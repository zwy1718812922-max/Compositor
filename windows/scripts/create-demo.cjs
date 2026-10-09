// Reproducible sample project and screenshot; no external images or network.
const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { saveProject } = require('../project.cjs');
(async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const profile = '--user-data-dir=' + path.join(__dirname, '../validation/demo-profile');
  const app = await electron.launch(process.env.COMPOSITOR_EXECUTABLE
    ? { executablePath: process.env.COMPOSITOR_EXECUTABLE, args: [profile], env }
    : { args: [path.join(__dirname, '..'), profile], env });
  try {
    const page = await app.firstWindow(); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1697, 927)); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForSelector('.layer-row');
    const data = await page.evaluate(async () => {
      const { rasterLayer, textLayer, groupLayer, canvas, serialize } = await import('./editor.js');
      const bg = rasterLayer('深蓝背景', 1280, 800);
      bg.locked = true;
      const ctx = bg.canvas.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 800, 1280, 0);
      gradient.addColorStop(0, '#101923'); gradient.addColorStop(1, '#21374e');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1280, 800);
      const orb = rasterLayer('光与色', 1280, 800);
      const g = orb.canvas.getContext('2d');
      const glow = g.createLinearGradient(760, 100, 1190, 570);
      glow.addColorStop(0, '#c7f4d3'); glow.addColorStop(.45, '#72ccb9'); glow.addColorStop(1, '#336d9c');
      g.fillStyle = glow; g.beginPath(); g.arc(980, 310, 232, 0, Math.PI * 2); g.fill();
      const rings = rasterLayer('轨迹', 1280, 800);
      const r = rings.canvas.getContext('2d'); r.strokeStyle = '#bfe8de'; r.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        r.globalAlpha = .22 - i * .018; r.beginPath();
        r.ellipse(997, 316, 350 + i * 15, 116 + i * 10, -.62, 0, Math.PI * 2); r.stroke();
      }
      const line = rasterLayer('分隔线', 1280, 800);
      const l = line.canvas.getContext('2d'); l.fillStyle = '#618083'; l.fillRect(85, 681, 1110, 1);
      const makeText = (name, content, x, y, size, color, bold = false) => ({ ...textLayer(content, x, y, color), name, fontSize: size, bold });
      const label = makeText('版本标记', 'C O M P O S I T O R   /   W I N D O W S  1 1', 85, 74, 17, '#a6c5bf');
      const title = makeText('主标题', '自由创作', 78, 345, 132, '#eef6ef', true);
      const subtitle = makeText('副标题', '把灵感，一层一层变成作品。', 88, 522, 29, '#b0c7c8');
      const foot = makeText('页脚', '中文桌面版    ·    图层 / 绘画 / 文字', 85, 714, 17, '#a6c5bf');
      const group = groupLayer('文字与排版'); group.collapsed = true;
      [label, title, subtitle, foot].forEach(l => l.parentId = group.id);
      const mask = canvas(1280, 800), m = mask.getContext('2d'); m.fillStyle = '#000'; m.fillRect(0, 0, 1280, 800); m.fillStyle = '#fff'; m.beginPath(); m.arc(980, 310, 238, 0, Math.PI * 2); m.fill();
      orb.mask = { canvas: mask, x: 0, y: 0, scale: 1, rotation: 0, defaultColor: 0, density: 1, feather: 0, enabled: true, linked: true };
      const p = { width: 1280, height: 800, layers: [bg, orb, rings, line, label, title, subtitle, foot, group], activeId: orb.id };
      return serialize(p);
    });
    const directory = path.join(__dirname, '../examples'); await fs.mkdir(directory, { recursive: true });
    const file = path.join(directory, '中文示例.ccomp'); await saveProject(file, data);
    await app.evaluate(({ dialog, BrowserWindow }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      BrowserWindow.getAllWindows()[0].webContents.send('command', 'open');
    }, file);
    await page.waitForFunction(() => document.querySelector('#layer-count').textContent === '9 个图层');
    await page.locator('.brush-preset[data-hardness="0"]').click(); await page.locator('[data-tool=move]').click(); await page.locator('#show-transform').uncheck();
    await page.evaluate(() => { document.querySelector('#toast').hidden = true; document.querySelector('#status').textContent = '中文示例 · 9 个可编辑图层 · 图层组与蒙版'; });
    await page.screenshot({ path: path.join(__dirname, '../preview.png') });
    await page.locator('.layer-row').filter({ hasText: '光与色' }).click();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('command', 'adjust'));
    await page.locator('#adjust-saturation').evaluate(input => { input.value = '75'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(__dirname, '../editing-preview.png') });
    await page.locator('#adjust-dialog [data-dismiss]').click();
    await page.locator('.layer-row').filter({ hasText: '光与色' }).locator('.mask-thumb').click();
    await page.screenshot({ path: path.join(__dirname, '../mask-preview.png') });
    await page.locator('.layer-row.active [data-target=image]').click(); await page.getByRole('button', { name: '色板面板', exact: true }).click();
    await page.getByRole('button', { name: '图层(L)', exact: true }).click(); await page.screenshot({ path: path.join(__dirname, '../menu-preview.png') }); await page.keyboard.press('Escape');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1024, 720));
    await page.getByRole('button', { name: '适合窗口', exact: true }).click(); await page.screenshot({ path: path.join(__dirname, '../preview-small.png') });
  } finally { await app.evaluate(({ app }) => app.exit(0)); await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
