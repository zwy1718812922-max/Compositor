export function setupBrushCursor(state) {
  const viewport=document.getElementById('viewport'),cursor=document.createElement('div');cursor.id='brush-cursor';cursor.hidden=true;cursor.setAttribute('aria-hidden','true');viewport.append(cursor);let position;
  function update() {
    const paint=['brush','eraser'].includes(state.tool())&&!state.busy()&&state.open()&&!state.space();
    viewport.classList.toggle('paint-cursor',paint);cursor.hidden=!paint||!position;if(cursor.hidden)return;
    const size=Math.max(1,Number(document.getElementById('brush-size').value)||1)*state.zoom();cursor.style.width=size+'px';cursor.style.height=size+'px';cursor.style.left=position.x+'px';cursor.style.top=position.y+'px';
    cursor.classList.toggle('soft',Number(document.getElementById('brush-hardness').value)<100);cursor.dataset.diameter=String(size);
  }
  viewport.addEventListener('pointermove',e=>{const r=viewport.getBoundingClientRect();position={x:e.clientX-r.left,y:e.clientY-r.top};update();});viewport.addEventListener('pointerleave',()=>{position=null;update();});
  document.addEventListener('input',update);document.addEventListener('keydown',update);document.addEventListener('keyup',update);return {update};
}
