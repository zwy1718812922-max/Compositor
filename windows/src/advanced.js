import { hasEffects } from './effect-model.mjs';
import { canvas, groupLayer, layerSurface, invalidatePixels, updateLinkedMask, transformPoint, layerTransform } from './editor.js';
import { checkSize } from './operations.js';
import { childrenOf, descendants, ancestors, canonicalize, moveSibling, isLocked } from './layer-tree.js';

export const pixelCount = layer => (layer.type==='fill'?layer.width*layer.height:0)+ [layer, layer.mask].reduce((n, t) => n + (t?.canvas ? t.canvas.width * t.canvas.height : 0), 0);
export function expandMask(project, layer, capacity) {
  const m = layer.mask;
  if (!m) return;
  if (m.rotation === 0 && m.scale === 1 && (m.scaleY??1) === 1 && !m.skew && m.x <= 0 && m.y <= 0 && m.x + m.canvas.width >= project.width && m.y + m.canvas.height >= project.height) return;
  const points = [{ x: 0, y: 0 }, { x: m.canvas.width, y: 0 }, { x: 0, y: m.canvas.height }, { x: m.canvas.width, y: m.canvas.height }].map(p => transformPoint(m, p));
  const x = Math.floor(Math.min(0, ...points.map(p => p.x))), y = Math.floor(Math.min(0, ...points.map(p => p.y)));
  const width = Math.ceil(Math.max(project.width, ...points.map(p => p.x))) - x, height = Math.ceil(Math.max(project.height, ...points.map(p => p.y))) - y;
  checkSize(width, height); capacity(width * height - m.canvas.width * m.canvas.height, 1, 0);
  const pixels = canvas(width, height), ctx = pixels.getContext('2d');
  const gray = m.defaultColor; ctx.fillStyle = `rgb(${gray},${gray},${gray})`; ctx.fillRect(0, 0, width, height);
  ctx.translate(-x, -y); layerTransform(ctx, m); ctx.drawImage(m.canvas, 0, 0);
  Object.assign(m, { canvas: pixels, x, y, scale: 1, scaleY:1, skew:0, rotation: 0 }); invalidatePixels(m);
}
export function grayColor(color) {
  const rgb = color.slice(1).match(/../g).map(n => parseInt(n, 16));
  const value = Math.round(rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722);
  return `rgb(${value},${value},${value})`;
}
export function transformLayer(layer, values) {
  const previous = { ...layer }, next = { ...layer, ...values };
  if (values.scale !== undefined && values.scaleY === undefined && layer.scaleY !== undefined) next.scaleY = layer.scaleY * values.scale / layer.scale;
  if (layer.mask?.linked) {
    next.mask = { ...layer.mask }; updateLinkedMask(next, previous); const m = next.mask;
    if (Math.abs(m.x) > 100000 || Math.abs(m.y) > 100000 || m.scale < .01 || m.scale > 100 || Math.abs(m.rotation) > 36000) throw new Error('变换后蒙版超出限制，请先取消链接或栅格化。');
  }
  Object.assign(layer, next);
}
export function moveLayer(project, layer, dx, dy, maskOnly = false) {
  if (maskOnly) { layer.mask.x += dx; layer.mask.y += dy; invalidatePixels(layer.mask); return; }
  const moving = layer.type === 'group' ? descendants(project, layer.id).filter(l => l.type !== 'group') : [layer];
  const groupMasks = layer.type === 'group' ? [layer, ...descendants(project, layer.id).filter(l => l.type === 'group')] : [];
  if (moving.some(l => isLocked(project, l)) || groupMasks.some(l => isLocked(project, l))) throw new Error('组内有锁定图层，请先解锁。');
  for (const l of moving) if (Math.abs(l.x + dx) > 100000 || Math.abs(l.y + dy) > 100000 || l.mask?.linked && (Math.abs(l.mask.x + dx) > 100000 || Math.abs(l.mask.y + dy) > 100000)) throw new Error('位置超出限制。');
  for (const l of groupMasks) if (l.mask?.linked && (Math.abs(l.mask.x + dx) > 100000 || Math.abs(l.mask.y + dy) > 100000)) throw new Error('组蒙版位置超出限制。');
  for (const l of moving) transformLayer(l, { x: l.x + dx, y: l.y + dy });
  for (const l of groupMasks) if (l.mask?.linked) { l.mask.x += dx; l.mask.y += dy; invalidatePixels(l.mask); }
}
export function cloneLayer(layer, idMap) {
  const copy = { ...layer, id: idMap.get(layer.id), parentId: idMap.get(layer.parentId) || layer.parentId, locked: false };
  if (layer.canvas) { copy.canvas = canvas(layer.canvas.width, layer.canvas.height); copy.canvas.getContext('2d').drawImage(layer.canvas, 0, 0); }
  if (layer.mask) {
    copy.mask = { ...layer.mask, canvas: canvas(layer.mask.canvas.width, layer.mask.canvas.height), _surface: undefined };
    copy.mask.canvas.getContext('2d').drawImage(layer.mask.canvas, 0, 0);
  }
  if(layer.fill)copy.fill=structuredClone(layer.fill);if(layer.adjustment)copy.adjustment=structuredClone(layer.adjustment);delete copy._fill;
  if (layer.styles) copy.styles = structuredClone(layer.styles);
  return copy;
}
export function advancedCommand(action, state) {
  const actions = ['addMask', 'hideMask', 'toggleMask', 'linkMask', 'invertMask', 'deleteMask', 'applyMask', 'clipping', 'group', 'ungroup', 'duplicate', 'deleteLayer', 'raise', 'lower'];
  if (!actions.includes(action)) return false;
  const { project, checkpoint, changed, toast, capacity, selected, target, setTarget } = state;
  const layer = project.layers.find(l => l.id === project.activeId);
  const guard = () => { if (isLocked(project, layer)) throw new Error('当前图层或所属组已锁定，请先解锁。'); };
  guard();
  if (action === 'addMask' || action === 'hideMask') {
    if (layer.mask) { setTarget('mask'); toast('已选择现有蒙版。'); return true; }
    capacity(project.width, project.height, 0); checkpoint();
    const pixels = canvas(project.width, project.height), ctx = pixels.getContext('2d'), sel = state.selection;
    const hide = action === 'hideMask'; ctx.fillStyle = hide&&sel?'#ffffff':hide || sel ? '#000000' : '#ffffff'; ctx.fillRect(0, 0, pixels.width, pixels.height);
    if (sel) { ctx.fillStyle = hide ? '#000000' : '#ffffff';if(sel.canvas){if(hide){const temp=canvas(sel.width,sel.height),c=temp.getContext('2d');c.drawImage(sel.canvas,0,0);c.globalCompositeOperation='source-in';c.fillStyle='black';c.fillRect(0,0,temp.width,temp.height);ctx.drawImage(temp,sel.x,sel.y);}else ctx.drawImage(sel.canvas,sel.x,sel.y);}else ctx.fillRect(sel.x, sel.y, sel.width, sel.height); }
    layer.mask = { canvas: pixels, x: 0, y: 0, scale: 1, scaleY:1,skew:0, rotation: 0, defaultColor: hide || sel ? 0 : 255, density: 1, feather: 0, enabled: true, linked: true };
    setTarget('mask'); changed('已添加蒙版：黑色隐藏，白色显示。点击图像缩略图可返回图像编辑。');
  } else if (['toggleMask', 'linkMask', 'invertMask', 'deleteMask', 'applyMask'].includes(action)) {
    if (!layer.mask) throw new Error('请先为当前图层添加蒙版。');
    if(action==='applyMask'&&layer.type==='adjustment')throw new Error('调整图层请先向下合并，再应用蒙版。');
    if (action === 'applyMask' && layer.type === 'group') throw new Error('组蒙版请通过合并可见图层应用。');
    if (action === 'applyMask') capacity(project.width * project.height - pixelCount(layer), 1, 0);
    checkpoint(); const m = layer.mask;
    if (action === 'toggleMask') m.enabled = !m.enabled;
    else if (action === 'linkMask') m.linked = !m.linked;
    else if (action === 'invertMask') {
      const ctx = m.canvas.getContext('2d'), image = ctx.getImageData(0, 0, m.canvas.width, m.canvas.height);
      for (let i = 0; i < image.data.length; i += 4) { image.data[i] = image.data[i + 1] = image.data[i + 2] = 255 - image.data[i]; image.data[i + 3] = 255; }
      ctx.putImageData(image, 0, 0); m.defaultColor = 255 - m.defaultColor; invalidatePixels(m);
    } else if (action === 'applyMask') {
      const next = { ...layer, type: 'raster', canvas: layerSurface(project, layer), x: 0, y: 0, scale: 1, scaleY:1,skew:0, rotation: 0 };
      for (const key of ['fill','width','height','_fill','_pattern','mask', 'text', 'font', 'fontSize', 'bold', 'color', 'data', 'styles', 'psdEffects', 'textRasterCache', 'psdTextSource', 'textMode', 'fillOpacity']) delete next[key];
      project.layers[project.layers.indexOf(layer)] = next; setTarget('image');
    } else { delete layer.mask; setTarget('image'); }
    changed(action === 'applyMask' ? '蒙版已应用为像素，可撤销恢复' : '已更新图层蒙版');
  } else if (action === 'clipping') {
    const siblings = childrenOf(project, layer.parentId), index = siblings.indexOf(layer);
    if (!layer.clipping && (index === 0 || siblings.slice(0, index).every(l => l.clipping))) throw new Error('下方需要一个同组的基础图层。');
    const base = [...siblings.slice(0, index)].reverse().find(l => !l.clipping);
    if (!layer.clipping && [layer, base].some(l => l?.type === 'group' && l.blend === 'pass-through')) throw new Error('参与剪贴的图层组请先将混合模式设为“正常”。');
    checkpoint(); layer.clipping = !layer.clipping; changed(layer.clipping ? '已创建剪贴蒙版' : '已释放剪贴蒙版');
  } else if (action === 'group') {
    const chosen = project.layers.filter(l => selected.has(l.id) && !ancestors(project, l).some(a => selected.has(a.id)));
    if (!chosen.length) chosen.push(layer);
    if (chosen.some(l => (l.parentId || null) !== (layer.parentId || null) || isLocked(project, l))) throw new Error('请选择同一组内的未锁定图层。');
    const siblings = childrenOf(project, layer.parentId), positions = chosen.map(l => siblings.indexOf(l)).sort((a, b) => a - b);
    if (positions.at(-1) - positions[0] + 1 !== positions.length) throw new Error('请按 Ctrl 选择相邻图层后分组，以保持叠放顺序。');
    if (siblings[positions[0]].clipping) throw new Error('请同时选择剪贴蒙版的基础图层，再创建图层组。');
    if (ancestors(project, layer).length >= 9 || chosen.some(l => descendants(project, l.id).some(d => ancestors(project, d).length >= 9))) throw new Error('图层组最多嵌套 10 层。');
    capacity(0, 0); checkpoint(); const group = groupLayer('组 ' + (project.layers.filter(l => l.type === 'group').length + 1)); group.parentId = layer.parentId || null;
    project.layers.splice(Math.max(...chosen.map(l => project.layers.indexOf(l))) + 1, 0, group);
    chosen.forEach(l => { l.parentId = group.id; }); canonicalize(project); project.activeId = group.id; selected.clear(); selected.add(group.id); setTarget('image'); changed('已创建图层组；可拖动图层到文件夹，Ctrl 单击多选');
  } else if (action === 'ungroup') {
    if (layer.type !== 'group') throw new Error('请选择图层组。');
    if (layer.mask || hasEffects(layer) || (layer.fillOpacity ?? 1) !== 1 || layer.opacity !== 1 || layer.blend !== 'pass-through' || !layer.visible || layer.clipping) throw new Error('请先恢复组的穿透、100% 不透明度并移除组蒙版、图层样式及填充效果，才能取消分组而保持外观。');
    const children = childrenOf(project, layer.id);
    if (project.layers.length === 1) throw new Error('至少保留一个图层。');
    checkpoint(); children.forEach(l => { l.parentId = layer.parentId || null; }); project.layers = project.layers.filter(l => l !== layer); canonicalize(project);
    project.activeId = children.at(-1)?.id || project.layers.at(-1).id; setTarget('image'); changed('已取消图层分组');
  } else if (action === 'duplicate') {
    const roots=project.layers.filter(l=>selected.has(l.id)&&!ancestors(project,l).some(a=>selected.has(a.id)));if(!roots.length)roots.push(layer);
    const trees=roots.map(l=>[...(l.type==='group'?descendants(project,l.id):[]),l]),subtree=trees.flat();
    capacity(subtree.reduce((n,l)=>n+pixelCount(l),0),1,subtree.length);checkpoint();const ids=new Map(subtree.map(l=>[l.id,crypto.randomUUID()]));
    const batches=new Map();for(const tree of trees){const root=tree.at(-1),copies=tree.map(l=>cloneLayer(l,ids)),parent=root.parentId||null;copies.at(-1).name=(root.name+' 副本').slice(0,200);let batch=batches.get(parent);if(!batch){batch={copies:[]};batches.set(parent,batch);}batch.copies.push(...copies);batch.top=root;}
    for(const batch of batches.values())project.layers.splice(project.layers.indexOf(batch.top)+1,0,...batch.copies);
    const chosen=roots.find(root=>root===layer||root.type==='group'&&descendants(project,root.id).includes(layer))||roots.at(-1);
    canonicalize(project);project.activeId=ids.get(chosen.id);selected.clear();roots.forEach(l=>selected.add(ids.get(l.id)));setTarget(target);changed('已复制所选图层及蒙版');
  } else if (action === 'deleteLayer') {
    const roots=project.layers.filter(l=>selected.has(l.id)&&!ancestors(project,l).some(a=>selected.has(a.id)));if(!roots.length)roots.push(layer);
    const removed = roots.flatMap(l=>[...(l.type==='group'?descendants(project,l.id):[]),l]);
    if (removed.length === project.layers.length) throw new Error('至少保留一个图层。');
    if (removed.some(l => isLocked(project, l))) throw new Error('组内有锁定图层，请先解锁。');
    checkpoint(); project.layers = project.layers.filter(l => !removed.includes(l)); canonicalize(project); project.activeId = project.layers.at(-1).id; setTarget('image'); changed('已删除图层');
  } else {
    const siblings = childrenOf(project, layer.parentId), delta = action === 'raise' ? 1 : -1;
    if (siblings[siblings.indexOf(layer) + delta]) { checkpoint(); moveSibling(project, layer, delta); changed(); }
  }
  return true;
}
