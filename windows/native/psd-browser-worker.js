import { Buffer } from 'buffer';
import { readPsdDocument,writePsdDocument } from '../psd.cjs';
import { embeddedProfile,writeCmykPsd } from '../cmyk-psd.cjs';
import { initColorProfile } from '../src/color-engine.mjs';
import { PNG } from 'pngjs';
globalThis.Buffer=Buffer;
self.onmessage=async({data})=>{
  const{id,action,payload}=data;
  try{if(action==='read'){const b=Buffer.from(payload.bytes||payload);let profile;if(b.readUInt16BE(24)===4)profile=await initColorProfile(embeddedProfile(b)||payload.profile);self.postMessage({id,value:readPsdDocument(b,profile)});}else if(action==='write'){let bytes=writePsdDocument(payload.project,payload.composite);if(payload.project.colorMode==='CMYK'){const profile=await initColorProfile(payload.project.colorProfile.data),pixels=PNG.sync.read(Buffer.from(payload.composite.slice(22),'base64'));bytes=writeCmykPsd(bytes,pixels,profile);}self.postMessage({id,value:bytes},[bytes.buffer]);}else throw new Error('未知 PSD 操作。');}
  catch(error){self.postMessage({id,error:error.message});}
};
