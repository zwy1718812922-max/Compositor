const {test}=require('node:test'),assert=require('node:assert/strict');
const {PNG:reference}=require('pngjs'),{PNG:browser}=require('../native/browser-png.cjs');
test('轻量版 PNG 编解码由独立 pngjs 验证：透明度、全部滤波及 CRC 损坏',()=>{
  const pixels={width:19,height:13,data:Buffer.alloc(19*13*4)};for(let i=0;i<pixels.data.length;i++)pixels.data[i]=(i*37+i*i*13)%256;
  const encoded=browser.sync.write(pixels),decoded=reference.sync.read(encoded);assert.deepEqual(decoded.data,pixels.data);
  for(let filterType=0;filterType<5;filterType++){const bytes=reference.sync.write(pixels,{filterType}),out=browser.sync.read(bytes);assert.deepEqual(out.data,pixels.data);}
  const broken=Buffer.from(encoded);broken[45]^=1;assert.throws(()=>browser.sync.read(broken),/校验/);
});
