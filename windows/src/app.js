import { affine, inverse } from './affine.mjs';
import { setupColors, rememberColor } from './colors.js';
import { setupWorkspace } from './workspace.js';
import { initColorProfile } from './color-engine.mjs';
import { setupBlur } from './blur.js';
import { setupSelections,selectionPath,selectionOutline } from './selections.js';
import { setupNumericScrubbing } from './numeric-scrubber.js';
import { setupBrushCursor } from './brush-cursor.js';
import { setupCutout } from './cutout.js';
import { setupRulers } from './rulers.js';
import { setupFillEditor } from './fill-editor.js';
import { setupFonts } from './fonts.js';
import { hitLayer, invalidatePixels, rasterLayer, textLayer, canvas, bounds, layerTransform, localPoint, renderInto, composite, serialize, deserialize, decodeImage, History, MAX_PIXELS } from './editor.js';
import { preparePsd } from './psd-export.js';
import { renderPreview } from './render-preview.js';
import { advancedCommand, pixelCount, grayColor, moveLayer, transformLayer, expandMask } from './advanced.js';
import { childrenOf, descendants, ancestors, panelLayers, canonicalize, moveToGroup, isLocked, isVisible } from './layer-tree.js';
import { setupShell, showPanel, colorSwatches, drawRulers } from './ui-shell.js';
import { setupNewDocument } from './new-document.js';
import { setupSnapping } from './snapping.js';
import { setupTransformControls } from './transform-controls.js';
import { setupTypeEditor, clearTextCache } from './type-editor.js';
import { setupLayerStyles } from './layer-styles.js';
import { hasEffects } from './effect-model.mjs';
import { rectangle, clipSelection, checkSize, resizeCanvasProject, cropProject, resizeImageProject, rasterize, adjustRaster } from './operations.js';
const $ = id => document.getElementById(id);
const api = window.desktop;
let project, name = '未命名', dirty = false, tool = 'move', busy = false, space = false, gesture = null;
let zoom = 1, pan = { x: 0, y: 0 }, toastTimer;
let selection = null, cropRect = null, sizeMode = 'image', adjustment = null, adjustmentFrame = null;
let history = new History(),workspace,path=null,sourcePath=null;
let editTarget = 'image'; const selectedIds = new Set();
let savedColors = null;
let typeEditor, transformUI, snapping, fonts, brushCursor, rulers,selections, numericTransaction=null, documentOpen=true, transformSelected=true;
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
  transformSelected=true;
  if (typeEditor?.editing && !typeEditor.owns(layer)) typeEditor.finish();
  if (!multiple) selectedIds.clear();
  if (multiple && selectedIds.has(layer.id) && selectedIds.size > 1) selectedIds.delete(layer.id); else selectedIds.add(layer.id);
  project.activeId = selectedIds.has(layer.id) ? layer.id : [...selectedIds].at(-1); setTarget(target); refresh(false); drawOverlay();
}
const viewport = $('viewport'), display = $('canvas'), overlay = $('overlay'),recentPreview=canvas(1,1);
const toolNames = { move: '移动工具', select: '矩形选区工具',objectSelect:'对象选择工具',quickSelect:'快速选择工具',wand:'魔棒工具', crop: '裁剪工具', gradient: '渐变工具', brush: '画笔工具', eraser: '橡皮擦工具', text: '文字工具', rect: '矩形工具', ellipse: '椭圆工具', eyedropper: '吸管工具', hand: '抓手工具' };
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
function setDirty(value) { dirty = value; updateTitle();api.setDirty(workspace?workspace.hasDirty():value); }
function updateTitle() {
  $('document-name').textContent = name; $('tab-name').textContent = name;
  $('dirty-dot').hidden = !dirty;
  document.title = (dirty ? '● ' : '') + name + ' — Compositor 中文版';
  workspace?.capture();workspace?.render();
}
function snapshot() {
  return serialize(project,true);
}
function checkpoint() { if(numericTransaction){if(!numericTransaction.pushed){history.push(numericTransaction.before);numericTransaction.pushed=true;}return;} history.push(snapshot()); }
function changed(message) {
  if (!selectedIds.has(project.activeId)) { selectedIds.clear(); selectedIds.add(project.activeId); }
  setDirty(true); render(); refresh(); if (message) $('status').textContent = message;
}
function capacity(width = 0, height = 0, count = 1) {
  const pixels = project.layers.reduce((sum, l) => sum + pixelCount(l), 0);
  if (project.layers.length + count > 100 || pixels + width * height > MAX_PIXELS) throw new Error('已达到图层内存限制（100 层 / 6400 万像素），请删除一些图层。');
}
function newProject(width, height, background, title, resolution = 72, register=true,colorMode='RGB',profile) {
  if(register)workspace?.beginNew();
  documentOpen=true;document.body.classList.remove('no-document');
  const layer = rasterLayer('背景', width, height, background);
  project = { width, height, resolution, colorSpace: 'sRGB',colorMode,...(profile?{colorProfile:profile}:{}), layers: [layer], activeId: layer.id };
  selection = cropRect = null; selectedIds.clear(); selectedIds.add(layer.id); setTarget('image');
  name = title || '未命名'; history=new History();path=sourcePath=null;transformSelected=true;api.commitDocument({kind:'activate',path:null});
  resizeCanvas(); setDirty(false); fit(); refresh();
  if(register)workspace?.add();
}
function resizeCanvas() {
  const ratio=Math.min(1,Math.sqrt(2*1024*1024/(project.width*project.height)));
  for (const c of [display, overlay]) { c.width = Math.max(1,Math.round(project.width*ratio)); c.height = Math.max(1,Math.round(project.height*ratio));c.style.width=project.width+'px';c.style.height=project.height+'px'; }
  $('canvas-wrap').style.width = project.width + 'px'; $('canvas-wrap').style.height = project.height + 'px';
  $('dimensions').textContent = project.width + ' × ' + project.height + ' px · ' + Math.round(project.resolution) + ' ppi · '+(project.colorMode||'RGB');
  $('tab-size').textContent = project.width + ' × ' + project.height;
}
function applyView() {
  $('canvas-wrap').style.transform = 'translate(' + pan.x + 'px,' + pan.y + 'px) scale(' + zoom + ')';
  $('zoom-value').textContent = Math.round(zoom * 100) + '%';
  drawRulers(project, zoom, pan); rulers?.update(); brushCursor?.update(); render();
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
function render() { if(!documentOpen||workspace?.isHome())return;rulers?.update();renderPreview(display,project,undefined,true,{scale:zoom,pixelRatio:devicePixelRatio,pan,width:viewport.clientWidth,height:viewport.clientHeight});drawOverlay();typeEditor?.update(); }
function drawOverlay() {
  const ctx = overlay.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,overlay.width,overlay.height);ctx.scale(overlay.width/project.width,overlay.height/project.height);
  const layer = active();
  transformUI?.update();
  if (gesture?.kind !== 'move') snapping?.clear();
  const rect = cropRect || selection;
  if (rect) {
    ctx.save();
    if (cropRect) { ctx.fillStyle = '#0008'; ctx.beginPath(); ctx.rect(0, 0, project.width, project.height); ctx.rect(rect.x, rect.y, rect.width, rect.height); ctx.fill('evenodd'); }
    ctx.lineWidth = 1 / zoom; ctx.strokeStyle = '#fff';if(rect.canvas&&!cropRect)ctx.stroke(selectionOutline(rect));else ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = '#10151f'; ctx.setLineDash([5 / zoom, 5 / zoom]);if(rect.canvas&&!cropRect)ctx.stroke(selectionOutline(rect));else ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  }
  $('apply-crop').disabled = !rect; $('deselect').disabled = !rect;
  $('selection-size').textContent = rect ? rect.width + ' × ' + rect.height : '';
}
function setTool(next) {
  if(['move','text'].includes(next))transformSelected=true;
  if (next !== tool && typeEditor?.editing) typeEditor.finish();
  if (next !== 'crop') cropRect = null;
  tool = next;brushCursor?.update(); $('tool-name').textContent = toolNames[tool];
  selections?.update(tool);
  $('move-options').hidden = tool !== 'move'; $('text-options').hidden = tool !== 'text';
  $('type-options').hidden = tool !== 'text';
  if (tool === 'text' && active().type !== 'text') $('type-color').value = $('color').value;
  const paint = ['brush', 'eraser', 'rect', 'ellipse', 'gradient'].includes(tool);
  $('tool-color-label').hidden = !paint; $('brush-size').closest('label').hidden = !['brush', 'eraser'].includes(tool);
  $('brush-hardness').closest('label').hidden = !['brush', 'eraser'].includes(tool); $('brush-opacity').closest('label').hidden = !paint;
  $('gradient-color-option').hidden = tool !== 'gradient';
  document.querySelectorAll('[data-tool]').forEach(button => { button.classList.toggle('selected', button.dataset.tool === tool); button.setAttribute('aria-pressed', String(button.dataset.tool === tool)); });
  viewport.style.cursor = ['move', 'hand', 'text'].includes(tool) ? { move: 'default', hand: 'grab', text: 'text' }[tool] : 'crosshair';
  $('property-hint').textContent = ['brush', 'eraser'].includes(tool) ? '在选中的可见像素图层上绘画。文字请新建图层后绘画。' : tool === 'move' ? '拖动图层移动；拖动手柄自由缩放；Shift 等比。Alt 拖动复制 / 手柄中心缩放；Ctrl 暂停吸附；Esc 取消。' : tool === 'text' ? '单击创建点文字，拖出框创建段落文字；单击已有文字继续编辑。Ctrl+Enter 完成，Esc 取消。' : '选择图层后，可在这里修改它的属性。';
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
  if(!mask&&['fill','adjustment'].includes(item.type)){thumb.textContent=item.type==='fill'?'◩':'◐';thumb.style.background=item.fill?.color||'#555';thumb.ondblclick=e=>{e.stopPropagation();if(!busy)fillEditor.open(item);};}
  if (!mask && item.type === 'text') thumb.ondblclick = e => { e.stopPropagation(); if (!busy) typeEditor.begin(item); };
  return thumb;
}
function refresh(rebuild = true) {
  if(!documentOpen||workspace?.isHome())return;
  const layer = active(), target = editSurface(), locked = isLocked(project, layer);
  $('layer-count').textContent = project.layers.length + ' 个图层';
  $('undo').disabled = history.undoStack.length === 0; $('redo').disabled = history.redoStack.length === 0;
  $('layer-type').textContent = layer.type === 'text' ? '文字图层' : layer.type === 'group' ? '图层组' : layer.type==='fill'?'填充图层':layer.type==='adjustment'?'调整图层':'像素图层';
  $('layer-x').value = Math.round(target.x); $('layer-y').value = Math.round(target.y);
  $('layer-scale').value = Math.round(target.scale * 100);$('layer-scale-y').value=Math.round((target.scaleY??target.scale)*100); $('layer-rotation').value = Math.round(target.rotation);
  $('layer-opacity').value = Math.round(layer.opacity * 100); $('blend').value = layer.blend;
  $('blend').querySelector('[value="pass-through"]').disabled = layer.type !== 'group';
  $('text-properties').hidden = layer.type !== 'text' || editTarget === 'mask';
  $('edit-target-label').textContent = editTarget === 'mask' ? '正在编辑：图层蒙版' : '';
  for (const el of document.querySelectorAll('.properties input,.properties select,.properties textarea,#blend,#layer-opacity,#bold')) el.disabled = locked;
  if (['group','adjustment'].includes(layer.type) && editTarget !== 'mask') ['layer-x', 'layer-y', 'layer-scale', 'layer-scale-y','layer-rotation'].forEach(id => $(id).disabled = true);
  if (layer.type === 'text') { $('text-content').value = layer.text; if (![...$('font').options].some(o => o.value === layer.font)) $('font').add(new Option(layer.font,layer.font)); $('font').value = layer.font; $('font-size').value = layer.fontSize; $('text-color').value = layer.color; $('bold').classList.toggle('active', layer.bold); $('text-leading').value = layer.lineHeight || 1.35; $('text-spacing').value = layer.letterSpacing || 0; }
  fonts?.update(); if(layer.type==='text'){ $('font-style').value=`${layer.bold?700:layer.fontWeight||400}:${!!layer.italic}`;$('italic').classList.toggle('active',!!layer.italic);$('underline').classList.toggle('active',!!layer.underline);document.querySelectorAll('[data-align]').forEach(b=>b.classList.toggle('active',b.dataset.align===(layer.align||'left')));}
  typeEditor?.update();
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
        if (hasEffects(item)) { const fx = document.createElement('button'); fx.className = 'fx-badge'; fx.textContent = 'fx'; fx.setAttribute('aria-label',item.name+'的图层样式'); fx.onclick = e => { e.stopPropagation(); selectLayer(item); command('layerStyles'); }; row.append(fx); }
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
  const output = await result(api.saveProject(serialize(project), saveAs));
  if (!output) return false;
  name = output.name;path=output.path;setDirty(false);workspace?.remember(path);toast('项目已保存：' + output.path); return true;
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
function editable() {
  if(!documentOpen)return false; if (isLocked(project, active())) { toast('当前图层已锁定，请先解锁。'); return false; } return true; }
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
async function command(action,file=null) {
  if (action === 'selectAll' && document.activeElement?.matches('input,textarea')) { document.activeElement.select(); return; }
  if (typeEditor?.editing && ['undo','redo'].includes(action) && document.activeElement?.matches('input,textarea')) { document.execCommand(action); return; }
  if (busy || gesture || document.querySelector('dialog[open]')) return;
  if((!documentOpen||workspace?.isHome())&&!['new','open','close','help'].includes(action)&&!action.startsWith('panel'))return;
  if (typeEditor?.editing) typeEditor.finish();
  // Commit a pending text change before a menu accelerator operates on it.
  if (document.activeElement?.matches('input,textarea,select')) document.activeElement.blur();
  setBusy(true);
  document.body.dataset.commandSerial = String(Number(document.body.dataset.commandSerial || 0) + 1);
  try {
    if (advancedCommand(action, { project, checkpoint, changed, toast, capacity, selected: selectedIds, target: editTarget, setTarget, selection })) return;
    if (action.startsWith('panel')) { showPanel(action.slice(5).toLowerCase()); return; }
    if (action === 'toggleSnap') { snapping.toggle(); return; }
    if(rulers?.command(action))return;
    if(action==='createFill'){fillEditor.menu();return;}
    if (action === 'textTool') { setTool('text'); return; }
    if (action === 'freeTransform') { transformSelected=true;setTool('move'); $('show-transform').checked = true; drawOverlay(); toast('拖动手柄自由缩放；Shift 等比 · Alt 中心变换 · Esc 取消'); return; }
    if (action === 'new') { newDocument.open(); }
    else if (action === 'open') {
      const opened = await result(api.openProject(file)); if (!opened) return;
      const already=workspace.findPath(opened.path);if(already){workspace.activate(already.id,true);toast('项目已在标签页中打开');return;}
      if (opened.requiresConversion) {
        const dialog = $('psd-warning-dialog'); $('psd-warning-text').textContent = opened.warnings.join('\n'); dialog.querySelector('[data-psd-choice="flatten"]').disabled = !opened.preview; dialog.returnValue = 'cancel'; dialog.showModal();
        const choice = await new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true })); if (choice === 'cancel') return; if (choice === 'flatten') opened.project = opened.preview;
      }
      if(opened.project.colorMode==='CMYK')await initColorProfile(opened.project.colorProfile.data);
      const loaded = await deserialize(opened.project);workspace.beginNew();documentOpen=true;document.body.classList.remove('no-document');project = loaded; name = opened.name; selection = cropRect = null;path=opened.source==='psd'?null:opened.path;sourcePath=opened.path;history=new History();transformSelected=true;
      selectedIds.clear(); selectedIds.add(project.activeId); setTarget('image');
      api.commitDocument({kind:'activate',path});resizeCanvas();dirty=opened.source==='psd';fit();refresh();workspace.add();setDirty(dirty);workspace.remember(opened.path);$('canvas-tip').hidden = true;toast(opened.source === 'psd' ? 'PSD 已打开' + (opened.warnings.length ? '：' + opened.warnings.join('；') : '') : '项目已打开');
    } else if (action === 'save' || action === 'saveAs') await save(action === 'saveAs');
    else if (action === 'import') await importImages(await result(api.importImages()));
    else if (action === 'export') $('export-dialog').showModal();
    else if (action === 'help') $('help-dialog').showModal();
    else if (action === 'imageSize' || action === 'canvasSize') openSize(action === 'imageSize' ? 'image' : 'canvas');
    else if(action==='removeBackground'||action==='selectSubject')cutout.open({mode:action==='selectSubject'?'selection':'mask'});
    else if (action === 'adjust') openAdjustment();
    else if(action.startsWith('blur:'))blur.open(action.slice(5));
    else if (action === 'layerStyles') {if(active().type==='adjustment')toast('调整图层请先向下合并，再添加 FX。');else layerStyles.open();}
    else if (action === 'clearStyles') { if (!editable()) return; checkpoint(); delete active().styles; delete active().psdEffects; active().stylesModified = true; changed('已清除图层样式'); }
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
      if (!editable() || !['text','fill'].includes(active().type)) return;
      const old = active(), next = rasterize(old); replacementCapacity([old], next.canvas.width, next.canvas.height);
      checkpoint(); project.layers[project.layers.indexOf(old)] = next; changed('文字已栅格化，撤销可恢复可编辑文字');
    } else if (action === 'copyMerged') {
      const rect = selection || { x: 0, y: 0, width: project.width, height: project.height };
      const copy = canvas(rect.width, rect.height); const ctx=copy.getContext('2d');ctx.drawImage(composite(project), -rect.x, -rect.y);if(selection?.canvas){ctx.globalCompositeOperation='destination-in';ctx.drawImage(selection.canvas,0,0);}
      await result(api.copyImage(copy.toDataURL('image/png'))); toast('已将可见画面复制到 Windows 剪贴板');
    } else if (action === 'pasteImage') {
      const data = await result(api.pasteImage()); if (!data) { toast('剪贴板中没有图片。'); return; }
      await importImages([{ name: '剪贴板图片', data }]);
    } else if (action === 'undo' || action === 'redo') await travel(action === 'undo');
    else if (action === 'fit') fit();
    else if (action === 'actual') setZoom(1);
    else if (action === 'closeDocument') { if(await mayReplace()){dirty=false;workspace.remove();setDirty(documentOpen?dirty:false);} }
    else if (action === 'close') {const original=workspace.current();for(const doc of [...workspace.documents]){workspace.activate(doc.id,true);if(!await mayReplace()){if(original)workspace.activate(original,true);return;}dirty=false;workspace.capture();}api.setDirty(false);api.close();}
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
document.querySelectorAll('[data-tool]').forEach(button => button.onclick = () => { if (documentOpen&&!workspace?.isHome()&&!busy && !gesture) setTool(button.dataset.tool); });
document.querySelectorAll('[data-dismiss]').forEach(button => button.onclick = () => button.closest('dialog').close());
document.querySelectorAll('[data-choice]').forEach(button => button.onclick = () => $('confirm-dialog').close(button.dataset.choice));
let newProfile;
$('new-color-mode').addEventListener('change',()=>{newProfile=undefined;});
const newDocument = setupNewDocument(async settings => {
  let profile;
  if(settings.colorMode==='CMYK'){const data=newProfile||await result(api.colorProfile('system'));const p=await initColorProfile(data);profile={name:p.name,data};}
  newProject(settings.width, settings.height, settings.background, settings.title, settings.resolution,true,settings.colorMode,profile);
  $('canvas-tip').hidden = false;
});
$('new-profile-import').onclick=async()=>{try{const data=await result(api.colorProfile('custom'));if(data){const profile=await initColorProfile(data);newProfile=data;$('new-color-profile').replaceChildren(new Option(profile.name,profile.name));}}catch(e){toast(e.message);}};
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
    if (!documentOpen || isLocked(project, active()) || busy) { refresh(); return; }
    const value = convert($(id).value);
    const geometry = ['x', 'y', 'scale','scaleY', 'rotation'].includes(key), target = geometry ? editSurface() : active();
    if (geometry && active().type === 'group' && editTarget !== 'mask') { refresh(); return; }
    if (value === undefined || value === target[key]) { refresh(); return; }
    try { if (!typeEditor.owns(target)) checkpoint(); if(key==='font')delete target.psdFont; if (target.type === 'text' && ['font','fontSize','color','lineHeight','letterSpacing'].includes(key)) clearTextCache(target); if (target === active() && geometry) transformLayer(target, { [key]: value }); else { target[key] = value; if (target === active().mask) invalidatePixels(target); } changed(); }
    catch (error) { refresh(); toast(error.message); }
  });
}
const numeric = (min, max, divisor = 1) => value => value !== '' && Number.isFinite(Number(value)) ? clamp(Number(value), min, max) / divisor : undefined;
updateProperty('layer-x', 'x', numeric(-100000, 100000));
updateProperty('layer-y', 'y', numeric(-100000, 100000));
updateProperty('layer-scale-y','scaleY',numeric(1,10000,100));
updateProperty('layer-scale', 'scale', numeric(1, 10000, 100));
updateProperty('layer-rotation', 'rotation', numeric(-36000, 36000));
updateProperty('layer-opacity', 'opacity', numeric(0, 100, 100));
updateProperty('blend', 'blend');
updateProperty('font', 'font'); updateProperty('font-size', 'fontSize', numeric(1, 1000));
updateProperty('text-color', 'color');
updateProperty('text-leading','lineHeight',numeric(.5,5)); updateProperty('text-spacing','letterSpacing',numeric(-100,1000));
let textSession = false;
$('text-content').addEventListener('focus', () => { textSession = false; });
$('text-content').addEventListener('input', () => {
  if (busy || isLocked(project, active()) || active().type !== 'text' || active().text === $('text-content').value) return;
  if (!textSession && !typeEditor.owns(active())) { checkpoint(); textSession = true; }
  clearTextCache(active());
  active().text = $('text-content').value; setDirty(true); render();
  $('undo').disabled = false; $('redo').disabled = true;
});
$('bold').onclick = () => { if (active().type !== 'text' || isLocked(project, active()) || busy) return; if (!typeEditor.owns(active())) checkpoint(); clearTextCache(active()); active().bold = !active().bold;active().fontWeight=active().bold?700:400; changed(); };
$('brush-opacity').oninput = () => $('brush-opacity-value').textContent = $('brush-opacity').value + '%';
$('zoom-in').onclick = () => setZoom(zoom * 1.25); $('zoom-out').onclick = () => setZoom(zoom / 1.25);
viewport.addEventListener('wheel', event => {
  event.preventDefault(); if (gesture) return;
  const rect = viewport.getBoundingClientRect();
  setZoom(zoom * Math.exp(-event.deltaY * .0015), { x: event.clientX - rect.left, y: event.clientY - rect.top });
}, { passive: false });
function point(event) {
  const rect = viewport.getBoundingClientRect();
  return { x: Math.round((event.clientX - rect.left - pan.x) / zoom * 1e6)/1e6, y: Math.round((event.clientY - rect.top - pan.y) / zoom * 1e6)/1e6 };
}
function paintStroke(g, p) {
  const current = p, previous = g.last || current;
  const ctx = g.stroke.getContext('2d');
  ctx.save(); const origin=localPoint(g.layer,{x:0,y:0}); ctx.transform(...inverse(affine(g.layer)),origin.x,origin.y); ctx.strokeStyle = g.color; ctx.fillStyle = g.color; ctx.lineWidth = g.size;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(current.x, current.y); ctx.stroke();
  ctx.beginPath(); ctx.arc(current.x, current.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  const target = g.layer.canvas.getContext('2d');
  target.clearRect(0, 0, g.layer.canvas.width, g.layer.canvas.height); target.drawImage(g.before, 0, 0);
  target.save(); clipSelection(target, g.layer, selection); target.globalCompositeOperation = g.kind === 'eraser' && !g.mask ? 'destination-out' : 'source-over'; target.globalAlpha = g.opacity;
  target.filter = `blur(${g.size / g.layer.scale * .15 * (1 - g.hardness / 100)}px)`; target.drawImage(g.stroke, 0, 0); target.restore();
  invalidatePixels(g.layer); g.last = current; render();
}
viewport.addEventListener('pointerdown', event => {
  if (!documentOpen || busy || gesture || (event.button !== 0 && event.button !== 1)) return;
  if (typeEditor.editing) typeEditor.finish();
  viewport.focus(); const p = point(event);
  if (tool === 'hand' || space || event.button === 1) {
    gesture = { kind: 'pan', startX: event.clientX, startY: event.clientY, pan: { ...pan } };
  } else {
    if (p.x < 0 || p.y < 0 || p.x >= project.width || p.y >= project.height) {transformSelected=false;drawOverlay();return;}
    transformSelected=true;
    if (tool === 'move' && $('auto-select').checked) {
      let found = hitLayer(project, p);
      if (found && $('auto-select-mode').value === 'group') found = ancestors(project, found).at(-1) || found;
      if (found && !selectedIds.has(found.id) && !ancestors(project,found).some(a=>selectedIds.has(a.id))) selectLayer(found);
    }
    const layer = active();
    if (tool === 'eyedropper') {
      const pixel = display.getContext('2d').getImageData(Math.floor((p.x-Number(display.dataset.originX||0))*display.width/Number(display.dataset.worldWidth||project.width)), Math.floor((p.y-Number(display.dataset.originY||0))*display.height/Number(display.dataset.worldHeight||project.height)), 1, 1).data;
      if (pixel[3]) {$('color').value = '#' + [...pixel].slice(0, 3).map(x => x.toString(16).padStart(2, '0')).join('');rememberColor($('color').value,'color');} colorSwatches();
      return;
    }
    if (tool === 'text') {
      const found = [...project.layers].reverse().find(l => { if (l.type !== 'text' || !isVisible(project,l)) return false; const q = localPoint(l,p), b = bounds(l); return q.x>=0 && q.y>=0 && q.x<=b.width && q.y<=b.height; });
      if (found && !event.altKey) { typeEditor.begin(found); return; }
      gesture = {kind:'textCreate',start:p,end:p};
    }
    else if(['quickSelect','wand'].includes(tool)){gesture=selections.begin(p,event,tool);if(tool==='wand'&&gesture){const g=gesture;gesture=null;selections.finish(g);return;}}
    else if (tool === 'select' || tool === 'crop'||tool==='objectSelect') {
      gesture = { kind: tool, start: p, end: p,oldSelection:selection,mode:selections.mode(event) };
    } else if (['rect', 'ellipse', 'gradient'].includes(tool)) {
      try { if (editTarget !== 'mask') capacity(project.width, project.height); else if (!pixelEditable()) return; } catch (error) { toast(error.message); return; }
      gesture = { kind: tool, start: p, end: p, color: editTarget === 'mask' ? grayColor($('color').value) : $('color').value, endColor: editTarget === 'mask' ? grayColor($('gradient-color').value) : $('gradient-color').value, mask: editTarget === 'mask', opacity: Number($('brush-opacity').value) / 100 };
    } else {
      if (!editable()) return;
      if (!isVisible(project, layer)) { toast('请先显示当前图层。'); return; }
      if (tool === 'move') { try { gesture = snapping.begin(layer,p,editTarget === 'mask' && !layer.mask.linked&&!event.altKey,event.altKey); } catch(error) {toast(error.message);return;} }
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
  else if (g.kind === 'transform') { try { transformUI.move(g,p,event.shiftKey); } catch (error) { toast(error.message); } }
  else if(g.kind==='pixelSelect')selections.move(g,p);
  else if (g.kind === 'move') {
    try { snapping.move(g,p,event.ctrlKey); } catch(error) {toast(error.message);}
  } else if (['brush', 'eraser'].includes(g.kind)) paintStroke(g, p);
  else {
    g.end = { x: clamp(p.x, 0, project.width), y: clamp(p.y, 0, project.height) };
    if (g.kind === 'textCreate') { drawOverlay(); const rect = rectangle(g.start,g.end), ctx = overlay.getContext('2d'); ctx.strokeStyle = '#6eacff'; ctx.lineWidth = 1/zoom; ctx.strokeRect(rect.x,rect.y,rect.width,rect.height); }
    else if (g.kind === 'select' || g.kind === 'crop'||g.kind==='objectSelect') {
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
  if (g.kind === 'textCreate') { const rect = rectangle(g.start,g.end), paragraph = rect.width*zoom>5 && rect.height*zoom>5; try { typeEditor.create(paragraph ? rect : {...rect,x:g.start.x,y:g.start.y},paragraph); $('canvas-tip').hidden = true; } catch (error) { toast(error.message); } }
  else if(g.kind==='pixelSelect')selections.finish(g);
  else if(g.kind==='objectSelect'){selection=g.oldSelection;const rect=rectangle(g.start,g.end);if(rect.width>1&&rect.height>1){const found=hitLayer(project,{x:rect.x+rect.width/2,y:rect.y+rect.height/2});if(found?.type==='raster')selectLayer(found);const l=active(),points=[[rect.x,rect.y],[rect.x+rect.width,rect.y],[rect.x,rect.y+rect.height],[rect.x+rect.width,rect.y+rect.height]].map(([x,y])=>localPoint(l,{x,y})),x=Math.max(0,Math.floor(Math.min(...points.map(p=>p.x)))),y=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y))));if(l.canvas)cutout.open({mode:'selection',selectionMode:g.mode,region:{x,y,width:Math.min(l.canvas.width-x,Math.ceil(Math.max(...points.map(p=>p.x)))-x),height:Math.min(l.canvas.height-y,Math.ceil(Math.max(...points.map(p=>p.y)))-y)},autoRun:true});}drawOverlay();}
  else if (['transform','move'].includes(g.kind) && event?.type === 'pointercancel') (g.kind === 'move' ? snapping : transformUI).cancel(g);
  else if (g.kind === 'select' || g.kind === 'crop'||g.kind==='objectSelect') {
    const rect = rectangle(g.start, g.end);
    if (g.kind === 'crop') cropRect = rect.width && rect.height ? rect : null;
    else { selection = rect.width && rect.height ? rect : null; cropRect = null; }
    drawOverlay(); $('status').textContent = g.kind === 'crop' ? 'Enter 或上方“裁剪”应用，Esc 取消' : '选区已建立，绘画、填充和调整将限制在选区内';
  } else if (['rect', 'ellipse', 'gradient'].includes(g.kind)) {
    if (g.kind === 'gradient' ? Math.hypot(g.start.x - g.end.x, g.start.y - g.end.y) >= 1 : Math.abs(g.start.x - g.end.x) >= 1 && Math.abs(g.start.y - g.end.y) >= 1) {
      checkpoint(); try { if (g.mask) expandMask(project, active(), capacity); } catch (error) { toast(error.message); return; }
      const layer = g.mask ? editSurface() : rasterLayer({ rect: '矩形', ellipse: '椭圆', gradient: '渐变' }[g.kind], project.width, project.height);
      const ctx = layer.canvas.getContext('2d'); ctx.save(); clipSelection(ctx, layer, selection);
      if (g.mask) { const origin = localPoint(layer, { x: 0, y: 0 }); ctx.transform(...inverse(affine(layer)), origin.x, origin.y); }
      if (g.kind === 'gradient') gradientPath(ctx, g); else shapePath(ctx, g); ctx.restore();
      if (!g.mask) { layer.parentId = active().type === 'group' ? active().id : active().parentId || null; project.layers.push(layer); canonicalize(project); project.activeId = layer.id; setTarget('image'); } else invalidatePixels(layer); changed(g.mask ? '已更新蒙版' : '已创建' + layer.name + '图层');
    } else drawOverlay();
  } else if (g.kind !== 'pan' && (g.kind !== 'move' || g.committed)) changed();
}
viewport.addEventListener('pointerup', finishGesture); viewport.addEventListener('pointercancel', finishGesture);
window.addEventListener('blur', () => { space = false; finishGesture(); });
window.addEventListener('keydown', event => {
  if (['transform','move'].includes(gesture?.kind) && event.key === 'Escape') { event.preventDefault(); const g = gesture; gesture = null; (g.kind === 'move' ? snapping : transformUI).cancel(g); return; }
  if(!event.defaultPrevented&&event.ctrlKey&&event.key.toLowerCase()==='w'){event.preventDefault();command('closeDocument');return;}
  if(!documentOpen||workspace?.isHome())return;
  if (event.isComposing || event.target.matches('input,textarea,select') || event.target.closest('[role=menu]') || document.querySelector('dialog[open]')) return;
  if (event.code === 'Space') { event.preventDefault(); space = true; return; }
  // Menu accelerators own Ctrl combinations in Electron.
  if (event.ctrlKey || event.metaKey || event.altKey || busy || gesture) return;
  const shortcuts = { w:'objectSelect',v: 'move', m: 'select', c: 'crop', g: 'gradient', b: 'brush', e: 'eraser', t: 'text', u: 'rect', o: 'ellipse', i: 'eyedropper', h: 'hand' };
  if (shortcuts[event.key.toLowerCase()]) setTool(shortcuts[event.key.toLowerCase()]);
  if (event.key.toLowerCase() === 'x') $('swap-colors').click();
  if (event.key.toLowerCase() === 'd') { $('color').value = '#000000'; $('gradient-color').value = '#ffffff';$('gradient-color').dispatchEvent(new Event('input',{bubbles:true}));$('color').dispatchEvent(new Event('input',{bubbles:true})); colorSwatches(); }
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
    if(!documentOpen||workspace?.isHome()){const image=await decodeImage(images[0].data);newProject(image.width,image.height,'transparent',images[0].name.replace(/\.[^.]+$/,''));}await importImages(images);
  } catch (error) { toast(error.message); } finally { setBusy(false); }
});
document.querySelectorAll('[data-psd-choice]').forEach(b => b.onclick = () => $('psd-warning-dialog').close(b.dataset.psdChoice));
setupColors(()=>editTarget==='mask');
setupShell(command, setTool, refresh);
selections=setupSelections({project:()=>project,active,display:()=>composite(project),selection:()=>selection,set:value=>{selection=value;cropRect=null;drawOverlay();},tool:setTool,command,busy:value=>{setBusy(value);if(value)document.querySelector('.optionsbar').inert=false;},toast});
const cutout=setupCutout({project:()=>project,active,api,snapshot,get history(){return history;},capacity,changed,render,putSelection:(mask,layer,kind)=>selections.fromMask(mask,layer,kind),target:setTarget,toast,locked:l=>isLocked(project,l)});
const fillEditor=setupFillEditor({project:()=>project,active,selection:()=>selection,api,snapshot,get history(){return history;},capacity,render,refresh,changed,toast});
const layerStyles = setupLayerStyles({active,snapshot,get history(){return history;},changed,render,refresh,toast,locked:l=>isLocked(project,l)});
const blur=setupBlur({active,selection:()=>selection,snapshot,history:()=>history,render,changed,toast,locked:l=>isLocked(project,l)});
typeEditor = setupTypeEditor({active,project:()=>project,snapshot,get history(){return history;},dirty:()=>dirty,setDirty,changed,render,refresh,checkpoint,capacity,select:selectLayer,tool:setTool,status:v=>$('status').textContent=v,focus:()=>viewport.focus(),locked:l=>isLocked(project,l)});
transformUI = setupTransformControls({active,project:()=>project,snapshot,get history(){return history;},dirty:()=>dirty,setDirty,render,refresh,point,target:()=>editTarget,selected:()=>selectedIds,view:()=>({pan,zoom}),busy:()=>busy||!!gesture,show:()=>documentOpen&&transformSelected&&$('show-transform').checked && ['move','text'].includes(tool) && !typeEditor.editing&&!document.querySelector('dialog[open]'),status:v=>$('status').textContent=v,begin:(event,g)=>{gesture=g;viewport.setPointerCapture(event.pointerId);viewport.focus();}});
rulers=setupRulers({project:()=>project,open:()=>documentOpen,view:()=>({pan,zoom}),snapshot,get history(){return history;},checkpoint,changed,draw:()=>drawRulers(project,zoom,pan),busy:()=>busy||!!gesture,status:v=>$('status').textContent=v});
snapping = setupSnapping({project:()=>project,selected:()=>selectedIds,snapshot,get history(){return history;},capacity,dirty:()=>dirty,setDirty,render,refresh,view:()=>({pan,zoom}),status:v=>$('status').textContent=v});
$('show-transform').onchange = ()=>{if($('show-transform').checked)transformSelected=true;drawOverlay();};
document.addEventListener('pointerdown',event=>{if(!documentOpen||busy||gesture||event.target.closest('.layer-row,#transform-controls,#show-transform,dialog'))return;const rect=$('canvas-wrap').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom){transformSelected=false;drawOverlay();}}); $('text-options').onclick = () => showPanel('properties');
for (const [id, key, divide] of [['mask-density', 'density', 100], ['mask-feather', 'feather', 1]]) $(id).addEventListener('change', () => {
  if (busy || !active().mask || !editable()) return; const value = Number($(id).value) / divide; if (!Number.isFinite(value)) return; checkpoint(); active().mask[key] = clamp(value, 0, key === 'density' ? 1 : 100); invalidatePixels(active().mask); changed();
});
$('export-format').onchange = () => { $('export-quality').closest('label').hidden = $('export-format').value !== 'jpeg'; }; $('export-format').onchange();
new ResizeObserver(() => { if (project) drawRulers(project, zoom, pan); }).observe(viewport);
brushCursor=setupBrushCursor({tool:()=>tool,zoom:()=>zoom,busy:()=>busy,open:()=>documentOpen,space:()=>space});
fonts=setupFonts(api,refresh,toast);
setupNumericScrubbing({busy:()=>busy||!!gesture,begin:input=>{if(!documentOpen||input.closest('dialog'))return null;numericTransaction={before:snapshot(),dirty,undo:[...history.undoStack],redo:[...history.redoStack],pushed:false};return numericTransaction;},end:async(cancel,transaction)=>{numericTransaction=null;if(cancel&&transaction?.pushed){project=await deserialize(transaction.before);history.undoStack=transaction.undo;history.redoStack=transaction.redo;setDirty(transaction.dirty);render();refresh();}}});
$('font-style').onchange=()=>{if(!documentOpen||active().type!=='text'||isLocked(project,active()))return;checkpoint();clearTextCache(active());const [weight,italic]=$('font-style').value.split(':');Object.assign(active(),{fontWeight:Number(weight),bold:Number(weight)>=700,italic:italic==='true'});changed();};
for(const [id,key] of [['italic','italic'],['underline','underline']])$(id).onclick=()=>{if(!documentOpen||active().type!=='text'||isLocked(project,active()))return;checkpoint();clearTextCache(active());active()[key]=!active()[key];changed();};
document.querySelectorAll('[data-align]').forEach(b=>b.onclick=()=>{if(!documentOpen||active().type!=='text'||isLocked(project,active()))return;checkpoint();clearTextCache(active());active().align=b.dataset.align;changed();});
workspace=setupWorkspace({capture:()=>({project,name,dirty,path,sourcePath,history,zoom,pan:{...pan},selection,cropRect,editTarget,selected:[...selectedIds],transformSelected}),
  canSwitch:()=>!busy&&!gesture&&!document.querySelector('dialog[open]')&&!typeEditor.editing,
  restore:doc=>{setTarget('image');({project,name,dirty,path,sourcePath,history,zoom,pan,selection,cropRect,transformSelected}=doc);documentOpen=true;document.body.classList.remove('no-document');selectedIds.clear();doc.selected.forEach(id=>selectedIds.add(id));setTarget(doc.editTarget);api.commitDocument({kind:'activate',path});resizeCanvas();applyView();render();refresh();updateTitle();api.setDirty(workspace.hasDirty());},
  empty:()=>{documentOpen=false;selection=cropRect=null;history=new History();selectedIds.clear();dirty=false;api.commitDocument({kind:'activate',path:null});document.body.classList.add('no-document');$('layer-list').replaceChildren();$('layer-count').textContent='0 个图层';$('dimensions').textContent='';snapping.clear();brushCursor.update();},
  close:id=>{if(workspace.activate(id))command('closeDocument');},open:file=>command('open',file),
  thumbnail:()=>{const thumb=canvas(240,150),ctx=thumb.getContext('2d'),ratio=Math.min(240/project.width,150/project.height);renderPreview(recentPreview,project,undefined,true,{scale:ratio});ctx.fillStyle='#282828';ctx.fillRect(0,0,240,150);ctx.drawImage(recentPreview,(240-project.width*ratio)/2,(150-project.height*ratio)/2,project.width*ratio,project.height*ratio);return thumb.toDataURL('image/jpeg',.7);}
});
newProject(1280, 800, 'transparent', '未命名',72,false);documentOpen=false;document.body.classList.add('no-document');workspace.showHome();
setTool('move');
setBusy(false);
new ResizeObserver(() => { if (project && !gesture) fit(); }).observe(viewport);
requestAnimationFrame(() => requestAnimationFrame(() => { $('startup-screen').hidden = true; api.rendererReady?.(); }));
