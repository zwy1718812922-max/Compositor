import {renderPreview} from './render-preview.js';
import {initColorProfile} from './color-engine.mjs';
let project={},documentId,queue=Promise.resolve();
const assets=new Map(),target=new OffscreenCanvas(1,1);target.style={};target.dataset={};
async function render(request){
 if(documentId!==request.documentId){for(const bitmap of assets.values())bitmap.close();assets.clear();project={};documentId=request.documentId;}
 for(const {id,bitmap} of request.assets){assets.get(id)?.close();assets.set(id,bitmap);}
 const used=new Set();const resolve=id=>{if(!id)return undefined;used.add(id);return assets.get(id);};
 const layers=request.project.layers.map(layer=>({...layer,canvas:resolve(layer.bitmapId),_pattern:resolve(layer.patternId),mask:layer.mask&&{...layer.mask,canvas:resolve(layer.mask.bitmapId)}}));
 for(const [id,bitmap] of assets)if(!used.has(id)){bitmap.close();assets.delete(id);}
 Object.assign(project,request.project,{layers});if(project.colorMode==='CMYK'&&project.colorProfile?.data)await initColorProfile(project.colorProfile.data);
 const region=renderPreview(target,project,undefined,true,request.view),bitmap=target.transferToImageBitmap();postMessage({id:request.id,region,bitmap},[bitmap]);
}
self.onmessage=({data})=>{queue=queue.then(()=>render(data)).catch(error=>postMessage({id:data.id,error:error.message}));};
