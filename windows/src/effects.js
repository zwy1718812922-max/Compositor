import { hasEffects, defaultEffect, effectPadding } from './effect-model.mjs';
const bitmap = (w, h) => { const c = typeof document==='undefined' ? new OffscreenCanvas(w,h) : document.createElement('canvas'); c.width = w; c.height = h; return c; };
const rgb = color => color.slice(1).match(/../g).map(v => parseInt(v, 16));
const clamp = v => Math.max(0, Math.min(1, v));
function blend(b, s, mode) {
  if (mode === 'multiply') return b * s;
  if (mode === 'screen') return b + s - b * s;
  if (mode === 'overlay') return b <= .5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
  if (mode === 'darken') return Math.min(b, s);
  if (mode === 'lighten') return Math.max(b, s);
  if (mode === 'difference') return Math.abs(b - s);
  if (mode === 'hard-light') return s <= .5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
  if (mode === 'soft-light') return s <= .5 ? b - (1 - 2 * s) * b * (1 - b) : b + (2 * s - 1) * ((b <= .25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)) - b);
  return s;
}
// Linear-time squared Euclidean distance transform; do not grow a kernel with stroke size.
function distance(alpha, w, h, foreground) {
  const out = new Float32Array(w * h), f = new Float32Array(Math.max(w, h)), v = new Int32Array(f.length), z = new Float64Array(f.length + 1), d = new Float32Array(f.length);
  const pass = n => {
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let s = (f[q] + q * q - f[v[k]] - v[k] * v[k]) / (2 * (q - v[k]));
      while (s <= z[k]) { k--; s = (f[q] + q * q - f[v[k]] - v[k] * v[k]) / (2 * (q - v[k])); }
      v[++k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
  };
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = (alpha[y * w + x] >= .5) === foreground ? 0 : 1e12; pass(h); for (let y = 0; y < h; y++) out[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = out[y * w + x]; pass(w); for (let x = 0; x < w; x++) out[y * w + x] = foreground ? Math.sqrt(d[x]) : Math.min(Math.sqrt(d[x]),x+1,y+1,w-x,h-y); }
  return out;
}
function alphaCanvas(alpha, w, h) {
  const c = bitmap(w, h), ctx = c.getContext('2d'), data = ctx.createImageData(w, h);
  for (let i = 0; i < alpha.length; i++) { data.data[i * 4] = data.data[i * 4 + 1] = data.data[i * 4 + 2] = 255; data.data[i * 4 + 3] = clamp(alpha[i]) * 255; }
  ctx.putImageData(data, 0, 0); return c;
}
function blurAlpha(alpha, w, h, size, dx = 0, dy = 0, inverse = false) {
  const c = bitmap(w, h), ctx = c.getContext('2d');
  if (inverse) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'destination-out'; }
  ctx.filter = `blur(${Math.max(0, size / 2)}px)`; ctx.drawImage(alphaCanvas(alpha, w, h), dx, dy);
  const result = ctx.getImageData(0, 0, w, h).data, out = new Float32Array(alpha.length); for (let i = 0; i < out.length; i++) out[i] = result[i * 4 + 3] / 255; return out;
}
export function applyEffects(raw, layer,region) {
  if (!hasEffects(layer) && (layer.fillOpacity ?? 1) === 1) return raw;
  const w0 = raw.width, h0 = raw.height;
  const sx=Math.max(0,Math.floor(region?.x||0)),sy=Math.max(0,Math.floor(region?.y||0)),sw=Math.min(w0,Math.ceil(region?.right??w0))-sx,sh=Math.min(h0,Math.ceil(region?.bottom??h0))-sy;
  if (sw<=0||sh<=0) return raw;
  const all = raw.getContext('2d').getImageData(sx,sy,sw,sh).data;
  let left = w0, top = h0, right = -1, bottom = -1;
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (all[(y * sw + x) * 4 + 3]) { left = Math.min(left, x+sx); top = Math.min(top, y+sy); right = Math.max(right, x+sx); bottom = Math.max(bottom, y+sy); }
  if (right < left) return raw;
  const styles = layer.stylesEnabled === false ? {} : layer.styles || {};
  const pad = effectPadding(layer);
  const originX = left, originY = top, inkWidth = right - left + 1, inkHeight = bottom - top + 1;
  left = Math.max(0, left - pad); top = Math.max(0, top - pad); right = Math.min(w0 - 1, right + pad); bottom = Math.min(h0 - 1, bottom + pad);
  const w = right - left + 1, h = bottom - top + 1, src = raw.getContext('2d').getImageData(left, top, w, h), alpha = new Float32Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = src.data[i * 4 + 3] / 255;
  let outer, inner;
  const distances = () => { outer ||= distance(alpha, w, h, true); inner ||= distance(alpha, w, h, false); };
  const result = bitmap(w, h), ctx = result.getContext('2d');
  const effect = key => styles[key]?.enabled ? { ...defaultEffect(key), ...styles[key] } : null;
  const paint = (field, color, opacity, mode = 'source-over') => {
    const image = ctx.createImageData(w, h), colors = rgb(color);
    for (let i = 0; i < field.length; i++) { for (let c = 0; c < 3; c++) image.data[i * 4 + c] = colors[c]; image.data[i * 4 + 3] = clamp(field[i] * opacity) * 255; }
    const c = bitmap(w, h); c.getContext('2d').putImageData(image, 0, 0); ctx.globalCompositeOperation = mode; ctx.drawImage(c, 0, 0); ctx.globalCompositeOperation = 'source-over';
  };
  for (const key of ['dropShadow', 'outerGlow']) {
    const e = effect(key); if (!e) continue; distances();
    const spread = e.size * e.spread / 100, grown = Float32Array.from(alpha, (a, i) => Math.max(a, clamp(spread + .5 - outer[i])));
    const rad = e.angle * Math.PI / 180, dx = key === 'dropShadow' ? -Math.cos(rad) * e.distance : 0, dy = key === 'dropShadow' ? Math.sin(rad) * e.distance : 0;
    paint(blurAlpha(grown, w, h, e.size - spread, dx, dy), e.color, e.opacity, e.blend);
  }
  const inside = bitmap(w, h), insideCtx = inside.getContext('2d'), pixels = new Uint8ClampedArray(src.data);
  for (let i = 0; i < alpha.length; i++) pixels[i * 4 + 3] *= layer.fillOpacity ?? 1;
  const overlay = (e, colorAt, strengthAt = () => 1) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const n = y * w + x; if (!alpha[n]) continue; const color = colorAt(x + left, y + top), s = clamp(e.opacity * strengthAt(n, x, y)), b = pixels[n*4+3]/255/alpha[n], a=s+b*(1-s); if (!a) continue; for (let c = 0; c < 3; c++) { const cb=pixels[n*4+c]/255,cs=color[c]/255; pixels[n*4+c]=255*(s*(1-b)*cs+s*b*blend(cb,cs,e.blend)+b*(1-s)*cb)/a; } pixels[n*4+3]=alpha[n]*a*255; }
  };
  for (const key of ['colorOverlay', 'gradientOverlay', 'patternOverlay']) {
    const e = effect(key); if (!e) continue; const c1 = rgb(e.color), c2 = rgb(e.color2 || e.color);
    overlay(e, (x, y) => {
      if (key === 'colorOverlay') return c1;
      if (key === 'patternOverlay') { const px = x / Math.max(1, e.size), py = y / Math.max(1, e.size), a = e.pattern === 'stripes' ? (Math.floor(px + py) % 2) : e.pattern === 'dots' ? (Math.hypot(px % 1 - .5, py % 1 - .5) < .25 ? 1 : 0) : ((Math.floor(px) + Math.floor(py)) % 2); return a ? c1 : c2; }
      const rad = e.angle * Math.PI / 180, dx = x - originX - inkWidth / 2, dy = y - originY - inkHeight / 2;
      let t = e.gradientType === 'radial' ? Math.hypot(dx, dy) / Math.max(1, Math.hypot(inkWidth, inkHeight) / 2) : .5 + (dx * Math.cos(rad) - dy * Math.sin(rad)) / Math.max(1, Math.abs(inkWidth * Math.cos(rad)) + Math.abs(inkHeight * Math.sin(rad)));
      t = clamp(t); if (e.reverse) t = 1 - t; return c1.map((c, i) => c + (c2[i] - c) * t);
    });
  }
  for (const key of ['innerShadow', 'innerGlow', 'satin']) {
    const e = effect(key); if (!e) continue; distances(); let field;
    if (key === 'innerGlow') { field = Float32Array.from(inner, d => clamp(1 - (d - .5) / Math.max(1, e.size))); if (e.source === 'center') field = field.map(a => 1 - a); }
    else { const rad = e.angle * Math.PI / 180, dx = -Math.cos(rad) * e.distance, dy = Math.sin(rad) * e.distance;
      if (key === 'innerShadow') field = blurAlpha(alpha, w, h, e.size, dx, dy, true);
      else { const a = blurAlpha(alpha, w, h, e.size, dx, dy), b = blurAlpha(alpha, w, h, e.size, -dx, -dy); field = a.map((v, i) => e.invert ? 1 - Math.abs(v - b[i]) : Math.abs(v - b[i])); }
    }
    overlay(e, () => rgb(e.color), n => field[n]);
  }
  const bevel = effect('bevel');
  if (bevel && bevel.size) {
    distances(); const heights = Float32Array.from(inner, (d, i) => {
      let value = clamp((d - .5) / bevel.size); if (bevel.contour === 'cone') value = Math.sin(value * Math.PI / 2); if (bevel.contour === 'ring') value = .5 - .5 * Math.cos(value * Math.PI * 2);
      if (bevel.texture) value += (((i % w) % 8 < 4) === (Math.floor(i / w) % 8 < 4) ? 1 : -1) * bevel.textureDepth / 100;
      return value * bevel.size * bevel.depth / 100 * (bevel.direction === 'down' ? -1 : 1);
    });
    const rad = bevel.angle * Math.PI / 180, alt = bevel.altitude * Math.PI / 180, light = [-Math.cos(rad) * Math.cos(alt), -Math.sin(rad) * Math.cos(alt), Math.sin(alt)];
    const shade = new Float32Array(alpha.length);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const n = y * w + x, dx = (heights[n + 1] - heights[n - 1]) / 2, dy = (heights[n + w] - heights[n - w]) / 2; shade[n] = (-dx * light[0] - dy * light[1] + light[2]) / Math.hypot(dx, dy, 1) - light[2]; }
    overlay({ ...bevel, blend: 'screen' }, () => rgb(bevel.color), n => Math.max(0, shade[n]) * 2);
    overlay({ ...bevel, opacity: bevel.shadowOpacity, blend: 'multiply' }, () => rgb(bevel.color2), n => Math.max(0, -shade[n]) * 2);
  }
  insideCtx.putImageData(new ImageData(pixels, w, h), 0, 0); ctx.drawImage(inside, 0, 0);
  const stroke = effect('stroke');
  if (stroke && stroke.size) { distances(); const field = Float32Array.from(alpha, (a, i) => {
    if (stroke.position === 'inside') return a * clamp(stroke.size + .5 - inner[i]);
    if (stroke.position === 'center') return a ? a * clamp(stroke.size / 2 + .5 - inner[i]) : clamp(stroke.size / 2 + .5 - outer[i]);
    return (1 - a) * clamp(stroke.size + .5 - outer[i]);
  }); paint(field, stroke.color, stroke.opacity, stroke.blend); }
  const output = bitmap(w0, h0); output.getContext('2d').drawImage(result, left, top); return output;
}
