const test=require('node:test'),assert=require('node:assert/strict');
const modulePromise=import('../native/psd-input.mjs');
const url='https://compositor-import.local/_import/'+'a'.repeat(32);

test('旧版主程序与新版资源混用时仍可读取原始 PSD 字节',async()=>{
  const {readPsdBytes}=await modulePromise,bytes=Buffer.from('8BPS\0\1'),calls=[];
  const actual=await readPsdBytes({source:'psd',data:bytes.toString('base64')},{decodeBase64:data=>Buffer.from(data,'base64'),fetchFile:()=>{throw Error('Legacy host has no URL');},request:(...args)=>calls.push(args)});
  assert.deepEqual(Buffer.from(actual),bytes);assert.deepEqual(calls,[]);
});
test('新版主程序的二进制 PSD 传输读取完后释放文件',async()=>{
  const {readPsdBytes}=await modulePromise,bytes=Uint8Array.from([56,66,80,83]),calls=[];
  const actual=await readPsdBytes({url},{fetchFile:async input=>{assert.equal(input,url);return{ok:true,arrayBuffer:async()=>bytes.buffer};},request:async(...args)=>calls.push(args)});
  assert.deepEqual(actual,bytes);assert.deepEqual(calls,[['project:release','a'.repeat(32)]]);
});
test('PSD 读取失败保留原始错误并释放文件',async()=>{
  const {readPsdBytes}=await modulePromise,calls=[];
  await assert.rejects(()=>readPsdBytes({url},{fetchFile:async()=>{throw Error('File read failed');},request:async(...args)=>{calls.push(args);throw Error('Cleanup failed');}}),/File read failed/);
  assert.deepEqual(calls,[['project:release','a'.repeat(32)]]);
});
test('缺少 PSD 读取接口时给出明确中文提示，避免请求 undefined',async()=>{
  const {readPsdBytes}=await modulePromise;
  await assert.rejects(()=>readPsdBytes({source:'psd'},{}),/PSD 读取接口不兼容/);
});
