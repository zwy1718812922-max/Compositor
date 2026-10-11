const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { validateProject, readProject, saveProject } = require('../project.cjs');
function fixture() {
  return { format: 'com.compositor.windows', version: 1, width: 640, height: 480, activeId: 'text-1', layers: [{ id: 'text-1', name: '中文标题', type: 'text', text: '你好，Windows 11', font: 'Microsoft YaHei', fontSize: 48, color: '#abcdef', bold: false, x: 0, y: 0, scale: 1, rotation: 0, visible: true, locked: false, opacity: 1, blend: 'source-over' }] };
}
test('中文路径可保存、重新读取和覆盖，写入失败不损坏原文件', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'compositor-中文-'));
  const file = path.join(dir, '我的项目.ccomp');
  try {
    const first = fixture(); await saveProject(file, first);
    assert.deepEqual(await readProject(file), first);
    const next = fixture(); next.layers[0].text = '第二次保存'; await saveProject(file, next);
    assert.deepEqual(await readProject(file), next);
    const invalid = fixture(); invalid.layers[0].scale = NaN;
    await assert.rejects(saveProject(file, invalid));
    assert.deepEqual(await readProject(file), next);
    assert.deepEqual(await fs.readdir(dir), ['我的项目.ccomp']);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('拒绝未来版本、超大尺寸、重复 ID 和无效属性', () => {
  for (const mutate of [
    p => p.version = 5, p => p.width = 4097, p => p.layers.push(p.layers[0]),
    p => p.activeId = 'missing', p => p.layers[0].opacity = 2,
    p => p.layers[0].blend = 'unknown', p => p.layers[0].color = 'invalid'
  ]) { const p = fixture(); mutate(p); assert.throws(() => validateProject(p)); }
});
test('拒绝伪造、损坏和超大 PNG', () => {
  const p = fixture(); p.layers[0].type = 'raster';
  p.layers[0].data = 'data:image/png;base64,YWJj'; assert.throws(() => validateProject(p));
  const b = Buffer.alloc(24); Buffer.from('89504e470d0a1a0a', 'hex').copy(b); b.writeUInt32BE(9999, 16); b.writeUInt32BE(9999, 20);
  p.layers[0].data = 'data:image/png;base64,' + b.toString('base64'); assert.throws(() => validateProject(p));
});

test('v2 保留分辨率、允许 A3 画布并拒绝无效分辨率及超大画布', () => {
  const p = fixture(); Object.assign(p, { version: 2, width: 3508, height: 4961, resolution: 300, colorSpace: 'sRGB' });
  assert.equal(validateProject(p).resolution, 300);
  for (const mutate of [x => x.resolution = 0, x => x.resolution = 9601, x => x.colorSpace = 'CMYK', x => x.width = 16385]) {
    const bad = structuredClone(p); mutate(bad); assert.throws(() => validateProject(bad));
  }
});

test('v4 保存段落排版及图层样式，拒绝无效参数且旧格式保持兼容', () => {
  const { defaultEffect }=require('../src/effect-model.mjs');
  const p=fixture(); Object.assign(p,{version:4,resolution:300,colorSpace:'sRGB'}); Object.assign(p.layers[0],{textMode:'paragraph',boxWidth:300,boxHeight:200,align:'center',lineHeight:1.5,letterSpacing:2,fillOpacity:.5,styles:{stroke:{...defaultEffect('stroke'),enabled:true}}});
  assert.equal(validateProject(p).layers[0].styles.stroke.size,3);
  for (const change of [l=>l.boxWidth=0,l=>l.align='bad',l=>l.fillOpacity=2,l=>l.styles.stroke.size=251,l=>l.styles.stroke.color='red',l=>l.styles.fake={enabled:true}]) {const bad=structuredClone(p);change(bad.layers[0]);assert.throws(()=>validateProject(bad));}
  const legacy=structuredClone(p);legacy.version=3;assert.throws(()=>validateProject(legacy),/v4/);
});
