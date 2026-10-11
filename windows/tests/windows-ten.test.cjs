const {test}=require('node:test'),assert=require('node:assert/strict');
const {shapeSettings,cornerGeometry,normalizeShapeTransform}=require('../src/shape-model.mjs');
const {layoutText,justifyLine,paintTextLine}=require('../src/text-layout.js');
const {validateProject}=require('../project.cjs'),{PNG}=require('pngjs');
const measure={measureText:text=>({width:Array.from(text).length*10})};
test('圆角按邻边长度收敛，非等比尺寸调整保留描边及圆角像素',()=>{
  const s=shapeSettings('polygon',300,70);s.sides=12;s.vertexRadii=Array(12).fill(35);const corners=cornerGeometry(s);
  for(let i=0;i<corners.length;i++)assert.ok(corners[i].cut+corners[(i+1)%corners.length].cut<=corners[i].lb+.00001);
  const l={type:'shape',scale:2,scaleY:.5,shape:{...shapeSettings('rect',100,80),radii:[12,12,12,12],strokeWidth:8}};normalizeShapeTransform(l);
  assert.deepEqual([l.shape.width,l.shape.height,l.shape.strokeWidth,l.scale,l.scaleY],[200,40,8,1,1]);assert.deepEqual(l.shape.radii,[12,12,12,12]);
});
test('每个段落分别标记末行，英文词不拉伸、中文使用字间距',()=>{
  const l={fontSize:10,lineHeight:1,textMode:'paragraph',boxWidth:50,text:'one two three\n甲乙丙丁戊己庚'};
  const lines=layoutText(measure,l).lines;assert.equal(lines.filter(l=>l.last).length,2);assert.ok(lines.filter(l=>!l.last).length>=2);
  const english=justifyLine(measure,'one two',100);assert.equal(english.fragments[0].text,'one ');assert.equal(english.width,100);
  const chinese=justifyLine(measure,'甲乙丙',100);assert.deepEqual(chinese.fragments.map(f=>f.x),[0,45,90]);assert.equal(justifyLine(measure,'甲',100).width,10);
  for(const [align,x] of [['justify-left',0],['justify-center',35],['justify-right',70],['justify-all',0]]){const calls=[],ctx={...measure,fillText:(t,x)=>calls.push([t,x])};paintTextLine(ctx,{align,textMode:'paragraph',fontSize:10},{text:'甲乙丙',x:0,y:0,width:100,last:true},{width:100});assert.equal(calls[0][1],x);if(align==='justify-all')assert.equal(calls.at(-1)[1],90);}
});
test('v8 可保存七种段落模式和逐顶点圆角，旧版本拒绝新字段',()=>{
  const l={id:'a',name:'text',type:'text',text:'测试',font:'Arial',fontSize:12,color:'#112233',bold:false,x:0,y:0,scale:1,rotation:0,opacity:1,visible:true,locked:false,blend:'source-over',align:'justify-all'};
  const p={format:'com.compositor.windows',version:8,colorMode:'RGB',colorSpace:'sRGB',resolution:72,width:100,height:100,activeId:'a',layers:[l]};assert.equal(validateProject(p),p);assert.throws(()=>validateProject({...p,version:7}));
  p.layers=[{...l,type:'shape',shape:{...shapeSettings('triangle',100,100),vertexRadii:[12,7,3]}}];assert.equal(validateProject(p),p);assert.throws(()=>validateProject({...p,version:7}));
});
test('取消总层数与累计像素门槛，真实 PNG 仍校验尺寸和结构',()=>{
  const bitmap=new PNG({width:2000,height:2000}),data='data:image/png;base64,'+PNG.sync.write(bitmap).toString('base64');
  const layers=Array.from({length:120},(_,i)=>({id:String(i),name:'layer',type:i<17?'raster':'group',x:0,y:0,scale:1,rotation:0,opacity:1,visible:true,locked:false,blend:'source-over',...(i<17?{data}:{collapsed:false})}));
  const p={format:'com.compositor.windows',version:8,colorMode:'RGB',colorSpace:'sRGB',resolution:72,width:100,height:100,activeId:'0',layers};assert.equal(validateProject(p).layers.length,120);
});
