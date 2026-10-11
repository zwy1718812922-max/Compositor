import { affine, inverse, multiply, vector, decompose } from './affine.mjs';
import { colorProfile,proofPixels } from './color-engine.mjs';
import { childrenOf, ancestors, isVisible } from './layer-tree.js';
import { paintFill, applyAdjustment } from './fill-renderer.js';
import { applyEffects } from './effects.js';
import { hasEffects } from './effect-model.mjs';
import { paintShape,normalizeShapeTransform } from './shape-model.mjs';
import { layoutText,paintTextLine } from './text-layout.js';
export const MAX_PIXELS = 16384 * 16384;
const revisions = new WeakMap(), historyPixels = new WeakMap();
export const pixelRevision = bitmap => revisions.get(bitmap) || 0;
export function canvas(width, height) {
  const result = typeof document==='undefined' ? new OffscreenCanvas(width,height) : document.createElement('canvas');
  result.width = width; result.height = height;
  return result;
}
export function baseLayer(name, type = 'raster') {
  return { id: crypto.randomUUID(), name, type, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, blend: 'source-over', visible: true, locked: false };
}
export function rasterLayer(name, width, height, background) {
  const layer = { ...baseLayer(name), canvas: canvas(width, height) };
  if (background && background !== 'transparent') {
    const ctx = layer.canvas.getContext('2d');
    ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
  }
  return layer;
}
export function textLayer(text, x, y, color) {
  return { ...baseLayer('文字', 'text'), text, x, y, color, font: 'Microsoft YaHei', fontSize: 64, bold: false };
}
export function groupLayer(name) { return { ...baseLayer(name, 'group'), blend: 'pass-through', collapsed: false, parentId: null }; }
export function invalidatePixels(target) { if(target.canvas){revisions.set(target.canvas,pixelRevision(target.canvas)+1);historyPixels.delete(target.canvas);}delete target.data; delete target._surface; delete target._bounds; }
export function transformPoint(layer, p) {
  const v = vector(affine(layer),p); return {x:layer.x+v.x,y:layer.y+v.y};
}
export function updateLinkedMask(layer, previous) {
  if (!layer.mask?.linked) return;
  const mask = layer.mask, pos = transformPoint(layer, localPoint(previous, mask));
  mask.x = pos.x; mask.y = pos.y; Object.assign(mask,decompose(multiply(multiply(affine(layer),inverse(affine(previous))),affine(mask)))); delete mask._surface;
}
export function textFont(layer) {
  return (layer.italic ? 'italic ' : '') + (layer.bold ? '700 ' : (layer.fontWeight || 400) + ' ') + layer.fontSize + 'px "' + layer.font.replace(/["\\]/g, '') + '", "Microsoft YaHei", sans-serif';
}
export function textLines(layer) {
  const ctx = canvas(1, 1).getContext('2d'); ctx.font = textFont(layer); ctx.letterSpacing = (layer.letterSpacing || 0) + 'px';
  if (layer.textMode !== 'paragraph') return layer.text.split('\n');
  const lines = [];
  for (const paragraph of layer.text.split('\n')) {
    let line = '';
    for (const character of Array.from(paragraph)) { if (line && ctx.measureText(line + character).width > layer.boxWidth) { lines.push(line); line = ''; } line += character; }
    lines.push(line);
  }
  return lines;
}
export function bounds(layer) {
  if(layer.artboard)return {width:layer.artboard.width,height:layer.artboard.height};
  if(layer.type==='shape')return {width:layer.shape.width,height:layer.shape.height};
  if(layer.type==='fill')return {width:layer.width,height:layer.height};
  if(layer.type==='adjustment')return {width:1,height:1};
  if (layer.type === 'group') return { width: 1, height: 1 };
  if (layer.canvas) return { width: layer.canvas.width, height: layer.canvas.height };
  const ctx = canvas(1, 1).getContext('2d');
  ctx.font = textFont(layer);
  ctx.letterSpacing = (layer.letterSpacing || 0) + 'px';
  const lines = textLines(layer);
  return { width: layer.textMode === 'paragraph' ? layer.boxWidth : Math.max(12, ...layoutText(ctx,layer).lines.map(line => ctx.measureText(line.text).width+line.x)), height: layer.textMode === 'paragraph' ? layer.boxHeight : layoutText(ctx,layer).height };
}
export function visualBounds(layer) {
  if (!layer.canvas) return { x:0,y:0,...bounds(layer) };
  if (layer._bounds) return layer._bounds;
  const w = layer.canvas.width,h = layer.canvas.height,data = layer.canvas.getContext('2d').getImageData(0,0,w,h).data;
  let left=w,top=h,right=-1,bottom=-1;
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) if (data[(y*w+x)*4+3]) { left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y); }
  layer._bounds = right<left ? {x:0,y:0,width:w,height:h,empty:true} : {x:left,y:top,width:right-left+1,height:bottom-top+1}; return layer._bounds;
}
export function layerTransform(ctx, layer) {
  ctx.transform(...affine(layer),layer.x,layer.y);
}
export function localPoint(layer, point) {
  return vector(inverse(affine(layer)),{x:point.x-layer.x,y:point.y-layer.y});
}
export function drawLayer(ctx, layer) {
  if (!layer.visible || layer.opacity === 0) return;
  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.globalCompositeOperation = layer.blend;
  layerTransform(ctx, layer);
  if(layer.type==='adjustment'){ctx.restore();return;}
  if(layer.type==='fill')paintFill(ctx,layer);
  else if(layer.type==='shape')paintShape(ctx,layer.shape);
  else if (layer.type === 'raster' || layer.textRasterCache && layer.canvas) ctx.drawImage(layer.canvas, 0, 0);
  else {
    ctx.font = textFont(layer); ctx.textBaseline = 'top'; ctx.fillStyle = layer.color;
    ctx.letterSpacing = (layer.letterSpacing || 0) + 'px';
    const size = bounds(layer);
    if (layer.textMode === 'paragraph') { ctx.beginPath(); ctx.rect(0, 0, size.width, size.height); ctx.clip(); }
    ctx.direction=layer.paragraph?.direction||'ltr';
    layoutText(ctx,layer).lines.forEach(line=>paintTextLine(ctx,layer,line,size));
  }
  ctx.restore();
}
export function maskSurface(project, mask) {
  const key = [project.width, project.height, mask.x, mask.y, mask.scale, mask.scaleY, mask.skew, mask.rotation,mask.flipX,mask.flipY, mask.defaultColor, mask.density, mask.feather,pixelRevision(mask.canvas)].join(',');
  if (mask._surface?.key === key && mask._surface.bitmap === mask.canvas) return mask._surface.canvas;
  let pixels = canvas(project.width, project.height), ctx = pixels.getContext('2d');
  const gray = Math.round(mask.defaultColor ?? 255);
  ctx.fillStyle = `rgb(${gray},${gray},${gray})`; ctx.fillRect(0, 0, pixels.width, pixels.height);
  ctx.save(); layerTransform(ctx, mask); ctx.drawImage(mask.canvas, 0, 0); ctx.restore();
  if (mask.feather > 0) {
    const blurred = canvas(project.width, project.height), b = blurred.getContext('2d');
    b.fillStyle = `rgb(${gray},${gray},${gray})`; b.fillRect(0, 0, blurred.width, blurred.height); b.filter = `blur(${mask.feather}px)`; b.drawImage(pixels, 0, 0); pixels = blurred; ctx = b;
  }
  const image = ctx.getImageData(0, 0, pixels.width, pixels.height), density = mask.density ?? 1;
  for (let i = 0; i < image.data.length; i += 4) {
    const value = image.data[i] * .2126 + image.data[i + 1] * .7152 + image.data[i + 2] * .0722;
    image.data[i + 3] = Math.round(255 * (1 - density) + value * density);
    image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
  }
  ctx.putImageData(image, 0, 0); mask._surface = { key, bitmap:mask.canvas, canvas: pixels }; return pixels;
}
export function layerSurface(project, layer, includeMask = true) {
  const cache=project._renderCache;
  const key=cache&&layer.type!=='group'?JSON.stringify([includeMask,layer.x,layer.y,layer.scale,layer.scaleY,layer.skew,layer.rotation,layer.flipX,layer.flipY,layer.type,layer.text,layer.font,layer.fontSize,layer.fontWeight,layer.bold,layer.italic,layer.underline,layer.color,layer.align,layer.letterSpacing,layer.lineHeight,layer.textMode,layer.boxWidth,layer.boxHeight,layer.paragraph,layer.strike,layer.shape,layer.artboard,layer.textRasterCache,layer.fill,layer.fillOpacity,layer.stylesEnabled,layer.styles,layer.mask&&[layer.mask.x,layer.mask.y,layer.mask.scale,layer.mask.scaleY,layer.mask.skew,layer.mask.rotation,layer.mask.flipX,layer.mask.flipY,layer.mask.enabled,layer.mask.density,layer.mask.feather,layer.mask.defaultColor,pixelRevision(layer.mask.canvas)],pixelRevision(layer.canvas)]):null;
  const entry=key&&cache.get(layer.id);
  if(entry?.key===key&&entry.bitmap===layer.canvas&&entry.mask===layer.mask?.canvas)return entry.surface;
  const result = canvas(project.width, project.height), ctx = result.getContext('2d');
  if (layer.type === 'group') { if(layer.artboard)renderArtboard(ctx,project,layer);else renderSiblings(ctx, project, layer.id); }
  else drawLayer(ctx, { ...layer, opacity: 1, blend: 'source-over', visible: true });
  if (includeMask && layer.mask?.enabled) { ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(maskSurface(project, layer.mask), 0, 0); }
  let region;
  if (!project._renderCache && layer.type !== 'group' && (hasEffects(layer) || (layer.fillOpacity ?? 1) !== 1)) { const b=visualBounds(layer), points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>transformPoint(layer,{x,y})); const margin=layer.type==='text'&&!layer.textRasterCache ? layer.fontSize*Math.max(layer.scale,layer.scaleY??layer.scale) : 2; region={x:Math.min(...points.map(p=>p.x))-margin,y:Math.min(...points.map(p=>p.y))-margin,right:Math.max(...points.map(p=>p.x))+margin,bottom:Math.max(...points.map(p=>p.y))+margin}; }
  const output=applyEffects(result, layer,region);
  if(key)cache.put(layer.id,{key,bitmap:layer.canvas,mask:layer.mask?.canvas,surface:output});
  return output;
}
function blendColor(b, s, mode) {
  if (mode === 'multiply') return b * s;
  if (mode === 'screen') return b + s - b * s;
  if (mode === 'overlay') return b <= .5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
  if (mode === 'hard-light') return s <= .5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
  if (mode === 'soft-light') return s <= .5 ? b - (1 - 2 * s) * b * (1 - b) : b + (2 * s - 1) * ((b <= .25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)) - b);
  if (mode === 'darken') return Math.min(b, s);
  if (mode === 'lighten') return Math.max(b, s);
  if (mode === 'difference') return Math.abs(b - s);
  return s;
}
function clipBlend(target, source, opacity, blend) {
  const ctx = target.getContext('2d'), a = ctx.getImageData(0, 0, target.width, target.height), b = source.getContext('2d').getImageData(0, 0, source.width, source.height);
  for (let i = 0; i < a.data.length; i += 4) {
    if (!a.data[i + 3] || !b.data[i + 3]) continue;
    const alpha = b.data[i + 3] / 255 * opacity;
    for (let c = 0; c < 3; c++) a.data[i + c] = Math.round((1 - alpha) * a.data[i + c] + alpha * 255 * blendColor(a.data[i + c] / 255, b.data[i + c] / 255, blend));
  }
  ctx.putImageData(a, 0, 0);
}
function renderArtboard(ctx,project,layer) {
  const a=layer.artboard;ctx.save();ctx.beginPath();ctx.rect(layer.x,layer.y,a.width,a.height);ctx.clip();
  if(a.background!=='transparent'){ctx.fillStyle=a.background;ctx.fillRect(layer.x,layer.y,a.width,a.height);}
  renderSiblings(ctx,project,layer.id);ctx.restore();
}
function renderSiblings(ctx, project, parentId = null) {
  const layers = childrenOf(project, parentId);
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i]; if (l.clipping) continue;
    if(l.type==='adjustment'){if(l.visible&&l.opacity)applyAdjustment(ctx,project,l);continue;}
    const clipped = []; while (layers[i + 1]?.clipping) clipped.push(layers[++i]);
    if (!l.visible || l.opacity === 0) continue;
    if (!clipped.length && l.type === 'group' && l.blend === 'pass-through' && l.opacity === 1 && !l.mask?.enabled && !hasEffects(l) && (l.fillOpacity ?? 1) === 1) { if(l.artboard)renderArtboard(ctx,project,l);else renderSiblings(ctx, project, l.id); continue; }
    if (!clipped.length && l.type === 'group' && l.blend === 'pass-through' && !hasEffects(l) && (l.fillOpacity ?? 1) === 1) {
      const surface = canvas(project.width, project.height), g = surface.getContext('2d'); g.drawImage(ctx.canvas, 0, 0); renderSiblings(g, project, l.id);
      const before = ctx.getImageData(0, 0, project.width, project.height), after = g.getImageData(0, 0, project.width, project.height);
      const mask = l.mask?.enabled ? maskSurface(project, l.mask).getContext('2d').getImageData(0, 0, project.width, project.height).data : null;
      for (let n = 0; n < before.data.length; n += 4) {
        const weight = l.opacity * (mask ? mask[n + 3] / 255 : 1), a = before.data[n + 3] / 255, b = after.data[n + 3] / 255, alpha = a * (1 - weight) + b * weight;
        for (let c = 0; c < 3; c++) before.data[n + c] = alpha ? (before.data[n + c] * a * (1 - weight) + after.data[n + c] * b * weight) / alpha : 0;
        before.data[n + 3] = alpha * 255;
      }
      ctx.putImageData(before, 0, 0); continue;
    }
    if (!clipped.length && l.type !== 'group' && !l.mask?.enabled && !hasEffects(l) && (l.fillOpacity ?? 1) === 1) { drawLayer(ctx, l); continue; }
    let pixels = layerSurface(project, l);
    if(clipped.length&&project._renderCache){const copy=canvas(pixels.width,pixels.height);copy.getContext('2d').drawImage(pixels,0,0);pixels=copy;}
    for (const upper of clipped) if (upper.visible && upper.opacity) {if(upper.type==='adjustment')applyAdjustment(pixels.getContext('2d'),project,upper);else clipBlend(pixels, layerSurface(project, upper), upper.opacity, upper.blend);}
    ctx.save(); ctx.globalAlpha = l.opacity; ctx.globalCompositeOperation = l.blend === 'pass-through' ? 'source-over' : l.blend; ctx.drawImage(pixels, 0, 0); ctx.restore();
  }
}
export function composite(project, background, proof=true) {
  const result = canvas(project.width, project.height);
  renderInto(result, project, background,proof);
  return result;
}
export function renderInto(target, project, background,proof=true) {
  const ctx = target.getContext('2d');
  ctx.clearRect(0, 0, target.width, target.height);
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, target.width, target.height); }
  renderSiblings(ctx, project);
  if(proof&&project.colorMode==='CMYK'){const profile=colorProfile(project.colorProfile?.data);if(profile)ctx.putImageData(proofPixels(ctx.getImageData(0,0,target.width,target.height),profile),0,0);}
}
export function hitLayer(project, point) {
  const pixel = canvas(1, 1), ctx = pixel.getContext('2d');
  const masks=new Map();
  const maskAlpha = mask => {
    if(masks.has(mask))return masks.get(mask);
    let value;
    if(mask.feather>0)value=maskSurface(project,mask).getContext('2d').getImageData(Math.floor(point.x),Math.floor(point.y),1,1).data[3]/255;
    else {
      const c=canvas(1,1),m=c.getContext('2d'),gray=Math.round(mask.defaultColor??255);m.fillStyle=`rgb(${gray},${gray},${gray})`;m.fillRect(0,0,1,1);
      m.translate(-Math.floor(point.x),-Math.floor(point.y));layerTransform(m,mask);m.drawImage(mask.canvas,0,0);const rgba=m.getImageData(0,0,1,1).data,density=mask.density??1;
      value=Math.round(255*(1-density)+(rgba[0]*.2126+rgba[1]*.7152+rgba[2]*.0722)*density)/255;
    }
    masks.set(mask,value);return value;
  };
  const alpha = l => {
    ctx.clearRect(0, 0, 1, 1); ctx.save(); ctx.translate(-Math.floor(point.x), -Math.floor(point.y)); drawLayer(ctx, { ...l, blend: 'source-over' }); ctx.restore();
    let value = ctx.getImageData(0, 0, 1, 1).data[3];
    if (l.mask?.enabled) value *= maskAlpha(l.mask);
    return value;
  };
  for (const l of [...project.layers].reverse()) {
    if (l.type === 'group' || !isVisible(project, l) || !alpha(l)) continue;
    if(ancestors(project,l).some(a=>a.artboard&&(point.x<a.x||point.y<a.y||point.x>a.x+a.artboard.width||point.y>a.y+a.artboard.height)))continue;
    const parents = ancestors(project, l);
    if (parents.some(p => !p.opacity || p.mask?.enabled && !maskAlpha(p.mask))) continue;
    if (l.clipping) { const siblings = childrenOf(project, l.parentId), base = siblings.slice(0, siblings.indexOf(l)).reverse().find(p => !p.clipping); if (!base || base.type === 'group' || !base.visible || !alpha(base)) continue; }
    return l;
  }
  return project.layers.slice().reverse().find(l=>l.artboard&&isVisible(project,l)&&l.opacity>0&&point.x>=l.x&&point.y>=l.y&&point.x<l.x+l.artboard.width&&point.y<l.y+l.artboard.height)||null;
}
export function serialize(project, forHistory = false) {
  const bitmapFields = item => {
    if(!forHistory)return {data:item.data||(item.data=item.canvas.toDataURL('image/png'))};
    let bitmap=historyPixels.get(item.canvas);
    if(!bitmap){bitmap=canvas(item.canvas.width,item.canvas.height);bitmap.getContext('2d').drawImage(item.canvas,0,0);historyPixels.set(item.canvas,bitmap);}
    return {_bitmap:bitmap,...(item._bounds?{_bounds:{...item._bounds}}:{})};
  };
  return {
    format: 'com.compositor.windows', version: 8,colorMode:project.colorMode||'RGB',...(project.colorProfile?{colorProfile:structuredClone(project.colorProfile)}:{}), guides:(project.guides || []).map(g=>({...g})), ruler:structuredClone(project.ruler || {unit:'px',origin:{x:0,y:0},visible:true,guidesVisible:true,locked:false}), width: project.width, height: project.height, resolution: project.resolution ?? 72, colorSpace: 'sRGB', activeId: project.activeId,
    layers: project.layers.map(layer => {
      const { canvas: pixels, mask, data, _bitmap, _surface, _bounds, _fill, _pattern, ...metadata } = layer;
      const output = pixels ? { ...structuredClone(metadata), ...bitmapFields(layer) } : structuredClone(metadata);
      if (mask) { const { canvas: bitmap, data, _bitmap, _surface, _bounds, ...settings } = mask; output.mask = { ...settings, ...bitmapFields(mask) }; }
      return output;
    })
  };
}
export async function decodeImage(data) {
  const image = new Image();
  image.src = data;
  await image.decode().catch(() => { throw new Error('图片无法读取，可能已损坏或格式不受支持。'); });
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 16384 || image.naturalHeight > 16384 || image.naturalWidth * image.naturalHeight > MAX_PIXELS) throw new Error('图片超过当前绘图引擎的单边尺寸范围。');
  return image;
}
export async function deserialize(data) {
  // The main process validates the format, metadata, limits, and PNG headers.
  const layers = [];
  for (const layer of data.layers) {
      if (layer.type !== 'raster' && !layer.textRasterCache) layers.push({ ...layer });
    else {
      const {pixels:raw,_bitmap,...metadata}=layer;
      const image = raw || _bitmap || await decodeImage(layer.data);
      const pixels = canvas(image.width||image.naturalWidth, image.height||image.naturalHeight);
      if(raw)pixels.getContext('2d').putImageData(new ImageData(raw.data,raw.width,raw.height),0,0);
      else pixels.getContext('2d').drawImage(image, 0, 0);
      const restored={ ...metadata, canvas: pixels };if(raw?.bounds)restored._bounds=raw.bounds;layers.push(restored);
    }
    normalizeShapeTransform(layers.at(-1));
    if(layer.fill?.data)layers.at(-1)._pattern=await decodeImage(layer.fill.data);
    if (layer.mask) {
      const {pixels:raw,_bitmap,...metadata}=layer.mask,image=raw||_bitmap||await decodeImage(layer.mask.data),pixels=canvas(image.width||image.naturalWidth,image.height||image.naturalHeight);
      if(raw)pixels.getContext('2d').putImageData(new ImageData(raw.data,raw.width,raw.height),0,0);else pixels.getContext('2d').drawImage(image,0,0);
      layers.at(-1).mask = { ...metadata, canvas: pixels };
    }
  }
  return { width: data.width, height: data.height, resolution: data.resolution ?? 72, colorSpace: 'sRGB',colorMode:data.colorMode||'RGB',colorProfile:data.colorProfile, activeId: data.activeId, guides:data.guides || [], ruler:data.ruler || {unit:'px',origin:{x:0,y:0},visible:true,guidesVisible:true,locked:false}, layers };
}
export class History {
  constructor() { this.reset(); }
  reset() { this.undoStack = []; this.redoStack = []; }
  push(snapshot) {
    this.undoStack.push(snapshot); this.redoStack = [];
    // Unchanged pixels share immutable canvases across undo entries.
    const size=()=>{let bytes=0;const seen=new Set();for(const s of this.undoStack)for(const l of s.layers)for(const item of [l,l.mask].filter(Boolean)){const pixels=item._bitmap;if(pixels){if(!seen.has(pixels)){seen.add(pixels);bytes+=pixels.width*pixels.height*4;}}else bytes+=(item.data?.length||item.text?.length||0);}return bytes;};
    while (this.undoStack.length > 25 || (this.undoStack.length > 1 && size() > 192 * 1024 * 1024)) this.undoStack.shift();
  }
}
