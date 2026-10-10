import {canvas,renderInto,pixelRevision} from './editor.js';
// Preview pixels follow the view. Document pixels remain untouched for edits and export.
const states=new WeakMap();
const MAX_PREVIEW_PIXELS=2*1024*1024,MAX_CACHE_BYTES=128*1024*1024;
function surfaceCache(){
 const entries=new Map();let bytes=0;
 return{get(id){const e=entries.get(id);if(e){entries.delete(id);entries.set(id,e);}return e;},put(id,e){const old=entries.get(id);if(old)bytes-=old.surface.width*old.surface.height*4;entries.delete(id);entries.set(id,e);bytes+=e.surface.width*e.surface.height*4;while(bytes>MAX_CACHE_BYTES&&entries.size>1){const key=entries.keys().next().value,item=entries.get(key);entries.delete(key);bytes-=item.surface.width*item.surface.height*4;}},clear(){entries.clear();bytes=0;}};
}
export function previewRegion(project,view={}){
 const large=project.width*project.height>MAX_PREVIEW_PIXELS;
 let scale=large?Math.min(1,view.scale*(view.pixelRatio||1)||1):1;
 let x=0,y=0,width=project.width,height=project.height;
 if(large&&width*height*scale*scale>MAX_PREVIEW_PIXELS&&view.width&&view.height&&view.pan){
  const padding=96/Math.max(.05,view.scale),right=Math.min(project.width,(view.width-view.pan.x)/view.scale+padding),bottom=Math.min(project.height,(view.height-view.pan.y)/view.scale+padding);
  x=Math.min(project.width-1,Math.max(0,Math.floor(-view.pan.x/view.scale-padding)));y=Math.min(project.height-1,Math.max(0,Math.floor(-view.pan.y/view.scale-padding)));
  width=Math.max(1,Math.ceil(right)-x);height=Math.max(1,Math.ceil(bottom)-y);
 }
 scale=Math.min(scale,Math.sqrt(MAX_PREVIEW_PIXELS/(width*height)));
 return{x,y,width,height,scale};
}
export function renderPreview(target,project,background,proof=true,view={}){
 const region=previewRegion(project,view),{scale}=region,key=JSON.stringify(region);
 let targets=states.get(project);if(!targets){targets=new WeakMap();states.set(project,targets);}let state=targets.get(target);
 if(!state||state.key!==key){state={key,layers:new Map(),cache:surfaceCache()};targets.set(target,state);}
 const layers=project.layers.map(layer=>{
  let proxy=state.layers.get(layer.id);if(!proxy){proxy={};state.layers.set(layer.id,proxy);}
  const oldBounds=proxy._bounds,oldBitmap=proxy.canvas,oldRevision=proxy._revision,oldMask=proxy.mask;
  for(const key of Object.keys(proxy))if(!key.startsWith('_'))delete proxy[key];
  Object.assign(proxy,layer,{x:(layer.x-region.x)*scale,y:(layer.y-region.y)*scale,scale:layer.scale*scale,scaleY:(layer.scaleY??layer.scale)*scale});
  proxy._pattern=layer._pattern;
  proxy._revision=pixelRevision(layer.canvas);
  proxy._bounds=layer._bounds||(oldBitmap===layer.canvas&&oldRevision===proxy._revision?oldBounds:undefined);
  const styleKey=JSON.stringify(layer.styles);
  if(proxy._styleKey!==styleKey){proxy._styleKey=styleKey;proxy._styles=layer.styles&&Object.fromEntries(Object.entries(layer.styles).map(([key,e])=>[key,{...e,...(e.size===undefined?{}:{size:e.size*scale}),...(e.distance===undefined?{}:{distance:e.distance*scale})}]));}
  proxy.styles=proxy._styles;
  if(layer.mask){const m=layer.mask;proxy.mask={...m,x:(m.x-region.x)*scale,y:(m.y-region.y)*scale,scale:m.scale*scale,scaleY:(m.scaleY??m.scale)*scale,feather:m.feather*scale,_surface:oldMask?.canvas===m.canvas?oldMask._surface:undefined};}
  else delete proxy.mask;
  return proxy;
 });
 for(const id of state.layers.keys())if(!project.layers.some(l=>l.id===id))state.layers.delete(id);
 const width=Math.max(1,Math.round(region.width*scale)),height=Math.max(1,Math.round(region.height*scale));
 if(target.width!==width)target.width=width;if(target.height!==height)target.height=height;
 target.style.width=region.width+'px';target.style.height=region.height+'px';target.style.left=region.x+'px';target.style.top=region.y+'px';
 target.dataset.originX=region.x;target.dataset.originY=region.y;target.dataset.worldWidth=region.width;target.dataset.worldHeight=region.height;
 const preview={...project,width,height,layers,_renderCache:state.cache};
 renderInto(target,preview,background,proof);
 return region;
}
