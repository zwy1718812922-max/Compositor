const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateStyles } = require('./src/effect-model.mjs');

const {decompose}=require('./src/affine.mjs');
const { validateFill,validateAdjustment }=require('./src/fill-model.mjs');
const {validateShape}=require('./src/shape-model.mjs');
const {validateArtboard}=require('./src/artboard-model.mjs');
const FORMAT = 'com.compositor.windows';
const MAX_BYTES = Infinity;
const blends = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference', 'soft-light', 'hard-light'];
function number(value, min, max) { return Number.isFinite(value) && value >= min && value <= max; }
function pngPixels(data, limit = 16384) {
  if (typeof data !== 'string' || data.length > MAX_BYTES * 1.4 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('图层或蒙版图片必须是 PNG。');
  const b = Buffer.from(data.slice(22), 'base64');
  if (b.length < 24 || b.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('PNG 图片损坏。');
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  if (!w || !h || w > limit || h > limit || w * h > 16384 * 16384) throw new Error('图层或蒙版图片尺寸超过限制。');
  return w * h;
}
function validateProject(p, allowPixels = false) {
  if (!p || p.format !== FORMAT || ![1, 2, 3, 4, 5, 6, 7, 8].includes(p.version)) throw new Error('不支持的项目格式或版本。请打开 .ccomp 项目。');
  const limit = p.version === 1 ? 4096 : 16384;
  if (![p.width, p.height].every(n => Number.isInteger(n) && number(n, 1, limit)) || p.width * p.height > 16384 * 16384) throw new Error('画布尺寸超过此项目版本的限制。');
  if (p.version >= 2 && (!number(p.resolution, 1, 9600) || p.colorSpace !== 'sRGB')) throw new Error('分辨率或颜色空间无效。');
  if(p.version<6&&(p.colorMode||p.colorProfile))throw new Error('CMYK 工作模式需要 v6。');
  if(p.version>=6){if(!['RGB','CMYK'].includes(p.colorMode))throw new Error('颜色模式无效。');if(p.colorMode==='CMYK'){const profile=p.colorProfile;if(!profile||typeof profile.name!=='string'||profile.name.length>200||typeof profile.data!=='string'||profile.data.length>6*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(profile.data))throw new Error('CMYK 配置文件无效。');const b=Buffer.from(profile.data,'base64');if(b.length<128||b.length>4*1024*1024||b.toString('ascii',36,40)!=='acsp'||b.toString('ascii',16,20)!=='CMYK')throw new Error('需要 CMYK ICC 配置文件。');}}
  if (!Array.isArray(p.layers) || p.layers.length < 1) throw new Error('项目至少需要一个图层。');
  const ids = new Set();
  let pixels = 0;
  const bitmapPixels = item => {
    if (!allowPixels || !item.pixels) return pngPixels(item.data, limit);
    const {width,height,data}=item.pixels;
    if(![width,height].every(n=>Number.isInteger(n)&&number(n,1,limit))||width*height>64*1024*1024||!(data instanceof Uint8Array||data instanceof Uint8ClampedArray)||data.byteLength!==width*height*4)throw new Error('PSD 像素数据无效。');
    return width*height;
  };
  for (const l of p.layers) {
    if (!l || typeof l.id !== 'string' || !l.id.length || l.id.length > 200 || ids.has(l.id)) throw new Error('图层标识无效或重复。');
    ids.add(l.id);
    if (typeof l.name !== 'string' || l.name.length > 200 || !(p.version >= 3 ? (p.version>=5?(p.version>=7?['raster','text','group','fill','adjustment','shape']:['raster','text','group','fill','adjustment']):['raster','text','group']) : ['raster', 'text']).includes(l.type)) throw new Error('图层信息无效。');
    if (!number(l.x, -100000, 100000) || !number(l.y, -100000, 100000) || !number(l.rotation, -36000, 36000) || !number(l.scale, 0.01, 100) || !number(l.opacity, 0, 1) || !(blends.includes(l.blend) || l.type === 'group' && l.blend === 'pass-through') || typeof l.visible !== 'boolean' || typeof l.locked !== 'boolean') throw new Error('图层属性无效。');
    if (p.version < 3 && (l.mask || l.parentId || l.clipping)) throw new Error('蒙版、图层组和剪贴蒙版需要 v3 项目格式。');
    if (l.clipping !== undefined && typeof l.clipping !== 'boolean') throw new Error('剪贴蒙版标志无效。');
    if (l.parentId !== undefined && l.parentId !== null && typeof l.parentId !== 'string') throw new Error('图层组引用无效。');
    if (p.version < 4 && (l.styles || l.fillOpacity !== undefined || l.textMode || l.textRasterCache)) throw new Error('图层样式和段落文字需要 v4 项目格式。');
    if (l.styles) validateStyles(l.styles);
    if (l.stylesEnabled !== undefined && typeof l.stylesEnabled !== 'boolean' || l.fillOpacity !== undefined && !number(l.fillOpacity, 0, 1)) throw new Error('图层样式或填充不透明度无效。');
    for (const key of ['textRasterCache','stylesModified']) if (l[key] !== undefined && typeof l[key] !== 'boolean') throw new Error('文字缓存或样式修改标志无效。');
    if (l.psdEffects && JSON.stringify(l.psdEffects).length > 65536) throw new Error('PSD 样式元数据过大。');
    for(const t of [l,l.mask].filter(Boolean)){for(const key of ['flipX','flipY'])if(t[key]!==undefined&&(typeof t[key]!=='boolean'||p.version<7&&t[key]))throw new Error('翻转属性需要 v7。');if(t.scaleY!==undefined&&!number(t.scaleY,.01,100)||t.skew!==undefined&&!number(t.skew,-100,100))throw new Error('二维变换属性无效。');if(p.version<5&&(t.scaleY!==undefined||t.skew!==undefined))throw new Error('二维变换需要 v5。');}
    if(l.artboard){if(p.version<7||l.type!=='group'||l.parentId)throw new Error('画板需要 v7 根级图层组。');validateArtboard(l.artboard);}
    if(l.type==='shape'){validateShape(l.shape);if(l.shape.vertexRadii&&p.version<8)throw new Error('顶点圆角需要 v8。');}
    else if(l.type==='fill'){validateFill(l);if(l.fill.alpha!==undefined&&(p.version<7||!number(l.fill.alpha,0,1)))throw new Error('填充透明度需要 v7。');if(p.version<7)pixels+=l.width*l.height;if(l.fill.data)pixels+=pngPixels(l.fill.data,512);}
    else if(l.type==='adjustment')validateAdjustment(l);
    else if (l.type === 'raster') {
      pixels += bitmapPixels(l);
    } else if (l.type === 'text') {
      if (typeof l.text !== 'string' || l.text.length > 10000 || typeof l.font !== 'string' || l.font.length > 200 || !number(l.fontSize, 1, 1000) || !/^#[\da-f]{6}$/i.test(l.color) || typeof l.bold !== 'boolean') throw new Error('文字图层信息无效。');
      if(l.paragraph){if(p.version<7)throw new Error('段落属性需要 v7。');for(const key of ['leftIndent','rightIndent','firstIndent','spaceBefore','spaceAfter'])if(l.paragraph[key]!==undefined&&!number(l.paragraph[key],key==='firstIndent'?-1000:0,10000))throw new Error('段落间距无效。');if(l.paragraph.list&&!['none','bullet','number'].includes(l.paragraph.list)||l.paragraph.direction&&!['ltr','rtl'].includes(l.paragraph.direction))throw new Error('段落属性无效。');}
      if(l.strike!==undefined&&(p.version<7||typeof l.strike!=='boolean'))throw new Error('删除线属性无效。');
      if(l.fontWeight!==undefined&&!number(l.fontWeight,100,900)||['italic','underline'].some(k=>l[k]!==undefined&&typeof l[k]!=='boolean'))throw new Error('字体样式无效。');
      if(l.textGeometry){const m=l.textGeometry.matrix;if(!Array.isArray(m)||m.length!==6||!m.every(n=>number(n,-100000,100000)))throw new Error('PSD 文字矩阵无效。');decompose(m.slice(0,4));}
      if (l.textMode !== undefined && !['point', 'paragraph'].includes(l.textMode) || l.align !== undefined && !['left','center','right',...(p.version>=8?['justify-left','justify-center','justify-right','justify-all']:[])].includes(l.align) || l.lineHeight !== undefined && !number(l.lineHeight, .5, 5) || l.letterSpacing !== undefined && !number(l.letterSpacing, -100, 1000)) throw new Error('文字排版属性无效。');
      if (l.textMode === 'paragraph' && (!number(l.boxWidth, 1, 16384) || !number(l.boxHeight, 1, 16384))) throw new Error('段落文字框尺寸无效。');
      if (l.textRasterCache) pixels += bitmapPixels(l);
    } else if (l.data !== undefined || !l.artboard&&(l.x !== 0 || l.y !== 0) || l.scale !== 1 || l.rotation !== 0 || typeof l.collapsed !== 'boolean') throw new Error('图层组的变换或折叠状态无效。');
    if (l.mask) {
      const m = l.mask;
      if (!number(m.x, -100000, 100000) || !number(m.y, -100000, 100000) || !number(m.scale, .01, 100) || !number(m.rotation, -36000, 36000) || !number(m.defaultColor, 0, 255) || !number(m.density, 0, 1) || !number(m.feather, 0, 100) || typeof m.enabled !== 'boolean' || typeof m.linked !== 'boolean') throw new Error('蒙版属性无效。');
      pixels += bitmapPixels(m);
    }
  }
  if(p.guides!==undefined&&(!Array.isArray(p.guides)||p.guides.length>200||p.guides.some(g=>!g||typeof g.id!=='string'||!['x','y'].includes(g.axis)||!number(g.position,-100000,100000))))throw new Error('参考线无效。');
  if(p.ruler&&(!['px','in','cm','mm','pt'].includes(p.ruler.unit)||!p.ruler.origin||!number(p.ruler.origin.x,-100000,100000)||!number(p.ruler.origin.y,-100000,100000)||['visible','guidesVisible','locked'].some(k=>typeof p.ruler[k]!=='boolean')))throw new Error('标尺属性无效。');
  const byId = new Map(p.layers.map(l => [l.id, l]));
  for (const l of p.layers) {
    const chain = new Set([l.id]); let parent = l.parentId;
    while (parent) {
      const group = byId.get(parent);
      if (!group || group.type !== 'group' || chain.has(parent) || chain.size > (l.type === 'group' ? 9 : 10)) throw new Error('图层组层级无效、循环引用或超过 10 层。');
      chain.add(parent); parent = group.parentId;
    }
  }
  if (!ids.has(p.activeId)) throw new Error('当前图层不存在。');
  return p;
}
async function readProject(file) {
  return validateProject(JSON.parse(await fs.readFile(file, 'utf8')));
}
async function atomicWrite(file, data) {
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
  try {
    await fs.writeFile(temp, data, { flag: 'wx' });
    await fs.rename(temp, file);
  } finally { await fs.rm(temp, { force: true }).catch(() => {}); }
}
async function saveProject(file, project) {
  validateProject(project);
  const data = JSON.stringify(project);
  await atomicWrite(file, data);
}
module.exports = { validateProject, readProject, saveProject, atomicWrite, pngPixels, MAX_BYTES };
