import {pixelRevision} from './editor.js';
export function setupBackgroundPreview(){
 let worker,project,documentId=0,serial=0,assetSerial=0,known=new WeakMap(),available=new Set(),queue=Promise.resolve();const pending=new Map();
 function reset(){worker?.terminate();worker=null;project=null;known=new WeakMap();available.clear();for(const request of pending.values())request.reject(new Error('预览进程已结束'));pending.clear();}
 function start(){if(worker)return;worker=new Worker(new URL('./preview-worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{const request=pending.get(data.id);pending.delete(data.id);if(!request){data.bitmap?.close();return;}data.error?request.reject(new Error(data.error)):request.resolve(data);};worker.onerror=event=>{event.preventDefault();reset();};}
 async function request(p,view,valid){
  if(!valid())return null;start();if(project!==p){project=p;documentId++;known=new WeakMap();available.clear();}
  const assets=[],updates=[],prepared=new Map();
  async function bitmapId(source){if(!source)return undefined;if(prepared.has(source))return prepared.get(source);const revision=pixelRevision(source),old=known.get(source);if(old?.revision===revision&&available.has(old.id)){prepared.set(source,old.id);return old.id;}const id=old?.id||++assetSerial,bitmap=await createImageBitmap(source);assets.push({id,bitmap});updates.push({source,id,revision});prepared.set(source,id);return id;}
  function metadata(item){const copy={};for(const [key,value] of Object.entries(item))if(key!=='canvas'&&key!=='mask'&&key!=='data'&&!key.startsWith('_'))copy[key]=structuredClone(value);return copy;}
  try{
   const layers=[];for(const layer of p.layers){const copy=metadata(layer);copy.bitmapId=await bitmapId(layer.canvas);copy.patternId=await bitmapId(layer._pattern);if(layer.mask)copy.mask={...metadata(layer.mask),bitmapId:await bitmapId(layer.mask.canvas)};layers.push(copy);}
   if(!valid()){assets.forEach(asset=>asset.bitmap.close());return null;}
   const id=++serial,result=new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));worker.postMessage({id,documentId,project:{width:p.width,height:p.height,colorMode:p.colorMode,colorProfile:p.colorProfile,layers},view,assets},assets.map(asset=>asset.bitmap));updates.forEach(({source,id,revision})=>known.set(source,{id,revision}));available=new Set(prepared.values());return await result;
  }catch(error){assets.forEach(asset=>asset.bitmap.close());reset();throw error;}
 }
 function render(p,view,valid=()=>true){const task=queue.then(()=>request(p,view,valid));queue=task.catch(()=>{});return task;}
 return{render,clear:reset};
}
