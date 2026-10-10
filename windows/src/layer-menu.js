const items=[['创建填充或调整图层…','createFill'],['新建图层','addLayer','Ctrl+Shift+N'],['复制图层 / 选区','duplicate','Ctrl+J'],['删除图层','deleteLayer'],null,['自由变换','freeTransform','Ctrl+T'],['图层样式…','layerStyles'],['清除图层样式','clearStyles'],['向上移动','raise'],['向下移动','lower'],null,['创建图层组','group','Ctrl+G'],['取消图层分组','ungroup','Ctrl+Shift+G'],['创建 / 释放剪贴蒙版','clipping','Ctrl+Alt+G'],null,['添加显示蒙版','addMask'],['添加隐藏蒙版','hideMask'],['启用 / 停用蒙版','toggleMask'],['链接 / 取消链接蒙版','linkMask'],['蒙版反相','invertMask'],['应用蒙版','applyMask'],['删除蒙版','deleteMask'],null,['编辑文字','editText'],['栅格化文字 / 填充','rasterize'],['向下合并','mergeDown','Ctrl+E'],['合并可见图层','mergeVisible','Ctrl+Shift+M']];
export function setupLayerMenu(state){
 let menu;
 const close=()=>{menu?.remove();menu=null;};
 function open(layer,event){
  event.preventDefault();if(!layer||state.busy())return;close();state.select(layer);
  menu=document.createElement('div');menu.id='layer-context-menu';menu.className='app-menu layer-context-menu';menu.setAttribute('role','menu');
  for(const item of items){if(!item){menu.append(document.createElement('hr'));continue;}const [label,action,key]=item,b=document.createElement('button');b.textContent=label;b.dataset.layerCommand=action;b.setAttribute('role','menuitem');
   if(key){const k=document.createElement('kbd');k.textContent=key;b.append(k);}if(action==='editText')b.disabled=layer.type!=='text';if(action==='rasterize')b.disabled=!['text','fill'].includes(layer.type);if(['toggleMask','linkMask','invertMask','applyMask','deleteMask'].includes(action))b.disabled=!layer.mask;
   b.onclick=()=>{close();state.command(action);};menu.append(b);
  }
  document.body.append(menu);const r=menu.getBoundingClientRect();menu.style.left=Math.max(4,Math.min(event.clientX,innerWidth-r.width-4))+'px';menu.style.top=Math.max(4,Math.min(event.clientY,innerHeight-r.height-4))+'px';menu.querySelector('button')?.focus();
  menu.onkeydown=e=>{if(e.key==='Escape'){close();state.focus();}if(['ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();const buttons=[...menu.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length]?.focus();}};
 }
 document.addEventListener('pointerdown',e=>{if(!e.target.closest('#layer-context-menu'))close();});document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
 return{open,close};
}
