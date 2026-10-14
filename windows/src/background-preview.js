import {pixelRevision} from './editor.js';
import {memoryBudget} from './memory-budget.mjs';
export function setupBackgroundPreview(){
 let worker,project,documentId=0,serial=0,assetSerial=0,epoch=0,known=new WeakMap(),available=new Set(),running=false,activeJob,retainedBytes=0;const pending=new Map(),queue=new Map(),resource={},versions=new WeakMap(),jobKeys=new WeakMap();
 function jobKey(p,kind='preview'){let keys=jobKeys.get(p);if(!keys){keys=new Map();jobKeys.set(p,keys);}if(!keys.has(kind))keys.set(kind,{p,kind});return keys.get(kind);}
 function reset(){epoch++;worker?.terminate();worker=null;project=null;known=new WeakMap();available.clear();retainedBytes=0;memoryBudget.delete(resource);for(const request of pending.values())request.resolve(null);pending.clear();}
 function start(){if(worker)return;worker=new Worker(new URL('./preview-worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{const request=pending.get(data.id);pending.delete(data.id);if(!request){data.bitmap?.close();return;}data.error?request.reject(new Error(data.error)):request.resolve(data);};worker.onerror=event=>{event.preventDefault();reset();};}
 async function request(p,view,valid){
  if(!valid())return null;start();if(project!==p){project=p;documentId++;known=new WeakMap();available.clear();}
  const current=epoch,assets=[],updates=[],prepared=new Map();
  async function bitmapId(source){if(!valid()||current!==epoch)throw cancelled;if(!source)return undefined;if(prepared.has(source))return prepared.get(source);const revision=pixelRevision(source),old=known.get(source);if(old?.revision===revision&&available.has(old.id)){prepared.set(source,old.id);return old.id;}const id=old?.id||++assetSerial,bitmap=await createImageBitmap(source);assets.push({id,bitmap});if(!valid()||current!==epoch)throw cancelled;updates.push({source,id,revision});prepared.set(source,id);return id;}
  function metadata(item){const copy={};for(const [key,value] of Object.entries(item))if(key!=='canvas'&&key!=='mask'&&key!=='data'&&!(value instanceof Path2D)&&(!key.startsWith('_')||key==='_bounds'))copy[key]=structuredClone(value);return copy;}
  try{
   const layers=[];for(const layer of view.kind==='raster'?[]:p.layers){const copy=metadata(layer);copy.bitmapId=await bitmapId(layer.canvas);copy.patternId=await bitmapId(layer._pattern);if(layer.mask)copy.mask={...metadata(layer.mask),bitmapId:await bitmapId(layer.mask.canvas)};layers.push(copy);}
   if(!valid()||current!==epoch)throw cancelled;
   let raster;if(view.kind==='raster')raster={layer:metadata(view.layer),settings:view.settings,sourceId:await bitmapId(view.source),selection:view.selection?{...metadata(view.selection),bitmapId:await bitmapId(view.selection.canvas)}:null};
   if(!valid()||current!==epoch)throw cancelled;
   const sourceBytes=[...prepared.keys()].reduce((n,a)=>n+a.width*a.height*4,0),cacheLimit=Math.max(0,memoryBudget.limit-(memoryBudget.stats().bytes-retainedBytes)-sourceBytes),wireView=raster?{}:view;
   const id=++serial,result=new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));if(activeJob)activeJob.requestId=id;worker.postMessage({id,documentId,cacheLimit,project:{width:p.width,height:p.height,colorMode:p.colorMode,colorProfile:p.colorProfile,layers},view:wireView,raster,assets},assets.map(asset=>asset.bitmap));updates.forEach(({source,id,revision})=>known.set(source,{id,revision}));available=new Set(prepared.values());const output=await result;if(!output||output.cancelled)return null;retainedBytes=output.retainedBytes||0;memoryBudget.set(resource,retainedBytes,reset,p,'worker');if(!valid()){output.bitmap?.close();return null;}return output;
  }catch(error){assets.forEach(asset=>asset.bitmap.close());if(current!==epoch&&valid())return retry;if(error===cancelled||current!==epoch)return null;reset();throw error;}
 }
 const cancelled=Symbol('cancelled'),retry=Symbol('retry');
 async function drain(){if(running)return;running=true;try{while(queue.size){const [key,job]=[...queue].sort((a,b)=>b[1].priority-a[1].priority||b[1].version-a[1].version)[0];queue.delete(key);activeJob={key,...job};try{const result=await request(key.p,job.view,job.valid);if(result===retry&&job.valid())queue.set(key,job);else job.resolve(result===retry?null:result);}catch(error){job.reject(error);}finally{activeJob=null;}}}finally{running=false;}}
 function render(p,view,valid=()=>true){const key=jobKey(p,view.kind),version=++serial;versions.set(key,version);return new Promise((resolve,reject)=>{queue.get(key)?.resolve(null);queue.delete(key);if(activeJob?.key===key){activeJob.resolve(null);if(activeJob.requestId)worker?.postMessage({cancel:activeJob.requestId});}queue.set(key,{view,version,priority:view.priority??(memoryBudget.isActive(p)?2:1),valid:()=>versions.get(key)===version&&valid(),resolve,reject});drain();});}
 function cancel(p,kind){const keys=kind?[jobKey(p,kind)]:[...(jobKeys.get(p)?.values()||[])];for(const key of keys){versions.set(key,++serial);queue.get(key)?.resolve(null);queue.delete(key);if(activeJob?.key===key){activeJob.resolve(null);if(activeJob.requestId)worker?.postMessage({cancel:activeJob.requestId});}}}
 function release(p){cancel(p);if(project===p)reset();}
 function clear(){for(const [key,job] of queue){versions.set(key,++serial);job.resolve(null);}queue.clear();if(activeJob){versions.set(activeJob.key,++serial);activeJob.resolve(null);}reset();}
 const adjust=(p,layer,source,selection,settings,valid)=>render(p,{kind:'raster',priority:3,layer,source,selection,settings},valid);
 return{render,adjust,exportPNG:(p,options={},valid)=>render(p,{...options,kind:'export',priority:1},valid),cancel,clear,release};
}
