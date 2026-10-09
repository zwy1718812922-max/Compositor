const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const FORMAT = 'com.compositor.windows';
const MAX_BYTES = 128 * 1024 * 1024;
const blends = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference', 'soft-light', 'hard-light'];
function number(value, min, max) { return Number.isFinite(value) && value >= min && value <= max; }
function pngPixels(data, limit = 16384) {
  if (typeof data !== 'string' || data.length > MAX_BYTES * 1.4 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('图层或蒙版图片必须是 PNG。');
  const b = Buffer.from(data.slice(22), 'base64');
  if (b.length < 24 || b.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('PNG 图片损坏。');
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  if (!w || !h || w > limit || h > limit || w * h > 64 * 1024 * 1024) throw new Error('图层或蒙版图片尺寸超过限制。');
  return w * h;
}
function validateProject(p) {
  if (!p || p.format !== FORMAT || ![1, 2, 3].includes(p.version)) throw new Error('不支持的项目格式或版本。请打开 .ccomp 项目。');
  const limit = p.version === 1 ? 4096 : 16384;
  if (![p.width, p.height].every(n => Number.isInteger(n) && number(n, 1, limit)) || p.width * p.height > 64 * 1024 * 1024) throw new Error('画布尺寸超过此项目版本的限制。');
  if (p.version >= 2 && (!number(p.resolution, 1, 9600) || p.colorSpace !== 'sRGB')) throw new Error('分辨率或颜色空间无效。');
  if (!Array.isArray(p.layers) || p.layers.length < 1 || p.layers.length > 100) throw new Error('项目需要 1–100 个图层。');
  const ids = new Set();
  let pixels = 0;
  for (const l of p.layers) {
    if (!l || typeof l.id !== 'string' || !l.id.length || l.id.length > 200 || ids.has(l.id)) throw new Error('图层标识无效或重复。');
    ids.add(l.id);
    if (typeof l.name !== 'string' || l.name.length > 200 || !(p.version >= 3 ? ['raster', 'text', 'group'] : ['raster', 'text']).includes(l.type)) throw new Error('图层信息无效。');
    if (!number(l.x, -100000, 100000) || !number(l.y, -100000, 100000) || !number(l.rotation, -36000, 36000) || !number(l.scale, 0.01, 100) || !number(l.opacity, 0, 1) || !(blends.includes(l.blend) || l.type === 'group' && l.blend === 'pass-through') || typeof l.visible !== 'boolean' || typeof l.locked !== 'boolean') throw new Error('图层属性无效。');
    if (p.version < 3 && (l.mask || l.parentId || l.clipping)) throw new Error('蒙版、图层组和剪贴蒙版需要 v3 项目格式。');
    if (l.clipping !== undefined && typeof l.clipping !== 'boolean') throw new Error('剪贴蒙版标志无效。');
    if (l.parentId !== undefined && l.parentId !== null && typeof l.parentId !== 'string') throw new Error('图层组引用无效。');
    if (l.type === 'raster') {
      pixels += pngPixels(l.data, limit);
    } else if (l.type === 'text') {
      if (typeof l.text !== 'string' || l.text.length > 10000 || typeof l.font !== 'string' || l.font.length > 200 || !number(l.fontSize, 1, 1000) || !/^#[\da-f]{6}$/i.test(l.color) || typeof l.bold !== 'boolean') throw new Error('文字图层信息无效。');
    } else if (l.data !== undefined || l.x !== 0 || l.y !== 0 || l.scale !== 1 || l.rotation !== 0 || typeof l.collapsed !== 'boolean') throw new Error('图层组的变换或折叠状态无效。');
    if (l.mask) {
      const m = l.mask;
      if (!number(m.x, -100000, 100000) || !number(m.y, -100000, 100000) || !number(m.scale, .01, 100) || !number(m.rotation, -36000, 36000) || !number(m.defaultColor, 0, 255) || !number(m.density, 0, 1) || !number(m.feather, 0, 100) || typeof m.enabled !== 'boolean' || typeof m.linked !== 'boolean') throw new Error('蒙版属性无效。');
      pixels += pngPixels(m.data, limit);
    }
  }
  const byId = new Map(p.layers.map(l => [l.id, l]));
  for (const l of p.layers) {
    const chain = new Set([l.id]); let parent = l.parentId;
    while (parent) {
      const group = byId.get(parent);
      if (!group || group.type !== 'group' || chain.has(parent) || chain.size > (l.type === 'group' ? 9 : 10)) throw new Error('图层组层级无效、循环引用或超过 10 层。');
      chain.add(parent); parent = group.parentId;
    }
  }
  if (pixels > 64 * 1024 * 1024) throw new Error('图层和蒙版总像素超过 6400 万，请缩小项目。');
  if (!ids.has(p.activeId)) throw new Error('当前图层不存在。');
  return p;
}
async function readProject(file) {
  if ((await fs.stat(file)).size > MAX_BYTES) throw new Error('项目文件超过 128 MB。');
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
  if (Buffer.byteLength(data) > MAX_BYTES) throw new Error('项目文件超过 128 MB。');
  await atomicWrite(file, data);
}
module.exports = { validateProject, readProject, saveProject, atomicWrite, pngPixels, MAX_BYTES };
