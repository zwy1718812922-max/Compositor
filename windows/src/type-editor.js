import { textLayer, bounds, textFont } from './editor.js';
import { canonicalize, isVisible } from './layer-tree.js';
const $ = id => document.getElementById(id);
const signature = l => JSON.stringify(['text','font','fontSize','color','bold','align','lineHeight','letterSpacing','textMode','boxWidth','boxHeight','x','y','scale','rotation','opacity','blend'].map(k => l[k]));
export function clearTextCache(layer) { if (layer.type === 'text' && layer.textRasterCache) { delete layer.canvas; delete layer.data; delete layer.textRasterCache; } }
export function setupTypeEditor(state) {
  let session = null; const input = $('inline-text');
  function option(id, value) { const select = $(id); if (![...select.options].some(o => o.value === value)) select.add(new Option(value,value)); select.value = value; }
  function update() {
    const l = state.active();
    if (l?.type === 'text') { option('type-font',l.font); $('type-size').value = l.fontSize; $('type-color').value = l.color; $('type-align').value = l.align || 'left'; $('type-bold').classList.toggle('active',l.bold); }
    $('type-cancel').hidden = $('type-commit').hidden = !session;
    if (!session) return;
    const layer = session.layer, size = bounds(layer);
    if (input.value !== layer.text) input.value = layer.text;
    input.style.left = layer.x + 'px'; input.style.top = layer.y + 'px'; input.style.width = Math.max(24,size.width) + 'px'; input.style.height = Math.max(layer.fontSize * (layer.lineHeight || 1.35),size.height) + 'px'; input.style.font = textFont(layer); input.style.lineHeight = layer.lineHeight || 1.35; input.style.textAlign = layer.align || 'left'; input.style.letterSpacing = (layer.letterSpacing || 0)+'px'; input.style.caretColor = layer.color;
    input.style.transform = `rotate(${layer.rotation}deg) scale(${layer.scale})`; input.wrap = layer.textMode === 'paragraph' ? 'soft' : 'off'; input.style.whiteSpace = layer.textMode === 'paragraph' ? 'pre-wrap' : 'pre'; input.style.wordBreak = layer.textMode === 'paragraph' ? 'break-all' : 'normal';
  }
  function finish(commit = true) {
    if (!session) return;
    const s = session; session = null; input.hidden = true; $('type-commit').hidden = $('type-cancel').hidden = true;
    const changed = signature(s.layer) !== s.signature;
    if (!commit || s.created && !s.layer.text.trim()) {
      if (s.created) { const p = state.project(); p.layers = p.layers.filter(l => l !== s.layer); p.activeId = s.before.activeId; }
      else { for (const key of Object.keys(s.layer)) if (!(key in s.original)) delete s.layer[key]; Object.assign(s.layer,s.original); }
      state.select(state.active()); state.setDirty(s.dirty); state.render(); state.refresh(); state.status('已取消文字编辑');
    } else if (changed || s.created) {
      if (s.created || s.layer.name === '文字' || s.layer.name === '输入文字') s.layer.name = s.layer.text.split('\n')[0].slice(0,40) || '文字';
      state.history.push(s.before); state.changed('文字编辑完成，可再次用 T 工具单击修改');
    } else { Object.assign(s.layer,s.original); state.setDirty(s.dirty); state.render(); state.refresh(); }
    update(); state.focus();
  }
  function begin(layer, created = false, before = state.snapshot(), previousDirty = state.dirty()) {
    if (session?.layer === layer) { input.focus(); return; }
    finish(); if (state.locked(layer) || !isVisible(state.project(),layer)) { state.status('请先显示并解锁文字图层。'); return; }
    state.select(layer); state.tool('text');
    session = { layer,created,before,dirty:previousDirty,original:{...layer},signature:signature(layer) }; clearTextCache(layer);
    input.value = layer.text; input.hidden = false; update(); state.render(); state.refresh(); input.focus(); input.select(); state.status('直接输入文字；Enter 换行，Ctrl+Enter 完成，Esc 取消');
  }
  function create(rect, paragraph) {
    state.capacity(); const before = state.snapshot(), dirty = state.dirty(), current = state.active(), p = state.project();
    const l = textLayer('输入文字',Math.round(rect.x),Math.round(rect.y),$('type-color').value); l.font = $('type-font').value; l.fontSize = Number($('type-size').value) || 64; l.bold = $('type-bold').classList.contains('active'); l.align = $('type-align').value; l.textMode = paragraph ? 'paragraph' : 'point';
    if (paragraph) { l.boxWidth = Math.max(24,rect.width); l.boxHeight = Math.max(24,rect.height); }
    l.parentId = current.type === 'group' ? current.id : current.parentId || null; p.layers.push(l); canonicalize(p); p.activeId = l.id;
    begin(l,true,before,dirty); state.changed('直接在画布上输入文字');
  }
  input.oninput = () => { if (!session) return; session.layer.text = input.value; $('text-content').value = input.value; state.setDirty(true); state.render(); update(); };
  input.onpointerdown = event => event.stopPropagation();
  input.onkeydown = event => { if (event.isComposing) return; if (event.key === 'Escape' || event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); finish(event.key !== 'Escape'); } };
  $('type-commit').onclick = () => finish(); $('type-cancel').onclick = () => finish(false);
  for (const [id,key,convert] of [['type-font','font',v=>v],['type-size','fontSize',v=>Number(v)],['type-color','color',v=>v],['type-align','align',v=>v]]) $(id).onchange = () => {
    const l = state.active(); if (l.type !== 'text' || state.locked(l) || !$(id).checkValidity()) return;
    if (!session) state.checkpoint(); clearTextCache(l); l[key] = convert($(id).value); if (session) { state.setDirty(true); state.render(); state.refresh(); update(); input.focus(); } else state.changed();
  };
  $('type-bold').onclick = () => { const l = state.active(); if (l.type !== 'text') { $('type-bold').classList.toggle('active'); return; } if (state.locked(l)) return; if (!session) state.checkpoint(); clearTextCache(l); l.bold = !l.bold; if (session) { state.setDirty(true); state.render(); state.refresh(); update(); } else state.changed(); };
  return { update, begin, create, finish, get editing() { return !!session; }, owns(layer) { return session?.layer === layer; } };
}
