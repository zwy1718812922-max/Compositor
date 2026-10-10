import { affine, multiply,vector,decompose } from './affine.mjs';
import { textLayer, bounds, textFont,canvas,localPoint,transformPoint } from './editor.js';
import { canonicalize, isVisible } from './layer-tree.js';
import { lastTextColor,rememberColor } from './colors.js';
const $ = id => document.getElementById(id);
const signature = l => JSON.stringify(['scaleY','skew','italic','fontWeight','underline','text','font','fontSize','color','bold','align','lineHeight','letterSpacing','textMode','boxWidth','boxHeight','paragraph','strike','flipX','flipY','x','y','scale','rotation','opacity','blend'].map(k => l[k]));
export function clearTextCache(layer) { if (layer.type === 'text' && layer.textRasterCache) { if(layer.textGeometry){const m=layer.textGeometry.matrix,a=affine(layer),matrix=multiply(a,m.slice(0,4)),measure=canvas(1,1).getContext('2d');measure.font=textFont(layer);measure.textBaseline='top';const ascent=measure.measureText('Mg').actualBoundingBoxAscent;measure.textBaseline='alphabetic';const baseline=measure.measureText('Mg').actualBoundingBoxAscent-ascent,origin=layer.textCacheOrigin||layer,offset=vector(a,{x:m[4]-origin.x,y:m[5]-origin.y}),top=vector(matrix,{x:0,y:-baseline});Object.assign(layer,{x:layer.x+offset.x+top.x,y:layer.y+offset.y+top.y,...decompose(matrix)});delete layer.textGeometry;} delete layer.canvas; delete layer.data; delete layer.textRasterCache; } }
export function setupTypeEditor(state) {
  let session = null,resize = null; const input = $('inline-text'),frame=document.createElement('div');frame.id='text-edit-frame';frame.hidden=true;input.before(frame);
  for(const handle of ['nw','n','ne','e','se','s','sw','w']){const button=document.createElement('button');button.dataset.textHandle=handle;button.setAttribute('aria-label','调整段落文字框 '+handle);button.onpointerdown=event=>{if(event.button||!session)return;event.preventDefault();event.stopPropagation();resize={handle,layer:{...session.layer}};button.setPointerCapture(event.pointerId);};frame.append(button);}
  frame.addEventListener('pointermove',event=>{if(!resize||!session)return;const {handle,layer}=resize,p=localPoint(layer,state.point(event)),minimum=Math.max(24,layer.fontSize),left=handle.includes('w')?Math.min(p.x,layer.boxWidth-minimum):0,top=handle.includes('n')?Math.min(p.y,layer.boxHeight-minimum):0,right=handle.includes('e')?Math.max(minimum,p.x):layer.boxWidth,bottom=handle.includes('s')?Math.max(minimum,p.y):layer.boxHeight,origin=transformPoint(layer,{x:left,y:top});Object.assign(session.layer,{x:origin.x,y:origin.y,boxWidth:Math.min(16384,right-left),boxHeight:Math.min(16384,bottom-top)});state.setDirty(true);state.render();state.refresh(false);});
  const stopResize=()=>{if(!resize)return;resize=null;input.focus();};frame.addEventListener('pointerup',stopResize);frame.addEventListener('pointercancel',stopResize);
  function option(id, value) { const select = $(id); if (![...select.options].some(o => o.value === value)) select.add(new Option(value,value)); select.value = value; }
  function update() {
    const l = state.active();
    if (l?.type === 'text') { option('type-font',l.font); $('type-size').value = l.fontSize; $('type-color').value = l.color; $('type-align').value = l.align || 'left'; $('type-bold').classList.toggle('active',l.bold); }
    $('type-cancel').hidden = $('type-commit').hidden = !session;
    if (!session) {frame.hidden=true;return;}
    const layer = session.layer, size = bounds(layer);
    if (input.value !== layer.text) input.value = layer.text;
    input.style.left = layer.x + 'px'; input.style.top = layer.y + 'px'; input.style.width = Math.max(24,size.width) + 'px'; input.style.height = Math.max(layer.fontSize * (layer.lineHeight || 1.35),size.height) + 'px'; input.style.font = textFont(layer); input.style.lineHeight = layer.lineHeight || 1.35; input.style.textAlign = layer.align || 'left'; input.style.letterSpacing = (layer.letterSpacing || 0)+'px'; input.style.caretColor = layer.color;
    input.style.color=layer.color;input.style.opacity=layer.opacity;input.style.textDecoration=[layer.underline?'underline':'',layer.strike?'line-through':''].filter(Boolean).join(' ')||'none';input.style.direction=layer.paragraph?.direction||'ltr';input.style.paddingLeft=(layer.paragraph?.leftIndent||0)+'px';input.style.paddingRight=(layer.paragraph?.rightIndent||0)+'px';input.style.textIndent=(layer.paragraph?.firstIndent||0)+'px';input.style.transform = `matrix(${affine(layer).join(',')},0,0)`; input.wrap = layer.textMode === 'paragraph' ? 'soft' : 'off'; input.style.whiteSpace = layer.textMode === 'paragraph' ? 'pre-wrap' : 'pre'; input.style.wordBreak = layer.textMode === 'paragraph' ? 'break-all' : 'normal';
    frame.hidden=layer.textMode!=='paragraph';frame.style.left=input.style.left;frame.style.top=input.style.top;frame.style.width=input.style.width;frame.style.height=input.style.height;frame.style.transform=input.style.transform;input.classList.toggle('paragraph-editing',!frame.hidden);
  }
  function finish(commit = true) {
    if (!session) return;
    const s = session; session = null;resize=null; input.hidden = frame.hidden = true; $('type-commit').hidden = $('type-cancel').hidden = true;
    const changed = signature(s.layer) !== s.signature;
    if (!commit || s.created && !s.layer.text.trim()) {
      if (s.created) { const p = state.project(); p.layers = p.layers.filter(l => l !== s.layer); p.activeId = s.before.activeId; }
      else { for(const key of Object.keys(s.layer))if(!Object.hasOwn(s.original,key))delete s.layer[key];Object.assign(s.layer,s.original); }
      state.select(state.active()); state.setDirty(s.dirty); state.render(); state.refresh(); state.status('已取消文字编辑');
    } else if (changed || s.created) {
      if (s.created || s.layer.name === '文字' || s.layer.name === '输入文字') s.layer.name = s.layer.text.split('\n')[0].slice(0,40) || '文字';
      state.history.push(s.before); state.changed('文字编辑完成，可再次用 T 工具单击修改');
    } else { for(const key of Object.keys(s.layer))if(!Object.hasOwn(s.original,key))delete s.layer[key];Object.assign(s.layer,s.original); state.setDirty(s.dirty); state.render(); state.refresh(); }
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
    const l = textLayer('输入文字',Math.round(rect.x),Math.round(rect.y),lastTextColor()); l.font = $('type-font').value; l.fontSize = Number($('type-size').value) || 64; l.bold = $('type-bold').classList.contains('active'); l.align = $('type-align').value; l.textMode = paragraph ? 'paragraph' : 'point';
    if (paragraph) { l.boxWidth = Math.max(l.fontSize,rect.width); l.boxHeight = Math.max(l.fontSize*1.35,rect.height); }
    l.parentId=state.parentAt?.(rect)??(current.type==='group'?current.id:current.parentId||null); p.layers.push(l); canonicalize(p); p.activeId = l.id;
    begin(l,true,before,dirty); state.changed('直接在画布上输入文字');
  }
  input.oninput = () => { if (!session) return; session.layer.text = input.value; state.setDirty(true); state.render(); update(); };
  input.onpointerdown = event => event.stopPropagation();
  input.onkeydown = event => { if (event.isComposing) return; if (event.key === 'Escape' || event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); finish(event.key !== 'Escape'); } };
  $('type-commit').onclick = () => finish(); $('type-cancel').onclick = () => finish(false);
  for (const [id,key,convert] of [['type-font','font',v=>v],['type-size','fontSize',v=>Number(v)],['type-color','color',v=>v],['type-align','align',v=>v]]) $(id).onchange = () => {
    const l = state.active(); if (l.type !== 'text' || state.locked(l) || !$(id).checkValidity()) return;
    if (!session) state.checkpoint(); clearTextCache(l); l[key] = convert($(id).value);if(key==='color')rememberColor(l.color,'text-color'); if (session) { state.setDirty(true); state.render(); state.refresh(); update(); input.focus(); } else state.changed();
  };
  $('type-bold').onclick = () => { const l = state.active(); if (l.type !== 'text') { $('type-bold').classList.toggle('active'); return; } if (state.locked(l)) return; if (!session) state.checkpoint(); clearTextCache(l); l.bold = !l.bold;l.fontWeight=l.bold?700:400; if (session) { state.setDirty(true); state.render(); state.refresh(); update(); } else state.changed(); };
  return { update, begin, create, finish, get editing() { return !!session; }, owns(layer) { return session?.layer === layer; } };
}
