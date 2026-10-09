const $ = id => document.getElementById(id);
const menus = {
  '文件(F)': [['新建…', 'new', 'Ctrl+N'], ['打开项目或 PSD…', 'open', 'Ctrl+O'], ['导入图片…', 'import', 'Ctrl+I'], null, ['保存项目', 'save', 'Ctrl+S'], ['项目另存为…', 'saveAs', 'Ctrl+Shift+S'], ['导出 PNG / JPEG / PSD…', 'export', 'Ctrl+Shift+E'], null, ['退出', 'close']],
  '编辑(E)': [['撤销', 'undo', 'Ctrl+Z'], ['重做', 'redo', 'Ctrl+Shift+Z'], null, ['复制可见画面', 'copyMerged', 'Ctrl+Shift+C'], ['粘贴图片为图层', 'pasteImage', 'Ctrl+Shift+V'], ['前景色填充', 'fillSelection', 'Shift+F5'], ['清除像素', 'clearSelection']],
  '图像(I)': [['图像大小…', 'imageSize'], ['画布大小…', 'canvasSize'], ['裁剪到选区', 'cropSelection'], null, ['图像调整…', 'adjust']],
  '图层(L)': [['新建图层', 'addLayer', 'Ctrl+Shift+N'], ['复制图层', 'duplicate', 'Ctrl+J'], ['删除图层', 'deleteLayer'], ['向上移动', 'raise'], ['向下移动', 'lower'], null, ['创建图层组', 'group', 'Ctrl+G'], ['取消图层分组', 'ungroup', 'Ctrl+Shift+G'], ['创建 / 释放剪贴蒙版', 'clipping', 'Ctrl+Alt+G'], null, ['添加显示蒙版', 'addMask'], ['添加隐藏蒙版', 'hideMask'], ['启用 / 停用蒙版', 'toggleMask'], ['链接 / 取消链接蒙版', 'linkMask'], ['蒙版反相', 'invertMask'], ['应用蒙版', 'applyMask'], ['删除蒙版', 'deleteMask'], null, ['栅格化文字', 'rasterize'], ['向下合并', 'mergeDown', 'Ctrl+E'], ['合并可见图层', 'mergeVisible', 'Ctrl+Shift+M']],
  '文字(Y)': [['新建文字（T 工具）', 'textTool'], ['栅格化文字', 'rasterize']],
  '选择(S)': [['全选', 'selectAll', 'Ctrl+A'], ['取消选区', 'deselect', 'Ctrl+D'], ['裁剪到选区', 'cropSelection']],
  '滤镜(T)': [['图像调整与模糊…', 'adjust']],
  '视图(V)': [['适合窗口', 'fit', 'Ctrl+0'], ['实际像素', 'actual', 'Ctrl+1']],
  '窗口(W)': [['色板', 'panelSwatches'], ['属性', 'panelProperties'], ['蒙版', 'panelMask']],
  '帮助(H)': [['使用说明与快捷键', 'help']]
};
export function showPanel(panel) {
  for (const name of ['swatches', 'properties', 'mask']) $(name + '-panel').hidden = panel !== name;
  document.querySelectorAll('[data-panel]').forEach(b => b.classList.toggle('active', b.dataset.panel === panel));
}
export function colorSwatches() { $('foreground-swatch').style.background = $('tool-color').style.background = $('color').value; $('background-swatch').style.background = $('gradient-color').value; }
export function brushPreview(canvas, hardness) {
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.filter = `blur(${(100 - hardness) / 100 * 4}px)`; ctx.strokeStyle = '#fff'; ctx.lineWidth = 13; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(17, 22); ctx.bezierCurveTo(75, 8, 128, 38, 218, 21); ctx.stroke(); ctx.restore();
}
export function setupShell(command, setTool, refresh) {
  let popup;
  function closeMenu() { popup?.remove(); popup = null; document.querySelectorAll('#menu-bar>button').forEach(b => b.setAttribute('aria-expanded', 'false')); }
  for (const [label, items] of Object.entries(menus)) {
    const button = document.createElement('button'); button.textContent = label; button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'false');
    button.onclick = () => {
      const wasOpen = button.getAttribute('aria-expanded') === 'true'; closeMenu(); if (wasOpen) return;
      button.setAttribute('aria-expanded', 'true'); popup = document.createElement('div'); popup.className = 'app-menu'; popup.setAttribute('role', 'menu');
      for (const item of items) {
        if (!item) { popup.append(document.createElement('hr')); continue; }
        const row = document.createElement('button'); row.setAttribute('role', 'menuitem'); const title = document.createElement('span'); title.textContent = item[0]; row.append(title);
        if (item[2]) { const key = document.createElement('kbd'); key.textContent = item[2]; row.append(key); }
        row.onclick = () => { closeMenu(); command(item[1]); }; popup.append(row);
      }
      const rect = button.getBoundingClientRect(); popup.style.left = rect.left + 'px'; popup.style.top = rect.bottom + 'px'; document.body.append(popup);
      const height = popup.getBoundingClientRect().height; if (height > innerHeight - rect.bottom - 8) { popup.style.maxHeight = innerHeight - rect.bottom - 8 + 'px'; popup.style.overflowY = 'auto'; }
      popup.querySelector('button')?.focus();
      popup.onkeydown = e => {
        const rows = [...popup.querySelectorAll('button')], index = rows.indexOf(document.activeElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) { e.preventDefault(); rows[e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]?.focus(); }
        if (e.key === 'Escape' || e.key === 'Tab') { closeMenu(); button.focus(); }
      };
    }; $('menu-bar').append(button);
  }
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#menu-bar,.app-menu')) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  document.querySelectorAll('[data-window]').forEach(b => b.onclick = () => window.desktop.windowAction(b.dataset.window));
  document.querySelectorAll('[data-panel]').forEach(b => b.onclick = () => showPanel(b.dataset.panel));
  const families = { RGB: ['#000000','#ffffff','#c29a72','#d89784','#45413d','#9ba1a3','#decda0','#f2e6cc','#203642','#178291','#246de2','#bc3750'], 中性色: ['#222222','#444444','#666666','#888888','#aaaaaa','#cccccc','#ffffff'], 浅色: ['#e4dcec','#e1e5ee','#d0dede','#e9d5c2','#f0e5c9','#f1e1e4','#a9c4ff'] };
  function swatch(color, family) { const b = document.createElement('button'); b.className = 'swatch'; b.style.background = color; b.title = family + ' ' + color; b.setAttribute('aria-label', b.title); b.onclick = () => { $('color').value = color; colorSwatches(); }; return b; }
  families.RGB.forEach(c => $('swatch-grid').append(swatch(c, 'RGB')));
  document.querySelectorAll('[data-family]').forEach(el => families[el.dataset.family].forEach(c => el.append(swatch(c, el.dataset.family))));
  $('swatch-search').oninput = () => document.querySelectorAll('.swatch').forEach(b => b.hidden = !b.title.toLowerCase().includes($('swatch-search').value.toLowerCase()));
  $('color').addEventListener('input', colorSwatches); $('gradient-color').addEventListener('input', colorSwatches);
  $('tool-color').onclick = () => $('color').showPicker();
  $('swap-colors').onclick = () => { const old = $('color').value; $('color').value = $('gradient-color').value; $('gradient-color').value = old; colorSwatches(); };
  document.querySelectorAll('.brush-preset').forEach(b => {
    brushPreview(b.querySelector('canvas'), Number(b.dataset.hardness));
    b.onclick = () => { $('brush-hardness').value = b.dataset.hardness; document.querySelectorAll('.brush-preset').forEach(p => p.classList.toggle('active', p === b)); setTool('brush'); };
  });
  $('brush-search').oninput = () => document.querySelectorAll('.brush-preset').forEach(b => b.hidden = !b.textContent.includes($('brush-search').value));
  $('preset-size').oninput = () => { $('brush-size').value = $('preset-size').value; $('preset-size-value').textContent = $('preset-size').value + ' px'; };
  $('brush-size').addEventListener('input', () => { $('preset-size').value = $('brush-size').value; $('preset-size-value').textContent = $('brush-size').value + ' px'; });
  $('layer-search').oninput = () => refresh(); colorSwatches();
}
export function drawRulers(project, zoom, pan) {
  const dpr = devicePixelRatio || 1;
  for (const axis of ['x', 'y']) {
    const c = $('ruler-' + axis), rect = c.getBoundingClientRect(), length = axis === 'x' ? rect.width : rect.height;
    const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#b8b8b8'; ctx.strokeStyle = '#777'; ctx.font = '9px Segoe UI'; ctx.lineWidth = 1;
    const target = 70 / zoom, exponent = Math.pow(10, Math.floor(Math.log10(target))), step = [1,2,5,10].map(n => n * exponent).find(n => n >= target), origin = pan[axis];
    for (let value = Math.floor(-origin / zoom / step) * step; origin + value * zoom < length; value += step / 5) {
      const pos = Math.round(origin + value * zoom) + .5; if (pos < 0) continue;
      const major = Math.abs(value / step - Math.round(value / step)) < .001;
      ctx.beginPath(); if (axis === 'x') { ctx.moveTo(pos, major ? 11 : 15); ctx.lineTo(pos, 20); if (major) ctx.fillText(String(Math.round(value)), pos + 3, 9); }
      else { ctx.moveTo(major ? 11 : 15, pos); ctx.lineTo(20, pos); if (major) { ctx.save(); ctx.translate(9, pos + 3); ctx.rotate(-Math.PI / 2); ctx.fillText(String(Math.round(value)), 0, 0); ctx.restore(); } } ctx.stroke();
    }
  }
  $('tab-zoom').textContent = ' @ ' + Math.round(zoom * 100) + '% (RGB/8)';
}
