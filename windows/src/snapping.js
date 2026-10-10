import { visualBounds, transformPoint } from './editor.js';
import { descendants, ancestors, isVisible, isLocked } from './layer-tree.js';
import { transformLayer } from './advanced.js';
import { snapBox, boxGap } from './snap-model.mjs';

function worldBox(layer) {
  const b = visualBounds(layer); if (b.empty) return null;
  const points = [[b.x,b.y],[b.x+b.width,b.y],[b.x+b.width,b.y+b.height],[b.x,b.y+b.height]].map(([x,y])=>transformPoint(layer,{x,y}));
  const x = Math.min(...points.map(p=>p.x)), y = Math.min(...points.map(p=>p.y));
  return { x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y,id:layer.id };
}
function union(boxes) {
  const x = Math.min(...boxes.map(b=>b.x)), y = Math.min(...boxes.map(b=>b.y));
  return { x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y };
}
export function setupSnapping(state) {
  const element = document.getElementById('smart-guides'), toggle = document.getElementById('snap-enabled');
  try { toggle.checked = localStorage.getItem('compositor.snap') !== 'false'; } catch {}
  function clear() { element.replaceChildren(); element.setAttribute('hidden',''); }
  toggle.onchange = () => { try { localStorage.setItem('compositor.snap', String(toggle.checked)); } catch {} clear(); };
  function begin(layer, point, maskOnly) {
    const p = state.project(), selected = p.layers.filter(l=>state.selected().has(l.id));
    const roots = (selected.length ? selected : [layer]).filter(l=>!ancestors(p,l).some(a=>state.selected().has(a.id)));
    const moving = new Set();
    if (maskOnly) moving.add(layer); else for (const l of roots) { moving.add(l); if (l.type === 'group') descendants(p,l.id).forEach(c=>moving.add(c)); }
    if ([...moving].some(l=>isLocked(p,l))) throw new Error('所选图层或组内图层已锁定，请先解锁。');
    const originals = [...moving].map(l=>({layer:l,original:{...l,mask:l.mask ? {...l.mask} : undefined}}));
    const boxes = originals.filter(i=>maskOnly || i.layer.type !== 'group' && isVisible(p,i.layer)).map(i=>worldBox(maskOnly ? i.layer.mask : i.layer)).filter(Boolean);
    const guides=(p.ruler?.guidesVisible===false?[]:p.guides||[]).map(g=>({axis:g.axis,x:g.axis==='x'?g.position:0,y:g.axis==='y'?g.position:0,width:g.axis==='x'?0:p.width,height:g.axis==='y'?0:p.height,canvas:true,guide:true}));
    const targets = [...guides,{x:0,y:0,width:p.width,height:p.height,canvas:true},...p.layers.filter(l=>l.type!=='group' && !moving.has(l) && isVisible(p,l)).map(worldBox).filter(Boolean)];
    return {kind:'move',start:point,maskOnly,originals,box:boxes.length ? union(boxes) : null,targets,before:state.snapshot(),dirty:state.dirty(),undo:[...state.history.undoStack],redo:[...state.history.redoStack],committed:false};
  }
  function move(g, point, bypass) {
    let dx = Math.round(point.x-g.start.x), dy = Math.round(point.y-g.start.y);
    let snap;
    if (toggle.checked && !bypass && g.box) { snap = snapBox(g.box,g.targets,dx,dy,6/state.view().zoom); dx = snap.dx; dy = snap.dy; }
    const plans = g.originals.map(({layer,original:o})=>{
      const next = {...o,mask:o.mask ? {...o.mask} : undefined};
      if (g.maskOnly) { next.mask.x += dx; next.mask.y += dy; }
      else if (o.type === 'group') { if (next.mask?.linked) { next.mask.x += dx; next.mask.y += dy; } }
      else transformLayer(next,{x:o.x+dx,y:o.y+dy});
      for (const t of [next,next.mask].filter(Boolean)) if (Math.abs(t.x)>100000 || Math.abs(t.y)>100000) throw new Error('位置超出限制。');
      return {layer,next};
    });
    if (!g.committed && (dx || dy)) { state.history.push(g.before); g.committed = true; }
    if (!g.committed) return;
    for (const {layer,next} of plans) Object.assign(layer,next);
    state.render(); draw(snap); state.status(`移动：${Math.round(dx)} / ${Math.round(dy)} 像素${snap?.hits.length ? ' · 已吸附' : ''} · Alt 暂停吸附 · Esc 取消`);
  }
  function cancel(g) {
    g.originals.forEach(i=>Object.assign(i.layer,i.original));
    if (g.committed) { state.history.undoStack=g.undo;state.history.redoStack=g.redo; }
    clear();state.setDirty(g.dirty);state.render();state.refresh();state.status('已取消移动');
  }
  function draw(snap) {
    clear(); if (!snap?.hits.length) return; element.removeAttribute('hidden');
    const {pan,zoom}=state.view(), b=snap.box, color='#ff43df';
    const node=(tag,attrs,text)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text)n.textContent=text;element.append(n);return n;};
    const line=(x1,y1,x2,y2,dashed=false)=>node('line',{x1:pan.x+x1*zoom,y1:pan.y+y1*zoom,x2:pan.x+x2*zoom,y2:pan.y+y2*zoom,stroke:color,'stroke-width':1,...(dashed?{'stroke-dasharray':'4 3'}:{})});
    const outline=r=>node('rect',{x:pan.x+r.x*zoom,y:pan.y+r.y*zoom,width:r.width*zoom,height:r.height*zoom,fill:'none',stroke:color,'stroke-width':1});
    const distance=(a,c,axis)=>{const gap=boxGap(a,c,axis);if(!gap || gap.end-gap.start<.5)return;const cross=axis==='x'?Math.min(a.y+a.height,c.y+c.height)+12/zoom:Math.min(a.x+a.width,c.x+c.width)+12/zoom;
      if(axis==='x'){line(gap.start,cross,gap.end,cross);line(gap.start,cross-4/zoom,gap.start,cross+4/zoom);line(gap.end,cross-4/zoom,gap.end,cross+4/zoom);}else{line(cross,gap.start,cross,gap.end);line(cross-4/zoom,gap.start,cross+4/zoom,gap.start);line(cross-4/zoom,gap.end,cross+4/zoom,gap.end);}
      const label=Math.round(gap.end-gap.start)+' 像素', x=pan.x+(axis==='x'?(gap.start+gap.end)/2:cross)*zoom,y=pan.y+(axis==='x'?cross:(gap.start+gap.end)/2)*zoom;
      const width=label.length*7+10;node('rect',{x:x-width/2,y:y-9,width,height:18,rx:2,fill:color});node('text',{x,y:y+4,'text-anchor':'middle',fill:'#fff','font-size':11,'font-family':'Microsoft YaHei, sans-serif','data-distance':Math.round(gap.end-gap.start)},label);
    };
    outline(b);
    for(const hit of snap.hits){const t=hit.target;
      if(hit.kind==='align'){if(hit.axis==='x')line(hit.value,Math.min(b.y,t.y)-8/zoom,hit.value,Math.max(b.y+b.height,t.y+t.height)+8/zoom,true);else line(Math.min(b.x,t.x)-8/zoom,hit.value,Math.max(b.x+b.width,t.x+t.width)+8/zoom,hit.value,true);}
      if(!t.canvas){outline(t);distance(b,t,hit.axis==='x'?'y':'x');}
      if(hit.pair){outline(hit.pair);distance(hit.pair,t,hit.axis);distance(b,t,hit.axis);distance(b,hit.pair,hit.axis);}
    }
  }
  return {begin,move,cancel,clear,toggle:()=>{toggle.checked=!toggle.checked;toggle.onchange();}};
}
