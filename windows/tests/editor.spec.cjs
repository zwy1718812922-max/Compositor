const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs/promises');
let app, page, errors;
test.beforeEach(async () => {
  app = null; errors = [];
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const profile = '--user-data-dir=' + test.info().outputPath('profile');
  app = await electron.launch(process.env.COMPOSITOR_EXECUTABLE
    ? { executablePath: process.env.COMPOSITOR_EXECUTABLE, args: [profile], env }
    : { args: [path.join(__dirname, '..'), profile], env });
  page = await app.firstWindow(); errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('#home-screen')).toBeVisible();await menu('new');await page.locator('#new-name').fill('未命名');await page.locator('[data-category=web]').click();await page.locator('[data-preset=web-1280]').click();await page.locator('#new-background').selectOption('transparent');await page.locator('#create-document').click();await expect(page.locator('#new-dialog')).toBeHidden();await menu('rasterize');await expect(page.locator('#layer-count')).toHaveText('1 个图层');
});
test.afterEach(async () => {
  if (app) { await app.evaluate(({ app }) => app.exit(0)); await app.close(); }
  expect(errors).toEqual([]);
});
async function menu(command) {
  await page.waitForFunction(() => document.body.getAttribute('aria-busy') === 'false');
  const serial = await page.evaluate(() => Number(document.body.dataset.commandSerial || 0));
  await app.evaluate(({ BrowserWindow }, action) => BrowserWindow.getAllWindows()[0].webContents.send('command', action), command);
  await page.waitForFunction(value => Number(document.body.dataset.commandSerial || 0) > value, serial);
  await page.waitForFunction(() => document.body.getAttribute('aria-busy') === 'false' || !!document.querySelector('dialog[open]'));
}
async function at(x, y) {
  const box = await page.locator('#canvas').boundingBox();
  const size = await page.locator('#canvas').evaluate(c => ({ width: c.width, height: c.height }));
  const origin=await page.locator('#canvas').evaluate(c=>({x:Number(c.dataset.originX||0),y:Number(c.dataset.originY||0),width:Number(c.dataset.worldWidth||c.width),height:Number(c.dataset.worldHeight||c.height)}));return {x:box.x+(x-origin.x)/origin.width*box.width,y:box.y+(y-origin.y)/origin.height*box.height};
}
async function drag(x1, y1, x2, y2) {
  const a = await at(x1, y1), b = await at(x2, y2);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();if(await page.locator('#layer-type').textContent()==='形状属性'&&await page.locator('.tools [data-tool=rect]').evaluate(b=>b.getAttribute('aria-pressed')==='true'))await menu('rasterize');
}
async function pixel(x, y) { return page.locator('#canvas').evaluate((c, p) => Array.from(c.getContext('2d').getImageData(Math.floor((p.x-Number(c.dataset.originX||0))*c.width/Number(c.dataset.worldWidth||c.width)),Math.floor((p.y-Number(c.dataset.originY||0))*c.height/Number(c.dataset.worldHeight||c.height)),1,1).data), { x, y }); }
async function edit(id, value) {
  if(id==='text-content'){if(!await page.locator('#inline-text').isVisible())await page.locator('#text-edit-inline').click();await page.locator('#inline-text').fill(String(value));await page.locator('#inline-text').press('Control+Enter');return;}
  if (['layer-x', 'layer-y', 'layer-scale', 'layer-rotation', 'text-content', 'font-size'].includes(id)) await page.getByRole('button', { name: '属性面板', exact: true }).click();
  await page.locator('#' + id).fill(String(value)); await page.locator('#' + id).press('Tab');
}

test('绘画、橡皮擦、撤销重做、图层可见性和锁定', async () => {
  await page.getByRole('button', { name: '画笔工具', exact: true }).click();
  await edit('brush-size', 50);
  await drag(300, 300, 500, 300);
  expect((await pixel(400, 300))[3]).toBe(255);
  await page.getByRole('button', { name: '橡皮擦工具', exact: true }).click();
  await drag(400, 290, 400, 310);
  expect((await pixel(400, 300))[3]).toBe(0);
  await menu('undo'); await expect.poll(async () => (await pixel(400, 300))[3]).toBe(255);
  await menu('redo'); await expect.poll(async () => (await pixel(400, 300))[3]).toBe(0);
  await page.getByRole('button', { name: '隐藏图层', exact: true }).click();
  expect((await pixel(320, 300))[3]).toBe(0);
  await page.getByRole('button', { name: '显示图层', exact: true }).click();
  expect((await pixel(320, 300))[3]).toBe(255);
  await page.getByRole('button', { name: '锁定图层', exact: true }).click();
  await drag(320, 290, 320, 310);
  expect((await pixel(320, 300))[3]).toBe(255);
});
test('中文文字、图层排序、透明度、保存打开与 PNG/JPEG 实际导出', async () => {
  const output = test.info().outputPath('中文目录'); await fs.mkdir(output, { recursive: true });
  const projectFile = path.join(output, '中文项目.ccomp'), png = path.join(output, '透明.png'), jpg = path.join(output, '作品.jpg');
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, projectFile);
  await page.getByRole('button', { name: '矩形工具', exact: true }).click();
  await drag(100, 100, 600, 400);
  await expect(page.locator('#layer-count')).toHaveText('2 个图层');
  expect((await pixel(200, 200))[3]).toBe(255);
  await edit('layer-opacity', 50); expect((await pixel(200, 200))[3]).toBeCloseTo(128, -1);
  await page.getByRole('button', { name: '文字工具', exact: true }).click();
  const p = await at(200, 200); await page.mouse.click(p.x, p.y);
  await edit('text-content', '你好，Windows 11\n中文创作'); await edit('font-size', 48);
  await expect(page.locator('#layer-count')).toHaveText('3 个图层');
  await menu('duplicate'); await expect(page.locator('#layer-count')).toHaveText('4 个图层');
  await menu('deleteLayer'); await expect(page.locator('#layer-count')).toHaveText('3 个图层');
  await menu('save'); await expect(page.locator('#dirty-dot')).toBeHidden();
  const saved = JSON.parse(await fs.readFile(projectFile, 'utf8'));
  expect(saved.layers[2].text).toBe('你好，Windows 11\n中文创作');
  const originalPixels = await displayImage();
  await menu('new'); await page.locator('#new-form button[type=submit]').click();
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, projectFile);
  await menu('open'); await expect(page.locator('#layer-count')).toHaveText('3 个图层');
  expect(await displayImage()).toBe(originalPixels);
  // Plain Save after Open must reuse the opened path, without another dialog.
  await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => { throw new Error('不应再次弹出另存为'); }; });
  await edit('text-content', '修改后'); await menu('save'); await expect(page.locator('#dirty-dot')).toBeHidden();
  expect(JSON.parse(await fs.readFile(projectFile, 'utf8')).layers[2].text).toBe('修改后');
  for (const [format, file] of [['png', png], ['jpeg', jpg]]) {
    await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, file);
    await menu('export'); await page.locator('#export-format').selectOption(format); await page.locator('#export-form button[type=submit]').click();
    await expect(page.locator('#export-dialog')).not.toBeVisible();
    const data = await fs.readFile(file);
    expect(data.subarray(0, format === 'png' ? 8 : 2).toString('hex')).toBe(format === 'png' ? '89504e470d0a1a0a' : 'ffd8');
    if (format === 'png') { expect(data.readUInt32BE(16)).toBe(1280); expect(data.readUInt32BE(20)).toBe(800); }
  }
  await page.screenshot({ path: test.info().outputPath('editor.png') });
});
test('取消操作保留未保存修改，导入图片、变换、重命名和错误项目恢复', async () => {
  await menu('addLayer'); await expect(page.locator('#layer-count')).toHaveText('2 个图层');
  await menu('closeDocument'); await expect(page.locator('#confirm-dialog')).toBeVisible(); await page.locator('[data-choice=cancel]').click();
  await expect(page.locator('#layer-count')).toHaveText('2 个图层');
  const imagePath = test.info().outputPath('导入.png');
  const data = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 100; c.height = 80; const ctx = c.getContext('2d'); ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 100, 80); return c.toDataURL().split(',')[1]; });
  await fs.writeFile(imagePath, Buffer.from(data, 'base64'));
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, imagePath);
  await menu('import'); await expect(page.locator('#layer-count')).toHaveText('3 个图层');
  expect(await pixel(640, 400)).toEqual([255, 0, 0, 255]);
  await edit('layer-x', 100); await edit('layer-y', 100); await edit('layer-scale', 200);
  expect(await pixel(150, 150)).toEqual([255, 0, 0, 255]);
  expect((await pixel(640, 400))[3]).toBe(0);
  await page.locator('.layer-row.active .layer-name span').dblclick();
  await page.locator('.rename-input').fill('我的照片'); await page.locator('.rename-input').press('Enter');
  await expect(page.locator('.layer-row.active .layer-name span')).toHaveText('我的照片');
  const bad = test.info().outputPath('损坏.ccomp'); await fs.writeFile(bad, '{"format":"bad"}');
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, bad);
  await menu('open');
  await expect(page.locator('#toast')).toContainText('不支持');
  await expect(page.locator('#layer-count')).toHaveText('3 个图层');
  expect(await pixel(150, 150)).toEqual([255, 0, 0, 255]);
});

test('关闭保护、另存为取消与新建后的保存路径隔离', async () => {
  const first = test.info().outputPath('第一个.ccomp'), second = test.info().outputPath('第二个.ccomp');
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, first);
  await menu('addLayer'); await menu('save');
  await expect(page.locator('#dirty-dot')).toBeHidden();
  const firstContent = await fs.readFile(first, 'utf8');
  await menu('new'); await page.locator('#new-form button[type=submit]').click();
  await menu('addLayer');
  await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true }); });
  await menu('close'); await expect(page.locator('#confirm-dialog')).toBeVisible();
  await page.locator('[data-choice=save]').click();
  await expect(page.locator('body')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#dirty-dot')).toBeVisible();
  await expect(page.locator('#layer-count')).toHaveText('2 个图层');
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, second);
  await menu('save'); await expect(page.locator('#dirty-dot')).toBeHidden();
  expect(await fs.readFile(first, 'utf8')).toBe(firstContent);
  expect(JSON.parse(await fs.readFile(second, 'utf8')).layers).toHaveLength(2);
  await menu('addLayer'); await menu('close');
  await page.locator('[data-choice=cancel]').click();
  await expect(page.locator('#layer-count')).toHaveText('3 个图层');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 720));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('minimum-window.png') });
});

test('纸张预设、单位和方向转换、保存预设、真实创建及分辨率导出', async () => {
  await menu('new');await page.locator('[data-category=print]').click();
  await expect(page.locator('.preset-card')).toHaveCount(14);
  await page.locator('[data-preset=a4]').click();
  await expect(page.locator('#new-size-preview')).toHaveText('2480 × 3508 像素 · 300 ppi');
  await page.locator('#new-unit').selectOption('in');
  expect(Number(await page.locator('#new-width').inputValue())).toBeCloseTo(210 / 25.4, 5);
  await page.locator('#new-resolution-unit').selectOption('ppcm');
  expect(Number(await page.locator('#new-resolution').inputValue())).toBeCloseTo(300 / 2.54, 5);
  await page.locator('#landscape').click();
  await expect(page.locator('#new-size-preview')).toHaveText('3508 × 2480 像素 · 300 ppi');
  await page.locator('#new-name').fill('A4 中文设计');
  await page.locator('#new-background').selectOption('transparent');
  await page.locator('#save-preset').click();
  await expect(page.locator('[data-category=saved]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.preset-card')).toHaveCount(1);
  await page.locator('[data-category=web]').click();
  await expect(page.locator('.preset-card')).toHaveCount(6);
  await page.locator('[data-category=saved]').click();
  await expect(page.locator('#new-size-preview')).toHaveText('3508 × 2480 像素 · 300 ppi');
  await page.locator('#create-document').click();
  await expect(page.locator('#new-dialog')).not.toBeVisible();
  expect(await page.locator('#canvas-wrap').evaluate(c => [parseInt(c.style.width), parseInt(c.style.height)])).toEqual([3508, 2480]);
  expect((await pixel(100, 100))[3]).toBe(0);
  const file = test.info().outputPath('打印项目.ccomp');
  await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, file);
  await menu('save'); await expect(page.locator('#document-name')).toHaveText('打印项目');
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  expect(saved.version).toBe(8); expect(saved.resolution).toBe(300); expect(saved.colorSpace).toBe('sRGB');
  for (const format of ['png', 'jpeg']) {
    const output = test.info().outputPath('300ppi.' + format);
    await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, output);
    await menu('export'); await page.locator('#export-format').selectOption(format); await page.locator('#export-form button[type=submit]').click();
    await expect(page.locator('#export-dialog')).not.toBeVisible();
    const image = await fs.readFile(output);
    if (format === 'png') {
      const offset = image.indexOf(Buffer.from('pHYs'));
      expect(offset).toBeGreaterThan(0);
      expect(image.readUInt32BE(offset + 4)).toBe(11811); expect(image[offset + 12]).toBe(1);
      expect(image.readUInt32BE(16)).toBe(3508); expect(image.readUInt32BE(20)).toBe(2480);
    } else { expect(image[13]).toBe(1); expect(image.readUInt16BE(14)).toBe(300); expect(image.readUInt16BE(16)).toBe(300); }
  }
  await menu('new'); await page.locator('[data-category=recent]').click();
  await expect(page.locator('.preset-card')).toHaveCount(2);
  await expect(page.locator('.preset-title').first()).toHaveText('A4 中文设计');
  await page.locator('[data-category=saved]').click(); await page.locator('#delete-preset').click();
  await expect(page.locator('#preset-empty')).toBeVisible();
});

test('搜索、A3 300ppi 预设和无效输入不会创建画布', async () => {
  await menu('new');await page.locator('[data-category=print]').click(); await page.locator('#preset-search').fill('A3');
  await expect(page.locator('.preset-card')).toHaveCount(1);
  await page.locator('#preset-search').press('Enter');
  await expect(page.locator('#new-dialog')).toBeVisible();
  await page.locator('[data-preset=a3]').click();
  await expect(page.locator('#new-size-preview')).toHaveText('3508 × 4961 像素 · 300 ppi');
  await page.locator('#new-unit').selectOption('px');
  await expect(page.locator('#new-width')).toHaveValue('3508');
  await expect(page.locator('#new-height')).toHaveValue('4961');
  await page.locator('#new-width').fill('20000');
  await expect(page.locator('#create-document')).toBeDisabled();
  await expect(page.locator('#new-error')).toContainText('16384');
  await page.locator('#new-width').fill('');
  await expect(page.locator('#create-document')).toBeDisabled();
  await page.locator('#new-width').fill('8000'); await page.locator('#new-height').fill('9000');
  await expect(page.locator('#create-document')).toBeEnabled();
  await page.locator('#new-height').fill('1000'); await page.locator('#new-resolution').fill('0');
  await expect(page.locator('#create-document')).toBeDisabled();
  await page.locator('#new-resolution').fill('72');
  await expect(page.locator('#create-document')).toBeEnabled();
  await page.locator('#new-dialog [data-dismiss]').click();
  expect(await page.locator('#canvas-wrap').evaluate(c => [parseInt(c.style.width), parseInt(c.style.height)])).toEqual([1280, 800]);
});

test('参考图布局、纸张选择和最小窗口的创建按钮可见', async () => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await menu('new');await page.locator('[data-category=print]').click();await page.locator('[data-preset=letter]').click();
  await page.evaluate(() => document.activeElement.blur());
  await page.mouse.move(0, 0);
  const dialog = page.locator('#new-dialog');
  const box = await dialog.boundingBox();
  expect([box.width, box.height]).toEqual([1080, 690]);
  await dialog.screenshot({ path: path.join(__dirname, '../new-canvas-preview.png') });
  await page.locator('.new-details').screenshot({ path: path.join(__dirname, '../new-canvas-details.png') });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 720));
  await page.waitForFunction(()=>innerWidth===1024);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const small = await dialog.boundingBox();
  const size = await page.evaluate(() => [innerWidth, innerHeight]);
  expect(small.x).toBeGreaterThanOrEqual(0); expect(small.y).toBeGreaterThanOrEqual(0);
  expect(small.x + small.width).toBeLessThanOrEqual(size[0]);
  expect(small.y + small.height).toBeLessThanOrEqual(size[1]);
  const create = await page.locator('#create-document').boundingBox();
  expect(create.y + create.height).toBeLessThanOrEqual(size[1]);
  await dialog.screenshot({ path: path.join(__dirname, '../new-canvas-small.png') });
});

test('矩形选区限制填充、绘画和清除，支持变换图层及撤销', async () => {
  await page.locator('#color').fill('#ff0000'); await menu('fillSelection');
  await expect.poll(() => pixel(100, 300)).toEqual([255, 0, 0, 255]);
  await edit('layer-x', 50); await edit('layer-y', 30); await edit('layer-rotation', 10);
  await page.locator('[data-tool=select]').click(); await drag(200, 200, 400, 400);
  await page.locator('#color').fill('#0000ff'); await menu('fillSelection');
  await expect.poll(() => pixel(300, 300)).toEqual([0, 0, 255, 255]);
  expect(await pixel(150, 300)).toEqual([255, 0, 0, 255]);
  await page.locator('#color').fill('#00ff00'); await page.locator('[data-tool=brush]').click(); await edit('brush-size', 60);
  await drag(150, 300, 450, 300);
  expect(await pixel(300, 300)).toEqual([0, 255, 0, 255]);
  expect(await pixel(150, 300)).toEqual([255, 0, 0, 255]); expect(await pixel(450, 300)).toEqual([255, 0, 0, 255]);
  await page.locator('#viewport').press('Delete');
  await expect.poll(async () => (await pixel(300, 300))[3]).toBe(0);
  expect(await pixel(150, 300)).toEqual([255, 0, 0, 255]);
  await menu('undo'); await expect.poll(() => pixel(300, 300)).toEqual([0, 255, 0, 255]);
  await page.getByRole('button', { name: '锁定图层', exact: true }).click(); await menu('clearSelection');
  await expect(page.locator('#toast')).toContainText('锁定'); expect(await pixel(300, 300)).toEqual([0, 255, 0, 255]);
});

test('裁剪、画布锚点扩展、图像重采样保留文字、尺寸撤销和保存重开', async () => {
  await page.locator('#color').fill('#ff0000'); await menu('fillSelection');
  await page.locator('[data-tool=text]').click(); const p = await at(200, 200); await page.mouse.click(p.x, p.y);
  await edit('text-content','尺寸修改后仍可编辑');
  await page.locator('[data-tool=crop]').click(); await drag(100, 100, 740, 500);
  const rectSize = (await page.locator('#selection-size').textContent()).split(' × ').map(Number);
  await page.locator('#viewport').press('Enter');
  expect(await page.locator('#canvas-wrap').evaluate(c => [parseInt(c.style.width), parseInt(c.style.height)])).toEqual(rectSize);
  expect(await pixel(10, 10)).toEqual([255, 0, 0, 255]);
  await menu('undo'); await expect.poll(() => page.locator('#canvas-wrap').evaluate(c => [parseInt(c.style.width), parseInt(c.style.height)])).toEqual([1280, 800]);
  await menu('canvasSize'); await page.locator('#size-width').fill('1440'); await page.locator('#size-height').fill('1000');
  await page.locator('#size-form button[type=submit]').click();if(!(await page.locator('#size-error').isVisible()))await expect(page.locator('#size-dialog')).toBeHidden();
  expect(await page.locator('#canvas-wrap').evaluate(c => [parseInt(c.style.width), parseInt(c.style.height)])).toEqual([1440, 1000]);
  expect((await pixel(10, 10))[3]).toBe(0); expect(await pixel(100, 120)).toEqual([255, 0, 0, 255]);
  await expect(page.locator('#layer-x')).toHaveValue('280'); await expect(page.locator('#layer-y')).toHaveValue('300');
  await menu('undo'); await expect.poll(() => page.locator('#canvas-wrap').evaluate(c => parseInt(c.style.width))).toBe(1280);
  await menu('imageSize'); await page.locator('#size-width').fill('640'); await expect(page.locator('#size-height')).toHaveValue('400');
  await page.locator('#size-resolution').fill('300'); await page.locator('#size-form button[type=submit]').click();if(!(await page.locator('#size-error').isVisible()))await expect(page.locator('#size-dialog')).toBeHidden();
  expect(await page.locator('#canvas-wrap').evaluate(c => [parseInt(c.style.width), parseInt(c.style.height)])).toEqual([640, 400]);
  await expect(page.locator('#layer-type')).toHaveText('文字图层'); await expect(page.locator('#layer-scale')).toHaveValue('50');
  await expect(page.locator('#layer-x')).toHaveValue('100'); await expect(page.locator('#dimensions')).toContainText('300 ppi');
  const file = test.info().outputPath('尺寸.ccomp');
  await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] }); }, file);
  const before = await displayImage(); await menu('save'); await expect(page.locator('#dirty-dot')).toBeHidden();
  await menu('open'); await expect(page.locator('#document-name')).toHaveText('尺寸');
  expect(await displayImage()).toBe(before);
  const saved = JSON.parse(await fs.readFile(file, 'utf8')); expect(saved.layers[0].data).toBeTruthy(); expect(saved.layers[1].type).toBe('text'); expect(saved.resolution).toBe(300);
  await menu('canvasSize'); await page.locator('#size-width').fill('16385'); await page.locator('#size-height').fill('9000');
  expect(await page.locator('#size-width').evaluate(i=>i.validity.rangeOverflow)).toBe(true);await page.locator('#size-form button[type=submit]').click();await expect(page.locator('#size-dialog')).toBeVisible();
  expect(await page.locator('#canvas-wrap').evaluate(c => parseInt(c.style.width))).toBe(640); await page.locator('#size-cancel').click();
});

async function adjustmentValue(key, value) {
  await page.locator('#adjust-' + key).evaluate((input, v) => { input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); }, String(value));
}

test('图像调整实时预览、取消保持保存状态、选区灰度和单步撤销', async () => {
  await page.locator('#color').fill('#ff0000'); await menu('fillSelection');
  const file = test.info().outputPath('调整.ccomp'); await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, file);
  await menu('save'); await expect(page.locator('#dirty-dot')).toBeHidden();
  await menu('adjust'); await adjustmentValue('invert', 100);
  await expect.poll(() => pixel(300, 300)).toEqual([0, 255, 255, 255]);
  await page.locator('#adjust-dialog [data-dismiss]').click();
  await expect.poll(() => pixel(300, 300)).toEqual([255, 0, 0, 255]); await expect(page.locator('#dirty-dot')).toBeHidden();
  await page.locator('[data-tool=select]').click(); await drag(200, 200, 400, 400);
  await menu('adjust'); await adjustmentValue('grayscale', 100);
  await expect.poll(async () => { const p = await pixel(300, 300); return p[0] === p[1] && p[1] === p[2]; }).toBe(true);
  expect(await pixel(150, 300)).toEqual([255, 0, 0, 255]);
  await page.locator('#adjust-form button[type=submit]').click(); await expect(page.locator('#dirty-dot')).toBeVisible();
  await menu('undo'); await expect.poll(() => pixel(300, 300)).toEqual([255, 0, 0, 255]);
  await menu('redo'); await expect.poll(async () => { const p = await pixel(300, 300); return p[0] === p[1] && p[1] === p[2]; }).toBe(true);
});

test('选区渐变、向下合并、混合模式合并保持画面、文字栅格化', async () => {
  await page.locator('#color').fill('#ff0000'); await menu('fillSelection');
  await page.locator('[data-tool=select]').click(); await drag(200, 200, 600, 400);
  await page.locator('[data-tool=gradient]').click(); await page.locator('#color').fill('#0000ff'); await page.locator('#gradient-color').fill('#ffffff');
  await drag(200, 300, 600, 300);
  await expect(page.locator('#layer-count')).toHaveText('2 个图层');
  expect(await pixel(150, 300)).toEqual([255, 0, 0, 255]);
  const center = await pixel(400, 300); expect(center[0]).toBeGreaterThan(120); expect(center[0]).toBeLessThan(140); expect(center[2]).toBe(255);
  await edit('layer-opacity', 50); const before = await displayImage(); await menu('mergeDown');
  await expect(page.locator('#layer-count')).toHaveText('1 个图层'); expect(await displayImage()).toBe(before);
  await menu('undo'); await expect(page.locator('#layer-count')).toHaveText('2 个图层');
  await page.locator('#blend').selectOption('multiply'); await menu('mergeDown'); await expect(page.locator('#toast')).toContainText('正常混合');
  const blendBefore = await displayImage(); await menu('mergeVisible');
  await expect(page.locator('#layer-count')).toHaveText('1 个图层'); expect(await displayImage()).toBe(blendBefore);
  await page.locator('[data-tool=text]').click(); const p = await at(700, 450); await page.mouse.click(p.x, p.y);
  await edit('text-content','中文栅格化');
  await page.locator('#canvas').evaluate(c => { window.testTextPixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; }); await menu('rasterize');
  await expect(page.locator('#layer-type')).toHaveText('像素图层');
  const diff = await page.locator('#canvas').evaluate(c => { const a = window.testTextPixels, b = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let count = 0, max = 0, x1 = c.width, y1 = c.height, x2 = 0, y2 = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { count++; max = Math.max(max, Math.abs(a[i] - b[i])); const p = Math.floor(i / 4); x1 = Math.min(x1, p % c.width); y1 = Math.min(y1, Math.floor(p / c.width)); x2 = Math.max(x2, p % c.width); y2 = Math.max(y2, Math.floor(p / c.width)); } return { count, max, x1, y1, x2, y2 }; });
  expect(diff).toEqual({ count: 0, max: 0, x1: 1280, y1: 800, x2: 0, y2: 0 });
  await menu('undo'); await expect(page.locator('#layer-type')).toHaveText('文字图层');
});

test('Windows 剪贴板复制选区并粘贴为图层，最小窗口工具可见', async () => {
  await page.locator('#color').fill('#ff0000'); await menu('fillSelection');
  await page.locator('[data-tool=select]').click(); await drag(200, 200, 400, 300);
  const size = (await page.locator('#selection-size').textContent()).split(' × ').map(Number);
  await app.evaluate(async ({ clipboard, ClipboardItem }) => { const items = await clipboard.read(); globalThis.testClipboardBackup = await Promise.all(items.filter(i=>i.types.length).map(async i => new ClipboardItem(Object.fromEntries(await Promise.all(i.types.map(async t => [t, await i.getType(t)])))))); });
  try {
    await menu('copyMerged'); await expect(page.locator('#toast')).toContainText('剪贴板');
    expect(await app.evaluate(async ({ clipboard, nativeImage }) => { const items = await clipboard.read(), blob = await items[0].getType('image/png'); const p = nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer())).getSize(); return [p.width, p.height]; })).toEqual(size);
    await menu('pasteImage'); await expect(page.locator('#layer-count')).toHaveText('2 个图层');
    expect(await pixel(640, 400)).toEqual([255, 0, 0, 255]);
  } finally { await app.evaluate(async ({ clipboard }) => { if (globalThis.testClipboardBackup.length) await clipboard.write(globalThis.testClipboardBackup); else clipboard.clear(); delete globalThis.testClipboardBackup; }); }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 720));
  const box = await page.locator('[data-tool=hand]').boundingBox();
  expect(box.y + box.height).toBeLessThan(await page.evaluate(() => innerHeight));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('editing-small.png') });
});


test('蒙版黑白绘画、撤销、浓度、链接移动、保存重开和应用', async () => {
  await page.locator('#color').fill('#ff0000'); await page.locator('[data-tool=rect]').click(); await drag(100,100,400,400);
  await menu('addMask'); await expect(page.locator('#edit-target-label')).toContainText('蒙版');
  await page.locator('[data-tool=brush]').click(); await edit('brush-size', 50); await drag(200,250,300,250);
  expect((await pixel(250,250))[3]).toBe(0); expect((await pixel(250,200))[3]).toBe(255);
  await menu('undo'); expect((await pixel(250,250))[3]).toBe(255); await menu('redo'); expect((await pixel(250,250))[3]).toBe(0);
  await page.locator('.layer-row.active .mask-thumb').click(); await page.locator('[data-tool=eraser]').click(); await drag(200,250,300,250);
  expect((await pixel(250,250))[3]).toBe(255);
  await menu('invertMask'); expect((await pixel(250,200))[3]).toBe(0);
  await page.locator('#mask-density').evaluate(el => { el.value = '50'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  expect((await pixel(250,200))[3]).toBeCloseTo(128,-1);
  await menu('toggleMask'); expect((await pixel(250,200))[3]).toBe(255); await menu('toggleMask');
  // Linked layer movement translates the mask; unlinking then moves only the mask.
  await page.locator('.layer-row.active [data-target=image]').click(); await edit('layer-x', 20);
  const file = test.info().outputPath('蒙版.ccomp');
  await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled:false, filePath:target }); },file);
  await menu('save'); const first = JSON.parse(await fs.readFile(file,'utf8')); expect(first.layers[1].mask.x).toBe(-80);
  await page.locator('.layer-row.active .mask-thumb').click(); await menu('linkMask'); await edit('layer-x', 40);
  await menu('save'); const second = JSON.parse(await fs.readFile(file,'utf8')); expect(second.layers[1].x).toBe(20); expect(second.layers[1].mask.x).toBe(40); expect(second.layers[1].mask.linked).toBe(false);
  const before = await displayImage();
  await app.evaluate(({ dialog }, target) => { dialog.showOpenDialog = async () => ({ canceled:false, filePaths:[target] }); },file);
  await menu('open'); expect(await displayImage()).toBe(before);
  await menu('applyMask'); await expect(page.locator('.layer-row.active .mask-thumb')).toHaveCount(0);
  expect(await displayImage()).toBe(before); await menu('undo'); await expect(page.locator('.layer-row.active .mask-thumb')).toHaveCount(1);
});

test('同级多选分组、剪贴蒙版、组显示、组透明度、移动与复制独立蒙版', async () => {
  await page.locator('#color').fill('#ff0000'); await page.locator('[data-tool=rect]').click(); await drag(100,100,400,400);
  await page.locator('#color').fill('#0000ff'); await drag(200,200,500,500); await menu('clipping');
  expect(await pixel(250,250)).toEqual([0,0,255,255]); expect((await pixel(450,450))[3]).toBe(0);
  await page.locator('.layer-row').nth(1).click(); await page.locator('.layer-row').nth(0).click({ modifiers:['Control'] }); await menu('group');
  await expect(page.locator('#layer-count')).toHaveText('4 个图层'); expect(await pixel(250,250)).toEqual([0,0,255,255]);
  await page.locator('.layer-row.active button[aria-label="隐藏图层"]').click(); expect((await pixel(250,250))[3]).toBe(0);
  await page.locator('.layer-row.active button[aria-label="显示图层"]').click(); await edit('layer-opacity', 50); expect((await pixel(250,250))[3]).toBeCloseTo(128,-1);
  await edit('layer-opacity', 100); if(await page.locator('#layer-type').textContent()==='形状属性')await menu('rasterize');await page.locator('[data-tool=move]').click(); await drag(250,250,270,280);
  expect((await pixel(110,110))[3]).toBe(0); expect(await pixel(270,280)).toEqual([0,0,255,255]);
  await menu('addMask'); await menu('duplicate'); await expect(page.locator('#layer-count')).toHaveText('7 个图层');
  await menu('invertMask'); await expect(page.locator('.mask-thumb')).toHaveCount(2); // Source group's mask stays white.
  expect(await pixel(270,280)).toEqual([0,0,255,255]);
  await menu('deleteLayer'); await expect(page.locator('#layer-count')).toHaveText('4 个图层'); await menu('undo'); await expect(page.locator('#layer-count')).toHaveText('7 个图层');
});

test('真实 PSD 打开、分组蒙版剪贴渲染、导出重开与独立解码文件', async () => {
  const { psdFixture } = require('./psd-fixture.cjs'); const file = test.info().outputPath('中文分层.psd'), output = test.info().outputPath('导出.psd');
  await fs.writeFile(file, psdFixture());
  await app.evaluate(({ dialog }, target) => { dialog.showOpenDialog = async () => ({ canceled:false, filePaths:[target] }); },file);
  await menu('open'); await expect(page.locator('#layer-count')).toHaveText('4 个图层');
  expect(await pixel(2,2)).toEqual([240,210,20,255]); expect(await pixel(5,2)).toEqual([25,50,90,255]);
  await expect(page.locator('#dirty-dot')).toBeVisible(); // PSD opens as a new .ccomp document.
  await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled:false, filePath:target }); },output);
  await menu('export'); await page.locator('#export-format').selectOption('psd'); await page.locator('#export-form button[type=submit]').click(); await expect(page.locator('#export-dialog')).not.toBeVisible();
  const { readPsdDocument } = require('../psd.cjs'), parsed = readPsdDocument(await fs.readFile(output)); expect(parsed.project.layers.map(l => l.name)).toEqual(['背景','蒙版图层','剪贴颜色','中文组']);
  await app.evaluate(({ dialog }, target) => { dialog.showOpenDialog = async () => ({ canceled:false, filePaths:[target] }); },output);
  await menu('open'); await expect(page.locator('#tab-name')).toHaveText('导出');
  expect(await pixel(2,2)).toEqual([240,210,20,255]); expect(await pixel(5,2)).toEqual([25,50,90,255]);
});

test('不支持的 PSD 明示预览确认，取消保留原项目', async () => {
  const { psdFixture, bitmap } = require('./psd-fixture.cjs'); const file = test.info().outputPath('复杂.psd');
  await fs.writeFile(file, psdFixture({ children:[{name:'颜色减淡',blendMode:'color dodge',imageData:bitmap(8,6,[200,200,200,255])}] }));
  await app.evaluate(({ dialog }, target) => { dialog.showOpenDialog = async () => ({ canceled:false, filePaths:[target] }); },file);
  await menu('open'); await expect(page.locator('#psd-warning-dialog')).toBeVisible(); await expect(page.locator('#psd-warning-text')).toContainText('混合模式');
  await page.locator('[data-psd-choice=cancel]').click(); await expect(page.locator('#tab-name')).toHaveText('未命名');
  await menu('open'); await page.locator('[data-psd-choice=flatten]').click(); await expect(page.locator('#tab-name')).toHaveText('复杂'); expect(await pixel(0,0)).toEqual([25,50,90,255]);
});


test('默认分组选择当前图层，组与蒙版随画布裁剪和重采样保存', async () => {
  await page.locator('#color').fill('#00ff00'); await page.locator('[data-tool=rect]').click(); await drag(100,100,400,400); await menu('addMask');
  await menu('group'); await expect(page.locator('#layer-count')).toHaveText('3 个图层');
  await menu('canvasSize'); await page.locator('#size-width').fill('1480'); await page.locator('#size-height').fill('1000'); await page.locator('#size-form button[type=submit]').click();if(!(await page.locator('#size-error').isVisible()))await expect(page.locator('#size-dialog')).toBeHidden();
  expect(await pixel(250,250)).toEqual([0,255,0,255]); expect((await pixel(150,150))[3]).toBe(0);
  await menu('imageSize'); await page.locator('#size-width').fill('740'); await page.locator('#size-form button[type=submit]').click();if(!(await page.locator('#size-error').isVisible()))await expect(page.locator('#size-dialog')).toBeHidden();
  expect(await pixel(125,125)).toEqual([0,255,0,255]);
  const file = test.info().outputPath('尺寸与层级.ccomp'); await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled:false,filePath:target }); },file); await menu('save');
  const saved = JSON.parse(await fs.readFile(file,'utf8')), group = saved.layers.find(l => l.type === 'group'), child = saved.layers.find(l => l.parentId === group.id);
  expect(child.name).toBe('矩形'); expect([group.x,group.y,group.scale,group.rotation]).toEqual([0,0,1,0]); expect([child.mask.x,child.mask.y]).toEqual([50,50]);
  await page.locator('.layer-row.active .disclosure').click(); await expect(page.locator('.layer-row')).toHaveCount(2); await page.locator('.layer-row.active .disclosure').click(); await expect(page.locator('.layer-row')).toHaveCount(3);
  const before = await displayImage(); await app.evaluate(({ dialog }, target) => { dialog.showOpenDialog = async () => ({ canceled:false,filePaths:[target] }); },file);
  await menu('open'); await expect(page.locator('#confirm-dialog')).not.toBeVisible(); await expect(page.locator('#tab-name')).toHaveText('尺寸与层级');
  expect(await displayImage()).toBe(before);
});

test('PSD 局部蒙版可以扩展到整个画布并通过白色画笔恢复原隐藏区域', async () => {
  const { psdFixture,bitmap }=require('./psd-fixture.cjs'); const file=test.info().outputPath('局部蒙版.psd');
  await fs.writeFile(file, psdFixture({ width:640,height:480,imageData:bitmap(640,480,[10,20,30,255]),children:[{name:'内容',imageData:bitmap(640,480,[200,30,40,255]),mask:{left:0,top:0,defaultColor:0,imageData:bitmap(10,10,[255,255,255,255])}}] }));
  await app.evaluate(({dialog},target)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[target]});},file); await menu('open'); expect((await pixel(200,200))[3]).toBe(0);
  await page.locator('.layer-row.active .mask-thumb').click(); await page.locator('#color').fill('#ffffff'); await page.locator('[data-tool=brush]').click(); await edit('brush-size',50); await drag(190,200,210,200);
  expect(await pixel(200,200)).toEqual([200,30,40,255]); await menu('undo'); expect((await pixel(200,200))[3]).toBe(0);
});


test('移动自动选择按可见像素命中，变换控件开关与菜单键盘操作', async () => {
  await page.locator('#color').fill('#ff0000'); await page.locator('[data-tool=rect]').click(); await drag(100,100,300,300);
  await page.locator('#color').fill('#0000ff'); await drag(500,100,700,300); if(await page.locator('#layer-type').textContent()==='形状属性')await menu('rasterize');await page.locator('[data-tool=move]').click(); await page.locator('#auto-select').check();
  await drag(150,150,170,180); expect((await pixel(110,110))[3]).toBe(0); expect(await pixel(170,180)).toEqual([255,0,0,255]);
  await page.locator('#show-transform').uncheck(); expect(await page.locator('#overlay').evaluate(c => c.getContext('2d').getImageData(0,0,c.width,c.height).data.some(v=>v!==0))).toBe(false);
  await page.getByRole('button',{name:'编辑(E)',exact:true}).click(); await expect(page.getByRole('menuitem',{name:'后退一步 Ctrl+Z',exact:true})).toBeFocused(); await page.keyboard.press('Enter');
  await expect.poll(async()=> (await pixel(110,110))[3]).toBe(255); await expect(page.locator('.app-menu')).toHaveCount(0);
});

async function displayImage(){await page.waitForFunction(()=>document.querySelector('#canvas').dataset.quality==='native');return page.locator('#canvas').evaluate(c=>c.toDataURL());}
