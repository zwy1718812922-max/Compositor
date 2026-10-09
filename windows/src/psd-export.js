import { canvas, serialize, bounds, layerTransform, transformPoint, drawLayer, composite } from './editor.js';
import { checkSize, rasterize } from './operations.js';
function bake(target, draw, background) {
  const size = target.canvas ? { width: target.canvas.width, height: target.canvas.height } : bounds(target);
  const points = [{ x: 0, y: 0 }, { x: size.width, y: 0 }, { x: size.width, y: size.height }, { x: 0, y: size.height }].map(p => transformPoint(target, p));
  const x = Math.floor(Math.min(...points.map(p => p.x))), y = Math.floor(Math.min(...points.map(p => p.y)));
  const width = Math.max(1, Math.ceil(Math.max(...points.map(p => p.x))) - x), height = Math.max(1, Math.ceil(Math.max(...points.map(p => p.y))) - y);
  checkSize(width, height); const result = canvas(width, height), ctx = result.getContext('2d');
  if (background !== undefined) { ctx.fillStyle = `rgb(${background},${background},${background})`; ctx.fillRect(0, 0, width, height); }
  ctx.translate(-x, -y); draw(ctx);
  return { x, y, scale: 1, rotation: 0, data: result.toDataURL('image/png') };
}
export function preparePsd(project) {
  const output = serialize(project);
  output.layers = project.layers.map((layer, i) => {
    const converted = { ...output.layers[i] };
    if (layer.type !== 'group') {
      const raw = layer.type === 'text' ? rasterize(layer) : layer;
      const safe = { ...raw, mask: undefined, opacity: 1, visible: true, blend: 'source-over' };
      // Text's actual ink may extend above its top baseline. Render through rasterize.
      Object.assign(converted, bake(raw, ctx => drawLayer(ctx, safe))); converted.type = 'raster';
      for (const key of ['text', 'font', 'fontSize', 'color', 'bold']) delete converted[key];
    }
    if (layer.mask) {
      const m = layer.mask;
      converted.mask = { ...converted.mask, ...bake(m, ctx => { layerTransform(ctx, m); ctx.drawImage(m.canvas, 0, 0); }, m.defaultColor) };
    }
    return converted;
  });
  return { project: output, composite: composite(project).toDataURL('image/png') };
}
