export function setupRulers(state) {
 const viewport=document.getElementById('viewport'),overlay=document.createElement('div');overlay.id='guide-overlay';overlay.setAttribute('aria-label','可编辑参考线');viewport.append(overlay);let drag,menu;
 const settings=()=>state.project().ruler ||= {unit:'px',origin:{x:0,y:0},visible:true,guidesVisible:true,locked:false};
 const guides=()=>state.project().guides ||= [];
 function update() {
  const p=state.project();if(!p)return;const s=settings(),{zoom,pan}=state.view();document.querySelector('.ruler-workspace').classList.toggle('rulers-hidden',!s.visible);overlay.hidden=!s.guidesVisible;
  overlay.replaceChildren();for(const g of guides()){const line=document.createElement('div');line.className='document-guide '+g.axis;line.dataset.guide=g.id;line.dataset.position=String(g.position);line.title=(g.axis==='x'?'垂直':'水平')+'参考线 '+Math.round(g.position)+' px；拖出画布工作区删除';line.style[g.axis==='x'?'left':'top']=pan[g.axis]+g.position*zoom+'px';line.setAttribute('role','separator');line.setAttribute('aria-orientation',g.axis==='x'?'vertical':'horizontal');line.onpointerdown=e=>start(e,g);line.ondblclick=e=>{e.stopPropagation();if(s.locked)return;state.checkpoint();p.guides=guides().filter(l=>l.id!==g.id);state.changed('已删除参考线');update();};overlay.append(line);}
  overlay.classList.toggle('locked',s.locked);state.draw();
 }
 function start(e,guideOrAxis) {
  if(e.button!==0||state.busy()||!state.open()||settings().locked)return;e.preventDefault();e.stopPropagation();const creating=typeof guideOrAxis==='string',origin=guideOrAxis==='origin',before=state.snapshot(),s=settings();
  if(creating&&!origin&&guides().length>=200){state.status('参考线最多 200 条，请先删除一些参考线。');return;}
  const guide=creating&&!origin?{id:crypto.randomUUID(),axis:guideOrAxis,position:0}:guideOrAxis;
  drag={guide,origin,creating,before,position:guide.position,original:{...s.origin},start:{x:e.clientX,y:e.clientY}};if(creating&&!origin)guides().push(guide);move(e);
 }
 function move(e){if(!drag)return;const rect=viewport.getBoundingClientRect(),{zoom,pan}=state.view(),p={x:(e.clientX-rect.left-pan.x)/zoom,y:(e.clientY-rect.top-pan.y)/zoom};
  if(drag.origin)settings().origin={x:Math.round(p.x),y:Math.round(p.y)};else drag.guide.position=Math.max(-100000,Math.min(100000,e.shiftKey?Math.round(p[drag.guide.axis]/10)*10:p[drag.guide.axis]));update();state.status('参考线 '+(drag.origin?'原点':Math.round(drag.guide.position)+' px')+' · Esc 取消');
 }
 function finish(e,cancel=false){if(!drag)return;const d=drag;drag=null;const p=state.project(),rect=viewport.getBoundingClientRect(),outside=e&&(e.clientX<rect.left||e.clientY<rect.top||e.clientX>rect.right||e.clientY>rect.bottom);
  if(cancel){if(d.origin)settings().origin=d.original;else if(d.creating)p.guides=guides().filter(g=>g!==d.guide);else d.guide.position=d.position;}
  else {if(outside&&!d.origin)p.guides=guides().filter(g=>g!==d.guide);if(JSON.stringify([p.guides,settings().origin])!==JSON.stringify([d.before.guides,d.before.ruler.origin])){state.history.push(d.before);state.changed('已更新参考线 / 标尺原点');}}
  update();
 }
 document.getElementById('ruler-x').onpointerdown=e=>start(e,'y');document.getElementById('ruler-y').onpointerdown=e=>start(e,'x');const corner=document.querySelector('.ruler-corner');corner.title='拖动设置标尺原点，双击复位';corner.onpointerdown=e=>start(e,'origin');corner.ondblclick=()=>{state.checkpoint();settings().origin={x:0,y:0};state.changed('已重置标尺原点');update();};
 document.addEventListener('pointermove',move);document.addEventListener('pointerup',e=>finish(e));document.addEventListener('pointercancel',e=>finish(e,true));document.addEventListener('keydown',e=>{if(drag&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(null,true);}},true);window.addEventListener('blur',()=>finish(null,true));
 for(const ruler of [corner,document.getElementById('ruler-x'),document.getElementById('ruler-y')])ruler.oncontextmenu=e=>{e.preventDefault();menu?.remove();menu=document.createElement('div');menu.className='app-menu ruler-menu';menu.style.left=Math.min(innerWidth-190,e.clientX)+'px';menu.style.top=e.clientY+'px';for(const [unit,label] of [['px','像素'],['in','英寸'],['cm','厘米'],['mm','毫米'],['pt','点']]){const b=document.createElement('button');b.textContent=(settings().unit===unit?'✓ ':'')+label;b.onclick=()=>{state.checkpoint();settings().unit=unit;state.changed('标尺单位：'+label);menu.remove();update();};menu.append(b);}document.body.append(menu);};
 document.addEventListener('pointerdown',e=>{if(menu&&!e.target.closest('.ruler-menu'))menu.remove();});
 function command(action){if(!['toggleRulers','toggleGuides','lockGuides','clearGuides','resetRulerOrigin'].includes(action))return false;state.checkpoint();const s=settings();if(action==='toggleRulers')s.visible=!s.visible;if(action==='toggleGuides')s.guidesVisible=!s.guidesVisible;if(action==='lockGuides')s.locked=!s.locked;if(action==='clearGuides')state.project().guides=[];if(action==='resetRulerOrigin')s.origin={x:0,y:0};state.changed('已更新标尺 / 参考线');update();return true;}
 return {update,command};
}
