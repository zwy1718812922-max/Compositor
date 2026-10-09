const {test}=require('node:test'),assert=require('node:assert/strict');
const {snapBox}=require('../src/snap-model.mjs');
test('吸附到边缘和中心，阈值按缩放换算，指针原始位移避免累积漂移',()=>{
  const box={x:100,y:100,width:100,height:80},target={x:320,y:300,width:100,height:80};
  const snapped=snapBox(box,[target],217,197,6);assert.equal(snapped.box.x,320);assert.equal(snapped.box.y,300);assert.equal(snapped.hits.length,2);
  assert.equal(snapBox(box,[target],230,197,6).box.x,330);
  assert.equal(snapBox(box,[target],230,197,12).box.x,320);
  assert.equal(snapBox(box,[target],217,197,6).box.x,320);
  const center=snapBox(box,[{x:0,y:0,width:1280,height:800,canvas:true}],489,258,6);assert.equal(center.box.x+50,640);assert.equal(center.box.y+40,400);
});
test('沿同一行吸附为相同间距，不使用相邻行的空隙',()=>{
  const box={x:0,y:100,width:100,height:80},a={x:100,y:100,width:100,height:80},b={x:250,y:100,width:100,height:80};
  const snapped=snapBox(box,[a,b],397,0,6);assert.equal(snapped.box.x,400);assert.equal(snapped.hits.find(h=>h.axis==='x').kind,'spacing');
  assert.equal(snapBox({...box,y:400},[a,b],397,0,6).box.x,397);
});
