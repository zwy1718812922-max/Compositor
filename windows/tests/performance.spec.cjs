const {test,expect,_electron:electron}=require('@playwright/test'),path=require('node:path');
let app,page;
test.beforeEach(async()=>{const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const args=['--user-data-dir='+test.info().outputPath('profile')];app=await electron.launch(process.env.COMPOSITOR_EXECUTABLE?{executablePath:process.env.COMPOSITOR_EXECUTABLE,args,env}:{args:[path.join(__dirname,'..'),...args],env});page=await app.firstWindow();await expect(page.locator('#startup-screen')).toBeHidden();});
test.afterEach(async()=>{if(app){await app.evaluate(({app})=>app.exit(0));await app.close();}});
test('后台预览与同步合成一致，支持文字、FX、蒙版、剪贴和删除撤销后的像素更新',async()=>{
 const result=await page.evaluate(async()=>{
  const e=await import('./editor.js'),{renderPreview}=await import('./render-preview.js'),{setupBackgroundPreview}=await import('./background-preview.js'),{defaultEffect}=await import('./effect-model.mjs'),background=setupBackgroundPreview();
  const group=e.groupLayer('组');group.opacity=.6;
  const base=e.rasterLayer('底层',200,160,'#dd4400');Object.assign(base,{x:200,y:150,parentId:group.id,styles:{stroke:{...defaultEffect('stroke'),enabled:true,size:6,color:'#00ff00'}}});
  const mask=e.rasterLayer('蒙版',200,160,'white');Object.assign(mask,{x:200,y:150,density:.8,feather:1,enabled:true,defaultColor:0});base.mask=mask;
  const upper=e.rasterLayer('剪贴',100,160,'#0000ff');Object.assign(upper,{x:200,y:150,clipping:true,parentId:group.id,opacity:.5});
  const text=e.textLayer('中文文字',450,150,'#118844');text.fontSize=42;
  const fill={...e.baseLayer('图案','fill'),width:2400,height:1600,fill:{kind:'pattern',pattern:'stripes',color:'#ffffff',color2:'#cccccc',scale:100}};
  const p={width:2400,height:1600,colorMode:'RGB',layers:[fill,base,upper,group,text]},view={scale:1,pixelRatio:1,pan:{x:-100,y:-100},width:800,height:500},differences=[];
  async function verify(){const expected=e.canvas(1,1),region=renderPreview(expected,p,undefined,true,view),r=await background.render(p,view),actual=e.canvas(r.bitmap.width,r.bitmap.height);actual.getContext('2d').drawImage(r.bitmap,0,0);r.bitmap.close();const a=actual.getContext('2d').getImageData(0,0,actual.width,actual.height).data,b=expected.getContext('2d').getImageData(0,0,expected.width,expected.height).data;let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));differences.push({max,regionMatch:JSON.stringify(r.region)===JSON.stringify(region)});}
  await verify();base.canvas.getContext('2d').fillStyle='#eeaa00';base.canvas.getContext('2d').fillRect(0,0,200,160);e.invalidatePixels(base);await verify();p.layers=p.layers.filter(l=>l!==base&&l!==upper);await verify();p.layers.unshift(base,upper);await verify();mask.canvas=e.canvas(200,160);await verify();
  const profile=await window.desktop.colorProfile('system'),{initColorProfile}=await import('./color-engine.mjs');await initColorProfile(profile.value);p.colorMode='CMYK';p.colorProfile={data:profile.value};await verify();
  background.clear();await verify();const cancelled=await background.render(p,view,()=>false);return{differences,cancelled};
 });
 expect(result.cancelled).toBeNull();for(const difference of result.differences){expect(difference.regionMatch).toBe(true);expect(difference.max).toBeLessThanOrEqual(2);}
});
test('大画布缓存预览保留蒙版、剪贴和组透明度，移动、像素及蒙版替换不会留下旧画面',async()=>{
 const result=await page.evaluate(async()=>{
  const e=await import('./editor.js'),{renderPreview}=await import('./render-preview.js'),{defaultEffect}=await import('./effect-model.mjs');
  const background={...e.baseLayer('背景','fill'),width:3840,height:2560,fill:{kind:'solid',color:'#ffffff'}},group=e.groupLayer('组');group.opacity=.6;
  const base=e.rasterLayer('底层',200,160,'#ff0000');Object.assign(base,{x:200,y:300,parentId:group.id,styles:{colorOverlay:{...defaultEffect('colorOverlay'),enabled:true,color:'#00ff00'}}});
  const mask=e.rasterLayer('蒙版',200,160,'#ffffff');Object.assign(mask,{x:200,y:300,density:1,feather:0,enabled:true,linked:true,defaultColor:0});base.mask=mask;
  const upper=e.rasterLayer('剪贴层',100,160,'#0000ff');Object.assign(upper,{x:200,y:300,parentId:group.id,clipping:true,opacity:.5});
  const p={width:3840,height:2560,colorMode:'RGB',resolution:72,layers:[background,base,upper,group],activeId:base.id},target=e.canvas(1,1),out=[];
  function verify(){renderPreview(target,p,undefined,true,{scale:.25});const full=e.composite(p),sample=(c,x,y)=>[...c.getContext('2d').getImageData(x,y,1,1).data];for(const [x,y] of [[240,340],[340,340],[440,340],[100,100]])out.push({actual:sample(target,x/4,y/4),expected:sample(full,x,y)});}
  verify();base.x+=40;mask.x+=40;verify();base.styles.colorOverlay.color='#ff00ff';verify();
  upper.canvas.getContext('2d').fillStyle='#00ffff';upper.canvas.getContext('2d').fillRect(0,0,100,160);e.invalidatePixels(upper);verify();
  const black=e.canvas(200,160);black.getContext('2d').fillStyle='black';black.getContext('2d').fillRect(0,0,200,160);mask.canvas=black;verify();group.opacity=.2;verify();
  delete base.mask;delete base.styles;base.fillOpacity=.3;verify();delete base.fillOpacity;verify();
  Object.assign(base,{type:'text',text:'X',font:'Arial',fontSize:64,color:'#ff0000',bold:false,textRasterCache:true});verify();delete base.canvas;delete base.textRasterCache;verify();
  return out;
 });
 for(let n=0;n<result.length;n++){const {actual,expected}=result[n];for(let c=0;c<4;c++)expect(Math.abs(actual[c]-expected[c]),JSON.stringify({step:Math.floor(n/4),point:n%4,actual,expected})).toBeLessThanOrEqual(2);}
});
test('100% 大画布按视口保留单像素精度，撤销快照独立且保存仍为原始尺寸',async()=>{
 const result=await page.evaluate(async()=>{
  const e=await import('./editor.js'),{renderPreview}=await import('./render-preview.js');
  const l=e.rasterLayer('像素',200,160);l.x=1800;l.y=1200;const ctx=l.canvas.getContext('2d');ctx.fillStyle='#123456';ctx.fillRect(0,0,1,1);
  const p={width:3840,height:2560,colorMode:'RGB',resolution:72,layers:[l],activeId:l.id},target=e.canvas(1,1),region=renderPreview(target,p,undefined,true,{scale:1,pixelRatio:1,pan:{x:-1800,y:-1000},width:800,height:600});
  const pixel=[...target.getContext('2d').getImageData(1800-region.x,1200-region.y,1,1).data],snapshot=e.serialize(p,true);
  ctx.fillStyle='#ff0000';ctx.fillRect(0,0,1,1);e.invalidatePixels(l);const restored=await e.deserialize(snapshot),saved=e.serialize(restored),png=await e.decodeImage(saved.layers[0].data);
  return{region,pixel,restored:[...restored.layers[0].canvas.getContext('2d').getImageData(0,0,1,1).data],size:[saved.width,saved.height,png.width,png.height],keys:Object.keys(saved.layers[0])};
 });
 expect(result.region.scale).toBe(1);expect(result.region.width).toBeLessThan(1400);expect(result.pixel).toEqual([18,52,86,255]);expect(result.restored).toEqual(result.pixel);expect(result.size).toEqual([3840,2560,200,160]);expect(result.keys).not.toContain('_bitmap');
});
test('局部蒙版命中与完整蒙版一致，支持变换、浓度和默认区域',async()=>{
 const result=await page.evaluate(async()=>{
  const e=await import('./editor.js'),l=e.rasterLayer('图像',300,300,'#123456'),m=e.rasterLayer('蒙版',80,80,'#ffffff');m.canvas.getContext('2d').fillStyle='#000000';m.canvas.getContext('2d').fillRect(0,0,40,80);Object.assign(m,{x:20,y:30,scale:1.5,scaleY:.8,skew:.1,rotation:12,density:1,feather:0,defaultColor:0,enabled:true,linked:true});l.mask=m;
  const p={width:300,height:300,layers:[l],activeId:l.id},out=[];
  for(const density of [1,.5,0])for(const defaultColor of [0,255]){m.density=density;m.defaultColor=defaultColor;const full=e.maskSurface(p,m);for(let y=5;y<290;y+=11)for(let x=5;x<290;x+=13)out.push({actual:!!e.hitLayer(p,{x,y}),expected:full.getContext('2d').getImageData(x,y,1,1).data[3]>0});}
  return out;
 });
 for(const point of result)expect(point.actual).toBe(point.expected);
});
test('局部重绘与完整合成一致，覆盖阴影、羽化蒙版、剪贴和上方调整层',async()=>{
 const result=await page.evaluate(async()=>{
  const e=await import('./editor.js'),{renderPreview,releasePreview}=await import('./render-preview.js'),{defaultEffect}=await import('./effect-model.mjs');
  const bg={...e.baseLayer('背景','fill'),width:1200,height:800,fill:{kind:'solid',color:'#aabbcc'}},group=e.groupLayer('组');group.opacity=.7;
  const base=e.rasterLayer('素材',100,80,'#dd4400');Object.assign(base,{x:220,y:250,parentId:group.id,styles:{dropShadow:{...defaultEffect('dropShadow'),enabled:true,size:12,distance:28},stroke:{...defaultEffect('stroke'),enabled:true,size:5}}});
  base.mask={...e.rasterLayer('蒙版',100,80,'white'),x:220,y:250,enabled:true,density:.8,feather:4,defaultColor:0};
  const clip=e.rasterLayer('剪贴',50,80,'#0088ee');Object.assign(clip,{x:220,y:250,clipping:true,parentId:group.id,opacity:.5});
  const adjustment={...e.baseLayer('调整','adjustment'),adjustment:{kind:'invert',values:{amount:30}},opacity:.2};
  const p={width:1200,height:800,layers:[bg,base,clip,group,adjustment]},partial=e.canvas(1,1),full=e.canvas(1,1),view={scale:1},differences=[];renderPreview(partial,p,undefined,true,view);
  const dirty={x:140,y:160,width:440,height:320};
  for(const x of [300,400,220]){base.x=x;base.mask.x=x;clip.x=x;renderPreview(partial,p,undefined,true,{...view,clip:dirty});renderPreview(full,p,undefined,true,view);const a=partial.getContext('2d').getImageData(0,0,1200,800).data,b=full.getContext('2d').getImageData(0,0,1200,800).data;let max=0;for(let n=0;n<a.length;n++)max=Math.max(max,Math.abs(a[n]-b[n]));differences.push(max);}
  releasePreview(p);return differences;
 });
 expect(Math.max(...result)).toBeLessThanOrEqual(2);
});
test('后台预览只保留最新排队参数，释放文档会取消正在准备的任务',async()=>{
 const result=await page.evaluate(async()=>{
  const e=await import('./editor.js'),{setupBackgroundPreview}=await import('./background-preview.js'),background=setupBackgroundPreview(),l=e.rasterLayer('素材',512,512,'#123456'),p={width:512,height:512,layers:[l]},view={scale:1};let generation=0;
  const jobs=[];for(let n=0;n<6;n++){const id=++generation;l.opacity=n/5;jobs.push(background.render(p,view,()=>id===generation));}
  const outputs=await Promise.all(jobs),latest=outputs.at(-1),c=e.canvas(512,512);c.getContext('2d').drawImage(latest.bitmap,0,0);latest.bitmap.close();const pixel=[...c.getContext('2d').getImageData(100,100,1,1).data];const cancelled=background.render(p,view);background.release(p);const cancellation=await cancelled;background.clear();return{completed:outputs.filter(Boolean).length,pixel,cancellation};
 });
 expect(result.completed).toBe(1);expect(result.pixel).toEqual([18,52,86,255]);expect(result.cancellation).toBeNull();
});
test('像素撤销仅保存变化块，恢复后仍能编辑并正确保存',async()=>{
 const result=await page.evaluate(async()=>{
  const e=await import('./editor.js'),{historyBytes}=await import('./history-pixels.js'),layer=e.rasterLayer('素材',1024,1024,'#123456'),p={width:1024,height:1024,layers:[layer],activeId:layer.id},snapshots=[e.serialize(p,true)];
  const ctx=layer.canvas.getContext('2d');for(let n=0;n<7;n++){ctx.fillStyle='#ff0000';ctx.fillRect(n*128,20,16,16);e.invalidatePixels(layer,{x:n*128,y:20,width:16,height:16});snapshots.push(e.serialize(p,true));}
  const bytes=historyBytes(snapshots),restored=await e.deserialize(snapshots[3]),sample=(l,x)=>[...l.canvas.getContext('2d').getImageData(x,25,1,1).data],pixels=[sample(restored.layers[0],5),sample(restored.layers[0],385)],restoredCtx=restored.layers[0].canvas.getContext('2d');restoredCtx.fillStyle='#00ff00';restoredCtx.fillRect(0,0,10,10);e.invalidatePixels(restored.layers[0]);const modified=e.serialize(restored,true),saved=e.serialize(await e.deserialize(modified));return{bytes,fullBytes:8*1024*1024*4,pixels,keys:Object.keys(saved.layers[0]),last:[...restoredCtx.getImageData(5,5,1,1).data],original:[...layer.canvas.getContext('2d').getImageData(5,5,1,1).data]};
 });
 expect(result.bytes).toBeLessThan(result.fullBytes/4);expect(result.pixels).toEqual([[255,0,0,255],[18,52,86,255]]);expect(result.last).toEqual([0,255,0,255]);expect(result.original).toEqual([18,52,86,255]);expect(result.keys).not.toContain('_tiles');
});
test('统一预算优先回收后台文档缓存，关闭文档释放登记资源',async()=>{
 const result=await page.evaluate(async()=>{const {createMemoryBudget}=await import('./memory-budget.mjs'),budget=createMemoryBudget(100),active={},inactive={},removed=[];budget.activate(active);budget.set('active',40,()=>removed.push('active'),active);budget.set('inactive',40,()=>removed.push('inactive'),inactive);budget.touch('inactive');budget.set('new',40,()=>removed.push('new'),active);const before=budget.stats().bytes;budget.release(active);return{removed,before,after:budget.stats().bytes};});
 expect(result.before).toBe(80);expect(result.removed[0]).toBe('inactive');expect(result.after).toBe(0);
});
test('文档释放会清除后台素材与清晰预览缓存',async()=>{
 const result=await page.evaluate(async()=>{const e=await import('./editor.js'),{setupViewMotion}=await import('./view-motion.js'),{memoryBudget}=await import('./memory-budget.mjs'),p={width:512,height:512,layers:[e.rasterLayer('素材',512,512,'#123456')]},display=e.canvas(512,512),viewport=document.createElement('div'),initial=memoryBudget.stats(p).bytes,motion=setupViewMotion({display,viewport,project:()=>p,gesture:()=>null,editingId:()=>null,decorate(){},render(){},view:()=>({scale:1,pixelRatio:1,pan:{x:0,y:0},width:512,height:512})});await motion.prepare(p);const retained=memoryBudget.stats(p).bytes;motion.release(p);motion.cancel();return{initial,retained,released:memoryBudget.stats(p).bytes};});
 expect(result.retained).toBeGreaterThan(result.initial);expect(result.released).toBe(result.initial);
});
test('超大画布清晰预览按视口分配，平移缩放与缩略图保留正确内容',async()=>{
 const result=await page.evaluate(async()=>{
  const e=await import('./editor.js'),{setupViewMotion}=await import('./view-motion.js'),{memoryBudget}=await import('./memory-budget.mjs');
  const bg={...e.baseLayer('背景','fill'),width:16384,height:16384,fill:{kind:'solid',color:'#ffffff'}},right={...e.baseLayer('右半边','fill'),x:8192,width:8192,height:16384,fill:{kind:'solid',color:'#dd4400'}},marker=e.rasterLayer('单像素',1,1,'#123456');Object.assign(marker,{x:14100,y:14100});
  const p={width:16384,height:16384,layers:[bg,right,marker]},display=e.canvas(1,1),viewport=document.createElement('div');let view={scale:.03,pixelRatio:1,pan:{x:0,y:0},width:800,height:500};
  const motion=setupViewMotion({display,viewport,project:()=>p,gesture:()=>null,editingId:()=>null,decorate(){},render(){},view:()=>view}),sizes=[];
  async function draw(){const bitmap=await motion.prepare(p);sizes.push([bitmap.width,bitmap.height]);if(!motion.draw())throw new Error('Viewport preview was not usable');motion.cancel();}
  await draw();view={...view,scale:1,pan:{x:-14000,y:-14000}};const rejected=motion.draw();await draw();const pixel=[...display.getContext('2d').getImageData(100,100,1,1).data];
  view={...view,pixelRatio:2,pan:{x:-15000,y:-15000}};await draw();const far=[...display.getContext('2d').getImageData(100,100,1,1).data];
  view={...view,pan:{x:-12000,y:-12000}};const pending=motion.prepare(p);view={...view,pan:{x:-1000,y:-1000}};const cancelled=await pending;const stale=motion.draw();await draw();const left=[...display.getContext('2d').getImageData(100,100,1,1).data];
  const thumb=await e.decodeImage(await motion.thumbnail(p)),c=e.canvas(240,150);c.getContext('2d').drawImage(thumb,0,0);const sample=x=>[...c.getContext('2d').getImageData(x,75,1,1).data],thumbnail=[sample(80),sample(160)];
  motion.release(p);motion.cancel();return{sizes,rejected,stale,cancelled,pixel,far,left,thumbnail,released:memoryBudget.stats(p).bytes};
 });
 expect(result.sizes.every(([w,h])=>w*h<=1600*1000)).toBe(true);expect(result.rejected).toBe(false);expect(result.stale).toBe(false);expect(result.cancelled).toBeNull();
 expect(result.pixel).toEqual([18,52,86,255]);expect(result.far).toEqual([221,68,0,255]);expect(result.left).toEqual([255,255,255,255]);expect(result.thumbnail).toEqual([[255,255,255,255],[221,68,0,255]]);expect(result.released).toBe(0);
});
