const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PNG } = require('pngjs');
const { readPsd, getCompositeImageData } = require('ag-psd');
const { readPsdDocument, writePsdDocument } = require('../psd.cjs');
const { validateProject } = require('../project.cjs');
const { psdFixture, bitmap } = require('./psd-fixture.cjs');
const toPNG = image => 'data:image/png;base64,' + PNG.sync.write({ width: image.width, height: image.height, data: Buffer.from(image.data) }).toString('base64');

test('PSD 像素传输与 PNG 解码逐字节一致，并保留组和蒙版；临时传输不能直接保存',()=>{
  const bytes=psdFixture(),encoded=readPsdDocument(bytes),raw=readPsdDocument(bytes,undefined,{rawPixels:true});
  assert.equal(validateProject(raw.project,true),raw.project);assert.throws(()=>validateProject(raw.project));
  assert.deepEqual(raw.project.layers.map(l=>[l.name,l.type,l.clipping]),encoded.project.layers.map(l=>[l.name,l.type,l.clipping]));
  for(let n=0;n<raw.project.layers.length;n++)for(const [a,b] of [[raw.project.layers[n],encoded.project.layers[n]],[raw.project.layers[n].mask,encoded.project.layers[n].mask]])if(a?.pixels){const png=PNG.sync.read(Buffer.from(b.data.slice(22),'base64'));assert.equal(a.data,undefined);assert.deepEqual([a.pixels.width,a.pixels.height],[png.width,png.height]);assert.deepEqual(Buffer.from(a.pixels.data),png.data);}
  const complex=readPsdDocument(psdFixture({children:[{name:'复杂混合',blendMode:'color dodge',imageData:bitmap(8,6,[10,20,30,255])}]}),undefined,{rawPixels:true});assert(complex.preview.layers[0].pixels);assert.equal(complex.preview.layers[0].data,undefined);
});

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
test('复杂 PSD 保留图层并提供独立合成预览，拒绝非法位深及损坏文件', () => {
  const source = psdFixture({ children: [{ name:'背景',imageData:bitmap(8,6,[1,2,3,255]) },{ name: '复杂混合', blendMode: 'color dodge', imageData: bitmap(8,6,[100,100,100,255]) }] });
  const imported = readPsdDocument(source); assert.equal(imported.requiresFlatten, false); assert.equal(imported.requiresConversion, true); assert.deepEqual(imported.project.layers.map(l=>l.name),['背景','复杂混合']); assert.equal(imported.preview.layers.length,1); assert.match(imported.warnings.join(''), /混合模式/);
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

test('PSD 原生 FX 和水平文字保持分层及可编辑元数据，往返不丢失效果', () => {
  const source = psdFixture({ children:[{name:'底层',imageData:bitmap(8,6,[1,2,3,255])},{name:'文字标题',imageData:bitmap(3,2,[255,255,255,255]),text:{text:'中文',transform:[1,0,0,1,2,4],style:{font:{name:'MicrosoftYaHei'},fontSize:12,fillColor:{r:255,g:255,b:255}}},effects:{scale:1,dropShadow:[{enabled:true,color:{r:0,g:0,b:0},opacity:.4,angle:120,distance:{units:'Pixels',value:3},size:{units:'Pixels',value:0},blendMode:'multiply'}]}}] });
  const imported = readPsdDocument(source), l=imported.project.layers[1];
  assert.equal(imported.project.layers.length,2); assert.equal(imported.requiresConversion,false); assert.equal(l.type,'text'); assert.equal(l.text,'中文'); assert.equal(l.styles.dropShadow.enabled,true); assert.equal(l.styles.dropShadow.size,0);
  const prepared=structuredClone(imported.project); prepared.layers[1].type='raster'; prepared.layers[1].psdText=l.psdTextSource;
  const bytes=writePsdDocument(prepared,toPNG(bitmap(8,6,[0,0,0,255]))), restored=readPsdDocument(bytes);
  assert.equal(restored.project.layers[1].type,'text'); assert.equal(restored.project.layers[1].text,'中文'); assert.equal(restored.project.layers[1].styles.dropShadow.opacity,.4);
});
test('v3 拒绝不存在的组、循环层级、失效蒙版及过深嵌套', () => {
  const original = readPsdDocument(psdFixture()).project;
  for (const mutate of [p => p.layers[1].parentId = 'missing', p => p.layers[3].parentId = p.layers[3].id, p => p.layers[1].mask.density = 2, p => p.layers[1].mask.data = 'broken', p => p.layers[3].x = 3]) { const p = structuredClone(original); mutate(p); assert.throws(() => validateProject(p)); }
  const p = structuredClone(original); const group = p.layers[3];
  for (let i = 0; i < 11; i++) { const next = { ...group, id: 'group-' + i, parentId: i ? 'group-' + (i-1) : null }; p.layers.push(next); }
  assert.throws(() => validateProject(p));
});
