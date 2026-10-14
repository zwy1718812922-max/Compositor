import {renderPreview,releasePreview,previewRegion,previewSize,preparePreviewFilters} from './render-preview.js';
import {memoryBudget} from './memory-budget.mjs';
import {initColorProfile} from './color-engine.mjs';
import {adjustRaster} from './operations.js';
import {returnSurface} from './render-surfaces.js';
import {exportPNG} from './tiled-export.js';
let project={},documentId,queue=Promise.resolve();const cancelled=new Set();
const assets=new Map(),target=new OffscreenCanvas(1,1);target.style={};target.dataset={};
function closeAsset(bitmap){if(bitmap.selectionCanvas)bitmap.selectionCanvas.width=bitmap.selectionCanvas.height=1;bitmap.close();}
async function render(request){
 if(request.cacheLimit!==undefined)memoryBudget.setLimit(request.cacheLimit);
 if(documentId!==request.documentId){releasePreview(project);memoryBudget.release(project);for(const bitmap of assets.values())closeAsset(bitmap);assets.clear();project={};documentId=request.documentId;}
 for(const {id,bitmap} of request.assets){if(assets.has(id))closeAsset(assets.get(id));assets.set(id,bitmap);}
 const used=new Set();const resolve=id=>{if(!id)return undefined;used.add(id);return assets.get(id);};
 const layers=request.project.layers.map(layer=>({...layer,canvas:resolve(layer.bitmapId),_pattern:resolve(layer.patternId),mask:layer.mask&&{...layer.mask,canvas:resolve(layer.mask.bitmapId)}}));
 let raster,source;if(request.raster){raster=request.raster;source=resolve(raster.sourceId);if(raster.selection?.bitmapId){const mask=resolve(raster.selection.bitmapId);if(!mask.selectionCanvas){mask.selectionCanvas=new OffscreenCanvas(mask.width,mask.height);mask.selectionCanvas.getContext('2d').drawImage(mask,0,0);}raster.selection={...raster.selection,canvas:mask.selectionCanvas};}}
 for(const [id,bitmap] of assets)if(!used.has(id)){closeAsset(bitmap);assets.delete(id);}
 Object.assign(project,request.project,{layers});memoryBudget.activate(project);if(project.colorMode==='CMYK'&&project.colorProfile?.data)await initColorProfile(project.colorProfile.data);
 if(raster){releasePreview(project,target);target.width=target.height=1;}
 const size=raster?{width:1,height:1}:request.view.patch&&request.view.clip||previewSize(previewRegion(project,request.view),request.view.matchDisplay),extraBytes=size.width*size.height*4+[...assets.values()].reduce((n,a)=>n+(a.selectionCanvas?a.width*a.height*4:0),0);
 if(request.cacheLimit!==undefined)memoryBudget.setLimit(Math.max(0,request.cacheLimit-extraBytes));
 const valid=()=>!cancelled.has(request.id);
 let region,bitmap,exported;if(request.view.kind==='export')exported=await exportPNG(project,{...request.view,valid});else if(raster){const output=adjustRaster(raster.layer,source,raster.selection,raster.settings,project);bitmap=output.transferToImageBitmap();returnSurface(output,project);}else{if(!await preparePreviewFilters(project,request.view,valid)){postMessage({id:request.id,cancelled:true});cancelled.delete(request.id);return;}region=renderPreview(target,project,undefined,true,request.view);bitmap=target.transferToImageBitmap();}
 const retainedBytes=memoryBudget.stats().bytes+[...assets.values()].reduce((n,a)=>n+a.width*a.height*4+(a.selectionCanvas?a.width*a.height*4:0),0)+target.width*target.height*4;postMessage({id:request.id,region,bitmap,...exported,retainedBytes},bitmap?[bitmap]:[]);
}
self.onmessage=({data})=>{if(data.cancel){cancelled.add(data.cancel);return;}queue=queue.then(()=>render(data)).catch(error=>postMessage({id:data.id,error:error.message})).finally(()=>cancelled.delete(data.id));};
