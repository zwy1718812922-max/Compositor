import {rasterLayer,drawLayer,maskSurface} from './editor.js';

export function copySelectionLayer(project,layer,selection) {
  if(!selection||['group','adjustment'].includes(layer.type))throw new Error('请选择包含像素或文字的图层，再复制选区。');
  const left=Math.max(0,Math.floor(selection.x)),top=Math.max(0,Math.floor(selection.y)),right=Math.min(project.width,Math.ceil(selection.x+selection.width)),bottom=Math.min(project.height,Math.ceil(selection.y+selection.height));
  if(right<=left||bottom<=top)throw new Error('选区在画布之外。');
  const copy=rasterLayer((layer.name+' 选区副本').slice(0,200),right-left,bottom-top),ctx=copy.canvas.getContext('2d');
  ctx.save();ctx.translate(-left,-top);drawLayer(ctx,{...layer,visible:true,opacity:1,blend:'source-over'});ctx.restore();
  if(layer.mask?.enabled){ctx.globalCompositeOperation='destination-in';ctx.drawImage(maskSurface(project,layer.mask),-left,-top);}
  if(selection.canvas){ctx.globalCompositeOperation='destination-in';ctx.drawImage(selection.canvas,selection.x-left,selection.y-top);}
  else {ctx.globalCompositeOperation='destination-in';ctx.fillStyle='white';ctx.fillRect(selection.x-left,selection.y-top,selection.width,selection.height);}
  ctx.globalCompositeOperation='source-over';
  const pixels=ctx.getImageData(0,0,copy.canvas.width,copy.canvas.height).data;
  if(!pixels.some((value,index)=>index%4===3&&value))throw new Error('选区内没有可复制的像素。');
  Object.assign(copy,{x:left,y:top,parentId:layer.parentId||null,opacity:layer.opacity,blend:layer.blend});
  if(layer.styles)copy.styles=structuredClone(layer.styles);if(layer.fillOpacity!==undefined)copy.fillOpacity=layer.fillOpacity;
  return copy;
}
