// Exercise the renderer preparation and native PSD writer, then retain files for independent decoding.
const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { readPsdDocument } = require('../psd.cjs');
const { psdFixture } = require('../tests/psd-fixture.cjs');
const { PNG } = require('pngjs');
(async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const directory = path.resolve(__dirname, '../validation'); await fs.mkdir(directory, { recursive: true });
  const app = await electron.launch({ args: [path.join(__dirname, '..'), '--user-data-dir=' + path.join(directory, 'profile')], env });
  try {
    const page = await app.firstWindow(); await page.waitForSelector('.layer-row');
    const cases = [
      { name: 'core', project: readPsdDocument(psdFixture()).project },
      { name: 'example', project: JSON.parse(await fs.readFile(path.join(__dirname, '../examples/中文示例.ccomp'), 'utf8')) },
      { name: 'transforms', project: null }
    ];
    const pass = readPsdDocument(psdFixture()).project, group = pass.layers.find(l => l.type === 'group'); group.opacity = .6;
    const maskData = Buffer.from(Array.from({ length: 48 }, (_, i) => i < 24 ? [255,255,255,255] : [0,0,0,255]).flat());
    group.mask = { x: 0, y: 0, scale: 1, rotation: 0, defaultColor: 0, density: .8, feather: 0, enabled: true, linked: true, data: 'data:image/png;base64,' + PNG.sync.write({ width: 8, height: 6, data: maskData }).toString('base64') };
    cases.push({ name: 'pass-through', project: pass });
    for (const item of cases) {
      const file = path.join(directory, item.name + '.psd');
      await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, file);
      const prepared = await page.evaluate(async source => {
        const { deserialize, serialize, rasterLayer, textLayer, groupLayer, composite } = await import('./editor.js');
        const { preparePsd } = await import('./psd-export.js');
        let project;
        if (source) project = await deserialize(source);
        else {
          const bg = rasterLayer('背景', 32, 32, '#284064');
          const r = rasterLayer('旋转像素', 10, 8, '#f05d37'); r.x = 9; r.y = 4; r.scale = 1.5; r.rotation = 30;
          const mask = rasterLayer('蒙版', 10, 8, '#000'); const ctx = mask.canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,5,8);
          r.mask = { canvas: mask.canvas, x: 9, y: 4, scale: 1.5, rotation: 30, defaultColor: 0, density: 1, feather: 0, enabled: true, linked: false };
          const group = groupLayer('隔离组'); group.blend = 'source-over'; group.opacity = .7; r.parentId = group.id;
          const text = textLayer('中', 1, 17, '#ffffff'); text.fontSize = 12;
          project = { width: 32, height: 32, resolution: 144, layers: [bg, r, group, text], activeId: r.id };
        }
        const payload = preparePsd(project), response = await window.desktop.exportPsd(payload); if (!response.ok) throw new Error(response.error);
        const restored = await deserialize(payload.project), before = composite(project).getContext('2d').getImageData(0,0,project.width,project.height).data, after = composite(restored).getContext('2d').getImageData(0,0,project.width,project.height).data;
        let max = 0, changed = 0; for (let i=0;i<before.length;i++) { max=Math.max(max,Math.abs(before[i]-after[i])); if(before[i]!==after[i])changed++; }
        return { composite: payload.composite, max, changed, layers: payload.project.layers.length, textConverted: payload.project.layers.every(l => l.type !== 'text') };
      }, item.project);
      await fs.writeFile(path.join(directory, item.name + '.png'), Buffer.from(prepared.composite.slice(22), 'base64'));
      assert.equal(prepared.textConverted, true); assert.ok(prepared.max <= 3, 'Prepared PSD appearance differs: ' + JSON.stringify({max:prepared.max,changed:prepared.changed}));
      const restored = readPsdDocument(await fs.readFile(file)); assert.equal(restored.requiresFlatten, false); assert.equal(restored.project.layers.length, prepared.layers);
      console.log(item.name, 'layers=' + prepared.layers, 'preparedMaxDiff=' + prepared.max);
    }
    await fs.copyFile(path.join(directory, 'example.psd'), path.join(__dirname, '../examples/中文示例.psd'));
  } finally { await app.evaluate(({ app }) => app.exit(0)); await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
