import { bounds, visualBounds, transformPoint } from './editor.js';
import { descendants, isLocked, isVisible } from './layer-tree.js';
import { transformLayer } from './advanced.js';
import { affine, inverse, multiply, vector, decompose } from './affine.mjs';
export function setupTransformControls(state) {
  const element = document.getElementById('transform-controls');
  const positions = { nw:[0,0],n:[.5,0],ne:[1,0],e:[1,.5],se:[1,1],s:[.5,1],sw:[0,1],w:[0,.5],rotate:[.5,0] };
  const names = { nw:'左上',n:'上边',ne:'右上',e:'右边',se:'右下',s:'下边',sw:'左下',w:'左边',rotate:'旋转' };
  let frame;
  function items() {
    const p = state.project(), active = state.active();
    if (state.target() === 'mask' && active.mask && !active.mask.linked) return [{ layer: active.mask, owner: active }];
    const selected = p.layers.filter(l => state.selected().has(l.id)); const all = new Set();
    for (const l of selected.length ? selected : [active]) { all.add(l); if (l.type === 'group') descendants(p, l.id).forEach(child => all.add(child)); }
    return [...all].filter(l => l.type !== 'group' || l.mask?.linked).map(l => ({ layer: l.type === 'group' ? l.mask : l, owner:l }));
  }
  function update() {
    const p = state.project(), l = state.active(), view = state.view();
    element.hidden = !state.show() || !l || l.type==='adjustment' || !isVisible(p,l); if (element.hidden) return;
    const moving = items(); if (!moving.length) { element.hidden = true; return; }
    if (moving.length === 1 && (l.type !== 'group' || state.target() === 'mask')) { const t = state.target() === 'mask' ? l.mask : l, size = visualBounds(t); if (size.empty) {element.hidden=true;return;} const pos = transformPoint(t,{x:size.x,y:size.y}); frame = {...t,...pos,width:size.width,height:size.height}; }
    else {
      const points = moving.filter(i => i.owner.type !== 'group' && isVisible(p,i.owner)).flatMap(({layer}) => { const b = visualBounds(layer); return b.empty ? [] : [[b.x,b.y],[b.x+b.width,b.y],[b.x+b.width,b.y+b.height],[b.x,b.y+b.height]].map(([x,y]) => transformPoint(layer,{x,y})); });
      if (!points.length) { element.hidden = true; return; }
      const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y)); frame = { x,y,scale:1,rotation:0,width:Math.max(1,Math.max(...points.map(p => p.x))-x),height:Math.max(1,Math.max(...points.map(p => p.y))-y) };
    }
    element.style.left = view.pan.x + frame.x * view.zoom + 'px'; element.style.top = view.pan.y + frame.y * view.zoom + 'px';
    const m=affine(frame),sx=Math.hypot(m[0],m[1]),sy=Math.hypot(m[2],m[3]);
    element.style.width = frame.width * sx * view.zoom + 'px'; element.style.height = frame.height * sy * view.zoom + 'px'; element.style.transform = `matrix(${[m[0]/sx,m[1]/sx,m[2]/sy,m[3]/sy].join(',')},0,0)`;
    const locked = moving.some(i => isLocked(p,i.owner)); element.querySelectorAll('button').forEach(b => b.disabled = locked);
  }
  function start(event, key) {
    if (state.busy() || event.button !== 0 || element.hidden) return;
    event.preventDefault(); event.stopPropagation(); const moving = items(); if (moving.some(i => isLocked(state.project(),i.owner))) return;
    const before = state.snapshot(), originals = moving.map(i => ({ ...i, original: { ...i.layer, mask:i.layer.mask ? {...i.layer.mask} : undefined } }));
    const [hx,hy] = positions[key], centered = event.altKey || key === 'rotate', pivot = transformPoint(frame,{ x:(centered ? .5 : 1-hx)*frame.width, y:(centered ? .5 : 1-hy)*frame.height });
    const handle = key === 'rotate' ? state.point(event) : transformPoint(frame,{x:hx*frame.width,y:hy*frame.height});
    state.begin(event,{kind:'transform',key,pivot,handle,frame:{...frame},start:state.point(event),originals,before,dirty:state.dirty(),undo:[...state.history.undoStack],redo:[...state.history.redoStack],committed:false});
  }
  for (const [key,[x,y]] of Object.entries(positions)) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.handle = key; b.style.left = x*100+'%'; b.style.top = y*100+'%'; b.setAttribute('aria-label',key === 'rotate' ? '旋转图层手柄' : names[key]+'缩放手柄'); b.title = key === 'rotate' ? '拖动旋转；Shift 按 15° 对齐' : '自由缩放；Shift 等比 · Alt 围绕中心';
    b.onpointerdown = event => start(event,key); element.append(b);
  }
  function move(g, point, shift) {
    let fx = 1, fy = 1, angle = 0, matrix;
    if (g.key === 'rotate') { angle = (Math.atan2(point.y-g.pivot.y,point.x-g.pivot.x)-Math.atan2(g.handle.y-g.pivot.y,g.handle.x-g.pivot.x))*180/Math.PI; angle = (angle+540)%360-180; if (shift) angle = Math.round(angle/15)*15; }
    else {
      const basis=affine(g.frame), inv=inverse(basis), from=vector(inv,{x:g.handle.x-g.pivot.x,y:g.handle.y-g.pivot.y}), to=vector(inv,{x:point.x-g.pivot.x,y:point.y-g.pivot.y});
      if (shift) fx=fy=Math.max(.001,(to.x*from.x+to.y*from.y)/Math.max(.0001,from.x*from.x+from.y*from.y));
      else { if (!['n','s'].includes(g.key)) fx=Math.max(.001,to.x/from.x); if (!['e','w'].includes(g.key)) fy=Math.max(.001,to.y/from.y); }
      matrix=multiply(multiply(basis,[fx,0,0,fy]),inv);
    }
    if (!g.committed && Math.abs(fx-1)<.00001 && Math.abs(fy-1)<.00001 && Math.abs(angle)<.001) return;
    if (g.key==='rotate') { const r=angle*Math.PI/180;matrix=[Math.cos(r),Math.sin(r),-Math.sin(r),Math.cos(r)]; }
    const plans = g.originals.map(i => { const o = i.original, v=vector(matrix,{x:o.x-g.pivot.x,y:o.y-g.pivot.y}), next = {...o,mask:o.mask ? {...o.mask} : undefined}; transformLayer(next,{x:g.pivot.x+v.x,y:g.pivot.y+v.y,...decompose(multiply(matrix,affine(o)))}); if (Math.abs(next.x)>100000 || Math.abs(next.y)>100000) throw new Error('变换超出允许范围。'); return {layer:i.layer,next}; });
    if (!g.committed) { state.history.push(g.before); g.committed = true; }
    plans.forEach(i => Object.assign(i.layer,i.next)); state.render(); state.status(`宽 ${Math.round(fx*100)}% · 高 ${Math.round(fy*100)}% · Shift 等比 · Esc 取消`);
  }
  function cancel(g) { for (const i of g.originals) {for(const key of Object.keys(i.layer))if(!Object.hasOwn(i.original,key))delete i.layer[key];Object.assign(i.layer,i.original);} if (g.committed) { state.history.undoStack=g.undo;state.history.redoStack=g.redo; } state.setDirty(g.dirty); state.render(); state.refresh(); state.status('已取消变换'); }
  return { update, move, cancel };
}
