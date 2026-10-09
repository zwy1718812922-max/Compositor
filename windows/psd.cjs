const crypto = require('node:crypto');
const { PNG } = require('pngjs');
const { readPsd, writePsdBuffer, getLayerImageData, getLayerMaskImageData, getCompositeImageData, initializeCanvas } = require('ag-psd');
const { validateProject, pngPixels, MAX_BYTES } = require('./project.cjs');
const MAX_PIXELS = 64 * 1024 * 1024;
initializeCanvas(() => { throw new Error('PSD 只能通过像素数据读取。'); }, (width, height) => {
  sizePixels(width, height); return { width, height, data: new Uint8ClampedArray(width * height * 4) };
});
const toCanvasBlend = { normal: 'source-over', 'pass through': 'pass-through', multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten', difference: 'difference', 'soft light': 'soft-light', 'hard light': 'hard-light' };
const toPsdBlend = Object.fromEntries(Object.entries(toCanvasBlend).map(([a, b]) => [b, a]));
function dataURL(pixels, grayscale = false) {
  const data = Buffer.from(pixels.data);
  if (grayscale) for (let i = 0; i < data.length; i += 4) { data[i + 1] = data[i + 2] = data[i]; data[i + 3] = 255; }
  return 'data:image/png;base64,' + PNG.sync.write({ width: pixels.width, height: pixels.height, data }).toString('base64');
}
function pixelData(data) { pngPixels(data); const p = PNG.sync.read(Buffer.from(data.slice(22), 'base64')); return { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) }; }
function base(name, type, node = {}, parentId = null) {
  return { id: crypto.randomUUID(), name: (name || '图层').slice(0, 200), type, parentId, x: type === 'group' ? 0 : node.left || 0, y: type === 'group' ? 0 : node.top || 0, scale: 1, rotation: 0, opacity: node.opacity ?? 1, blend: toCanvasBlend[node.blendMode || 'normal'] || 'source-over', visible: !node.hidden, locked: Boolean(node.transparencyProtected || node.protected?.composite || node.protected?.position), clipping: Boolean(node.clipping) };
}
function sizePixels(w, h) {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 0 || h < 0 || w > 16384 || h > 16384 || w * h > MAX_PIXELS) throw new Error('PSD 图层或蒙版尺寸超过限制。');
  return Math.max(1, w) * Math.max(1, h);
}
function header(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 26 || buffer.length > MAX_BYTES || buffer.toString('ascii', 0, 4) !== '8BPS') throw new Error('PSD 文件损坏或超过 128 MB。');
  if (buffer.readUInt16BE(4) !== 1) throw new Error('暂不支持 PSB，请转换为 PSD。');
  if (buffer.readUInt16BE(22) !== 8 || buffer.readUInt16BE(24) !== 3) throw new Error('当前支持 RGB 8 位 PSD，请先转换颜色模式和位深。');
  sizePixels(buffer.readUInt32BE(18), buffer.readUInt32BE(14));
  let offset = 30 + buffer.readUInt32BE(26);
  if (offset + 4 > buffer.length) throw new Error('PSD 颜色数据损坏。');
  const end = offset + 4 + buffer.readUInt32BE(offset); offset += 4;
  if (end > buffer.length) throw new Error('PSD 资源数据损坏。');
  while (offset < end) {
    if (offset + 7 > end) throw new Error('PSD 资源数据损坏。');
    const id = buffer.readUInt16BE(offset + 4), nameLength = buffer[offset + 6] + 1;
    offset += 6 + nameLength + (nameLength % 2);
    if (offset + 4 > end) throw new Error('PSD 资源数据损坏。');
    const length = buffer.readUInt32BE(offset); offset += 4;
    if (offset + length > end) throw new Error('PSD 资源数据损坏。');
    if (id === 1039) {
      const profile = buffer.subarray(offset, offset + length).toString('latin1');
      if (!/sRGB|s\x00r\x00g\x00b|\x00s\x00r\x00g\x00b/i.test(profile)) throw new Error('当前工作空间为 sRGB。请先将 PSD 的颜色配置文件转换为 sRGB 后打开。');
    }
    offset += length + length % 2;
  }
}
function readPsdDocument(buffer) {
  header(buffer);
  const psd = readPsd(buffer, { useImageData: true, useRawData: true, skipThumbnail: true, skipLinkedFilesData: true, totalMemoryLimit: 512 * 1024 * 1024 });
  if (psd.imageResources?.pixelAspectRatio && psd.imageResources.pixelAspectRatio.aspect !== 1) throw new Error('当前只支持方形像素，请先转换 PSD 的像素长宽比。');
  let count = 0, pixels = 0;
  const unsupported = new Set(), warnings = new Set();
  const inspect = (nodes, depth = 0) => {
    if (depth > 10) throw new Error('PSD 图层组超过 10 层。');
    for (const node of nodes || []) {
      if (++count > 100) throw new Error('PSD 超过 100 个图层或组。');
      if (!node.children) pixels += sizePixels((node.right || 0) - (node.left || 0), (node.bottom || 0) - (node.top || 0));
      if (node.mask) pixels += sizePixels((node.mask.right || 0) - (node.mask.left || 0), (node.mask.bottom || 0) - (node.mask.top || 0));
      if (pixels > MAX_PIXELS) throw new Error('PSD 图层与蒙版合计超过 6400 万像素。');
      if (!toCanvasBlend[node.blendMode || 'normal']) unsupported.add('未支持的混合模式');
      if (node.adjustment) unsupported.add('调整图层');
      if (node.fillOpacity !== undefined && node.fillOpacity !== 1) unsupported.add('非默认填充不透明度');
      if (node.knockout || node.channelBlendingRestrictions?.length) unsupported.add('高级混合选项');
      if (node.blendingRanges && [node.blendingRanges.compositeGrayBlendSource, node.blendingRanges.compositeGraphBlendDestinationRange, ...node.blendingRanges.ranges.flatMap(r => [r.sourceRange, r.destRange])].some(range => range && range.some((v, i) => v !== [0,0,255,255][i]))) unsupported.add('混合颜色带');
      if (node.effects && !node.effects.disabled) unsupported.add('图层效果');
      if (node.vectorMask || node.vectorFill || node.vectorStroke || node.realMask) unsupported.add('矢量或双重蒙版');
      if (node.placedLayer) unsupported.add('智能对象');
      if (node.artboard) unsupported.add('画板');
      if (node.text) warnings.add('PSD 文字按独立像素图层导入以保留外观；可编辑文字请保存在 .ccomp 项目中。');
      if (node.text && (!node.right || !node.bottom || node.right === node.left || node.bottom === node.top)) unsupported.add('未缓存外观的文字图层');
      if ((node.mask?.userMaskFeather || 0) > 100) unsupported.add('超过当前范围的蒙版羽化');
      if (node.children && node.blendMode === 'pass through' && node.clipping) unsupported.add('参与剪贴的穿透图层组');
      if (node.children && depth >= 10) throw new Error('PSD 图层组超过 10 层。');
      if (node.children) inspect(node.children, depth + 1);
    }
  };
  inspect(psd.children);
  let resolution = psd.imageResources?.resolutionInfo?.horizontalResolution || 72;
  if (psd.imageResources?.resolutionInfo?.horizontalResolutionUnit === 'PPCM') resolution *= 2.54;
  resolution = Math.max(1, Math.min(9600, resolution));
  const project = { format: 'com.compositor.windows', version: 3, width: psd.width, height: psd.height, resolution, colorSpace: 'sRGB', layers: [], activeId: '' };
  if (unsupported.size || !count) {
    const pixels = getCompositeImageData(psd);
    if (!pixels) throw new Error('PSD 包含未支持的内容，且没有可用的合成预览。请先栅格化相关图层。');
    const layer = { ...base('PSD 合成图', 'raster'), data: dataURL(pixels) }; project.layers = [layer]; project.activeId = layer.id;
    return { project: validateProject(project), requiresFlatten: Boolean(unsupported.size), warnings: [...unsupported].map(s => '含' + s), source: 'psd' };
  }
  const convert = (nodes, parentId = null) => {
    // ag-psd 31 stores siblings bottom-to-top; verify with independent recomposition.
    for (const node of nodes || []) {
      const l = base(node.name, node.children ? 'group' : 'raster', node, parentId);
      if (node.children) { l.collapsed = node.opened === false; convert(node.children, l.id); }
      else {
        const bitmap = getLayerImageData(node);
        l.data = bitmap ? dataURL(bitmap) : dataURL({ width: 1, height: 1, data: new Uint8Array(4) });
      }
      if (node.mask) {
        const bitmap = getLayerMaskImageData(node), color = node.mask.defaultColor ?? 255;
        l.mask = { x: node.mask.left || 0, y: node.mask.top || 0, scale: 1, rotation: 0, defaultColor: color, enabled: !node.mask.disabled, linked: true, density: node.mask.userMaskDensity ?? 1, feather: Math.min(100, node.mask.userMaskFeather || 0), data: dataURL(bitmap || { width: 1, height: 1, data: new Uint8Array([color, color, color, 255]) }, true) };
      }
      project.layers.push(l);
    }
  };
  convert(psd.children); project.activeId = project.layers.at(-1).id;
  return { project: validateProject(project), warnings: [...warnings], source: 'psd', requiresFlatten: false };
}
function writePsdDocument(project, composite) {
  validateProject(project); pngPixels(composite);
  const imageData = pixelData(composite);
  if (imageData.width !== project.width || imageData.height !== project.height) throw new Error('PSD 合成图尺寸与项目不一致。');
  if (project.layers.some(l => l.type === 'text' || l.scale !== 1 || l.rotation !== 0 || l.mask && (l.mask.scale !== 1 || l.mask.rotation !== 0))) throw new Error('PSD 导出需要先准备像素数据。');
  const tree = parentId => project.layers.filter(l => (l.parentId || null) === parentId).map(l => {
    const node = { name: l.name, left: Math.round(l.x), top: Math.round(l.y), blendMode: toPsdBlend[l.blend], opacity: l.opacity, hidden: !l.visible, clipping: Boolean(l.clipping), protected: { composite: l.locked, position: l.locked, transparency: l.locked }, transparencyProtected: l.locked };
    if (l.type === 'group') { node.children = tree(l.id); node.opened = !l.collapsed; }
    else node.imageData = pixelData(l.data);
    if (l.mask) {
      const m = l.mask;
      node.mask = { left: Math.round(m.x), top: Math.round(m.y), defaultColor: m.defaultColor, disabled: !m.enabled, positionRelativeToLayer: false, userMaskDensity: m.density, userMaskFeather: m.feather, imageData: pixelData(m.data) };
    }
    return node;
  });
  const resolution = project.resolution;
  const data = writePsdBuffer({ width: project.width, height: project.height, bitsPerChannel: 8, colorMode: 3, imageData, children: tree(null), imageResources: { resolutionInfo: { horizontalResolution: resolution, horizontalResolutionUnit: 'PPI', widthUnit: 'Inches', verticalResolution: resolution, verticalResolutionUnit: 'PPI', heightUnit: 'Inches' } } }, { noBackground: true, generateThumbnail: false, trimImageData: false });
  if (data.length > MAX_BYTES) throw new Error('PSD 导出超过 128 MB，请减少图层或缩小尺寸。');
  return data;
}
module.exports = { readPsdDocument, writePsdDocument };
