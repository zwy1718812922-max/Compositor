import { canvas, bounds, drawLayer, localPoint, textFont, textLines, transformPoint, MAX_PIXELS } from './editor.js';
import {selectionPath} from './selections.js';
import {affine,inverse} from './affine.mjs';

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
    if(l.type==='fill'){checkSize(l.width,l.height);pixels+=l.width*l.height;}
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
  const result = { ...l, x: l.type === 'group' ? 0 : l.x + x, y: l.type === 'group' ? 0 : l.y + y };
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

export function resizeImageProject(project, width, height, resolution) {
  checkSize(width, height);
  if (!Number.isFinite(resolution) || resolution < 1 || resolution > 9600) throw new Error('分辨率须为 1–9600 ppi。');
  const factor = width / project.width;
  const plans = project.layers.map(l => ({ layer: l, width: l.canvas ? l.type === 'text' ? l.canvas.width : Math.max(1, Math.round(l.canvas.width * factor)) : 0, height: l.canvas ? l.type === 'text' ? l.canvas.height : Math.max(1, Math.round(l.canvas.height * factor)) : 0 }));
  let pixels = 0;
  for (const p of plans) if (p.width) { checkSize(p.width, p.height); pixels += p.width * p.height; }
  for(const l of project.layers)if(l.type==='fill')pixels+=Math.max(1,Math.round(l.width*factor))*Math.max(1,Math.round(l.height*factor));
  if (pixels > MAX_PIXELS) throw new Error('缩放后像素图层合计超过 6400 万像素，请先合并或删除部分图层。');
  for (const l of project.layers) if (l.mask) {
    const w = Math.max(1, Math.round(l.mask.canvas.width * factor)), h = Math.max(1, Math.round(l.mask.canvas.height * factor)); checkSize(w, h); pixels += w * h;
  }
  if (pixels > MAX_PIXELS) throw new Error('缩放后图层与蒙版合计超过 6400 万像素。');
  const layers = plans.map(p => {
    const l = p.layer, result = { ...l, x: l.x * factor, y: l.y * factor, scale: l.type === 'text' ? l.scale * factor : l.scale, ...(l.scaleY !== undefined ? {scaleY:l.type==='text'?l.scaleY*factor:l.scaleY} : {}) };
    if (l.mask) {
      const m = l.mask, w = Math.max(1, Math.round(m.canvas.width * factor)), h = Math.max(1, Math.round(m.canvas.height * factor));
      const pixels = canvas(w, h), ctx = pixels.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(m.canvas, 0, 0, w, h);
      result.mask = { ...m, x: m.x * factor, y: m.y * factor, feather: m.feather * factor, canvas: pixels, data: undefined, _surface: undefined, _bounds: undefined };
    }
    return result;
  });
  checkLayers(layers);
  plans.forEach((p, i) => {
    if (!p.width || (p.width === p.layer.canvas.width && p.height === p.layer.canvas.height)) return;
    const pixels = canvas(p.width, p.height), ctx = pixels.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(p.layer.canvas, 0, 0, p.width, p.height);
    layers[i].canvas = pixels; delete layers[i].data; delete layers[i]._bounds;
  });
  for(const layer of layers)if(layer.type==='fill'){layer.width=Math.max(1,Math.round(layer.width*factor));layer.height=Math.max(1,Math.round(layer.height*factor));delete layer._fill;}
  return { ...project, width, height, resolution, layers,guides:(project.guides||[]).map(g=>({...g,position:g.position*factor})),ruler:project.ruler?{...project.ruler,origin:{x:project.ruler.origin.x*factor,y:project.ruler.origin.y*factor}}:undefined };
}

export function rasterize(layer) {
  if(layer.type==='fill'){const pixels=canvas(layer.width,layer.height);drawLayer(pixels.getContext('2d'),{...layer,x:0,y:0,scale:1,scaleY:1,skew:0,rotation:0,opacity:1,blend:'source-over',visible:true});const {fill,width,height,_fill,_pattern,...metadata}=layer;return{...metadata,type:'raster',canvas:pixels};}
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
  drawLayer(ctx, { ...layer, x: 0, y: 0, scale: 1, scaleY:1,skew:0, rotation: 0, opacity: 1, blend: 'source-over', visible: true });
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
