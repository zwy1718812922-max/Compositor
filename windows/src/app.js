import { hitLayer, invalidatePixels, rasterLayer, textLayer, canvas, bounds, layerTransform, localPoint, renderInto, composite, serialize, deserialize, decodeImage, History, MAX_PIXELS } from './editor.js';
import { preparePsd } from './psd-export.js';
import { advancedCommand, pixelCount, grayColor, moveLayer, transformLayer, expandMask } from './advanced.js';
import { childrenOf, descendants, ancestors, panelLayers, canonicalize, moveToGroup, isLocked, isVisible } from './layer-tree.js';
import { setupShell, showPanel, colorSwatches, drawRulers } from './ui-shell.js';
import { setupNewDocument } from './new-document.js';
import { rectangle, clipSelection, checkSize, resizeCanvasProject, cropProject, resizeImageProject, rasterize, adjustRaster } from './operations.js';
const $ = id => document.getElementById(id);
const api = window.desktop;
let project, name = '未命名', dirty = false, tool = 'move', busy = false, space = false, gesture = null;
let zoom = 1, pan = { x: 0, y: 0 }, toastTimer;
let selection = null, cropRect = null, sizeMode = 'image', adjustment = null, adjustmentFrame = null;
const history = new History();
let editTarget = 'image'; const selectedIds = new Set();
let savedColors = null;
const editSurface = () => editTarget === 'mask' && active().mask ? active().mask : active();
function setTarget(target) {
  if (target === 'mask' && active().mask) {
    if (!savedColors) { savedColors = [$('color').value, $('gradient-color').value]; $('color').value = '#000000'; $('gradient-color').value = '#ffffff'; }
    showPanel('mask');
  } else {
    target = 'image'; if (savedColors) { [$('color').value, $('gradient-color').value] = savedColors; savedColors = null; }
    if (active().type === 'text') showPanel('properties');
  }
  editTarget = target; colorSwatches();
}
function selectLayer(layer, target = 'image', multiple = false) {
  if (!multiple) selectedIds.clear();
  if (multiple && selectedIds.has(layer.id) && selectedIds.size > 1) selectedIds.delete(layer.id); else selectedIds.add(layer.id);
  project.activeId = selectedIds.has(layer.id) ? layer.id : [...selectedIds].at(-1); setTarget(target); refresh(false); drawOverlay();
}
const viewport = $('viewport'), display = $('canvas'), overlay = $('overlay');
const toolNames = { move: '移动工具', select: '矩形选区工具', crop: '裁剪工具', gradient: '渐变工具', brush: '画笔工具', eraser: '橡皮擦工具', text: '文字工具', rect: '矩形工具', ellipse: '椭圆工具', eyedropper: '吸管工具', hand: '抓手工具' };
const active = () => project.layers.find(layer => layer.id === project.activeId);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
function setBusy(value) {
  busy = value; document.body.setAttribute('aria-busy', String(value));
  document.querySelectorAll('.topbar,.optionsbar,main').forEach(element => { element.inert = value; });
}
function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 5500);
  $('status').textContent = message;
}
function setDirty(value) { dirty = value; api.setDirty(value); updateTitle(); }
function updateTitle() {
  $('document-name').textContent = name; $('tab-name').textContent = name;
  $('dirty-dot').hidden = !dirty;
  document.title = (dirty ? '● ' : '') + name + ' — Compositor 中文版';
}
function snapshot() {
  for (const layer of project.layers) for (const item of [layer, layer.mask]) if (item?.canvas && !item.data) item.data = item.canvas.toDataURL('image/png');
  return serialize(project);
}
function checkpoint() { history.push(snapshot()); }
function changed(message) {
  if (!selectedIds.has(project.activeId)) { selectedIds.clear(); selectedIds.add(project.activeId); }
  setDirty(true); render(); refresh(); if (message) $('status').textContent = message;
}
function capacity(width = 0, height = 0, count = 1) {
  const pixels = project.layers.reduce((sum, l) => sum + pixelCount(l), 0);
  if (project.layers.length + count > 100 || pixels + width * height > MAX_PIXELS) throw new Error('已达到图层内存限制（100 层 / 6400 万像素），请删除一些图层。');
}
function newProject(width, height, background, title, resolution = 72) {
  const layer = rasterLayer('背景', width, height, background);
  project = { width, height, resolution, colorSpace: 'sRGB', layers: [layer], activeId: layer.id };
  selection = cropRect = null; selectedIds.clear(); selectedIds.add(layer.id); setTarget('image');
  name = title || '未命名'; history.reset(); api.commitDocument('new');
  resizeCanvas(); setDirty(false); fit(); render(); refresh();
}
function resizeCanvas() {
  for (const c of [display, overlay]) { c.width = project.width; c.height = project.height; }
  $('canvas-wrap').style.width = project.width + 'px'; $('canvas-wrap').style.height = project.height + 'px';
  $('dimensions').textContent = project.width + ' × ' + project.height + ' px · ' + Math.round(project.resolution) + ' ppi';
  $('tab-size').textContent = project.width + ' × ' + project.height;
}
function applyView() {
  $('canvas-wrap').style.transform = 'translate(' + pan.x + 'px,' + pan.y + 'px) scale(' + zoom + ')';
  $('zoom-value').textContent = Math.round(zoom * 100) + '%';
  drawRulers(project, zoom, pan); drawOverlay();
}
function fit() {
  zoom = Math.max(.05, Math.min((viewport.clientWidth - 96) / project.width, (viewport.clientHeight - 112) / project.height, 1));
  pan = { x: (viewport.clientWidth - project.width * zoom) / 2, y: (viewport.clientHeight - project.height * zoom) / 2 };
  applyView();
}
function setZoom(value, center = { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }) {
  const next = clamp(value, .05, 8), factor = next / zoom;
  pan = { x: center.x - (center.x - pan.x) * factor, y: center.y - (center.y - pan.y) * factor };
  zoom = next; applyView();
}
function render() { renderInto(display, project); drawOverlay(); }
function drawOverlay() {
  const ctx = overlay.getContext('2d'); ctx.clearRect(0, 0, overlay.width, overlay.height);
  const layer = active();
  if ($('show-transform').checked && layer && isVisible(project, layer) && layer.type !== 'group' && ['move', 'text'].includes(tool)) {
    const target = editSurface(), size = bounds(target);
    ctx.save(); layerTransform(ctx, target);
    ctx.strokeStyle = '#719dff'; ctx.lineWidth = 1 / zoom / editSurface().scale;
    ctx.setLineDash([5 / zoom / editSurface().scale, 4 / zoom / editSurface().scale]);
    ctx.strokeRect(0, 0, size.width, size.height); ctx.restore();
  }
  const rect = cropRect || selection;
  if (rect) {
    ctx.save();
    if (cropRect) { ctx.fillStyle = '#0008'; ctx.beginPath(); ctx.rect(0, 0, project.width, project.height); ctx.rect(rect.x, rect.y, rect.width, rect.height); ctx.fill('evenodd'); }
    ctx.lineWidth = 1 / zoom; ctx.strokeStyle = '#fff'; ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = '#10151f'; ctx.setLineDash([5 / zoom, 5 / zoom]); ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  }
  $('apply-crop').disabled = !rect; $('deselect').disabled = !rect;
  $('selection-size').textContent = rect ? rect.width + ' × ' + rect.height : '';
}
function setTool(next) {
  if (next !== 'crop') cropRect = null;
  tool = next; $('tool-name').textContent = toolNames[tool];
  $('move-options').hidden = tool !== 'move'; $('text-options').hidden = tool !== 'text';
  const paint = ['brush', 'eraser', 'rect', 'ellipse', 'gradient'].includes(tool);
  $('tool-color-label').hidden = !paint; $('brush-size').closest('label').hidden = !['brush', 'eraser'].includes(tool);
  $('brush-hardness').closest('label').hidden = !['brush', 'eraser'].includes(tool); $('brush-opacity').closest('label').hidden = !paint;
  $('gradient-color-option').hidden = tool !== 'gradient';
  document.querySelectorAll('[data-tool]').forEach(button => { button.classList.toggle('selected', button.dataset.tool === tool); button.setAttribute('aria-pressed', String(button.dataset.tool === tool)); });
  viewport.style.cursor = ['move', 'hand', 'text'].includes(tool) ? { move: 'default', hand: 'grab', text: 'text' }[tool] : 'crosshair';
  $('property-hint').textContent = ['brush', 'eraser'].includes(tool) ? '在选中的可见像素图层上绘画。文字请新建图层后绘画。' : tool === 'move' ? '拖动所选图层；右侧可输入精确位置、缩放和角度。' : '选择图层后，可在这里修改它的属性。';
  drawOverlay();
}
function icon(name) { const img = document.createElement('img'); img.src = 'icons/' + name + '.svg'; img.alt = ''; return img; }
function thumbnail(item, mask = false) {
  const source = mask ? item.mask : item;
  const thumb = source.canvas ? document.createElement('canvas') : document.createElement('div');
  thumb.className = 'thumb' + (mask ? ' mask-thumb' : item.type === 'text' ? ' text-thumb' : item.type === 'group' ? ' group-thumb' : '');
  thumb.dataset.target = mask ? 'mask' : 'image'; thumb.draggable = false;
  if (source.canvas) {
    thumb.width = 74; thumb.height = 60; const ctx = thumb.getContext('2d');
    const ratio = Math.min(74 / source.canvas.width, 60 / source.canvas.height), ox = (74 - source.canvas.width * ratio) / 2, oy = (60 - source.canvas.height * ratio) / 2;
    ctx.drawImage(source.canvas, ox, oy, source.canvas.width * ratio, source.canvas.height * ratio);
    const data = ctx.getImageData(0, 0, 74, 60).data; let left = 74, top = 60, right = -1, bottom = -1;
    for (let y = 0; y < 60; y++) for (let x = 0; x < 74; x++) { const i = (y * 74 + x) * 4; if (data[i + 3] && (!mask || data[i] > 1)) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); } }
    if (right >= left) {
      const sx = Math.max(0, (left - ox - 1) / ratio), sy = Math.max(0, (top - oy - 1) / ratio), sw = Math.min(source.canvas.width - sx, (right - left + 3) / ratio), sh = Math.min(source.canvas.height - sy, (bottom - top + 3) / ratio), scale = Math.min(70 / sw, 56 / sh);
      ctx.clearRect(0, 0, 74, 60); if (mask) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 74, 60); }
      ctx.drawImage(source.canvas, sx, sy, sw, sh, (74 - sw * scale) / 2, (60 - sh * scale) / 2, sw * scale, sh * scale);
    }
  }
  else if (item.type === 'text') thumb.textContent = 'T'; else thumb.append(icon(item.collapsed ? 'folder' : 'folder-open'));
  if (mask && !source.enabled) thumb.classList.add('disabled');
  thumb.title = mask ? '编辑图层蒙版（Shift 单击停用 / 启用）' : '编辑图层图像';
  thumb.onclick = e => { e.stopPropagation(); if (busy) return; selectLayer(item, mask ? 'mask' : 'image', e.ctrlKey); if (mask && e.shiftKey) command('toggleMask'); };
  return thumb;
}
function refresh(rebuild = true) {
  const layer = active(), target = editSurface(), locked = isLocked(project, layer);
  $('layer-count').textContent = project.layers.length + ' 个图层';
  $('undo').disabled = history.undoStack.length === 0; $('redo').disabled = history.redoStack.length === 0;
  $('layer-type').textContent = layer.type === 'text' ? '文字图层' : layer.type === 'group' ? '图层组' : '像素图层';
  $('layer-x').value = Math.round(target.x); $('layer-y').value = Math.round(target.y);
  $('layer-scale').value = Math.round(target.scale * 100); $('layer-rotation').value = Math.round(target.rotation);
  $('layer-opacity').value = Math.round(layer.opacity * 100); $('blend').value = layer.blend;
  $('blend').querySelector('[value="pass-through"]').disabled = layer.type !== 'group';
  $('text-properties').hidden = layer.type !== 'text' || editTarget === 'mask';
  $('edit-target-label').textContent = editTarget === 'mask' ? '正在编辑：图层蒙版' : '';
  for (const el of document.querySelectorAll('.properties input,.properties select,.properties textarea,#blend,#layer-opacity,#bold')) el.disabled = locked;
  if (layer.type === 'group' && editTarget !== 'mask') ['layer-x', 'layer-y', 'layer-scale', 'layer-rotation'].forEach(id => $(id).disabled = true);
  if (layer.type === 'text') { $('text-content').value = layer.text; $('font').value = layer.font; $('font-size').value = layer.fontSize; $('text-color').value = layer.color; $('bold').classList.toggle('active', layer.bold); }
  $('mask-empty').hidden = !!layer.mask; $('mask-controls').hidden = !layer.mask;
  $('mask-state').textContent = layer.mask ? (layer.mask.enabled ? '已启用' : '已停用') : '未添加';
  if (layer.mask) { $('mask-density').value = layer.mask.density * 100; $('mask-density-value').textContent = Math.round(layer.mask.density * 100) + '%'; $('mask-feather').value = layer.mask.feather; $('mask-toggle').textContent = layer.mask.enabled ? '停用' : '启用'; $('mask-link').textContent = layer.mask.linked ? '取消链接' : '链接'; $('mask-density').disabled = $('mask-feather').disabled = locked; }
  if (rebuild) {
    const list = $('layer-list'); list.replaceChildren();
    for (const { layer: item, depth } of panelLayers(project)) {
      if (!$('layer-search').value || item.name.toLowerCase().includes($('layer-search').value.toLowerCase())) {
        const row = document.createElement('div'); row.className = 'layer-row' + (item.clipping ? ' clipped' : ''); row.setAttribute('role', 'listitem'); row.dataset.id = item.id; row.draggable = true;
        const visible = document.createElement('button'); visible.append(icon(item.visible ? 'eye' : 'eye-off')); visible.title = item.visible ? '隐藏图层' : '显示图层'; visible.setAttribute('aria-label', visible.title);
        visible.onclick = e => { e.stopPropagation(); if (busy) return; checkpoint(); item.visible = !item.visible; changed(); };
        row.append(visible);
        const spacer = document.createElement('span'); spacer.style.width = depth * 11 + 'px'; spacer.style.flex = 'none'; row.append(spacer);
        if (item.type === 'group') { const toggle = document.createElement('button'); toggle.className = 'disclosure'; toggle.append(icon(item.collapsed ? 'chevron-right' : 'chevron-down')); toggle.setAttribute('aria-label', item.collapsed ? '展开图层组' : '折叠图层组'); toggle.onclick = e => { e.stopPropagation(); if (busy) return; checkpoint(); item.collapsed = !item.collapsed; changed(); }; row.append(toggle); }
        row.append(thumbnail(item));
        if (item.mask) {
          const link = document.createElement('button'); link.className = 'mask-link'; link.append(icon(item.mask.linked ? 'link' : 'link-off')); link.title = item.mask.linked ? '取消链接蒙版' : '链接蒙版'; link.onclick = e => { e.stopPropagation(); selectLayer(item, 'mask'); command('linkMask'); }; row.append(link, thumbnail(item, true));
        }
        const info = document.createElement('div'); info.className = 'layer-name'; const title = document.createElement('span'); title.textContent = item.name; title.title = item.name;
        title.ondblclick = e => {
          e.stopPropagation(); if (busy || isLocked(project, item)) return;
          const input = document.createElement('input'); input.className = 'rename-input'; input.maxLength = 200; input.value = item.name; title.replaceWith(input); input.focus(); input.select(); let finished = false;
          const finish = commit => { if (finished) return; finished = true; if (commit && input.value.trim() && input.value.trim() !== item.name) { checkpoint(); item.name = input.value.trim(); changed(); } else refresh(); };
          input.onblur = () => finish(true); input.onkeydown = event => { if (event.key === 'Enter') finish(true); if (event.key === 'Escape') finish(false); }; input.onclick = event => event.stopPropagation();
        }; info.append(title); row.append(info);
        const lock = document.createElement('button'); lock.append(icon(item.locked ? 'lock' : 'lock-open')); lock.title = item.locked ? '解锁图层' : '锁定图层'; lock.setAttribute('aria-label', lock.title); lock.onclick = e => { e.stopPropagation(); if (busy) return; checkpoint(); item.locked = !item.locked; changed(); }; row.append(lock);
        row.onclick = e => { if (!busy) selectLayer(item, 'image', e.ctrlKey); }; row.tabIndex = 0; row.onkeydown = e => { if (e.key === 'Enter') selectLayer(item, 'image', e.ctrlKey); };
        row.ondragstart = e => { if (busy || isLocked(project, item)) { e.preventDefault(); return; } e.dataTransfer.setData('application/x-compositor-layer', item.id); e.dataTransfer.effectAllowed = 'move'; };
        row.ondragover = e => { if (e.dataTransfer.types.includes('application/x-compositor-layer')) { e.preventDefault(); row.classList.add('dragover'); } }; row.ondragleave = () => row.classList.remove('dragover');
        row.ondrop = e => {
          const id = e.dataTransfer.getData('application/x-compositor-layer'); if (!id) return; e.preventDefault(); e.stopPropagation(); row.classList.remove('dragover'); if (busy) return;
          try { const moving = project.layers.find(l => l.id === id); if (!moving || moving === item) return; if (isLocked(project, moving) || isLocked(project, item)) throw new Error('请先解锁图层。');
            const destination = item.type === 'group' ? item.id : item.parentId || null;
            if (moving.type === 'group' && [moving, ...descendants(project, moving.id)].some(l => l.id === destination)) throw new Error('不能将组移入自身或子组。');
            checkpoint(); moveToGroup(project, moving, destination);
            if (item.type !== 'group') { project.layers.splice(project.layers.indexOf(moving), 1); project.layers.splice(project.layers.indexOf(item) + 1, 0, moving); }
            else item.collapsed = false; canonicalize(project); project.activeId = moving.id; setTarget('image'); changed('已移动图层');
          } catch (error) { toast(error.message); }
        }; list.append(row);
      }
    }
  }
  document.querySelectorAll('.layer-row').forEach(row => { row.classList.toggle('active', row.dataset.id === layer.id); row.classList.toggle('selected', selectedIds.size > 1 && selectedIds.has(row.dataset.id)); row.querySelectorAll('[data-target]').forEach(t => t.classList.toggle('target', row.dataset.id === layer.id && t.dataset.target === editTarget)); });
}
async function result(promise) { const response = await promise; if (!response.ok) throw new Error(response.error); return response.value; }
async function save(saveAs = false) {
  const output = await result(api.saveProject(snapshot(), saveAs));
  if (!output) return false;
  name = output.name; setDirty(false); toast('项目已保存：' + output.path); return true;
}
async function mayReplace() {
  if (!dirty) return true;
  const dialog = $('confirm-dialog'); dialog.returnValue = 'cancel'; dialog.showModal();
  const choice = await new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true }));
  return choice === 'discard' || (choice === 'save' && await save());
}
async function importImages(images) {
  if (!images.length) return;
  const incoming = []; let pixels = 0;
  for (const image of images) {
    const decoded = await decodeImage(image.data);
    const ratio = Math.min(1, project.width / decoded.width, project.height / decoded.height);
    const width = Math.max(1, Math.round(decoded.width * ratio)), height = Math.max(1, Math.round(decoded.height * ratio));
    pixels += width * height;
    capacity(pixels, 1, images.length);
    const layer = rasterLayer(image.name.slice(0, 200), width, height);
    layer.canvas.getContext('2d').drawImage(decoded, 0, 0, width, height);
    layer.x = Math.round((project.width - width) / 2); layer.y = Math.round((project.height - height) / 2);
    incoming.push(layer);
  }
  checkpoint(); project.layers.push(...incoming); project.activeId = incoming.at(-1).id;
  $('canvas-tip').hidden = true; setTool('move'); changed('已导入 ' + incoming.length + ' 张图片');
}
async function travel(undo) {
  const source = undo ? history.undoStack : history.redoStack, destination = undo ? history.redoStack : history.undoStack;
  if (!source.length) return;
  const restored = await deserialize(source.at(-1));
  const resized = restored.width !== project.width || restored.height !== project.height;
  destination.push(snapshot()); source.pop(); project = restored; selectedIds.clear(); selectedIds.add(project.activeId); setTarget('image'); selection = cropRect = null; resizeCanvas(); if (resized) fit(); changed(undo ? '已撤销' : '已重做');
}
function editable() { if (isLocked(project, active())) { toast('当前图层已锁定，请先解锁。'); return false; } return true; }
function pixelEditable() {
  if (!editable()) return false;
  if (!isVisible(project, active())) { toast('请先显示当前图层。'); return false; }
  if (editTarget !== 'mask' && active().type !== 'raster') { toast('此操作用于像素图层，请从“图层”菜单栅格化文字，或新建像素图层。'); return false; }
  return true;
}
function replaceSize(next, message) {
  checkpoint(); project = next; selection = cropRect = null; resizeCanvas(); fit(); changed(message);
}
function replacementCapacity(removed, width, height) {
  const pixels = project.layers.filter(l => !removed.includes(l)).reduce((n, l) => n + pixelCount(l), width * height);
  if (pixels > MAX_PIXELS) throw new Error('操作后像素图层合计超过 6400 万像素，请先删除部分图层。');
}
function openSize(mode) {
  sizeMode = mode;
  $('size-title').textContent = mode === 'image' ? '图像大小' : '画布大小';
  $('size-description').textContent = mode === 'image' ? '按比例重采样所有像素图层，文字保持可编辑。单独修改分辨率不会改变像素尺寸。' : '根据锚点扩展或裁切画布，图层内容保留，新增区域透明。';
  $('size-width').value = project.width; $('size-height').value = project.height; $('size-resolution').value = project.resolution;
  $('size-resolution-label').hidden = mode !== 'image'; $('size-resolution').disabled = mode !== 'image';
  $('size-anchor-option').hidden = mode !== 'canvas'; $('size-anchor').value = '0.5,0.5'; $('size-error').hidden = true; $('size-dialog').showModal();
}
const adjustmentKeys = ['brightness', 'contrast', 'saturation', 'hue', 'grayscale', 'invert', 'blur'];
function adjustmentSettings() { return Object.fromEntries(adjustmentKeys.map(k => [k, Number($('adjust-' + k).value)])); }
function previewAdjustment() {
  if (!adjustment) return;
  adjustmentKeys.forEach(k => $('adjust-' + k).nextElementSibling.textContent = $('adjust-' + k).value + (k === 'hue' ? '°' : k === 'blur' ? ' px' : '%'));
  adjustment.layer.canvas = adjustRaster(adjustment.layer, adjustment.original, selection, adjustmentSettings()); render();
}
function openAdjustment() {
  if (editTarget === 'mask') { toast('蒙版请使用反相、浓度和羽化控件。'); return; }
  if (!pixelEditable()) return;
  const layer = active(); adjustment = { layer, original: layer.canvas, data: layer.data };
  $('adjust-form').reset(); previewAdjustment(); $('adjust-dialog').showModal();
}
async function mergeLayers(visible) {
  const current = active(), siblings = childrenOf(project, current.parentId), index = siblings.indexOf(current);
  if (!visible && !index) { toast('下方没有可合并的图层。'); return; }
  const roots = visible ? childrenOf(project).filter(l => l.visible) : siblings.slice(index - 1, index + 1);
  const removed = roots.flatMap(l => [...(l.type === 'group' ? descendants(project, l.id) : []), l]);
  if (roots.length < 2) { toast('至少需要两个可见的同级图层。'); return; }
  if (removed.some(l => isLocked(project, l)) || roots.some(l => !l.visible)) { toast('请先显示并解锁要合并的图层。'); return; }
  if (!visible && (roots.some(l => l.blend !== 'source-over' || l.clipping) || siblings[index + 1]?.clipping)) { toast('向下合并需要正常混合模式且未参与剪贴的图层；其他情况请合并可见图层。'); return; }
  const keptHidden = visible ? removed.filter(l => !isVisible(project, l)) : [];
  const discarded = removed.filter(l => !keptHidden.includes(l)); replacementCapacity(discarded, project.width, project.height);
  const layer = rasterLayer(visible ? '合并可见图层' : current.name, project.width, project.height);
  const renderLayers = removed.map(l => roots.includes(l) ? { ...l, parentId: null } : l);
  renderInto(layer.canvas, { ...project, layers: renderLayers }); checkpoint();
  if (visible) {
    keptHidden.forEach(l => { if (discarded.some(d => d.id === l.parentId)) { l.parentId = null; l.visible = false; } });
    project.layers = [...project.layers.filter(l => !discarded.includes(l)), layer];
  } else {
    const position = project.layers.indexOf(roots[0]); layer.parentId = current.parentId || null;
    project.layers = project.layers.filter(l => !removed.includes(l)); project.layers.splice(position, 0, layer);
  }
  canonicalize(project); project.activeId = layer.id; setTarget('image'); changed('已合并画布范围内的图层，可撤销恢复');
}
async function command(action) {
  if (action === 'selectAll' && document.activeElement?.matches('input,textarea')) { document.activeElement.select(); return; }
  if (busy || gesture || document.querySelector('dialog[open]')) return;
  // Commit a pending text change before a menu accelerator operates on it.
  if (document.activeElement?.matches('input,textarea,select')) document.activeElement.blur();
  setBusy(true);
  document.body.dataset.commandSerial = String(Number(document.body.dataset.commandSerial || 0) + 1);
  try {
    if (advancedCommand(action, { project, checkpoint, changed, toast, capacity, selected: selectedIds, target: editTarget, setTarget, selection })) return;
    if (action.startsWith('panel')) { showPanel(action.slice(5).toLowerCase()); return; }
    if (action === 'textTool') { setTool('text'); return; }
    if (action === 'new') { if (await mayReplace()) newDocument.open(); }
    else if (action === 'open') {
      if (!await mayReplace()) return;
      const opened = await result(api.openProject()); if (!opened) return;
      if (opened.requiresFlatten) {
        const dialog = $('psd-warning-dialog'); $('psd-warning-text').textContent = opened.warnings.join('；'); dialog.returnValue = 'cancel'; dialog.showModal();
        const choice = await new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true })); if (choice !== 'flatten') return;
      }
      const loaded = await deserialize(opened.project); project = loaded; name = opened.name; selection = cropRect = null;
      selectedIds.clear(); selectedIds.add(project.activeId); setTarget('image');
      api.commitDocument(opened.source === 'psd' ? 'new' : 'open'); history.reset(); resizeCanvas(); setDirty(opened.source === 'psd'); fit(); render(); refresh(); $('canvas-tip').hidden = true; toast(opened.source === 'psd' ? 'PSD 已打开' + (opened.warnings.length ? '：' + opened.warnings.join('；') : '') : '项目已打开');
    } else if (action === 'save' || action === 'saveAs') await save(action === 'saveAs');
    else if (action === 'import') await importImages(await result(api.importImages()));
    else if (action === 'export') $('export-dialog').showModal();
    else if (action === 'help') $('help-dialog').showModal();
    else if (action === 'imageSize' || action === 'canvasSize') openSize(action === 'imageSize' ? 'image' : 'canvas');
    else if (action === 'adjust') openAdjustment();
    else if (action === 'selectAll') { selection = { x: 0, y: 0, width: project.width, height: project.height }; cropRect = null; drawOverlay(); }
    else if (action === 'deselect') { selection = cropRect = null; drawOverlay(); }
    else if (action === 'cropSelection') {
      const rect = cropRect || selection;
      if (!rect) { toast('请用裁剪或矩形选区工具拖出范围。'); return; }
      replaceSize(cropProject(project, rect), '已裁剪画布，画布外的图层像素保留');
    } else if (action === 'fillSelection' || action === 'clearSelection') {
      if (!pixelEditable()) return;
      checkpoint(); if (editTarget === 'mask') expandMask(project, active(), capacity);
      const layer = editSurface(), ctx = layer.canvas.getContext('2d'); ctx.save(); clipSelection(ctx, layer, selection);
      if (action === 'clearSelection' && editTarget !== 'mask') ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
      else { ctx.globalAlpha = Number($('brush-opacity').value) / 100; ctx.fillStyle = editTarget === 'mask' ? action === 'clearSelection' ? '#000000' : grayColor($('color').value) : $('color').value; ctx.fillRect(0, 0, layer.canvas.width, layer.canvas.height); }
      ctx.restore(); invalidatePixels(layer); changed(action === 'clearSelection' ? '已清除像素' : '已使用前景色填充');
    } else if (action === 'mergeDown' || action === 'mergeVisible') await mergeLayers(action === 'mergeVisible');
    else if (action === 'rasterize') {
      if (!editable() || active().type !== 'text') return;
      const old = active(), next = rasterize(old); replacementCapacity([old], next.canvas.width, next.canvas.height);
      checkpoint(); project.layers[project.layers.indexOf(old)] = next; changed('文字已栅格化，撤销可恢复可编辑文字');
    } else if (action === 'copyMerged') {
      const rect = selection || { x: 0, y: 0, width: project.width, height: project.height };
      const copy = canvas(rect.width, rect.height); copy.getContext('2d').drawImage(display, -rect.x, -rect.y);
      await result(api.copyImage(copy.toDataURL('image/png'))); toast('已将可见画面复制到 Windows 剪贴板');
    } else if (action === 'pasteImage') {
      const data = await result(api.pasteImage()); if (!data) { toast('剪贴板中没有图片。'); return; }
      await importImages([{ name: '剪贴板图片', data }]);
    } else if (action === 'undo' || action === 'redo') await travel(action === 'undo');
    else if (action === 'fit') fit();
    else if (action === 'actual') setZoom(1);
    else if (action === 'close') { if (await mayReplace()) { setDirty(false); api.close(); } }
    else if (action === 'addLayer') {
      capacity(project.width, project.height); checkpoint();
      const layer = rasterLayer('图层 ' + (project.layers.length + 1), project.width, project.height);
      layer.parentId = active().type === 'group' ? active().id : active().parentId || null; project.layers.push(layer); canonicalize(project); project.activeId = layer.id; setTarget('image'); changed('已新建透明图层');
    }
  } catch (error) { toast(error.message || '操作失败，请重试。'); }
  finally { setBusy(false); }
}
api.onCommand(command);
document.querySelectorAll('[data-command]').forEach(button => button.onclick = () => command(button.dataset.command));
document.querySelectorAll('[data-tool]').forEach(button => button.onclick = () => { if (!busy && !gesture) setTool(button.dataset.tool); });
document.querySelectorAll('[data-dismiss]').forEach(button => button.onclick = () => button.closest('dialog').close());
document.querySelectorAll('[data-choice]').forEach(button => button.onclick = () => $('confirm-dialog').close(button.dataset.choice));
const newDocument = setupNewDocument(settings => {
  newProject(settings.width, settings.height, settings.background, settings.title, settings.resolution);
  $('canvas-tip').hidden = false;
});
for (const id of ['size-width', 'size-height']) $(id).addEventListener('input', () => {
  if (sizeMode !== 'image') return;
  const value = Number($(id).value);
  const other = id === 'size-width' ? 'size-height' : 'size-width';
  $(other).value = value > 0 ? Math.max(1, Math.round(value * (id === 'size-width' ? project.height / project.width : project.width / project.height))) : '';
});
$('size-form').onsubmit = event => {
  event.preventDefault(); if (busy) return; setBusy(true);
  try {
    const width = Number($('size-width').value), height = Number($('size-height').value);
    const [x, y] = $('size-anchor').value.split(',').map(Number);
    const next = sizeMode === 'image' ? resizeImageProject(project, width, height, Number($('size-resolution').value)) : resizeCanvasProject(project, width, height, { x, y });
    replaceSize(next, sizeMode === 'image' ? '已修改图像大小和分辨率' : '已修改画布大小'); $('size-dialog').close();
  } catch (error) { $('size-error').textContent = error.message; $('size-error').hidden = false; }
  finally { setBusy(false); }
};
adjustmentKeys.forEach(k => $('adjust-' + k).addEventListener('input', () => {
  cancelAnimationFrame(adjustmentFrame); adjustmentFrame = requestAnimationFrame(previewAdjustment);
}));
$('adjust-reset').onclick = () => { $('adjust-form').reset(); previewAdjustment(); };
$('adjust-dialog').addEventListener('close', () => {
  cancelAnimationFrame(adjustmentFrame);
  if (adjustment) { adjustment.layer.canvas = adjustment.original; adjustment.layer.data = adjustment.data; adjustment = null; render(); }
});
$('adjust-form').onsubmit = event => {
  event.preventDefault(); if (!adjustment) return;
  cancelAnimationFrame(adjustmentFrame); previewAdjustment();
  const { layer, original, data } = adjustment, output = layer.canvas;
  layer.canvas = original; layer.data = data; checkpoint(); layer.canvas = output; delete layer.data;
  adjustment = null; $('adjust-dialog').close(); changed('已应用图像调整');
};
$('export-form').onsubmit = async event => {
  event.preventDefault(); if (busy) return; setBusy(true);
  try {
    const format = $('export-format').value;
    let saved;
    if (format === 'psd') saved = await result(api.exportPsd(preparePsd(project)));
    else { const output = composite(project, format === 'jpeg' ? '#ffffff' : null); const data = output.toDataURL('image/' + format, Number($('export-quality').value) / 100); saved = await result(api.exportImage(data, format, project.resolution)); }
    if (saved) { $('export-dialog').close(); toast('图片已导出：' + saved); }
  } catch (error) { toast(error.message); }
  finally { setBusy(false); }
};
function updateProperty(id, key, convert = x => x) {
  $(id).addEventListener('change', () => {
    if (isLocked(project, active()) || busy) { refresh(); return; }
    const value = convert($(id).value);
    const geometry = ['x', 'y', 'scale', 'rotation'].includes(key), target = geometry ? editSurface() : active();
    if (geometry && active().type === 'group' && editTarget !== 'mask') { refresh(); return; }
    if (value === undefined || value === target[key]) { refresh(); return; }
    try { checkpoint(); if (target === active() && geometry) transformLayer(target, { [key]: value }); else { target[key] = value; if (target === active().mask) invalidatePixels(target); } changed(); }
    catch (error) { refresh(); toast(error.message); }
  });
}
const numeric = (min, max, divisor = 1) => value => value !== '' && Number.isFinite(Number(value)) ? clamp(Number(value), min, max) / divisor : undefined;
updateProperty('layer-x', 'x', numeric(-100000, 100000));
updateProperty('layer-y', 'y', numeric(-100000, 100000));
updateProperty('layer-scale', 'scale', numeric(1, 10000, 100));
updateProperty('layer-rotation', 'rotation', numeric(-36000, 36000));
updateProperty('layer-opacity', 'opacity', numeric(0, 100, 100));
updateProperty('blend', 'blend');
updateProperty('font', 'font'); updateProperty('font-size', 'fontSize', numeric(1, 1000));
updateProperty('text-color', 'color');
let textSession = false;
$('text-content').addEventListener('focus', () => { textSession = false; });
$('text-content').addEventListener('input', () => {
  if (busy || isLocked(project, active()) || active().type !== 'text' || active().text === $('text-content').value) return;
  if (!textSession) { checkpoint(); textSession = true; }
  active().text = $('text-content').value; setDirty(true); render();
  $('undo').disabled = false; $('redo').disabled = true;
});
$('bold').onclick = () => { if (active().type !== 'text' || isLocked(project, active()) || busy) return; checkpoint(); active().bold = !active().bold; changed(); };
$('brush-opacity').oninput = () => $('brush-opacity-value').textContent = $('brush-opacity').value + '%';
$('zoom-in').onclick = () => setZoom(zoom * 1.25); $('zoom-out').onclick = () => setZoom(zoom / 1.25);
viewport.addEventListener('wheel', event => {
  event.preventDefault(); if (gesture) return;
  const rect = viewport.getBoundingClientRect();
  setZoom(zoom * Math.exp(-event.deltaY * .0015), { x: event.clientX - rect.left, y: event.clientY - rect.top });
}, { passive: false });
function point(event) {
  const rect = viewport.getBoundingClientRect();
  return { x: (event.clientX - rect.left - pan.x) / zoom, y: (event.clientY - rect.top - pan.y) / zoom };
}
function paintStroke(g, p) {
  const current = localPoint(g.layer, p), previous = g.last || current;
  const ctx = g.stroke.getContext('2d');
  ctx.strokeStyle = g.color; ctx.fillStyle = g.color; ctx.lineWidth = g.size / g.layer.scale;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(current.x, current.y); ctx.stroke();
  ctx.beginPath(); ctx.arc(current.x, current.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
  const target = g.layer.canvas.getContext('2d');
  target.clearRect(0, 0, g.layer.canvas.width, g.layer.canvas.height); target.drawImage(g.before, 0, 0);
  target.save(); clipSelection(target, g.layer, selection); target.globalCompositeOperation = g.kind === 'eraser' && !g.mask ? 'destination-out' : 'source-over'; target.globalAlpha = g.opacity;
  target.filter = `blur(${g.size / g.layer.scale * .15 * (1 - g.hardness / 100)}px)`; target.drawImage(g.stroke, 0, 0); target.restore();
  invalidatePixels(g.layer); g.last = current; render();
}
viewport.addEventListener('pointerdown', event => {
  if (busy || gesture || (event.button !== 0 && event.button !== 1)) return;
  viewport.focus(); const p = point(event);
  if (tool === 'hand' || space || event.button === 1) {
    gesture = { kind: 'pan', startX: event.clientX, startY: event.clientY, pan: { ...pan } };
  } else {
    if (p.x < 0 || p.y < 0 || p.x >= project.width || p.y >= project.height) return;
    if (tool === 'move' && $('auto-select').checked) {
      let found = hitLayer(project, p);
      if (found && $('auto-select-mode').value === 'group') found = ancestors(project, found).at(-1) || found;
      if (found) selectLayer(found);
    }
    const layer = active();
    if (tool === 'eyedropper') {
      const pixel = display.getContext('2d').getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
      if (pixel[3]) $('color').value = '#' + [...pixel].slice(0, 3).map(x => x.toString(16).padStart(2, '0')).join(''); colorSwatches();
      return;
    }
    if (tool === 'text') {
      try { capacity(); } catch (error) { toast(error.message); return; }
      checkpoint(); const text = textLayer('输入文字', Math.round(p.x), Math.round(p.y), $('color').value);
      text.parentId = active().type === 'group' ? active().id : active().parentId || null; project.layers.push(text); canonicalize(project); project.activeId = text.id; setTarget('image'); showPanel('properties'); changed('在右侧输入文字内容');
      setTool('move'); $('text-content').focus(); $('text-content').select(); $('canvas-tip').hidden = true; return;
    }
    if (tool === 'select' || tool === 'crop') {
      gesture = { kind: tool, start: p, end: p };
    } else if (['rect', 'ellipse', 'gradient'].includes(tool)) {
      try { if (editTarget !== 'mask') capacity(project.width, project.height); else if (!pixelEditable()) return; } catch (error) { toast(error.message); return; }
      gesture = { kind: tool, start: p, end: p, color: editTarget === 'mask' ? grayColor($('color').value) : $('color').value, endColor: editTarget === 'mask' ? grayColor($('gradient-color').value) : $('gradient-color').value, mask: editTarget === 'mask', opacity: Number($('brush-opacity').value) / 100 };
    } else {
      if (!editable()) return;
      if (!isVisible(project, layer)) { toast('请先显示当前图层。'); return; }
      if (tool === 'move') gesture = { kind: 'move', layer, start: p, last: p, maskOnly: editTarget === 'mask' && !layer.mask.linked, committed: false };
      else if (tool === 'brush' || tool === 'eraser') {
        if (!pixelEditable()) return;
        checkpoint(); try { if (editTarget === 'mask') expandMask(project, layer, capacity); } catch (error) { toast(error.message); return; }
        const surface = editSurface();
        const before = canvas(surface.canvas.width, surface.canvas.height); before.getContext('2d').drawImage(surface.canvas, 0, 0);
        gesture = { kind: tool, layer: surface, mask: editTarget === 'mask', before, stroke: canvas(surface.canvas.width, surface.canvas.height), color: editTarget === 'mask' ? tool === 'eraser' ? '#ffffff' : grayColor($('color').value) : $('color').value, hardness: Number($('brush-hardness').value), opacity: Number($('brush-opacity').value) / 100, size: clamp(Number($('brush-size').value) || 20, 1, 500) };
        paintStroke(gesture, p);
      }
    }
  }
  if (gesture) { viewport.setPointerCapture(event.pointerId); $('canvas-tip').hidden = true; }
});
function shapePath(ctx, g) {
  const x = Math.min(g.start.x, g.end.x), y = Math.min(g.start.y, g.end.y);
  const w = Math.abs(g.start.x - g.end.x), h = Math.abs(g.start.y - g.end.y);
  ctx.beginPath();
  if (g.kind === 'rect') ctx.rect(x, y, w, h);
  else ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = g.color; ctx.globalAlpha = g.opacity; ctx.fill(); ctx.globalAlpha = 1;
}
function gradientPath(ctx, g) {
  const gradient = ctx.createLinearGradient(g.start.x, g.start.y, g.end.x, g.end.y);
  gradient.addColorStop(0, g.color); gradient.addColorStop(1, g.endColor);
  ctx.fillStyle = gradient; ctx.globalAlpha = g.opacity; ctx.fillRect(0, 0, project.width, project.height); ctx.globalAlpha = 1;
}
viewport.addEventListener('pointermove', event => {
  if (!gesture) return;
  const g = gesture, p = point(event);
  if (g.kind === 'pan') { pan = { x: g.pan.x + event.clientX - g.startX, y: g.pan.y + event.clientY - g.startY }; applyView(); }
  else if (g.kind === 'move') {
    if (!g.committed && Math.hypot(p.x - g.start.x, p.y - g.start.y) > .5) { checkpoint(); g.committed = true; }
    if (g.committed) { try { const dx = Math.round(p.x - g.last.x), dy = Math.round(p.y - g.last.y); moveLayer(project, g.layer, dx, dy, g.maskOnly); g.last = { x: g.last.x + dx, y: g.last.y + dy }; render(); } catch (error) { toast(error.message); } }
  } else if (['brush', 'eraser'].includes(g.kind)) paintStroke(g, p);
  else {
    g.end = { x: clamp(p.x, 0, project.width), y: clamp(p.y, 0, project.height) };
    if (g.kind === 'select' || g.kind === 'crop') {
      const rect = rectangle(g.start, g.end);
      if (g.kind === 'crop') cropRect = rect; else { selection = rect; cropRect = null; }
      drawOverlay();
    } else {
      drawOverlay(); const ctx = overlay.getContext('2d'); ctx.save();
      clipSelection(ctx, { x: 0, y: 0, rotation: 0, scale: 1 }, selection);
      if (g.kind === 'gradient') gradientPath(ctx, g); else shapePath(ctx, g); ctx.restore();
    }
  }
});
function finishGesture(event) {
  if (!gesture) return;
  const g = gesture; gesture = null;
  if (event && viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  if (g.kind === 'select' || g.kind === 'crop') {
    const rect = rectangle(g.start, g.end);
    if (g.kind === 'crop') cropRect = rect.width && rect.height ? rect : null;
    else { selection = rect.width && rect.height ? rect : null; cropRect = null; }
    drawOverlay(); $('status').textContent = g.kind === 'crop' ? 'Enter 或上方“裁剪”应用，Esc 取消' : '选区已建立，绘画、填充和调整将限制在选区内';
  } else if (['rect', 'ellipse', 'gradient'].includes(g.kind)) {
    if (g.kind === 'gradient' ? Math.hypot(g.start.x - g.end.x, g.start.y - g.end.y) >= 1 : Math.abs(g.start.x - g.end.x) >= 1 && Math.abs(g.start.y - g.end.y) >= 1) {
      checkpoint(); try { if (g.mask) expandMask(project, active(), capacity); } catch (error) { toast(error.message); return; }
      const layer = g.mask ? editSurface() : rasterLayer({ rect: '矩形', ellipse: '椭圆', gradient: '渐变' }[g.kind], project.width, project.height);
      const ctx = layer.canvas.getContext('2d'); ctx.save(); clipSelection(ctx, layer, selection);
      if (g.mask) { const rad = layer.rotation * Math.PI / 180, origin = localPoint(layer, { x: 0, y: 0 }); ctx.transform(Math.cos(rad) / layer.scale, -Math.sin(rad) / layer.scale, Math.sin(rad) / layer.scale, Math.cos(rad) / layer.scale, origin.x, origin.y); }
      if (g.kind === 'gradient') gradientPath(ctx, g); else shapePath(ctx, g); ctx.restore();
      if (!g.mask) { layer.parentId = active().type === 'group' ? active().id : active().parentId || null; project.layers.push(layer); canonicalize(project); project.activeId = layer.id; setTarget('image'); } else invalidatePixels(layer); changed(g.mask ? '已更新蒙版' : '已创建' + layer.name + '图层');
    } else drawOverlay();
  } else if (g.kind !== 'pan' && (g.kind !== 'move' || g.committed)) changed();
}
viewport.addEventListener('pointerup', finishGesture); viewport.addEventListener('pointercancel', finishGesture);
window.addEventListener('blur', () => { space = false; finishGesture(); });
window.addEventListener('keydown', event => {
  if (event.isComposing || event.target.matches('input,textarea,select') || event.target.closest('[role=menu]') || document.querySelector('dialog[open]')) return;
  if (event.code === 'Space') { event.preventDefault(); space = true; return; }
  // Menu accelerators own Ctrl combinations in Electron.
  if (event.ctrlKey || event.metaKey || event.altKey || busy || gesture) return;
  const shortcuts = { v: 'move', m: 'select', c: 'crop', g: 'gradient', b: 'brush', e: 'eraser', t: 'text', u: 'rect', o: 'ellipse', i: 'eyedropper', h: 'hand' };
  if (shortcuts[event.key.toLowerCase()]) setTool(shortcuts[event.key.toLowerCase()]);
  if (event.key.toLowerCase() === 'x') $('swap-colors').click();
  if (event.key.toLowerCase() === 'd') { $('color').value = '#000000'; $('gradient-color').value = '#ffffff'; colorSwatches(); }
  if (event.key === 'Escape') command('deselect');
  if (event.key === 'Enter' && cropRect) command('cropSelection');
  if (event.key === 'Delete') command(selection ? 'clearSelection' : 'deleteLayer');
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault(); if (!editable()) return;
    checkpoint(); const step = event.shiftKey ? 10 : 1;
    try { moveLayer(project, active(), event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0, editTarget === 'mask' && !active().mask.linked); changed(); } catch (error) { toast(error.message); }
  }
});
window.addEventListener('keyup', event => { if (event.code === 'Space') space = false; });
document.addEventListener('dragover', event => event.preventDefault());
document.addEventListener('drop', event => event.preventDefault());
viewport.addEventListener('dragover', event => { event.preventDefault(); viewport.classList.add('dragover'); });
viewport.addEventListener('dragleave', () => viewport.classList.remove('dragover'));
viewport.addEventListener('drop', async event => {
  event.preventDefault(); viewport.classList.remove('dragover'); if (busy || gesture) return; setBusy(true);
  try {
    const files = [...event.dataTransfer.files];
    if (files.some(file => !/^image\/(png|jpeg|webp|bmp)$/.test(file.type))) throw new Error('拖入功能支持 PNG、JPEG、WebP 和 BMP 图片；项目请使用“打开项目”。');
    if (files.reduce((sum, file) => sum + file.size, 0) > 128 * 1024 * 1024) throw new Error('图片总大小超过 128 MB。');
    const images = [];
    for (const file of files) {
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
      images.push({ name: file.name, data });
    }
    await importImages(images);
  } catch (error) { toast(error.message); } finally { setBusy(false); }
});
document.querySelectorAll('[data-psd-choice]').forEach(b => b.onclick = () => $('psd-warning-dialog').close(b.dataset.psdChoice));
setupShell(command, setTool, refresh);
$('show-transform').onchange = drawOverlay; $('text-options').onclick = () => showPanel('properties');
for (const [id, key, divide] of [['mask-density', 'density', 100], ['mask-feather', 'feather', 1]]) $(id).addEventListener('change', () => {
  if (busy || !active().mask || !editable()) return; const value = Number($(id).value) / divide; if (!Number.isFinite(value)) return; checkpoint(); active().mask[key] = clamp(value, 0, key === 'density' ? 1 : 100); invalidatePixels(active().mask); changed();
});
$('export-format').onchange = () => { $('export-quality').closest('label').hidden = $('export-format').value !== 'jpeg'; }; $('export-format').onchange();
new ResizeObserver(() => { if (project) drawRulers(project, zoom, pan); }).observe(viewport);
newProject(1280, 800, 'transparent', '未命名');
setTool('move');
setBusy(false);
new ResizeObserver(() => { if (project && !gesture) fit(); }).observe(viewport);
