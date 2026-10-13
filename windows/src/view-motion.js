import {canvas,pixelRevision} from './editor.js';
import {setupBackgroundPreview} from './background-preview.js';
import {renderPreview} from './render-preview.js';

// Native-resolution composites serve both navigation and recent previews.
export function setupViewMotion(state) {
  const background=setupBackgroundPreview(),cache=new WeakMap(),entries=new Set(),identities=new WeakMap(),released=new WeakSet();let identitySerial=0;const identity=value=>value?(identities.get(value)||(()=>{const id=++identitySerial;identities.set(value,id);return id;})()):0;
  let frame,warmTimer,override,drag,revision=0,bytes=0;
  const clean=item=>Object.fromEntries(Object.entries(item).filter(([key])=>!['canvas','mask','data','psdTextSource','psdEffects','psdFont','stylesModified'].includes(key)&&!key.startsWith('_')));
  function signature(p){return JSON.stringify([p.width,p.height,p.colorMode,identity(p.colorProfile),p.layers.map(l=>[clean(l),identity(l.canvas),pixelRevision(l.canvas),l.mask&&[clean(l.mask),identity(l.mask.canvas),pixelRevision(l.mask.canvas)]])]);}
  function remember(p,key,bitmap){
    const old=cache.get(p);if(old?.bitmap){bytes-=old.bitmap.width*old.bitmap.height*4;old.bitmap.close();entries.delete(old);}
    const entry={project:p,key,bitmap};cache.set(p,entry);entries.add(entry);bytes+=bitmap.width*bitmap.height*4;
    while(bytes>288*1024*1024&&entries.size>1){const first=entries.values().next().value;bytes-=first.bitmap.width*first.bitmap.height*4;first.bitmap.close();first.bitmap=null;entries.delete(first);}
    return entry;
  }
  async function prepare(p=state.project()) {
    if(released.has(p))return null;const key=signature(p),old=cache.get(p);if(old?.key===key&&old.bitmap)return old.bitmap;
    if(old?.pending&&old.pendingKey===key)return old.pending;
    const valid=()=>!released.has(p)&&signature(p)===key;
    const holder=old||{};cache.set(p,holder);holder.pendingKey=key;
    const pending=background.render(p,{source:true},valid).then(result=>{
      if(!result)return null;if(!valid()){result.bitmap.close();return null;}
      const entry=remember(p,key,result.bitmap);if((p===state.project()||p===override)&&!state.editingId())schedule();return entry.bitmap;
    }).catch(error=>{if(!released.has(p))state.status?.('清晰预览生成失败：'+error.message);return null;}).finally(()=>{if(holder.pending===pending)holder.pending=null;});
    holder.pending=pending;return pending;
  }
  const editingContent=()=>['move','transform','artboardTransform','shapeRadius','brush','eraser'].includes(state.gesture()?.kind);
  function draw() {
    if(editingContent())return false;
    const p=override||state.project(),entry=cache.get(p);if(!entry?.bitmap||entry.key!==signature(p)||state.editingId())return false;
    const v=state.view(),dpr=v.pixelRatio||1,z=v.scale,left=Math.max(0,-v.pan.x/z),top=Math.max(0,-v.pan.y/z);
    const right=Math.min(p.width,(v.width-v.pan.x)/z),bottom=Math.min(p.height,(v.height-v.pan.y)/z);
    const w=Math.max(1,right-left),h=Math.max(1,bottom-top),target=state.display,pw=Math.max(1,Math.ceil(w*z*dpr)),ph=Math.max(1,Math.ceil(h*z*dpr));
    if(target.width!==pw)target.width=pw;if(target.height!==ph)target.height=ph;
    Object.assign(target.style,{width:w+'px',height:h+'px',left:left+'px',top:top+'px',visibility:''});
    Object.assign(target.dataset,{originX:left,originY:top,worldWidth:w,worldHeight:h,renderSerial:Number(target.dataset.renderSerial||0)+1,quality:'native'});
    const ctx=target.getContext('2d');ctx.clearRect(0,0,pw,ph);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(entry.bitmap,left,top,w,h,0,0,pw,ph);
    drag=null;
    state.viewport.dataset.viewUpdating='false';return true;
  }
  function beginDrag(gesture){
    const visible=canvas(state.display.width,state.display.height);
    visible.getContext('2d').drawImage(state.display,0,0);
    drag={gesture,visible,native:state.display.dataset.quality==='native'};
  }
  function renderDrag(p,view){
    if(!drag||p!==state.project())return null;
    const region=renderPreview(drag.preview||(drag.preview=canvas(1,1)),p,undefined,true,{...view,matchDisplay:drag.native});
    const target=state.display,preview=drag.preview,baseline=drag.visible;
    if(target.width!==preview.width||target.height!==preview.height){drag=null;return null;}
    // Keep untouched pixels identical to the image visible when the drag began.
    const ctx=target.getContext('2d');ctx.clearRect(0,0,target.width,target.height);ctx.drawImage(baseline,0,0);
    const g=drag.gesture,box=g.box;
    if(box){
      const shifted=g.originals.map(({layer,original})=>g.maskOnly?{x:layer.mask.x-original.mask.x,y:layer.mask.y-original.mask.y}:{x:layer.x-original.x,y:layer.y-original.y}).find(offset=>offset.x||offset.y)||{x:0,y:0};
      const effect=g.originals.reduce((maximum,{layer})=>Math.max(maximum,Number(layer.mask?.feather)||0,...Object.values(layer.styles||{}).map(style=>(Number(style?.size)||0)+(Number(style?.distance)||0)+(Number(style?.spread)||0))),0);
      const pad=Math.max(8,effect)+4/Math.max(view.scale,0.05),originX=Number(target.dataset.originX||0),originY=Number(target.dataset.originY||0);
      const sx=target.width/Number(target.dataset.worldWidth||p.width),sy=target.height/Number(target.dataset.worldHeight||p.height);
      const x=Math.max(0,Math.floor((box.x+Math.min(0,shifted.x)-pad-originX)*sx)-2),y=Math.max(0,Math.floor((box.y+Math.min(0,shifted.y)-pad-originY)*sy)-2);
      const right=Math.min(target.width,Math.ceil((box.x+box.width+Math.max(0,shifted.x)+pad-originX)*sx)+2),bottom=Math.min(target.height,Math.ceil((box.y+box.height+Math.max(0,shifted.y)+pad-originY)*sy)+2);
      if(right>x&&bottom>y){ctx.clearRect(x,y,right-x,bottom-y);ctx.drawImage(preview,x,y,right-x,bottom-y,x,y,right-x,bottom-y);}
    }else{ctx.clearRect(0,0,target.width,target.height);ctx.drawImage(preview,0,0);}
    target.dataset.quality='preview';target.dataset.renderSerial=Number(target.dataset.renderSerial||0)+1;
    return region;
  }
  function schedule(){if(frame)return;const current=revision;frame=requestAnimationFrame(()=>{frame=null;if(current!==revision)return;state.decorate();if(!draw())state.render();});}
  function cancel(){revision++;cancelAnimationFrame(frame);frame=null;drag=null;state.display.style.visibility='';state.viewport.dataset.viewUpdating='false';}
  function rendered(p,region,preview){override=preview;p=preview||p;state.viewport.dataset.viewUpdating='false';clearTimeout(warmTimer);if(editingContent())return;warmTimer=setTimeout(()=>prepare(p).then(bitmap=>{if(bitmap&&(p===state.project()||p===override)&&!state.editingId()&&!editingContent())schedule();}),80);}
  function move(){state.viewport.dataset.viewUpdating='true';schedule();}
  async function thumbnail(p){
    const bitmap=await prepare(p);if(!bitmap)return null;
    const thumb=canvas(240,150),ctx=thumb.getContext('2d'),ratio=Math.min(240/p.width,150/p.height);
    ctx.fillStyle='#282828';ctx.fillRect(0,0,240,150);ctx.imageSmoothingQuality='high';ctx.drawImage(bitmap,(240-p.width*ratio)/2,(150-p.height*ratio)/2,p.width*ratio,p.height*ratio);return thumb.toDataURL('image/png');
  }
  function release(p){released.add(p);const entry=cache.get(p);if(entry?.bitmap){bytes-=entry.bitmap.width*entry.bitmap.height*4;entry.bitmap.close();entries.delete(entry);}cache.delete(p);if(override===p)override=null;}
  return{move,cancel,rendered,prepare,thumbnail,draw,release,beginDrag,renderDrag};
}
