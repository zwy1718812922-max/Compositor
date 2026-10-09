const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PNG } = require('pngjs');
const { readPsd, getCompositeImageData } = require('ag-psd');
const { readPsdDocument, writePsdDocument } = require('../psd.cjs');
const { validateProject } = require('../project.cjs');
const { psdFixture, bitmap } = require('./psd-fixture.cjs');
const toPNG = image => 'data:image/png;base64,' + PNG.sync.write({ width: image.width, height: image.height, data: Buffer.from(image.data) }).toString('base64');

test('PSD 分层往返保留中文组、叠放顺序、剪贴关系、位置与灰度蒙版', () => {
  const { project, requiresFlatten } = readPsdDocument(psdFixture());
  assert.equal(requiresFlatten, false); assert.equal(project.resolution, 300);
  assert.deepEqual(project.layers.map(l => l.name), ['背景', '蒙版图层', '剪贴颜色', '中文组']);
  const base = project.layers[1], clipped = project.layers[2], group = project.layers[3];
  assert.equal(base.parentId, group.id); assert.equal(clipped.parentId, group.id); assert.equal(clipped.clipping, true);
  assert.deepEqual([base.x, base.y, base.mask.x, base.mask.y], [2, 1, 2, 1]);
  base.mask.density = .6; base.mask.feather = 2; base.mask.enabled = false;
  group.collapsed = true; base.locked = true;
  const output = writePsdDocument(project, toPNG(bitmap(8, 6, [80,100,140,255])));
  const restored = readPsdDocument(output).project;
  const mask = restored.layers[1].mask;
  assert.equal(mask.defaultColor, 0); assert.equal(mask.enabled, false); assert.equal(mask.density, .6); assert.equal(mask.feather, 2);
  assert.equal(restored.layers[3].collapsed, true); assert.equal(restored.layers[1].locked, true);
  assert.deepEqual(Array.from(PNG.sync.read(Buffer.from(mask.data.slice(22), 'base64')).data), Array.from(PNG.sync.read(Buffer.from(base.mask.data.slice(22), 'base64')).data));
  const raw = readPsd(output, { useImageData: true }); assert.deepEqual(Array.from(raw.imageData.data.slice(0,4)), [80,100,140,255]);
});
test('复杂 PSD 请求预览确认，拒绝 PSB、CMYK、16 位、损坏和超大文件', () => {
  const source = psdFixture({ children: [{ name: '复杂混合', blendMode: 'color dodge', imageData: bitmap(8,6,[100,100,100,255]) }] });
  const flattened = readPsdDocument(source); assert.equal(flattened.requiresFlatten, true); assert.equal(flattened.project.layers.length, 1); assert.match(flattened.warnings.join(''), /混合模式/);
  for (const [offset, value] of [[4,2],[22,16],[24,4]]) { const b = Buffer.from(psdFixture()); b.writeUInt16BE(value, offset); assert.throws(() => readPsdDocument(b)); }
  assert.throws(() => readPsdDocument(Buffer.from('not a psd')));
  const b = Buffer.from(psdFixture()); b.writeUInt32BE(20000,18); assert.throws(() => readPsdDocument(b));
  const original = psdFixture(), start = 30 + original.readUInt32BE(26), resourceLength = original.readUInt32BE(start);
  const profile = Buffer.from('Adobe RGB (1998)'), block = Buffer.alloc(12 + profile.length);
  block.write('8BIM'); block.writeUInt16BE(1039,4); block.writeUInt32BE(profile.length,8); profile.copy(block,12);
  const size = Buffer.alloc(4); size.writeUInt32BE(resourceLength + block.length);
  const tagged = Buffer.concat([original.subarray(0,start),size,block,original.subarray(start+4)]);
  assert.throws(() => readPsdDocument(tagged), /sRGB/);
});
test('v3 拒绝不存在的组、循环层级、失效蒙版及过深嵌套', () => {
  const original = readPsdDocument(psdFixture()).project;
  for (const mutate of [p => p.layers[1].parentId = 'missing', p => p.layers[3].parentId = p.layers[3].id, p => p.layers[1].mask.density = 2, p => p.layers[1].mask.data = 'broken', p => p.layers[3].x = 3]) { const p = structuredClone(original); mutate(p); assert.throws(() => validateProject(p)); }
  const p = structuredClone(original); const group = p.layers[3];
  for (let i = 0; i < 11; i++) { const next = { ...group, id: 'group-' + i, parentId: i ? 'group-' + (i-1) : null }; p.layers.push(next); }
  assert.throws(() => validateProject(p));
});
