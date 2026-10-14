const {test,expect,_electron:electron}=require('@playwright/test'),path=require('node:path');
let app,page,errors;
test.beforeEach(async()=>{const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({args:[path.join(__dirname,'..'),'--user-data-dir='+test.info().outputPath('profile')],env});page=await app.firstWindow();errors=[];page.on('pageerror',e=>errors.push(e.message));await expect(page.locator('#startup-screen')).toBeHidden();});
test.afterEach(async()=>{if(app){await app.evaluate(({app})=>app.exit(0));await app.close();}expect(errors).toEqual([]);});

test('未知页面的文档状态消息被忽略，不触发主进程未捕获异常',async()=>{
 const result=await app.evaluate(({ipcMain,BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];try{ipcMain.emit('document:dirty',{sender:win.webContents,senderFrame:{url:'file:///untrusted/index.html'}},true);return true;}catch{return false;}});
 expect(result).toBe(true);await expect(page.locator('#home-screen')).toBeVisible();
});

test('无需调用方版本号即可丢弃旧请求，前台优先，关闭旧文档不丢失新文档任务',async()=>{
 const result=await page.evaluate(async()=>{
  const e=await import('./editor.js'),{setupBackgroundPreview}=await import('./background-preview.js'),{memoryBudget}=await import('./memory-budget.mjs'),background=setupBackgroundPreview(),view={scale:1},make=()=>({width:128,height:128,layers:[e.rasterLayer('素材',128,128,'#123456')]}),p=make(),jobs=[];
  const NativeWorker=Worker;let posted,closed=0;const sent=new Promise(r=>posted=r);window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',({data})=>{if(data.bitmap){const close=data.bitmap.close.bind(data.bitmap);data.bitmap.close=()=>{closed++;close();};}});}postMessage(...args){super.postMessage(...args);posted();}};
  const stale=background.render(p,view);await sent;p.layers[0].opacity=.5;const fresh=background.render(p,view),inFlightDiscarded=await stale===null,newest=await fresh;newest.bitmap.close();const closedInFlight=closed;background.release(p);window.Worker=NativeWorker;
  for(let n=0;n<8;n++){p.layers[0].opacity=n/7;jobs.push(background.render(p,view));}const outputs=await Promise.all(jobs),latest=outputs.at(-1),c=e.canvas(128,128);c.getContext('2d').drawImage(latest.bitmap,0,0);latest.bitmap.close();const pixel=[...c.getContext('2d').getImageData(20,20,1,1).data];background.release(p);
  const first=make(),foreground=make(),other=make(),original=createImageBitmap,order=[];let unblock,entered;const gate=new Promise(r=>unblock=r),started=new Promise(r=>entered=r);window.createImageBitmap=async source=>{if(source===first.layers[0].canvas){entered();await gate;}return original(source);};memoryBudget.activate(foreground);
  const a=background.render(first,view).then(r=>{order.push('first');r.bitmap.close();});await started;const b=background.render(other,{...view,priority:0}).then(r=>{order.push('background');r.bitmap.close();}),f=background.render(foreground,view).then(r=>{order.push('foreground');r.bitmap.close();});unblock();await Promise.all([a,b,f]);window.createImageBitmap=original;
  // A retained worker belongs to the old document while a new source is prepared.
  const next=make();let resume,preparing;const blocked=new Promise(r=>resume=r),ready=new Promise(r=>preparing=r);let once=true;window.createImageBitmap=async source=>{if(source===next.layers[0].canvas&&once){once=false;preparing();await blocked;}return original(source);};const switched=background.render(next,view);await ready;memoryBudget.release(other);resume();const output=await switched,switchedCompleted=!!output;output?.bitmap.close();window.createImageBitmap=original;
  const cancelled=background.render(next,view);background.release(next);const cancellation=await cancelled;background.clear();for(const owner of [p,first,foreground,other,next])memoryBudget.release(owner);return{inFlightDiscarded,closedInFlight,completed:outputs.filter(Boolean).length,pixel,order,switchedCompleted,cancellation,bytes:memoryBudget.stats().bytes};
 });
 expect(result).toEqual({inFlightDiscarded:true,closedInFlight:2,completed:1,pixel:[18,52,86,255],order:['first','foreground','background'],switchedCompleted:true,cancellation:null,bytes:0});
});

test('像素调整在 Worker 中处理最新参数，复杂选区一致，预览和调整互不取消',async()=>{
 const result=await page.evaluate(async()=>{
  const e=await import('./editor.js'),{setupBackgroundPreview}=await import('./background-preview.js'),{adjustRaster}=await import('./operations.js'),{selectionPath,selectionOutline}=await import('./selections.js'),{memoryBudget}=await import('./memory-budget.mjs'),background=setupBackgroundPreview(),layer=e.rasterLayer('图像',2048,2048,'#123456'),unrelated=e.rasterLayer('无关素材',32,32,'red'),p={width:2048,height:2048,layers:[layer,unrelated]};memoryBudget.activate(p);
  const selection={x:0,y:0,canvas:e.canvas(128,128)};selection.canvas.getContext('2d').fillStyle='white';selection.canvas.getContext('2d').fillRect(10,10,40,40);selectionPath(selection);selectionOutline(selection);
  const settings={brightness:100,contrast:100,saturation:100,hue:0,grayscale:0,invert:0,blur:0},jobs=[];let frames=0,alive=true;function tick(){frames++;if(alive)requestAnimationFrame(tick);}requestAnimationFrame(tick);
  const original=createImageBitmap,uploads=[];window.createImageBitmap=async source=>{uploads.push(source===unrelated.canvas?'unrelated':source===layer.canvas?'source':'selection');return original(source);};
  for(let n=0;n<12;n++)jobs.push(background.adjust(p,layer,layer.canvas,selection,{...settings,grayscale:n===11?100:0,blur:n===11?3:0}));
  const outputs=await Promise.all(jobs),latest=outputs.at(-1),actual=e.canvas(2048,2048);actual.getContext('2d').drawImage(latest.bitmap,0,0);latest.bitmap.close();alive=false;window.createImageBitmap=original;
  const expected=adjustRaster(layer,layer.canvas,selection,{...settings,grayscale:100,blur:3},p),a=actual.getContext('2d').getImageData(0,0,100,100).data,b=expected.getContext('2d').getImageData(0,0,100,100).data;let max=0;for(let n=0;n<a.length;n++)max=Math.max(max,Math.abs(a[n]-b[n]));
  const raster=background.adjust(p,layer,layer.canvas,null,settings),preview=background.render(p,{scale:.1});const both=await Promise.all([raster,preview]);both.forEach(r=>r?.bitmap.close());const independent=both.every(Boolean);background.release(p);memoryBudget.release(p);return{completed:outputs.filter(Boolean).length,max,frames,uploads,independent,bytes:memoryBudget.stats().bytes};
 });
 expect(result.completed).toBe(1);expect(result.max).toBeLessThanOrEqual(1);expect(result.frames).toBeGreaterThan(0);expect(result.uploads).not.toContain('unrelated');expect(result.independent).toBe(true);expect(result.bytes).toBe(0);
});

test('分散像素编辑只读取变化块，恢复原图删除差异块，提交调整共享撤销基图',async()=>{
 const result=await page.evaluate(async()=>{
  const e=await import('./editor.js'),h=await import('./history-pixels.js'),layer=e.rasterLayer('图像',2048,2048,'#123456'),p={width:2048,height:2048,layers:[layer],activeId:layer.id},first=e.serialize(p,true),ctx=layer.canvas.getContext('2d'),original=ctx.getImageData.bind(ctx),reads=[];ctx.getImageData=(...args)=>{reads.push(args);return original(...args);};
  ctx.fillStyle='red';for(const x of [10,1900]){ctx.fillRect(x,x,8,8);e.invalidatePixels(layer,{x,y:x,width:8,height:8});}const second=e.serialize(p,true),editReads=reads.slice();reads.length=0;ctx.fillStyle='#123456';ctx.fillRect(10,10,8,8);e.invalidatePixels(layer,{x:10,y:10,width:8,height:8});const third=e.serialize(p,true);
  const output=e.canvas(2048,2048);output.getContext('2d').drawImage(layer.canvas,0,0);output.getContext('2d').fillStyle='white';output.getContext('2d').fillRect(500,500,8,8);h.inheritHistoryPixels(output,layer.canvas);layer.canvas=output;e.invalidatePixels(layer,{x:500,y:500,width:8,height:8});const fourth=e.serialize(p,true),restored=await e.deserialize(second),base=first.layers[0]._tiles.bitmap;
  return{editReads,tiles:[second,third,fourth].map(s=>s.layers[0]._tiles.tiles.length),shared:[second,third,fourth].every(s=>s.layers[0]._tiles.bitmap===base),pixels:[10,1900].map(x=>[...restored.layers[0].canvas.getContext('2d').getImageData(x,x,1,1).data]),bytes:h.historyBytes([first,second,third,fourth]),savedKeys:Object.keys(e.serialize(p).layers[0])};
 });
 expect(result.editReads).toEqual([[0,0,256,256],[1792,1792,256,256]]);expect(result.tiles).toEqual([2,1,2]);expect(result.shared).toBe(true);expect(result.pixels).toEqual([[255,0,0,255],[255,0,0,255]]);expect(result.bytes).toBe(2048*2048*4+3*256*256*4);expect(result.savedKeys).not.toContain('_tiles');
});

test('临时缓冲区复用并随文档释放，新后台缓存先于前台淘汰，蒙版参数不复制像素',async()=>{
 const result=await page.evaluate(async()=>{
  const {takeSurface,returnSurface}=await import('./render-surfaces.js'),{takePixels,returnPixels}=await import('./pixel-buffers.js'),{createMemoryBudget,memoryBudget}=await import('./memory-budget.mjs'),e=await import('./editor.js'),owner={};memoryBudget.activate(owner);
  const surface=takeSurface(64,64);surface.getContext('2d').fillRect(0,0,64,64);returnSurface(surface,owner);const reused=takeSurface(64,64),blank=reused.getContext('2d').getImageData(0,0,1,1).data[3]===0;returnSurface(reused,owner);const pixels=takePixels(4096);returnPixels(pixels,owner);const reusedPixels=takePixels(4096);returnPixels(reusedPixels,owner);memoryBudget.release(owner);
  const budget=createMemoryBudget(100),active={},inactive={},evicted=[];budget.activate(active);budget.set('front',80,()=>evicted.push('front'),active);budget.set('back',40,()=>evicted.push('back'),inactive);
  const mask=e.rasterLayer('蒙版',64,64,'white'),layer=e.rasterLayer('素材',64,64,'red'),p={width:64,height:64,layers:[{...layer,mask}]};mask.enabled=true;const first=e.serialize(p,true),data=mask.data,revision=e.pixelRevision(mask.canvas),generated=e.maskSurface(p,mask);mask.density=.5;e.invalidateAppearance(mask);const second=e.serialize(p,true);await Promise.resolve();memoryBudget.release(p);
  return{surfaceReuse:surface===reused,blank,pixelReuse:pixels===reusedPixels,releasedSize:[surface.width,surface.height],bytes:memoryBudget.stats().bytes,evicted,budgetBytes:budget.stats().bytes,maskRevision:e.pixelRevision(mask.canvas)===revision,maskData:mask.data===data,maskUndo:first.layers[0].mask._tiles===second.layers[0].mask._tiles,maskSurface:[generated.width,generated.height]};
 });
 expect(result).toEqual({surfaceReuse:true,blank:true,pixelReuse:true,releasedSize:[1,1],bytes:0,evicted:['back'],budgetBytes:80,maskRevision:true,maskData:true,maskUndo:true,maskSurface:[1,1]});
});
