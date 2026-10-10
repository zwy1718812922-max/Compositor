import { canvas, maskSurface } from './editor.js';
import { adjustPixels } from './fill-model.mjs';
export function fillSurface(layer) {
 const key=JSON.stringify([layer.width,layer.height,layer.fill]);if(layer._fill?.key===key)return layer._fill.canvas;
 const c=canvas(layer.width,layer.height),ctx=c.getContext('2d'),f=layer.fill;ctx.fillStyle=f.color;
 if(f.kind==='gradient'){const r=f.angle*Math.PI/180,dx=Math.cos(r)*layer.width/2,dy=Math.sin(r)*layer.height/2,g=ctx.createLinearGradient(layer.width/2-dx,layer.height/2-dy,layer.width/2+dx,layer.height/2+dy);g.addColorStop(0,f.color);g.addColorStop(1,f.color2);ctx.fillStyle=g;}
 if(f.kind==='pattern'){
  const tile=canvas(32,32),t=tile.getContext('2d');t.fillStyle=f.color2;t.fillRect(0,0,32,32);t.fillStyle=f.color;
  if(f.pattern==='image'&&layer._pattern)t.drawImage(layer._pattern,0,0,32,32);
  else if(f.pattern==='dots'){t.beginPath();t.arc(16,16,6,0,Math.PI*2);t.fill();}
  else if(f.pattern==='stripes'){t.fillRect(0,0,16,32);}
  else {t.fillRect(0,0,16,16);t.fillRect(16,16,16,16);}
  const pattern=ctx.createPattern(tile,'repeat');pattern.setTransform(new DOMMatrix().scale(f.scale/100));ctx.fillStyle=pattern;
 }
 ctx.fillRect(0,0,c.width,c.height);layer._fill={key,canvas:c};return c;
}
export function applyAdjustment(ctx,project,layer) {
 const before=ctx.getImageData(0,0,ctx.canvas.width,ctx.canvas.height),data=new Uint8ClampedArray(before.data);adjustPixels(data,layer.adjustment.kind,layer.adjustment.values);
 const mask=layer.mask?.enabled?maskSurface(project,layer.mask).getContext('2d').getImageData(0,0,project.width,project.height).data:null;
 for(let i=0;i<data.length;i+=4){const a=layer.opacity*(mask?mask[i+3]/255:1);for(let c=0;c<3;c++)before.data[i+c]=before.data[i+c]*(1-a)+data[i+c]*a;}
 ctx.putImageData(before,0,0);
}
