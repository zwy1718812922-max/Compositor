import {resizeImageProject} from './operations.js';
self.onmessage=({data})=>{
  try{const assets=data.assets,project={...data.project,layers:data.project.layers.map(l=>({...l,canvas:l.bitmapId===undefined?undefined:assets[l.bitmapId],mask:l.mask&&{...l.mask,canvas:assets[l.mask.bitmapId]}}))};
    const result=resizeImageProject(project,data.width,data.height,data.resolution,{method:data.method,progress:n=>postMessage({progress:n})}),output=[];
    const bitmap=c=>{const id=output.length;output.push(c instanceof OffscreenCanvas?c.transferToImageBitmap():c);return id;};
    const layers=result.layers.map(l=>{const {canvas,mask,...metadata}=l;return{...metadata,...(canvas?{bitmapId:bitmap(canvas)}:{}),mask:mask&&{...Object.fromEntries(Object.entries(mask).filter(([k])=>!['canvas','_surface','_bounds','data'].includes(k))),bitmapId:bitmap(mask.canvas)}};});
    postMessage({project:{...result,layers},assets:output},output);for(const asset of assets)asset.close();
  }catch(error){postMessage({error:error.message});}
};
