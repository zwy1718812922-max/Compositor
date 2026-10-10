import { baseLayer, canvas, decodeImage, invalidatePixels } from './editor.js';
import { canonicalize, isLocked } from './layer-tree.js';
import { fillNames, adjustments, defaults } from './fill-model.mjs';
export function setupFillEditor(state) {
 const dialog=document.createElement('dialog');dialog.id='fill-dialog';dialog.className='editor-dialog';dialog.setAttribute('aria-label','填充和调整图层');
 dialog.innerHTML='<form><h2 id="fill-title"></h2><div id="fill-fields"></div><p class="dialog-note">实时预览 · 左右拖动数字或参数名称可调节</p><footer><button type="button" id="fill-cancel">取消</button><button type="submit" class="primary">确定</button></footer></form>';document.body.append(dialog);let session,popup;
 function closePopup(){popup?.remove();popup=null;}
 function menu() {
  closePopup();popup=document.createElement('div');popup.className='app-menu fill-menu';popup.setAttribute('role','menu');const anchor=document.getElementById('create-fill').getBoundingClientRect();
  for(const [kind,label] of [...Object.entries(fillNames),['separator',''],...Object.entries(adjustments).map(([k,v])=>[k,v[0]])]) {
   if(kind==='separator'){popup.append(document.createElement('hr'));continue;}
   const b=document.createElement('button');b.setAttribute('role','menuitem');b.textContent=label+'…';b.dataset.fill=kind;b.onclick=()=>{closePopup();open(kind);};popup.append(b);
  }
  document.body.append(popup);popup.style.left=Math.max(5,anchor.right-185)+'px';popup.style.bottom=(innerHeight-anchor.top+4)+'px';popup.style.maxHeight=(innerHeight-80)+'px';popup.style.overflowY='auto';popup.querySelector('button').focus();
 }
 function open(kindOrLayer) {
  const project=state.project(),existing=typeof kindOrLayer==='object'?kindOrLayer:null;if(existing&&isLocked(project,existing)){state.toast('请先解锁图层。');return;}
  const kind=existing?(existing.fill?.kind||existing.adjustment.kind):kindOrLayer,isFill=Object.hasOwn(fillNames,kind);
  const before=state.snapshot(),activeId=project.activeId;
  let layer=existing;
  if(!layer){state.capacity(isFill?project.width:0,isFill?project.height:0);layer={...baseLayer((fillNames[kind]||adjustments[kind][0])+' 1',isFill?'fill':'adjustment'),parentId:state.active().type==='group'?state.active().id:state.active().parentId||null};
   if(isFill)Object.assign(layer,{width:project.width,height:project.height,fill:{kind,color:'#777777',color2:'#ffffff',angle:0,scale:100,pattern:'checker'}});
   else layer.adjustment={kind,values:{...defaults(kind),color:kind==='gradientMap'?'#000000':'#ec8d32',color2:'#ffffff',range:'neutrals'}};
   const selection=state.selection();if(selection){state.capacity(project.width,project.height);const bitmap=canvas(project.width,project.height),ctx=bitmap.getContext('2d');ctx.fillStyle='black';ctx.fillRect(0,0,bitmap.width,bitmap.height);ctx.fillStyle='white';ctx.fillRect(selection.x,selection.y,selection.width,selection.height);layer.mask={canvas:bitmap,x:0,y:0,scale:1,rotation:0,enabled:true,linked:true,defaultColor:0,density:1,feather:0};}
   const index=project.layers.indexOf(state.active());project.layers.splice(index+1,0,layer);canonicalize(project);
  }
  session={layer,existing,before,activeId,original:existing?structuredClone(isFill?layer.fill:layer.adjustment):null,pattern:layer._pattern,committed:false};project.activeId=layer.id;
  const fields=dialog.querySelector('#fill-fields');fields.replaceChildren();dialog.querySelector('#fill-title').textContent=fillNames[kind]||adjustments[kind][0];const values=isFill?layer.fill:layer.adjustment.values;
  const field=(key,label,type,min,max,step)=>{const l=document.createElement('label');l.textContent=label;const input=document.createElement('input');input.id='fill-'+key;input.type=type;input.value=values[key];if(min!==undefined){input.min=min;input.max=max;input.step=step;}l.append(input);fields.append(l);input.oninput=()=>{if(!input.checkValidity())return;values[key]=type==='number'?Number(input.value):input.value;delete layer._fill;state.render();};};
  if(isFill){field('color','颜色','color');if(kind!=='solid')field('color2','背景 / 终点颜色','color');if(kind==='gradient')field('angle','角度（°）','number',-36000,36000,1);
   if(kind==='pattern'){field('scale','缩放（%）','number',1,1000,1);const select=document.createElement('select');select.id='fill-pattern';for(const [v,t] of [['checker','棋盘'],['dots','圆点'],['stripes','条纹'],...(layer._pattern?[['image','自定义图案']]:[])])select.add(new Option(t,v));select.value=values.pattern;select.onchange=()=>{values.pattern=select.value;delete layer._fill;state.render();};fields.append(select);const b=document.createElement('button');b.type='button';b.textContent='导入自定义图案…';b.onclick=async()=>{try{const r=await state.api.importImages();if(!r.ok)throw new Error(r.error);if(!r.value?.length)return;const image=await decodeImage(r.value[0].data),ratio=Math.min(1,512/Math.max(image.width,image.height)),tile=canvas(Math.max(1,Math.round(image.width*ratio)),Math.max(1,Math.round(image.height*ratio)));tile.getContext('2d').drawImage(image,0,0,tile.width,tile.height);state.capacity(tile.width,tile.height,0);layer._pattern=tile;values.data=tile.toDataURL('image/png');values.pattern='image';if(![...select.options].some(o=>o.value==='image'))select.add(new Option('自定义图案','image'));select.value='image';delete layer._fill;state.render();}catch(e){state.toast(e.message);}};fields.append(b);}
  }else{for(const [key,label,,min,max,step] of adjustments[kind][1])field(key,label,'number',min,max,step);if(['photo','gradientMap'].includes(kind))field('color','颜色','color');if(kind==='gradientMap')field('color2','终点颜色','color');if(kind==='selective'){const s=document.createElement('select');s.id='fill-range';for(const [v,t] of [['reds','红色'],['neutrals','中性色'],['blacks','黑色'],['whites','白色']])s.add(new Option(t,v));s.value=values.range;s.onchange=()=>{values.range=s.value;state.render();};fields.prepend(s);}}
  state.refresh();state.render();dialog.showModal();
 }
 dialog.querySelector('form').onsubmit=e=>{e.preventDefault();const s=session;session=null;state.history.push(s.before);dialog.close();state.changed('已保存可编辑填充 / 调整图层');};
 dialog.querySelector('#fill-cancel').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{if(!session)return;const s=session;session=null;if(s.existing){if(s.layer.fill)s.layer.fill=s.original;else s.layer.adjustment=s.original;s.layer._pattern=s.pattern;delete s.layer._fill;}else state.project().layers=state.project().layers.filter(l=>l!==s.layer);state.project().activeId=s.activeId;state.render();state.refresh();});
 document.addEventListener('pointerdown',e=>{if(popup&&!e.target.closest('.fill-menu,#create-fill'))closePopup();});document.addEventListener('keydown',e=>{if(e.key==='Escape')closePopup();});return {menu,open};
}
