const { parentPort } = require('node:worker_threads');
const { readPsdDocument, readPsdPreview, writePsdDocument } = require('./psd.cjs');
parentPort.on('message', async ({ id, action, payload }) => {
  try {
    if (action === 'read'||action==='preview') {const b=Buffer.from(payload.buffer,payload.byteOffset,payload.byteLength);let profile;if(b.readUInt16BE(24)===4){const data=require('./cmyk-psd.cjs').embeddedProfile(b)||(await require('node:fs/promises').readFile(require('node:path').join(process.env.WINDIR,'System32','spool','drivers','color','RSWOP.icm'))).toString('base64');profile=await(await import('./src/color-engine.mjs')).initColorProfile(data);}parentPort.postMessage({ id, value: action==='preview'?readPsdPreview(b,profile):readPsdDocument(b,profile,{rawPixels:true}) });}
    else if (action === 'write') { let bytes = writePsdDocument(payload.project,payload.composite);if(payload.project.colorMode==='CMYK'){const profile=await(await import('./src/color-engine.mjs')).initColorProfile(payload.project.colorProfile.data),{PNG}=require('pngjs'),pixels=PNG.sync.read(Buffer.from(payload.composite.slice(22),'base64'));bytes=require('./cmyk-psd.cjs').writeCmykPsd(bytes,pixels,profile);}parentPort.postMessage({id,value:bytes}); }
    else throw new Error('未知 PSD 操作。');
  } catch (error) { parentPort.postMessage({ id,error:error.message }); }
});
