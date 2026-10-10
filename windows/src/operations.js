import { canvas, bounds, drawLayer, localPoint, textFont, textLines, transformPoint, MAX_PIXELS } from './editor.js';
import {validateShape} from './shape-model.mjs';
import {validateArtboard} from './artboard-model.mjs';
import {validateStyles} from './effect-model.mjs';
import {selectionPath} from './selections.js';
import {affine,inverse,multiply,decompose} from './affine.mjs';

export function rectangle(start, end) {
  const x = Math.floor(Math.min(start.x, end.x)), y = Math.floor(Math.min(start.y, end.y));
  return { x, y, width: Math.ceil(Math.max(start.x, end.x)) - x, height: Math.ceil(Math.max(start.y, end.y)) - y };
}

export function clipSelection(ctx, layer, selection) {
  if (!selection) return;
  if(selection.canvas){const transform=ctx.getTransform(),origin=localPoint(layer,{x:0,y:0});ctx.transform(...inverse(affine(layer)),origin.x,origin.y);ctx.clip(selectionPath(selection));ctx.setTransform(transform);return;}
  const { x, y, width, height } = selection;
  const points = [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }].map(p => localPoint(layer, p));
  ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath(); ctx.clip();
}

export function checkSize(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > MAX_PIXELS) throw new Error('尺寸须为 1–16384 的整数，画布总像素不超过 6400 万。');
}

function checkLayers(layers) {
  let pixels = 0;
  for (const l of layers) {
    if (Math.abs(l.x) > 100000 || Math.abs(l.y) > 100000 || l.scale < .01 || l.scale > 100 || (l.scaleY??l.scale)<.01 || (l.scaleY??l.scale)>100) throw new Error('缩放后图层的位置或比例超出限制，请先合并或栅格化该图层。');
    if(l.type==='fill')checkSize(l.width,l.height);if(l.shape)validateShape(l.shape);if(l.artboard)validateArtboard(l.artboard);if(l.styles)validateStyles(l.styles);
    if (l.canvas) { checkSize(l.canvas.width, l.canvas.height); pixels += l.canvas.width * l.canvas.height; }
    if (l.mask) {
      const m = l.mask;
      if (Math.abs(m.x) > 100000 || Math.abs(m.y) > 100000 || m.scale < .01 || m.scale > 100 || m.feather > 100) throw new Error('缩放后蒙版超出限制。');
      checkSize(m.canvas.width, m.canvas.height); pixels += m.canvas.width * m.canvas.height;
    }
  }
  if (pixels > MAX_PIXELS) throw new Error('缩放后像素图层合计超过 6400 万像素，请先合并或删除部分图层。');
}

function offsetLayer(l, x, y) {
  const result = { ...l, x: l.type === 'group' && !l.artboard ? 0 : l.x + x, y: l.type === 'group' && !l.artboard ? 0 : l.y + y };
  if (l.mask) result.mask = { ...l.mask, x: l.mask.x + x, y: l.mask.y + y, _surface: undefined };
  return result;
}

export function resizeCanvasProject(project, width, height, anchor) {
  checkSize(width, height);
  const x = Math.round((width - project.width) * anchor.x), y = Math.round((height - project.height) * anchor.y);
  const layers = project.layers.map(l => offsetLayer(l, x, y));
  checkLayers(layers);
  return { ...project, width, height, layers, guides:(project.guides||[]).map(g=>({...g,position:g.position+(g.axis==='x'?x:y)})),ruler:project.ruler?{...project.ruler,origin:{x:project.ruler.origin.x+x,y:project.ruler.origin.y+y}}:undefined };
}

export function cropProject(project, rect) {
  checkSize(rect.width, rect.height);
  const layers = project.layers.map(l => offsetLayer(l, -rect.x, -rect.y));
  checkLayers(layers);
  return { ...project, width: rect.width, height: rect.height, layers,guides:(project.guides||[]).map(g=>({...g,position:g.position-(g.axis==='x'?rect.x:rect.y)})),ruler:project.ruler?{...project.ruler,origin:{x:project.ruler.origin.x-rect.x,y:project.ruler.origin.y-rect.y}}:undefined };
}

export function resizeImageProject(project, width, height, resolution, options={}) {
  checkSize(width,height);if(!Number.isFinite(resolution)||resolution<1||resolution>9600)throw new Error('分辨率须为 1–9600 ppi。');
  const fx=width/project.width,fy=height/project.height,factor=Math.min(fx,fy),dimension=(n)=>Math.max(1,Math.round(n*factor));
  let total=0;for(const l of project.layers){if(l.canvas)total+=(l.type==='text'?l.canvas.width*l.canvas.height:dimension(l.canvas.width)*dimension(l.canvas.height));if(l.mask)total+=dimension(l.mask.canvas.width)*dimension(l.mask.canvas.height);}
  if(total>MAX_PIXELS)throw new Error('调整后图层与蒙版合计超过 6400 万像素。');
  const resample=source=>{const w=dimension(source.width),h=dimension(source.height);checkSize(w,h);if(w===source.width&&h===source.height)return source;const pixels=canvas(w,h),ctx=pixels.getContext('2d');ctx.imageSmoothingEnabled=options.method!=='nearest';ctx.imageSmoothingQuality=options.method==='bilinear'?'low':'high';ctx.drawImage(source,0,0,w,h);return pixels;};
  const layers=project.layers.map((l,index)=>{
    const result={...l,x:l.x*fx,y:l.y*fy};
    if(l.type!=='group'&&l.type!=='adjustment'){const density=l.type==='text'?1:l.type==='shape'?Math.min(1,factor):factor;Object.assign(result,decompose(multiply([fx/density,0,0,fy/density],affine(l))));}
    if(l.canvas&&l.type!=='text'){result.canvas=resample(l.canvas);delete result.data;delete result._bounds;}
    if(l.type==='shape'){const density=Math.min(1,factor),shape={...l.shape,width:l.shape.width*density,height:l.shape.height*density,strokeWidth:l.shape.strokeWidth*density,radii:l.shape.radii.map(r=>r*density)};result.shape=shape;}
    if(l.type==='fill'){result.width=dimension(l.width);result.height=dimension(l.height);result.fill={...l.fill,...(l.fill.kind==='pattern'?{scale:Math.max(1,Math.min(1000,l.fill.scale*factor))}:{})};delete result._fill;}
    if(l.artboard)result.artboard={...l.artboard,width:Math.max(1,Math.round(l.artboard.width*fx)),height:Math.max(1,Math.round(l.artboard.height*fy))};
    if(l.styles){result.stylesModified=true;result.styles=Object.fromEntries(Object.entries(l.styles).map(([key,e])=>[key,{...e,...(e.size===undefined?{}:{size:e.size*factor}),...(e.distance===undefined?{}:{distance:e.distance*factor})}]));}
    if(l.mask){const m=l.mask;result.mask={...m,x:m.x*fx,y:m.y*fy,...decompose(multiply([fx/factor,0,0,fy/factor],affine(m))),feather:m.feather*factor,canvas:resample(m.canvas),data:undefined,_surface:undefined,_bounds:undefined};}
    options.progress?.(Math.round((index+1)/project.layers.length*100));return result;
  });
  checkLayers(layers);
  return {...project,width,height,resolution,layers,guides:(project.guides||[]).map(g=>({...g,position:g.position*(g.axis==='x'?fx:fy)})),ruler:project.ruler?{...project.ruler,origin:{x:project.ruler.origin.x*fx,y:project.ruler.origin.y*fy}}:undefined};
}

export function expandRasterRect(layer,rect,capacity) {
  const points=[{x:rect.x,y:rect.y},{x:rect.x+rect.width,y:rect.y},{x:rect.x,y:rect.y+rect.height},{x:rect.x+rect.width,y:rect.y+rect.height}].map(p=>localPoint(layer,p)),left=Math.min(0,Math.floor(Math.min(...points.map(p=>p.x)))),top=Math.min(0,Math.floor(Math.min(...points.map(p=>p.y)))),right=Math.max(layer.canvas.width,Math.ceil(Math.max(...points.map(p=>p.x)))),bottom=Math.max(layer.canvas.height,Math.ceil(Math.max(...points.map(p=>p.y))));
  if(!left&&!top&&right===layer.canvas.width&&bottom===layer.canvas.height)return;
  const width=right-left,height=bottom-top;checkSize(width,height);capacity(width*height-layer.canvas.width*layer.canvas.height,1,0);
  const pixels=canvas(width,height);pixels.getContext('2d').drawImage(layer.canvas,-left,-top);Object.assign(layer,transformPoint(layer,{x:left,y:top}),{canvas:pixels});delete layer.data;delete layer._bounds;
}

export function rasterize(layer) {
  if(layer.type==='shape'){const padding=layer.shape.stroke==='none'?0:layer.shape.strokeWidth,pixels=canvas(Math.ceil(layer.shape.width+padding*2),Math.ceil(layer.shape.height+padding*2)),ctx=pixels.getContext('2d');ctx.translate(padding,padding);drawLayer(ctx,{...layer,x:0,y:0,scale:1,scaleY:1,skew:0,rotation:0,opacity:1,blend:'source-over',visible:true,flipX:false,flipY:false});const pos=transformPoint(layer,{x:-padding,y:-padding}),{shape,...metadata}=layer;return {...metadata,...pos,type:'raster',canvas:pixels};}
  if(layer.type==='fill'){const pixels=canvas(layer.width,layer.height);drawLayer(pixels.getContext('2d'),{...layer,x:0,y:0,scale:1,scaleY:1,skew:0,rotation:0,opacity:1,blend:'source-over',visible:true,flipX:false,flipY:false});const {fill,width,height,_fill,_pattern,...metadata}=layer;return{...metadata,type:'raster',canvas:pixels};}
  const size = bounds(layer), measure = canvas(1, 1).getContext('2d');
  measure.font = textFont(layer); measure.textBaseline = 'top';
  let left = 0, top = 0, right = size.width, bottom = size.height;
  textLines(layer).forEach((line, i) => {
    const m = measure.measureText(line), y = i * layer.fontSize * (layer.lineHeight || 1.35);
    left = Math.min(left, -m.actualBoundingBoxLeft); right = Math.max(right, m.actualBoundingBoxRight);
    top = Math.min(top, y - m.actualBoundingBoxAscent); bottom = Math.max(bottom, y + m.actualBoundingBoxDescent);
  });
  left = Math.floor(left) - 1; top = Math.floor(top) - 1;
  const width = Math.ceil(right) - left + 1, height = Math.ceil(bottom) - top + 1;
  checkSize(width, height);
  const pixels = canvas(width, height), ctx = pixels.getContext('2d'); ctx.translate(-left, -top);
  drawLayer(ctx, { ...layer, x: 0, y: 0, scale: 1, scaleY:1,skew:0, rotation: 0, opacity: 1, blend: 'source-over', visible: true,flipX:false,flipY:false });
  const { text, font, fontSize, color, bold, data, textMode, boxWidth, boxHeight, align, lineHeight, letterSpacing, textRasterCache, psdTextSource, textCacheOrigin, ...metadata } = layer;
  const rad = layer.rotation * Math.PI / 180;
  return { ...metadata, ...transformPoint(layer,{x:left,y:top}), type: 'raster', canvas: pixels };
}

export function adjustRaster(layer, original, selection, settings) {
  const filtered = canvas(original.width, original.height), f = filtered.getContext('2d');
  f.filter = `brightness(${settings.brightness}%) contrast(${settings.contrast}%) saturate(${settings.saturation}%) hue-rotate(${settings.hue}deg) grayscale(${settings.grayscale}%) invert(${settings.invert}%) blur(${settings.blur}px)`;
  f.drawImage(original, 0, 0);
  if (!selection) return filtered;
  const output = canvas(original.width, original.height), ctx = output.getContext('2d');
  ctx.drawImage(original, 0, 0); ctx.save(); clipSelection(ctx, layer, selection);
  ctx.clearRect(0, 0, output.width, output.height); ctx.drawImage(filtered, 0, 0); ctx.restore();
  return output;
}
