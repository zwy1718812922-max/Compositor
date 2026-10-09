import { canvas, serialize, bounds, layerTransform, transformPoint, drawLayer, composite, textFont, layerSurface } from './editor.js';
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
      if (layer.type === 'text') {
        const rad = layer.rotation*Math.PI/180, a = Math.cos(rad)*layer.scale,b = Math.sin(rad)*layer.scale;
        if (layer.textRasterCache && layer.psdTextSource) {
          const src = layer.psdTextSource, m = src.transform || [1,0,0,1,0,0], origin = layer.textCacheOrigin || layer;
          converted.psdText = { ...src, transform:[a*m[0]-b*m[1],b*m[0]+a*m[1],a*m[2]-b*m[3],b*m[2]+a*m[3],layer.x+a*(m[4]-origin.x)-b*(m[5]-origin.y),layer.y+b*(m[4]-origin.x)+a*(m[5]-origin.y)] };
        } else {
          const measure = canvas(1,1).getContext('2d'); measure.font = textFont(layer); measure.textBaseline = 'top'; const top = measure.measureText('Mg').actualBoundingBoxAscent; measure.textBaseline = 'alphabetic'; const baseline = measure.measureText('Mg').actualBoundingBoxAscent-top;
          const pos = transformPoint(layer,{x:0,y:baseline}), [r,g,blue] = layer.color.slice(1).match(/../g).map(v=>parseInt(v,16));
          const fonts = { 'Microsoft YaHei':'MicrosoftYaHei','Arial':'ArialMT','Segoe UI':'SegoeUI' };
          converted.psdText = { text:layer.text,transform:[a,b,-b,a,pos.x,pos.y],shapeType:layer.textMode === 'paragraph' ? 'box' : 'point',pointBase:[0,0],style:{font:{name:layer.psdFont || fonts[layer.font] || layer.font},fontSize:layer.fontSize,fauxBold:layer.bold,fillColor:{r,g,b:blue},autoLeading:false,leading:layer.fontSize*(layer.lineHeight||1.35),tracking:(layer.letterSpacing||0)/layer.fontSize*1000},paragraphStyle:{justification:layer.align||'left'} };
          if (layer.textMode === 'paragraph') converted.psdText.boxBounds = [0,-baseline,layer.boxWidth,layer.boxHeight-baseline];
        }
      }
    }
    if (layer.mask) {
      const m = layer.mask;
      converted.mask = { ...converted.mask, ...bake(m, ctx => { layerTransform(ctx, m); ctx.drawImage(m.canvas, 0, 0); }, m.defaultColor) };
    }
    const baked = {};
    if (layer.styles?.patternOverlay?.enabled) baked.patternOverlay = layer.styles.patternOverlay;
    if (layer.styles?.bevel?.enabled && (layer.styles.bevel.texture || layer.styles.bevel.contour !== 'linear')) baked.bevel = layer.styles.bevel;
    if (Object.keys(baked).length && !layer.psdEffects) {
      if (layer.type === 'group') throw new Error('带图案或纹理的组样式，请先合并该组再导出 PSD；.ccomp 可保留完整可编辑样式。');
      const pixels = layerSurface(project,{...layer,mask:undefined,styles:baked,fillOpacity:1});
      Object.assign(converted,{type:'raster',x:0,y:0,scale:1,rotation:0,data:pixels.toDataURL('image/png'),styles:structuredClone(converted.styles)});
      for (const key of Object.keys(baked)) delete converted.styles[key]; delete converted.psdText;
    }
    return converted;
  });
  return { project: output, composite: composite(project).toDataURL('image/png') };
}
