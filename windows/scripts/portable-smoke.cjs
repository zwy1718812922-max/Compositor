// NSIS does not forward the inspector output required by _electron.launch.
// Connect to the real extracted app through a local CDP port instead.
const { chromium, expect } = require('@playwright/test');
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve));
  const version = require('../package.json').version;
  const profile = path.join(__dirname, '../test-results/portable-profile-' + Date.now());
  const child = spawn(path.join(__dirname, '../dist/Compositor-ZH-' + version + '-x64-Portable.exe'), ['--remote-debugging-port=' + port, '--user-data-dir=' + profile], { windowsHide: true, stdio: 'ignore' });
  let browser;
  try {
    const start = Date.now();
    while (true) {
      try { const response = await fetch('http://127.0.0.1:' + port + '/json/version'); if (response.ok) break; } catch {}
      if (Date.now() - start > 45000) throw new Error('免安装程序未在 45 秒内就绪');
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
    const page = browser.contexts()[0].pages()[0];
    await expect(page.locator('#layer-count')).toHaveText('1 个图层');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await page.locator('[data-command=new]').click();
    await expect(page.locator('.preset-card')).toHaveCount(14);
    await expect(page.locator('#new-size-preview')).toHaveText('2550 × 3300 像素 · 300 ppi');
    await page.locator('#new-dialog [data-dismiss]').click();
    await page.locator('[data-tool=brush]').click();
    const box = await page.locator('#canvas').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    assert.equal(await page.locator('#canvas').evaluate(c => c.getContext('2d').getImageData(640, 400, 1, 1).data[3]), 255);
    await page.locator('[data-command=adjust]').click();
    await page.locator('#adjust-invert').evaluate(input => { input.value = '100'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.locator('#adjust-form button[type=submit]').click();
    const inverted = await page.locator('#canvas').evaluate(c => Array.from(c.getContext('2d').getImageData(640, 400, 1, 1).data));
    // Canvas filter color conversion can round differently across GPU backends.
    [133, 93, 0].forEach((channel, i) => assert.ok(Math.abs(inverted[i] - channel) <= 1)); assert.equal(inverted[3], 255);
    await page.getByRole('button', { name: '图像(I)', exact: true }).click(); await page.getByRole('menuitem', { name: '图像大小…', exact: true }).click(); await page.locator('#size-width').fill('640');
    await page.locator('#size-form button[type=submit]').click();
    assert.deepEqual(await page.locator('#canvas').evaluate(c => [c.width, c.height]), [640, 400]);
    await page.getByRole('button', { name: '添加图层蒙版', exact: true }).click(); await expect(page.locator('.mask-thumb')).toHaveCount(1);
    const maskedBox = await page.locator('#canvas').boundingBox(); await page.mouse.click(maskedBox.x + maskedBox.width / 2, maskedBox.y + maskedBox.height / 2);
    assert.equal(await page.locator('#canvas').evaluate(c => c.getContext('2d').getImageData(320, 200, 1, 1).data[3]), 0);
    console.log('免安装 EXE：解压、启动、中文菜单与新建窗口、打印预设、绘画、调整、重采样和蒙版绘画通过。');
    await page.evaluate(() => { window.desktop.setDirty(false); window.desktop.close(); }).catch(() => {});
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (child.exitCode === null) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
