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
