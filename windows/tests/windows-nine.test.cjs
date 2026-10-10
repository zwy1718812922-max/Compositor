const test=require('node:test'),assert=require('node:assert/strict');
const {validateProject}=require('../project.cjs'),{shapeSettings}=require('../src/shape-model.mjs');
test('v7 形状、画板、段落与翻转校验，旧版本拒绝新内容',()=>{const base={id:'board',name:'画板',type:'group',x:10,y:15,scale:1,rotation:0,opacity:1,blend:'pass-through',visible:true,locked:false,collapsed:false,artboard:{width:200,height:100,background:'#2468aa'}},shape={id:'shape',name:'形状',type:'shape',x:20,y:30,scale:1,rotation:0,opacity:1,blend:'source-over',visible:true,locked:false,parentId:'board',shape:shapeSettings('rect',80,60,'#ffaa00')},p={format:'com.compositor.windows',version:7,width:240,height:140,resolution:72,colorSpace:'sRGB',colorMode:'RGB',activeId:'shape',layers:[shape,base]};assert.equal(validateProject(p),p);const old=structuredClone(p);old.version=6;assert.throws(()=>validateProject(old));const bad=structuredClone(p);bad.layers[0].shape.radii[0]=500;assert.throws(()=>validateProject(bad));bad.layers[0].shape.radii[0]=20;bad.layers[0].flipY=true;validateProject(bad);});
test('RGB、HSB、D50 Lab 和 CMYK 颜色往返保持准确',()=>{const c=require('../src/color-values.mjs');for(const rgb of [[255,0,0],[56,49,42],[0,0,0],[255,255,255],[18,140,207]]){for(const converted of [c.hsvToRgb(c.rgbToHsv(rgb)),c.labToRgb(c.rgbToLab(rgb)),c.cmykToRgb(c.rgbToCmyk(rgb))])converted.forEach((v,i)=>assert.ok(Math.abs(v-rgb[i])<.01));assert.deepEqual(c.fromHex(c.toHex(rgb)),rgb);}});

test('PSD 往返保留多个画板、世界坐标、背景和子图层归属',()=>{
  const {PNG}=require('pngjs'),{writePsdDocument,readPsdDocument}=require('../psd.cjs');
  const png=(w,h,color)=>{const p=new PNG({width:w,height:h});for(let i=0;i<p.data.length;i+=4)p.data.set(color,i);return 'data:image/png;base64,'+PNG.sync.write(p).toString('base64');};
  const common={scale:1,rotation:0,opacity:1,visible:true,locked:false};
  const layer={...common,id:'image',name:'素材',type:'raster',x:35,y:15,blend:'source-over',parentId:'two',data:png(3,3,[255,0,0,255])};
  const boards=[{...common,id:'one',name:'黑色画板',type:'group',x:0,y:0,blend:'pass-through',collapsed:false,artboard:{width:20,height:20,background:'#000000'}},{...common,id:'two',name:'透明画板',type:'group',x:30,y:10,blend:'pass-through',collapsed:false,artboard:{width:20,height:20,background:'transparent'}}];
  const p={format:'com.compositor.windows',version:7,width:50,height:30,resolution:300,colorSpace:'sRGB',colorMode:'RGB',activeId:'image',layers:[boards[0],layer,boards[1]]};
  const result=readPsdDocument(writePsdDocument(p,png(50,30,[0,0,0,0]))).project;
  assert.deepEqual(result.layers.filter(l=>l.artboard).map(l=>[l.name,l.x,l.y,l.artboard]),boards.map(l=>[l.name,l.x,l.y,l.artboard]));
  const imported=result.layers.find(l=>l.name==='素材');assert.equal(result.layers.find(l=>l.id===imported.parentId).name,'透明画板');assert.equal(imported.x,35);
});

test('画板导出名称处理 Windows 禁用字符和保留名称',()=>{
  const {exportName}=require('../src/export-name.mjs');
  assert.equal(exportName('A:/B*?'),'A__B__');assert.equal(exportName('CON'),'_CON');assert.equal(exportName('  '),'画板');
});
