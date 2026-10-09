import { childrenOf, ancestors, isVisible } from './layer-tree.js';
export const MAX_PIXELS = 64 * 1024 * 1024;
export function canvas(width, height) {
  const result = document.createElement('canvas');
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
export function invalidatePixels(target) { delete target.data; delete target._surface; }
export function transformPoint(layer, p) {
  const rad = layer.rotation * Math.PI / 180;
  return { x: layer.x + layer.scale * (p.x * Math.cos(rad) - p.y * Math.sin(rad)), y: layer.y + layer.scale * (p.x * Math.sin(rad) + p.y * Math.cos(rad)) };
}
export function updateLinkedMask(layer, previous) {
  if (!layer.mask?.linked) return;
  const mask = layer.mask, pos = transformPoint(layer, localPoint(previous, mask));
  mask.x = pos.x; mask.y = pos.y; mask.scale *= layer.scale / previous.scale; mask.rotation += layer.rotation - previous.rotation; delete mask._surface;
}
export function textFont(layer) {
  return (layer.bold ? 'bold ' : '') + layer.fontSize + 'px "' + layer.font.replace(/["\\]/g, '') + '", "Microsoft YaHei", sans-serif';
}
export function bounds(layer) {
  if (layer.type === 'group') return { width: 1, height: 1 };
  if (layer.canvas) return { width: layer.canvas.width, height: layer.canvas.height };
  const ctx = canvas(1, 1).getContext('2d');
  ctx.font = textFont(layer);
  const lines = layer.text.split('\n');
  return { width: Math.max(12, ...lines.map(line => ctx.measureText(line).width)), height: Math.max(1, lines.length) * layer.fontSize * 1.35 };
}
export function layerTransform(ctx, layer) {
  ctx.translate(layer.x, layer.y);
  ctx.rotate(layer.rotation * Math.PI / 180);
  ctx.scale(layer.scale, layer.scale);
}
export function localPoint(layer, point) {
  const rad = -layer.rotation * Math.PI / 180;
  const x = point.x - layer.x, y = point.y - layer.y;
  return { x: (x * Math.cos(rad) - y * Math.sin(rad)) / layer.scale, y: (x * Math.sin(rad) + y * Math.cos(rad)) / layer.scale };
}
export function drawLayer(ctx, layer) {
  if (!layer.visible || layer.opacity === 0) return;
  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.globalCompositeOperation = layer.blend;
  layerTransform(ctx, layer);
  if (layer.type === 'raster') ctx.drawImage(layer.canvas, 0, 0);
  else {
    ctx.font = textFont(layer); ctx.textBaseline = 'top'; ctx.fillStyle = layer.color;
    layer.text.split('\n').forEach((line, i) => ctx.fillText(line, 0, i * layer.fontSize * 1.35));
  }
  ctx.restore();
}
export function maskSurface(project, mask) {
  const key = [project.width, project.height, mask.x, mask.y, mask.scale, mask.rotation, mask.defaultColor, mask.density, mask.feather].join(',');
  if (mask._surface?.key === key) return mask._surface.canvas;
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
  ctx.putImageData(image, 0, 0); mask._surface = { key, canvas: pixels }; return pixels;
}
export function layerSurface(project, layer, includeMask = true) {
  const result = canvas(project.width, project.height), ctx = result.getContext('2d');
  if (layer.type === 'group') renderSiblings(ctx, project, layer.id);
  else drawLayer(ctx, { ...layer, opacity: 1, blend: 'source-over', visible: true });
  if (includeMask && layer.mask?.enabled) { ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(maskSurface(project, layer.mask), 0, 0); }
  return result;
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
function renderSiblings(ctx, project, parentId = null) {
  const layers = childrenOf(project, parentId);
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i]; if (l.clipping) continue;
    const clipped = []; while (layers[i + 1]?.clipping) clipped.push(layers[++i]);
    if (!l.visible || l.opacity === 0) continue;
    if (!clipped.length && l.type === 'group' && l.blend === 'pass-through' && l.opacity === 1 && !l.mask?.enabled) { renderSiblings(ctx, project, l.id); continue; }
    if (!clipped.length && l.type === 'group' && l.blend === 'pass-through') {
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
    if (!clipped.length && l.type !== 'group' && !l.mask?.enabled) { drawLayer(ctx, l); continue; }
    const pixels = layerSurface(project, l);
    for (const upper of clipped) if (upper.visible && upper.opacity) clipBlend(pixels, layerSurface(project, upper), upper.opacity, upper.blend);
    ctx.save(); ctx.globalAlpha = l.opacity; ctx.globalCompositeOperation = l.blend === 'pass-through' ? 'source-over' : l.blend; ctx.drawImage(pixels, 0, 0); ctx.restore();
  }
}
export function composite(project, background) {
  const result = canvas(project.width, project.height);
  renderInto(result, project, background);
  return result;
}
export function renderInto(target, project, background) {
  const ctx = target.getContext('2d');
  ctx.clearRect(0, 0, target.width, target.height);
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, target.width, target.height); }
  renderSiblings(ctx, project);
}
export function hitLayer(project, point) {
  const pixel = canvas(1, 1), ctx = pixel.getContext('2d');
  const alpha = l => {
    ctx.clearRect(0, 0, 1, 1); ctx.save(); ctx.translate(-Math.floor(point.x), -Math.floor(point.y)); drawLayer(ctx, { ...l, blend: 'source-over' }); ctx.restore();
    let value = ctx.getImageData(0, 0, 1, 1).data[3];
    if (l.mask?.enabled) value *= maskSurface(project, l.mask).getContext('2d').getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data[3] / 255;
    return value;
  };
  for (const l of [...project.layers].reverse()) {
    if (l.type === 'group' || !isVisible(project, l) || !alpha(l)) continue;
    const parents = ancestors(project, l);
    if (parents.some(p => !p.opacity || p.mask?.enabled && !maskSurface(project, p.mask).getContext('2d').getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data[3])) continue;
    if (l.clipping) { const siblings = childrenOf(project, l.parentId), base = siblings.slice(0, siblings.indexOf(l)).reverse().find(p => !p.clipping); if (!base || base.type === 'group' || !base.visible || !alpha(base)) continue; }
    return l;
  }
  return null;
}
export function serialize(project) {
  return {
    format: 'com.compositor.windows', version: 3, width: project.width, height: project.height, resolution: project.resolution ?? 72, colorSpace: 'sRGB', activeId: project.activeId,
    layers: project.layers.map(layer => {
      const { canvas: pixels, mask, ...metadata } = layer;
      const output = pixels ? { ...metadata, data: layer.data || pixels.toDataURL('image/png') } : metadata;
      if (mask) { const { canvas: bitmap, _surface, ...settings } = mask; output.mask = { ...settings, data: mask.data || bitmap.toDataURL('image/png') }; }
      return output;
    })
  };
}
export async function decodeImage(data) {
  const image = new Image();
  image.src = data;
  await image.decode().catch(() => { throw new Error('图片无法读取，可能已损坏或格式不受支持。'); });
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 16384 || image.naturalHeight > 16384 || image.naturalWidth * image.naturalHeight > MAX_PIXELS) throw new Error('图片过大，请先缩小至 6400 万像素以内。');
  return image;
}
export async function deserialize(data) {
  // The main process validates the format, metadata, limits, and PNG headers.
  const layers = [];
  for (const layer of data.layers) {
    if (layer.type !== 'raster') layers.push({ ...layer });
    else {
      const image = await decodeImage(layer.data);
      const pixels = canvas(image.naturalWidth, image.naturalHeight);
      pixels.getContext('2d').drawImage(image, 0, 0);
      layers.push({ ...layer, canvas: pixels });
    }
    if (layer.mask) {
      const image = await decodeImage(layer.mask.data), pixels = canvas(image.naturalWidth, image.naturalHeight);
      pixels.getContext('2d').drawImage(image, 0, 0);
      layers.at(-1).mask = { ...layer.mask, canvas: pixels };
    }
  }
  return { width: data.width, height: data.height, resolution: data.resolution ?? 72, colorSpace: 'sRGB', activeId: data.activeId, layers };
}
export class History {
  constructor() { this.reset(); }
  reset() { this.undoStack = []; this.redoStack = []; }
  push(snapshot) {
    this.undoStack.push(snapshot); this.redoStack = [];
    // Snapshots share immutable PNG strings; cap both count and a conservative size budget.
    while (this.undoStack.length > 25 || (this.undoStack.length > 1 && this.undoStack.reduce((n, s) => n + s.layers.reduce((a, l) => a + (l.data?.length || l.text?.length || 0) + (l.mask?.data?.length || 0), 0), 0) > 96 * 1024 * 1024)) this.undoStack.shift();
  }
}
