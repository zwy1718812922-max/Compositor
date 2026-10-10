const {decompose}=require('./src/affine.mjs');
const {exportAdjustment,importAdjustment,exportFill,importFill}=require('./psd-adjustments.cjs');
const crypto = require('node:crypto');
const { PNG } = require('pngjs');
const { readPsd, writePsdBuffer, getLayerImageData, getLayerMaskImageData, getCompositeImageData, initializeCanvas } = require('ag-psd');
// The pinned decoder has CMYK channel support; our adapter supplies ICC conversion.
const {supportedColorModes}=require('ag-psd/dist/psdReader');if(!supportedColorModes.includes(4))supportedColorModes.push(4);
const { validateProject, pngPixels, MAX_BYTES } = require('./project.cjs');
const { importEffects, exportEffects, colorHex } = require('./psd-effects.cjs');
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
  if (buffer.readUInt16BE(22) !== 8 || ![3,4].includes(buffer.readUInt16BE(24))) throw new Error('当前支持 RGB / CMYK 8 位 PSD，请先转换颜色模式和位深。');
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
    if (id === 1039 && buffer.readUInt16BE(24) === 3) {
      const profile = buffer.subarray(offset, offset + length).toString('latin1');
      if (!/sRGB|s\x00r\x00g\x00b|\x00s\x00r\x00g\x00b/i.test(profile)) throw new Error('当前工作空间为 sRGB。请先将 PSD 的颜色配置文件转换为 sRGB 后打开。');
    }
    offset += length + length % 2;
  }
}
function readPsdDocument(buffer,profile,options = {}) {
  header(buffer);
  const bitmapFields=(pixels,gray=false)=>{
    if(!options.rawPixels)return {data:dataURL(pixels,gray)};
    const data=pixels.data instanceof Uint8ClampedArray?pixels.data:new Uint8ClampedArray(pixels.data);
    if(gray)for(let i=0;i<data.length;i+=4){data[i+1]=data[i+2]=data[i];data[i+3]=255;}
    let left=pixels.width,top=pixels.height,right=-1,bottom=-1;
    if(!gray)for(let y=0;y<pixels.height;y++)for(let x=0;x<pixels.width;x++)if(data[(y*pixels.width+x)*4+3]){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
    const bounds=right<left?{x:0,y:0,width:pixels.width,height:pixels.height,empty:true}:{x:left,y:top,width:right-left+1,height:bottom-top+1};
    return {pixels:{width:pixels.width,height:pixels.height,data,...(gray?{}:{bounds})}};
  };
  const validate=p=>validateProject(p,Boolean(options.rawPixels));
  const psd = readPsd(buffer, { useImageData: true, useRawData: true, skipThumbnail: true, skipLinkedFilesData: true, totalMemoryLimit: 512 * 1024 * 1024 });
  if(profile)require('./cmyk-psd.cjs').correctComposite(psd,buffer,profile);
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
      if(node.adjustment&&!importAdjustment(node.adjustment))unsupported.add('暂未支持的调整图层');
      if (node.knockout || node.channelBlendingRestrictions?.length) unsupported.add('高级混合选项');
      if (node.blendingRanges && [node.blendingRanges.compositeGrayBlendSource, node.blendingRanges.compositeGraphBlendDestinationRange, ...node.blendingRanges.ranges.flatMap(r => [r.sourceRange, r.destRange])].some(range => range && range.some((v, i) => v !== [0,0,255,255][i]))) unsupported.add('混合颜色带');
      if (node.vectorMask || node.vectorFill&&!importFill(node.vectorFill) || node.vectorStroke || node.realMask) unsupported.add('矢量或双重蒙版');
      if (node.placedLayer) unsupported.add('智能对象');
      if (node.artboard) unsupported.add('画板');
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
  const project = { format: 'com.compositor.windows', version: 6,colorMode:psd.colorMode===4?'CMYK':'RGB',...(profile?{colorProfile:{name:profile.name,data:Buffer.from(profile.bytes).toString('base64')}}:{}), width: psd.width, height: psd.height, resolution, colorSpace: 'sRGB', guides:(psd.imageResources?.gridAndGuidesInformation?.guides||[]).slice(0,200).map(g=>({id:crypto.randomUUID(),axis:g.direction==='vertical'?'x':'y',position:g.location})), layers: [], activeId: '' };
  if (!count) {
    const pixels = (profile?psd.imageData:getCompositeImageData(psd));
    if (!pixels) throw new Error('PSD 包含未支持的内容，且没有可用的合成预览。请先栅格化相关图层。');
    const layer = { ...base('PSD 合成图', 'raster'), ...bitmapFields(pixels) }; project.layers = [layer]; project.activeId = layer.id;
    return { project: validate(project), requiresFlatten: false, warnings: ['此 PSD 本身没有独立图层记录，已打开文件内的合成图。'], source: 'psd' };
  }
  const convert = (nodes, parentId = null) => {
    // ag-psd 31 stores siblings bottom-to-top; verify with independent recomposition.
    for (const node of nodes || []) {
      const l = base(node.name, node.children ? 'group' : 'raster', node, parentId);
      if (node.children) { l.collapsed = node.opened === false; convert(node.children, l.id); }
      else {
        const bitmap = profile?require('./cmyk-psd.cjs').correctLayer(node,profile):getLayerImageData(node);
        Object.assign(l,bitmapFields(bitmap || { width: 1, height: 1, data: new Uint8Array(4) }));
        if (node.text) {
          const t = node.text, style = t.style || t.styleRuns?.[0]?.style || {}, runs = t.styleRuns || [], matrix = t.transform || [1,0,0,1,0,0];
          let geometry;try{geometry=decompose(matrix.slice(0,4));}catch{} const axisUniform=Math.abs(matrix[1]||0)<.0001&&Math.abs(matrix[2]||0)<.0001&&Math.abs((matrix[0]||1)-(matrix[3]||1))<.0001;
          const simple = !!geometry && t.orientation !== 'vertical' && !t.warp?.style?.match(/^(?!none$).+/) && runs.every(r => JSON.stringify({ ...style, ...r.style }) === JSON.stringify(style));
          if (simple) {
            Object.assign(l, { type: 'text', text: t.text.replace(/\r/g, '\n').replace(/\n$/, ''), font: (style.font?.name || 'Microsoft YaHei').replace(/-?(Regular|Bold|Italic|MT)$/g, '').replace(/^MicrosoftYaHei$/, 'Microsoft YaHei'), psdFont: style.font?.name, fontSize: Math.max(1, Math.min(1000, (style.fontSize || 64) * Math.abs(matrix[0] || 1))), color: colorHex(style.fillColor), bold: Boolean(style.fauxBold || /Bold/i.test(style.font?.name || '')), textMode: t.shapeType === 'box' ? 'paragraph' : 'point', align: ['left','center','right'].includes(t.paragraphStyle?.justification) ? t.paragraphStyle.justification : 'left', textRasterCache: Boolean(bitmap) });
            l.italic=Boolean(style.fauxItalic||/Italic|Oblique/i.test(style.font?.name||''));l.underline=Boolean(style.underline);
            if(!axisUniform){l.fontSize=Math.max(1,Math.min(1000,style.fontSize||64));l.textGeometry={matrix:[...matrix]};}
            l.psdTextSource = t; l.textCacheOrigin = { x:l.x,y:l.y };
            if (l.textMode === 'paragraph') { l.boxWidth = Math.max(1, Math.min(16384, (t.boxBounds?.[2] - t.boxBounds?.[0]) || bitmap?.width || 300)); l.boxHeight = Math.max(1, Math.min(16384, (t.boxBounds?.[3] - t.boxBounds?.[1]) || bitmap?.height || 200)); }
            if (!bitmap) { l.x = matrix[4] || 0; l.y = (matrix[5] || 0) - l.fontSize; delete l.data; delete l.pixels; }
            warnings.add('水平单样式文字保持可编辑；首次编辑会使用本机字体重新排版。');
          } else warnings.add(`「${l.name}」的混合样式、变形或竖排文字已单独转为像素层，其他图层保留。`);
        }
      }
      if (node.fillOpacity !== undefined) l.fillOpacity = node.fillOpacity;
      if (node.effects) { l.styles = importEffects(node.effects, resolution, warnings, l.name); l.stylesEnabled = !node.effects.disabled; l.psdEffects = node.effects; }
      if(node.adjustment&&importAdjustment(node.adjustment)){warnings.add('调整图层已恢复为可编辑参数；部分色彩算法与 Photoshop 存在差异，请对照合成预览。');l.type='adjustment';l.adjustment=importAdjustment(node.adjustment);delete l.data;delete l.pixels;}
      if(node.vectorFill&&importFill(node.vectorFill)&&!node.vectorMask){l.type='fill';l.fill=importFill(node.vectorFill);l.width=psd.width;l.height=psd.height;l.x=l.y=0;delete l.data;delete l.pixels;}
      if (node.adjustment&&!importAdjustment(node.adjustment)) warnings.add(`「${l.name}」调整图层保留为独立占位层，调整计算暂不支持，画面可能与 PS 不同。`);
      if (node.placedLayer) warnings.add(`「${l.name}」智能对象使用其独立缓存像素，仍是单独图层。`);
      if (node.vectorMask || node.vectorFill&&!importFill(node.vectorFill) || node.vectorStroke || node.realMask) warnings.add(`「${l.name}」的矢量或双重蒙版未完整重现，请对照合成预览。`);
      if (l.type === 'group' && l.clipping && l.blend === 'pass-through') l.blend = 'source-over';
      if (node.mask) {
        const bitmap = getLayerMaskImageData(node), color = node.mask.defaultColor ?? 255;
        l.mask = { x: node.mask.left || 0, y: node.mask.top || 0, scale: 1, rotation: 0, defaultColor: color, enabled: !node.mask.disabled, linked: true, density: node.mask.userMaskDensity ?? 1, feather: Math.min(100, node.mask.userMaskFeather || 0), ...bitmapFields(bitmap || { width: 1, height: 1, data: new Uint8Array([color, color, color, 255]) }, true) };
      }
      project.layers.push(l);
    }
  };
  convert(psd.children); project.activeId = project.layers.at(-1).id;
  let preview;
  if (unsupported.size) { const bitmap = (profile?psd.imageData:getCompositeImageData(psd)); if (bitmap) preview = { ...project, layers: [{ ...base('PSD 合成图', 'raster'), ...bitmapFields(bitmap) }] }; if (preview) preview.activeId = preview.layers[0].id; }
  return { project: validate(project), preview, warnings: [...unsupported].map(s => '含' + s + '：已保留图层，相关外观可能不同。').concat([...warnings]), source: 'psd', requiresFlatten: false, requiresConversion: unsupported.size > 0 };
}
function writePsdDocument(project, composite) {
  validateProject(project); pngPixels(composite);
  const imageData = pixelData(composite);
  if (imageData.width !== project.width || imageData.height !== project.height) throw new Error('PSD 合成图尺寸与项目不一致。');
  if (project.layers.some(l => l.type === 'text' || l.scale !== 1 || (l.scaleY??1)!==1 || !!l.skew || l.rotation !== 0 || l.mask && (l.mask.scale !== 1 || (l.mask.scaleY??1)!==1 || !!l.mask.skew || l.mask.rotation !== 0))) throw new Error('PSD 导出需要先准备像素数据。');
  const tree = parentId => project.layers.filter(l => (l.parentId || null) === parentId).map(l => {
    const node = { name: l.name, left: Math.round(l.x), top: Math.round(l.y), blendMode: toPsdBlend[l.blend], opacity: l.opacity, hidden: !l.visible, clipping: Boolean(l.clipping), protected: { composite: l.locked, position: l.locked, transparency: l.locked }, transparencyProtected: l.locked };
    if (l.type === 'group') { node.children = tree(l.id); node.opened = !l.collapsed; }
    else if(l.type==='adjustment')node.adjustment=exportAdjustment(l.adjustment);
    else node.imageData = pixelData(l.data);
    if(l.psdFill)node.vectorFill=exportFill(l.psdFill);
    if (l.psdText) node.text = l.psdText;
    if (l.fillOpacity !== undefined) node.fillOpacity = l.fillOpacity;
    if (l.styles || l.psdEffects) node.effects = exportEffects(l);
    if (l.mask) {
      const m = l.mask;
      node.mask = { left: Math.round(m.x), top: Math.round(m.y), defaultColor: m.defaultColor, disabled: !m.enabled, positionRelativeToLayer: false, userMaskDensity: m.density, userMaskFeather: m.feather, imageData: pixelData(m.data) };
    }
    return node;
  });
  const resolution = project.resolution;
  const data = writePsdBuffer({ width: project.width, height: project.height, bitsPerChannel: 8, colorMode: 3, imageData, children: tree(null), imageResources: {gridAndGuidesInformation:{guides:(project.guides||[]).map(g=>({direction:g.axis==='x'?'vertical':'horizontal',location:g.position}))}, resolutionInfo: { horizontalResolution: resolution, horizontalResolutionUnit: 'PPI', widthUnit: 'Inches', verticalResolution: resolution, verticalResolutionUnit: 'PPI', heightUnit: 'Inches' } } }, { noBackground: true, generateThumbnail: false, trimImageData: false });
  if (data.length > MAX_BYTES) throw new Error('PSD 导出超过 128 MB，请减少图层或缩小尺寸。');
  return data;
}
module.exports = { readPsdDocument, writePsdDocument };
