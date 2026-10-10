const {test}=require('node:test'),assert=require('node:assert/strict');
const {affine,multiply,inverse,vector,decompose}=require('../src/affine.mjs');
const {adjustments,defaults,adjustPixels}=require('../src/fill-model.mjs');
const {validateProject}=require('../project.cjs');
const {exportAdjustment,importAdjustment}=require('../psd-adjustments.cjs');
const {snapBox}=require('../src/snap-model.mjs');
test('任意旋转后的自由缩放可逆，矩阵分解保留剪切和方向',()=>{
 const a=affine({scale:1.7,scaleY:.6,rotation:37,skew:.25}),b=multiply([1.8,0,0,.4],a),q=affine(decompose(b));q.forEach((n,i)=>assert.ok(Math.abs(n-b[i])<1e-10));const p={x:47,y:-20},back=vector(inverse(b),vector(b,p));assert.ok(Math.abs(back.x-p.x)<1e-10);assert.ok(Math.abs(back.y-p.y)<1e-10);assert.throws(()=>decompose([0,0,0,0]));
});
test('每种调整修改实际 RGB 并保留透明度，原生 PSD 描述可写可读',()=>{
 const {writePsdBuffer,readPsd}=require('ag-psd');
 for(const [kind,[name,fields]] of Object.entries(adjustments)){
  const values={...defaults(kind),color:'#2468aa',color2:'#fedcba',range:'reds'};if(fields.length){const [key,,value,min,max]=fields[0];values[key]=value+(max-value)*.5;}
  const data=new Uint8ClampedArray([172,64,48,137]);adjustPixels(data,kind,values);assert.equal(data[3],137,name);assert.notDeepEqual([...data.slice(0,3)],[172,64,48],name);
  const adjustment=exportAdjustment({kind,values}),bytes=writePsdBuffer({width:1,height:1,children:[{name,adjustment}]},{noBackground:true}),raw=readPsd(bytes,{skipLayerImageData:true,skipCompositeImageData:true});assert.equal(raw.children[0].adjustment.type,adjustment.type,name);assert.ok(importAdjustment(raw.children[0].adjustment),name);
 }
});
test('v5 二维变换、参考线、填充和调整限制，v4 拒绝新字段',()=>{
 const base={id:'f',name:'填充',type:'fill',width:64,height:48,x:0,y:0,scale:1,scaleY:2,skew:.2,rotation:20,opacity:1,blend:'source-over',visible:true,locked:false,fill:{kind:'solid',color:'#abcdef',color2:'#ffffff',angle:0,scale:100,pattern:'checker'}};
 const p={format:'com.compositor.windows',version:5,width:64,height:48,resolution:72,colorSpace:'sRGB',activeId:'f',layers:[base],guides:[{id:'g',axis:'x',position:27}],ruler:{unit:'mm',origin:{x:0,y:0},visible:true,guidesVisible:true,locked:false}};assert.equal(validateProject(p),p);const bad=structuredClone(p);bad.layers[0].scaleY=0;assert.throws(()=>validateProject(bad));const old=structuredClone(p);old.version=4;assert.throws(()=>validateProject(old));p.layers[0].type='adjustment';p.layers[0].adjustment={kind:'exposure',values:{exposure:2,offset:0,gamma:1}};validateProject(p);p.layers[0].adjustment.values.gamma=0;assert.throws(()=>validateProject(p));
});
test('参考线只吸附对应的轴，避免横向参考线误吸附 X',()=>{
 const b={x:10,y:20,width:30,height:40};let r=snapBox(b,[{axis:'x',x:101,y:500,width:0,height:800,canvas:true}],59,0,3);assert.equal(r.dx,61);assert.equal(r.dy,0);assert.equal(r.hits[0].axis,'x');r=snapBox(b,[{axis:'y',x:101,y:82,width:800,height:0,canvas:true}],59,20,3);assert.equal(r.dx,59);assert.equal(r.dy,22);
});

test('自由变换和旋转后的 PSD 文字仍恢复为可编辑文字',()=>{
 const {writePsdBuffer}=require('ag-psd'),{readPsdDocument}=require('../psd.cjs');
 const matrix=[1.5,.7,-.1,.5,5,7],data=writePsdBuffer({width:64,height:48,bitsPerChannel:8,colorMode:3,children:[{name:'自由变换文字',left:2,top:4,imageData:{width:2,height:2,data:new Uint8ClampedArray(16).fill(255)},text:{text:'中文',transform:matrix,style:{font:{name:'Arial'},fontSize:14,fillColor:{r:0,g:0,b:0}}}}]},{noBackground:true});
 const p=readPsdDocument(data).project;assert.equal(p.layers[0].type,'text');assert.deepEqual(p.layers[0].textGeometry.matrix,matrix);assert.equal(p.layers[0].fontSize,14);
});
