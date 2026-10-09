const { defaultEffect } = require('./src/effect-model.mjs');
const blendMap = { normal: 'source-over', multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten', difference: 'difference', 'soft light': 'soft-light', 'hard light': 'hard-light' };
const reverseBlend = Object.fromEntries(Object.entries(blendMap).map(([a, b]) => [b, a]));
const keys = { colorOverlay: 'solidFill', gradientOverlay: 'gradientOverlay', stroke: 'stroke', dropShadow: 'dropShadow', innerShadow: 'innerShadow', outerGlow: 'outerGlow', innerGlow: 'innerGlow', bevel: 'bevel', satin: 'satin' };
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
function colorHex(color, fallback = '#000000') {
  if (!color) return fallback;
  let rgb;
  if ('r' in color) rgb = [color.r, color.g, color.b];
  else if ('fr' in color) rgb = [color.fr, color.fg, color.fb].map(v => v * 255);
  else if ('h' in color) {
    const hue = (color.h % 1 + 1) % 1 * 6, c = color.b * color.s, x = c * (1 - Math.abs(hue % 2 - 1)), m = color.b - c;
    rgb = [[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][Math.floor(hue)].map(v => (v + m) * 255);
  } else if ('c' in color) rgb = [color.c,color.m,color.y].map(v => 255 * (1 - v / 100) * (1 - color.k / 100));
  else if ('k' in color) rgb = Array(3).fill(255 * color.k / 100);
  else return fallback;
  return '#' + rgb.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}
function unit(v, resolution) { if (!v) return 0; return v.value * ({ Pixels: 1, Points: resolution / 72, Inches: resolution, Millimeters: resolution / 25.4, Centimeters: resolution / 2.54, Percent: 1 }[v.units] || 1); }
function importEffects(effects, resolution, warnings, name) {
  const styles = {}; if (!effects) return styles;
  const scale = (effects.scale ?? 1);
  for (const [key, sourceKey] of Object.entries(keys)) {
    const source = effects[sourceKey], list = Array.isArray(source) ? source : source ? [source] : [];
    if (!list.length) continue;
    const active = list.filter(e => e.enabled !== false); const e = active[0] || list[0], out = defaultEffect(key);
    Object.assign(out, { enabled: e.enabled !== false, opacity: clamp(e.opacity ?? out.opacity, 0, 1), blend: blendMap[e.blendMode || 'normal'] || out.blend, color: colorHex(e.color, out.color), size: clamp(e.size ? unit(e.size, resolution) * scale : out.size, 0, 250), angle: clamp(e.angle ?? out.angle, -360, 360), distance: clamp(unit(e.distance, resolution) * scale, 0, 1000), spread: clamp(unit(e.choke, resolution), 0, 100) });
    if (active.length > 1) warnings.add(`「${name}」含多个同类 FX，当前预览使用第一个，原始 FX 定义保留用于导出。`);
    if (key === 'stroke') { out.position = e.position || 'outside'; if (e.fillType && e.fillType !== 'color') warnings.add(`「${name}」的渐变/图案描边以纯色近似预览，原始定义保留。`); }
    if (key === 'innerGlow') out.source = e.source === 'center' ? 'center' : 'edge';
    if (key === 'satin') out.invert = e.invert ?? true;
    if (key === 'bevel') Object.assign(out, { depth: clamp((e.strength ?? 1) * 100, 0, 1000), altitude: clamp(e.altitude ?? 30, 0, 90), direction: e.direction === 'down' ? 'down' : 'up', color: colorHex(e.highlightColor, '#ffffff'), color2: colorHex(e.shadowColor, '#000000'), opacity: clamp(e.highlightOpacity ?? .75, 0, 1), shadowOpacity: clamp(e.shadowOpacity ?? .75, 0, 1) });
    if (key === 'gradientOverlay') {
      const stops = e.gradient?.colorStops;
      if (!stops?.length || e.gradient.type !== 'solid') { warnings.add(`「${name}」的噪点渐变无法编辑，原始定义保留。`); out.enabled = false; }
      else Object.assign(out, { color: colorHex(stops[0].color), color2: colorHex(stops.at(-1).color, '#ffffff'), gradientType: e.type === 'radial' ? 'radial' : 'linear', reverse: Boolean(e.reverse) });
      if (stops?.length > 2 || e.type && !['linear', 'radial'].includes(e.type)) warnings.add(`「${name}」的复杂渐变以双端渐变近似预览。`);
    }
    styles[key] = out;
  }
  if (effects.patternOverlay?.enabled !== false && effects.patternOverlay) warnings.add(`「${name}」含外部图案 FX，保留原始定义；当前预览未重现该图案。`);
  return styles;
}
const units = value => ({ units: 'Pixels', value });
const color = hex => { const [r,g,b] = hex.slice(1).match(/../g).map(v => parseInt(v, 16)); return { r,g,b }; };
function exportEffects(layer) {
  if (layer.psdEffects && !layer.stylesModified) return { ...layer.psdEffects, disabled: layer.stylesEnabled === false };
  const result = { disabled: layer.stylesEnabled === false, scale: 1 };
  for (const [key, sourceKey] of Object.entries(keys)) {
    const e = layer.styles?.[key]; if (!e) continue;
    const out = { enabled: e.enabled, present: true, showInDialog: true, blendMode: reverseBlend[e.blend] || 'normal', opacity: e.opacity, color: color(e.color), size: units(e.size), angle: e.angle, distance: units(e.distance), choke: units(e.spread), useGlobalLight: false, antialiased: true };
    if (key === 'stroke') Object.assign(out, { position: e.position, fillType: 'color' });
    if (key === 'innerGlow') { out.source = e.source; out.technique = 'softer'; }
    if (key === 'satin') out.invert = e.invert;
    if (key === 'bevel') Object.assign(out, { style: 'inner bevel', technique: 'smooth', strength: e.depth / 100, direction: e.direction, altitude: e.altitude, highlightBlendMode: 'screen', shadowBlendMode: 'multiply', highlightColor: color(e.color), shadowColor: color(e.color2), highlightOpacity: e.opacity, shadowOpacity: e.shadowOpacity, soften: units(0), useTexture: false, useShape: false });
    if (key === 'gradientOverlay') Object.assign(out, { type: e.gradientType, reverse: e.reverse, align: true, scale: 1, gradient: { name: 'Compositor 渐变', type: 'solid', smoothness: 1, colorStops: [{ color: color(e.color), location: 0, midpoint: .5 }, { color: color(e.color2), location: 1, midpoint: .5 }], opacityStops: [{ opacity: 1, location: 0, midpoint: .5 }, { opacity: 1, location: 1, midpoint: .5 }] } });
    result[sourceKey] = ['solidFill','gradientOverlay','stroke','dropShadow','innerShadow'].includes(sourceKey) ? [out] : out;
  }
  return result;
}
module.exports = { importEffects, exportEffects, colorHex };
