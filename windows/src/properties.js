import {bounds} from './editor.js';
import {transformLayer} from './advanced.js';
import {clearTextCache} from './type-editor.js';
import {isLocked} from './layer-tree.js';

export function setupProperties(state) {
  const $=id=>document.getElementById(id),panel=$('properties-panel'),grid=panel.querySelector('.property-grid');
  const section=(title,parent=panel)=>{const d=document.createElement('details');d.open=true;const s=document.createElement('summary');s.textContent=title;d.append(s);parent.insertBefore(d,parent.querySelector('#property-hint'));return d;};
  const transform=section('变换');transform.append(grid);grid.classList.add('ps-transform-grid');
  transform.id='transform-properties';const transformSummary=document.createElement('span');transformSummary.className='transform-summary';transform.querySelector('summary').append(transformSummary);
  const field=(id,label,min=0,max=16384,step=1)=>'<label>'+label+' <input id="'+id+'" type="number" min="'+min+'" max="'+max+'" step="'+step+'" aria-label="'+label+'"> <small>px</small></label>';
  grid.insertAdjacentHTML('afterbegin',field('property-width','W',1)+field('property-height','H',1));grid.prepend(...['property-width','layer-x','property-height','layer-y'].map(id=>$(id).closest('label')));
  const actions=document.createElement('div');actions.className='property-actions';actions.innerHTML='<button id="property-link" title="链接宽高比例" aria-label="链接宽高比例" aria-pressed="true">⛓</button><button id="property-flip-x" title="水平翻转">↔</button><button id="property-flip-y" title="垂直翻转">↕</button><button id="property-reset" title="重置变换" aria-label="重置变换">↶</button>';transform.append(actions);const rotation=$('layer-rotation').closest('label');rotation.className='property-rotation';actions.append(rotation);const moreTransform=document.createElement('details');moreTransform.className='property-more';moreTransform.innerHTML='<summary>更多变换设置</summary>';moreTransform.append($('layer-scale').closest('label'),$('layer-scale-y').closest('label'));transform.append(moreTransform);let linked=true;try{linked=localStorage.getItem('compositor.propertyLink')!=='false';}catch{}$('property-link').setAttribute('aria-pressed',String(linked));
  $('property-link').onclick=()=>{linked=!linked;try{localStorage.setItem('compositor.propertyLink',String(linked));}catch{}$('property-link').setAttribute('aria-pressed',String(linked));};
  function edit(mutator,geometry=false){const selected=state.active(),l=geometry?state.target():selected;if(!l||state.busy()||isLocked(state.project(),selected))return;try{if(!state.typeEditor()?.owns(l))state.checkpoint();if(l.type==='text')clearTextCache(l);mutator(l);state.changed();}catch(error){state.toast(error.message);state.refresh();}}
  for(const [id,axis] of [['property-width','width'],['property-height','height']])$(id).onchange=()=>{
    const l=state.target(),value=Number($(id).value);if(!Number.isFinite(value)||value<1||value>16384)return;
    if(l.artboard){state.artboards().resize(l,{[axis]:Math.round(value)},linked);return;}
    if(l.type==='group'||l.type==='adjustment')return;
    edit(layer=>{const b=bounds(layer),sx=layer.scale,sy=layer.scaleY??sx,ratio=value/(b[axis]*(axis==='width'?sx:sy));
      if(layer.type==='shape'){const s=layer.shape;s[axis]=value/(axis==='width'?sx:sy);if(linked)s[axis==='width'?'height':'width']*=ratio;s.radii=s.radii.map(r=>Math.min(r,Math.min(s.width,s.height)/2));if(s.vertexRadii)s.vertexRadii=s.vertexRadii.map(r=>Math.min(r,Math.min(s.width,s.height)/2));}
      else if(layer.type==='text'&&layer.textMode==='paragraph'){layer[axis==='width'?'boxWidth':'boxHeight']=value/(axis==='width'?sx:sy);if(linked)layer[axis==='width'?'boxHeight':'boxWidth']*=ratio;}
      else transformLayer(layer,axis==='width'?{scale:sx*ratio,scaleY:linked?sy*ratio:sy}:{scale:linked?sx*ratio:sx,scaleY:sy*ratio});
    },true);
  };
  $('property-reset').onclick=()=>edit(l=>{if(l.artboard)return;transformLayer(l,{rotation:0,scale:1,scaleY:1,skew:0});},true);
  for(const [id,key] of [['property-flip-x','flipX'],['property-flip-y','flipY']])$(id).onclick=()=>edit(l=>{if(l.artboard||l.type==='group')return;const b=bounds(l),center=state.center(l,{x:b.width/2,y:b.height/2});const next={...l,[key]:!l[key]},moved=state.center(next,{x:b.width/2,y:b.height/2});transformLayer(l,{[key]:!l[key],x:l.x+center.x-moved.x,y:l.y+center.y-moved.y});},true);
  const text=$('text-properties'),character=text.querySelector('details');panel.insertBefore(transform,text);
  const fontStyle=$('font-style').closest('label'),styleRow=character.querySelector('.text-style'),bold=$('bold');character.insertBefore($('font'),styleRow);const sizeRow=document.createElement('label');sizeRow.append('字号 ', $('font-size'));const fontSettings=document.createElement('div');fontSettings.className='property-font-settings';fontSettings.append(fontStyle,sizeRow);character.insertBefore(fontSettings,styleRow);character.querySelector('.text-layout').prepend($('text-leading').closest('label'));styleRow.remove();character.insertBefore(character.querySelector('.text-layout'),character.querySelector('.text-color'));character.querySelector('.edit-text-button').hidden=true;
  const options=section('文字选项',text);options.className='text-options-section';options.innerHTML='<summary>文字选项</summary><div class="character-buttons"><button id="text-strike" title="删除线">S̶</button><button id="text-uppercase" title="转换为大写">TT</button><button id="text-lowercase" title="转换为小写">Tt</button></div>';const characterButtons=character.querySelector('.character-buttons');characterButtons.prepend(bold);characterButtons.append($('text-strike'),$('text-uppercase'),$('text-lowercase'));options.remove();
  const paragraph=[...text.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent==='段落');paragraph.insertAdjacentHTML('beforeend','<div class="ps-parameter-grid">'+field('paragraph-left','左缩进',0,10000)+field('paragraph-right','右缩进',0,10000)+field('paragraph-first','首行缩进',-1000,10000)+field('paragraph-before','段前',0,10000)+field('paragraph-after','段后',0,10000)+'</div>');
  const list=section('项目符号和编号',text);list.innerHTML='<summary>项目符号和编号</summary><div class="property-actions"><button data-text-list="none" title="无列表">无</button><button data-text-list="bullet" title="项目符号">• 列表</button><button data-text-list="number" title="编号">1. 列表</button></div>';
  const direction=section('文字方向',text);direction.innerHTML='<summary>文字方向</summary><select id="paragraph-direction" aria-label="文字方向"><option value="ltr">从左到右</option><option value="rtl">从右到左</option></select>';
  const quick=section('快速操作',text);quick.innerHTML='<summary>快速操作</summary><button id="text-convert-mode" class="wide-button">转换为段落文字</button><button id="text-rasterize" class="wide-button">栅格化文字</button><button id="text-edit-inline" class="wide-button">在画布上编辑</button>';
  quick.open=false;const advanced=section('缩进、列表和文字方向',text);advanced.open=false;advanced.className='text-advanced';paragraph.after(advanced);advanced.append(paragraph.querySelector('.ps-parameter-grid'),list.querySelector('.property-actions'),$('paragraph-direction'));list.remove();direction.remove();
  for(const [id,key] of [['paragraph-left','leftIndent'],['paragraph-right','rightIndent'],['paragraph-first','firstIndent'],['paragraph-before','spaceBefore'],['paragraph-after','spaceAfter']])$(id).onchange=()=>edit(l=>{if(l.type==='text')l.paragraph={...l.paragraph,[key]:Math.max(Number($(id).min),Math.min(Number($(id).max),Number($(id).value)||0))};});
  panel.querySelectorAll('[data-text-list]').forEach(b=>b.onclick=()=>edit(l=>{if(l.type==='text')l.paragraph={...l.paragraph,list:b.dataset.textList};}));
  $('paragraph-direction').onchange=()=>edit(l=>{if(l.type==='text')l.paragraph={...l.paragraph,direction:$('paragraph-direction').value};});
  $('text-strike').onclick=()=>edit(l=>{if(l.type==='text')l.strike=!l.strike;});
  $('text-uppercase').onclick=()=>edit(l=>{if(l.type==='text')l.text=l.text.toUpperCase();});$('text-lowercase').onclick=()=>edit(l=>{if(l.type==='text')l.text=l.text.toLowerCase();});
  $('text-convert-mode').onclick=()=>edit(l=>{if(l.type!=='text')return;const b=bounds(l);l.textMode=l.textMode==='paragraph'?'point':'paragraph';if(l.textMode==='paragraph'){l.boxWidth=Math.max(l.fontSize,b.width);l.boxHeight=Math.max(l.fontSize*1.35,b.height);}});
  $('text-rasterize').onclick=()=>state.command('rasterize');$('text-edit-inline').onclick=()=>state.command('editText');
  let lastType;
  function update(){const l=state.active(),target=state.target();if(!l)return;const b=bounds(target);$('property-width').value=Number((b.width*target.scale).toFixed(2));$('property-height').value=Number((b.height*(target.scaleY??target.scale)).toFixed(2));
    const type=l.artboard?'画板':l.type==='shape'?'形状':l.type==='text'?'文字':l.type==='group'?'图层组':l.type==='adjustment'?'调整':l.type==='fill'?'填充':'像素';$('property-name').textContent=l.name||'图层';$('property-name').title=l.name||'图层';$('property-icon').textContent=l.type==='text'?'T':l.type==='shape'?'■':l.artboard?'▣':l.type==='group'?'▤':'▧';$('property-icon').dataset.type=l.artboard?'artboard':l.type;$('layer-type').textContent=type;transformSummary.textContent=Number((b.width*target.scale).toFixed(0))+' × '+Number((b.height*(target.scaleY??target.scale)).toFixed(0))+' px · '+Math.round(target.rotation)+'°';if(type!==lastType){transform.open=l.type!=='text';lastType=type;}
    const disabled=isLocked(state.project(),l)||target===l&&(l.type==='group'&&!l.artboard||l.type==='adjustment');for(const id of ['property-width','property-height','property-reset','property-flip-x','property-flip-y'])$(id).disabled=disabled;
    if(l.artboard){$('layer-x').disabled=$('layer-y').disabled=isLocked(state.project(),l);}
    if(l.type!=='text')return;for(const [id,key] of [['paragraph-left','leftIndent'],['paragraph-right','rightIndent'],['paragraph-first','firstIndent'],['paragraph-before','spaceBefore'],['paragraph-after','spaceAfter']])$(id).value=l.paragraph?.[key]||0;
    $('paragraph-direction').value=l.paragraph?.direction||'ltr';$('text-convert-mode').textContent=l.textMode==='paragraph'?'转换为点文字':'转换为段落文字';$('text-strike').classList.toggle('active',!!l.strike);panel.querySelectorAll('[data-text-list]').forEach(b=>b.classList.toggle('active',b.dataset.textList===(l.paragraph?.list||'none')));
  }
  return{update};
}
