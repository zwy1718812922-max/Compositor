import {showPanel} from './ui-shell.js';
const key='compositor.panels.v1';
export function setupPanels(){
 const dock=document.querySelector('main>aside'),inspector=dock.querySelector('.inspector'),entries=new Map(),floating=new Map();let drag,saved={};
 try{saved=JSON.parse(localStorage.getItem(key))||{};}catch{}
 for(const [name,label,element] of [['swatches','色板',document.getElementById('swatches-panel')],['properties','属性',document.getElementById('properties-panel')],['mask','蒙版',document.getElementById('mask-panel')],['brush','画笔',dock.querySelector('.brush-panel')],['layers','图层',dock.querySelector('.layers-panel')],['canvas','画布',document.querySelector('.workspace')]]){
  const marker=document.createComment('panel '+name);element.before(marker);entries.set(name,{name,label,element,marker});
 }
 function store(){const layout={width:dock.style.width,inspector:inspector.style.height,brush:entries.get('brush').element.style.height,floating:{}};for(const [name,box] of floating)layout.floating[name]={x:parseFloat(box.style.left),y:parseFloat(box.style.top),width:box.offsetWidth,height:box.offsetHeight};try{localStorage.setItem(key,JSON.stringify(layout));}catch{}}
 function raise(box){const others=[...floating.values()].filter(other=>other!==box).sort((a,b)=>Number(a.style.zIndex)-Number(b.style.zIndex));others.forEach((other,index)=>other.style.zIndex=40+index);box.style.zIndex=40+others.length;}
 function constrain(box,x,y){box.style.left=Math.max(0,Math.min(x,innerWidth-70))+'px';box.style.top=Math.max(42,Math.min(y,innerHeight-36))+'px';}
 function dockPanel(name){const box=floating.get(name);if(!box)return;const entry=entries.get(name);entry.marker.after(entry.element);box.remove();floating.delete(name);entry.element.classList.remove('floating-content');entry.element.hidden=false;if(['swatches','properties','mask'].includes(name))showPanel(name);if(name==='canvas')document.body.classList.remove('canvas-floating');store();}
 function undock(name,x,y,width,height){
  if(floating.has(name))return floating.get(name);const e=entries.get(name),box=document.createElement('section');box.className='floating-panel';box.dataset.floatingPanel=name;box.setAttribute('aria-label',e.label+'浮动面板');
  const header=document.createElement('header');header.className='floating-title';header.innerHTML='<span class="panel-grip" aria-hidden="true">⠿</span><span></span><span class="spacer"></span><button title="停靠回右侧" aria-label="停靠'+e.label+'面板">▣</button>';header.querySelector('span:nth-child(2)').textContent=e.label;header.querySelector('button').onclick=()=>dockPanel(name);
  if(name==='canvas')header.querySelector('button').title='停靠回工作区';
  const resize=document.createElement('button');resize.className='panel-resize';resize.title='拖动调整面板大小';resize.setAttribute('aria-label','调整'+e.label+'面板大小');
  box.append(header,e.element,resize);e.element.hidden=false;e.element.classList.add('floating-content');box.style.width=Math.max(230,width||(name==='canvas'?720:300))+'px';box.style.height=Math.max(150,height||(name==='canvas'?560:name==='layers'?430:360))+'px';document.body.append(box);floating.set(name,box);raise(box);constrain(box,x,y);
  if(name==='canvas')document.body.classList.add('canvas-floating');if(['swatches','properties','mask'].includes(name)){const next=['swatches','properties','mask'].find(n=>!floating.has(n));if(next)showPanel(next);}
  header.onpointerdown=event=>{if(event.button||event.target.closest('button'))return;event.preventDefault();drag={kind:'move',box,startX:event.clientX,startY:event.clientY,x:parseFloat(box.style.left),y:parseFloat(box.style.top)};header.setPointerCapture(event.pointerId);};
  resize.onpointerdown=event=>{if(event.button)return;event.preventDefault();drag={kind:'resize',box,startX:event.clientX,startY:event.clientY,width:box.offsetWidth,height:box.offsetHeight};resize.setPointerCapture(event.pointerId);};
  resize.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();box.style.width=Math.max(230,box.offsetWidth+(event.key==='ArrowRight'?10:event.key==='ArrowLeft'?-10:0))+'px';box.style.height=Math.max(150,box.offsetHeight+(event.key==='ArrowDown'?10:event.key==='ArrowUp'?-10:0))+'px';store();};
  box.addEventListener('pointerdown',()=>raise(box));return box;
 }
 function prepareDrag(handle,name){handle.title='拖动浮出面板，双击停靠';handle.addEventListener('pointerdown',event=>{if(event.button||event.target.closest('input,select'))return;drag={kind:'detach',name,handle,startX:event.clientX,startY:event.clientY};handle.setPointerCapture(event.pointerId);});handle.addEventListener('dblclick',()=>{if(floating.has(name))dockPanel(name);else{const r=handle.getBoundingClientRect();undock(name,r.left-320,r.top);store();}});}
 for(const name of ['swatches','properties','mask'])prepareDrag(inspector.querySelector('[data-panel='+name+']'),name);
 for(const name of ['brush','layers'])prepareDrag(entries.get(name).element.querySelector('.panel-tabs'),name);
 const canvasGrip=document.createElement('button');canvasGrip.id='canvas-panel-handle';canvasGrip.textContent='⠿';canvasGrip.setAttribute('aria-label','拖动画布窗口');entries.get('canvas').element.querySelector('.canvas-tab').prepend(canvasGrip);prepareDrag(canvasGrip,'canvas');
 const widthHandle=document.createElement('div');widthHandle.id='panel-dock-resize';widthHandle.setAttribute('role','separator');widthHandle.setAttribute('aria-label','调整面板区域宽度');dock.prepend(widthHandle);
 widthHandle.onpointerdown=event=>{if(event.button)return;event.preventDefault();drag={kind:'dockWidth',startX:event.clientX,width:dock.offsetWidth};widthHandle.setPointerCapture(event.pointerId);};
 for(const [name,element] of [['inspector',inspector],['brush',entries.get('brush').element]]){const splitter=document.createElement('div');splitter.className='panel-splitter';splitter.setAttribute('role','separator');splitter.setAttribute('aria-label','调整'+(name==='brush'?'画笔':'属性')+'面板高度');element.after(splitter);splitter.onpointerdown=event=>{if(event.button)return;event.preventDefault();drag={kind:'dockHeight',element,startY:event.clientY,height:element.offsetHeight};splitter.setPointerCapture(event.pointerId);};}
 document.addEventListener('pointermove',event=>{if(!drag)return;const d=drag,dx=event.clientX-d.startX,dy=event.clientY-d.startY;
  if(d.kind==='detach'&&Math.hypot(dx,dy)>6){const box=undock(d.name,event.clientX-100,event.clientY-12);drag={kind:'move',box,startX:event.clientX,startY:event.clientY,x:parseFloat(box.style.left),y:parseFloat(box.style.top),handle:d.handle};}
  else if(d.kind==='move')constrain(d.box,d.x+dx,d.y+dy);
  else if(d.kind==='resize'){d.box.style.width=Math.max(230,Math.min(innerWidth-20,d.width+dx))+'px';d.box.style.height=Math.max(150,Math.min(innerHeight-55,d.height+dy))+'px';}
  else if(d.kind==='dockWidth')dock.style.width=Math.max(235,Math.min(innerWidth*.5,d.width-dx))+'px';
  else if(d.kind==='dockHeight')d.element.style.height=Math.max(110,Math.min(innerHeight-260,d.height+dy))+'px';
 });
 const end=()=>{if(!drag)return;const moved=drag.kind!=='detach';drag=null;if(moved)store();};document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);
 document.addEventListener('compositor:show-panel',event=>{const box=floating.get(event.detail);if(box){box.hidden=false;raise(box);}});
 window.addEventListener('resize',()=>{for(const box of floating.values())constrain(box,parseFloat(box.style.left),parseFloat(box.style.top));});
 if(saved.width)dock.style.width=Math.max(235,Math.min(innerWidth*.5,parseFloat(saved.width)))+'px';if(saved.inspector)inspector.style.height=saved.inspector;if(saved.brush)entries.get('brush').element.style.height=saved.brush;
 for(const [name,position] of Object.entries(saved.floating||{}))if(entries.has(name)&&['x','y','width','height'].every(k=>Number.isFinite(position[k])))undock(name,position.x,position.y,position.width,position.height);
 function reset(){for(const name of [...floating.keys()])dockPanel(name);dock.style.width=inspector.style.height=entries.get('brush').element.style.height='';showPanel('swatches');store();}
 function show(name){if(floating.has(name)){const box=floating.get(name);box.hidden=false;raise(box);}else if(['swatches','properties','mask'].includes(name))showPanel(name);else entries.get(name)?.element.scrollIntoView({block:'nearest'});}
 return{reset,undock,dock:dockPanel,show};
}
