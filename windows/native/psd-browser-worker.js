import { Buffer } from 'buffer';
import { readPsdDocument,writePsdDocument } from '../psd.cjs';
globalThis.Buffer=Buffer;
self.onmessage=({data})=>{
  const{id,action,payload}=data;
  try{if(action==='read')self.postMessage({id,value:readPsdDocument(Buffer.from(payload))});else if(action==='write'){const bytes=writePsdDocument(payload.project,payload.composite);self.postMessage({id,value:bytes},[bytes.buffer]);}else throw new Error('未知 PSD 操作。');}
  catch(error){self.postMessage({id,error:error.message});}
};
