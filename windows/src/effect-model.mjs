export const effectNames = { bevel: '斜面和浮雕', stroke: '描边', innerShadow: '内阴影', innerGlow: '内发光', satin: '光泽', colorOverlay: '颜色叠加', gradientOverlay: '渐变叠加', patternOverlay: '图案叠加', outerGlow: '外发光', dropShadow: '投影' };
export const effectBlends = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference', 'soft-light', 'hard-light'];
export function defaultEffect(type) {
  const value = { enabled: false, color: '#000000', opacity: .75, blend: 'source-over', size: 8, angle: 120, distance: 8, spread: 0 };
  if (['dropShadow', 'innerShadow', 'satin'].includes(type)) value.blend = 'multiply';
  if (['innerGlow', 'outerGlow'].includes(type)) Object.assign(value, { color: '#fff4c2', blend: 'screen', size: 16, source: 'edge' });
  if (type === 'stroke') Object.assign(value, { opacity: 1, size: 3, position: 'outside' });
  if (type === 'colorOverlay') Object.assign(value, { color: '#e53935', opacity: 1 });
  if (type === 'gradientOverlay') Object.assign(value, { color: '#2788ef', color2: '#ffffff', opacity: 1, angle: 90, gradientType: 'linear', reverse: false });
  if (type === 'patternOverlay') Object.assign(value, { color: '#ffffff', color2: '#333333', opacity: .5, pattern: 'checker', size: 16 });
  if (type === 'bevel') Object.assign(value, { size: 8, depth: 100, direction: 'up', altitude: 30, color: '#ffffff', color2: '#000000', shadowOpacity: .75, contour: 'linear', texture: false, textureDepth: 20 });
  if (type === 'satin') Object.assign(value, { angle: 19, size: 8, distance: 11, invert: true });
  return value;
}
export function hasEffects(layer) { return layer.stylesEnabled !== false && Object.values(layer.styles || {}).some(e => e.enabled); }
export function validateStyles(styles) {
  if (!styles || typeof styles !== 'object' || Array.isArray(styles) || Object.keys(styles).some(k => !effectNames[k])) throw new Error('图层样式类型无效。');
  const ranges = { opacity: [0, 1], shadowOpacity: [0, 1], size: [0, 250], angle: [-360, 360], distance: [0, 1000], spread: [0, 100], depth: [0, 1000], altitude: [0, 90], textureDepth: [0, 100] };
  for (const effect of Object.values(styles)) {
    if (!effect || typeof effect !== 'object' || Array.isArray(effect) || typeof effect.enabled !== 'boolean') throw new Error('图层样式设置无效。');
    for (const [key, [min, max]] of Object.entries(ranges)) if (effect[key] !== undefined && (!Number.isFinite(effect[key]) || effect[key] < min || effect[key] > max)) throw new Error('图层样式参数超出范围。');
    for (const key of ['color', 'color2']) if (effect[key] !== undefined && !/^#[\da-f]{6}$/i.test(effect[key])) throw new Error('图层样式颜色无效。');
    if (effect.blend !== undefined && !effectBlends.includes(effect.blend)) throw new Error('图层样式混合模式无效。');
    for (const [key, values] of Object.entries({ position: ['inside', 'center', 'outside'], gradientType: ['linear', 'radial'], pattern: ['checker', 'stripes', 'dots'], direction: ['up', 'down'], contour: ['linear', 'cone', 'ring'], source: ['edge', 'center'] })) if (effect[key] !== undefined && !values.includes(effect[key])) throw new Error('图层样式选项无效。');
    for (const key of ['reverse', 'invert', 'texture']) if (effect[key] !== undefined && typeof effect[key] !== 'boolean') throw new Error('图层样式开关无效。');
  }
  return styles;
}
