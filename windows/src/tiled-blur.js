import {blurPixels,blurKernel} from './blur-model.mjs';
import {tiles,tileWindow} from './tile-grid.mjs';
import {gpuContext,releaseGPU} from './gpu-renderer.js';
const make=(w,h)=>{const c=typeof document==='undefined'?new OffscreenCanvas(w,h):document.createElement('canvas');c.width=w;c.height=h;return c;};
export function renderBlurTiles(source,width,height,settings,{padding=0,tileSize=512,backend='auto',progress=()=>{}}={}){
 if(!['gaussian','box','surface'].includes(settings.kind))throw new Error('Blur requires a global sampling path');
 if(width>16384||height>16384||width<1||height<1)throw new Error('模糊后尺寸须为 1–16384 像素。');
 const output=make(width,height),target=output.getContext('2d'),crop=make(1,1),kernel=blurKernel(settings),renderer=backend==='canvas2d'||settings.kind==='surface'?null:gpuContext(),owner={},count=Math.ceil(width/tileSize)*Math.ceil(height/tileSize);let completed=0,gpuTiles=0;
 try{for(const tile of tiles(width,height,tileSize)){const area=tileWindow(tile,width,height,kernel.halo);crop.width=area.width;crop.height=area.height;const ctx=crop.getContext('2d');ctx.drawImage(source,padding-area.x,padding-area.y);let filtered=kernel.radius?renderer?.blur(crop,kernel,owner):crop;
 if(filtered&&filtered!==crop)gpuTiles++;if(!filtered){const before=ctx.getImageData(0,0,area.width,area.height),pixels=blurPixels(before.data,area.width,area.height,settings);ctx.putImageData(new ImageData(pixels,area.width,area.height),0,0);filtered=crop;}
 target.drawImage(filtered,area.offsetX,area.offsetY,tile.width,tile.height,tile.x,tile.y,tile.width,tile.height);progress(++completed/count*100);}
 output._backend=gpuTiles?'webgl2':'canvas2d';output._tiles=completed;return output;
 }finally{crop.width=crop.height=1;releaseGPU(owner);}
}
