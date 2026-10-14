import {compactFilters} from './beauty-assets.mjs';
import {canvas,pixelRevision,renderBounds} from './editor.js';
import {setupBackgroundPreview} from './background-preview.js';
import {renderPreview,previewRegion,previewSize,releasePreview,nativePreviewView} from './render-preview.js';
import {memoryBudget} from './memory-budget.mjs';
import {ancestors} from './layer-tree.js';
import {hasEffects} from './effect-model.mjs';

// Cache viewport composites on the same pixel grid used by interactive patches.
export function setupViewMotion(state) {
  const background=setupBackgroundPreview(),cache=new WeakMap(),entries=new Set(),identities=new WeakMap(),released=new WeakSet();let identitySerial=0;const identity=value=>value?(identities.get(value)||(()=>{const id=++identitySerial;identities.set(value,id);return id;})()):0;
  let frame,warmTimer,override,drag,revision=0,previewSerial=0;
  const clean=item=>Object.fromEntries(Object.entries(item).filter(([key])=>!['canvas','mask','data','psdTextSource','psdEffects','psdFont','stylesModified'].includes(key)&&!key.startsWith('_')).map(([key,value])=>[key,key==='filters'?compactFilters(value):value]));
  function signature(p){return JSON.stringify([p.width,p.height,p.colorMode,identity(p.colorProfile),p.layers.map(l=>[clean(l),identity(l.canvas),pixelRevision(l.canvas),l.mask&&[clean(l.mask),identity(l.mask.canvas),pixelRevision(l.mask.canvas)]])]);}
  function remember(p,key,bitmap,region,viewKey){
    const old=cache.get(p);if(old?.bitmap){memoryBudget.delete(old);old.bitmap.close();entries.delete(old);}
    const entry={project:p,key,bitmap,region,viewKey};cache.set(p,entry);entries.add(entry);
    memoryBudget.set(entry,bitmap.width*bitmap.height*4,()=>{entry.bitmap?.close();entry.bitmap=null;entries.delete(entry);},p);
    return entry;
  }
  async function prepare(p=state.project()) {
    if(released.has(p))return null;const key=signature(p),view=nativePreviewView(p,state.view()),viewKey=JSON.stringify(previewRegion(p,view)),pendingKey=key+viewKey+':'+previewSerial,old=cache.get(p);if(old?.key===key&&old.viewKey===viewKey&&old.bitmap)return old.bitmap;
    if(old?.pending&&old.pendingKey===pendingKey)return old.pending;
    const generation=previewSerial,valid=()=>generation===previewSerial&&!released.has(p)&&signature(p)===key&&JSON.stringify(previewRegion(p,nativePreviewView(p,state.view())))===viewKey;
    const holder=old||{};cache.set(p,holder);holder.pendingKey=pendingKey;
    const settled=drag?.project===p&&drag.lastKey===key&&drag.viewKey===viewKey&&!editingContent(),region=settled?drag.region:null;
    const pending=(settled?createImageBitmap(state.display).then(bitmap=>({bitmap,region})):background.render(p,view,valid)).then(result=>{
      if(!result)return null;if(!valid()){result.bitmap.close();return null;}
      const entry=remember(p,key,result.bitmap,result.region,viewKey);if((p===state.project()||p===override)&&!state.editingId())schedule();return entry.bitmap;
    }).catch(error=>{if(!released.has(p))state.status?.('清晰预览生成失败：'+error.message);return null;}).finally(()=>{if(holder.pending===pending)holder.pending=null;});
    holder.pending=pending;return pending;
  }
  const editingContent=()=>['move','transform','artboardTransform','shapeRadius','brush','eraser'].includes(state.gesture()?.kind);
  function draw() {
    if(editingContent())return false;
    const p=override||state.project(),entry=cache.get(p);if(!entry?.bitmap||entry.key!==signature(p)||state.editingId()||entry.viewKey!==JSON.stringify(previewRegion(p,nativePreviewView(p,state.view()))))return false;
    memoryBudget.activate(state.project());memoryBudget.touch(entry);
    const v=state.view(),r=entry.region,left=r.x,top=r.y,w=r.width,h=r.height,target=state.display,{width:pw,height:ph}=previewSize(r);
    if(target.width!==pw)target.width=pw;if(target.height!==ph)target.height=ph;
    Object.assign(target.style,{width:w+'px',height:h+'px',left:left+'px',top:top+'px',visibility:''});
    Object.assign(target.dataset,{originX:left,originY:top,worldWidth:w,worldHeight:h,renderSerial:Number(target.dataset.renderSerial||0)+1,quality:'native'});
    const ctx=target.getContext('2d');ctx.clearRect(0,0,pw,ph);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    if(!nativePreviewView(p,v).source)ctx.drawImage(entry.bitmap,0,0);
    else ctx.drawImage(entry.bitmap,(left-r.x)*r.scale,(top-r.y)*r.scale,w*r.scale,h*r.scale,0,0,pw,ph);
    clearDrag();
    state.viewport.dataset.viewUpdating='false';return true;
  }
  function beginDrag(gesture){
    clearDrag();clearTimeout(warmTimer);memoryBudget.activate(state.project());
    const visible=canvas(state.display.width,state.display.height);
    visible.getContext('2d').drawImage(state.display,0,0);
    const p=state.project(),region=previewRegion(p,nativePreviewView(p,state.view())),key=signature(p);
    drag={gesture,visible,project:p,key,lastKey:key,region,viewKey:JSON.stringify(region),lastBoxes:affectedBoxes(p,gesture)};
  }
  function affectedBoxes(p,g){
    const affected=new Set();for(const item of g.originals){const l=item.owner||item.layer;affected.add(p.layers.find(layer=>layer.id===l.id)||l);for(const group of ancestors(p,l))if(hasEffects(group))affected.add(group);}
    return [...affected].filter(l=>l.visible!==false&&l.opacity!==0).map(l=>renderBounds(l,p));
  }
  function clearDrag(){if(drag){if(drag.preview)releasePreview(drag.project,drag.preview);drag=null;}}
  function renderDrag(p,view){
    if(!drag||p!==drag.project)return null;
    const region=previewRegion(p,nativePreviewView(p,view)),target=state.display;
    if(JSON.stringify(region)!==drag.viewKey){clearDrag();return null;}
    const ctx=target.getContext('2d');
    const key=signature(p),editing=editingContent();
    if(key===drag.lastKey){if(!editing)target.dataset.quality='native';return region;}
    if(!editing&&key===drag.key){ctx.clearRect(0,0,target.width,target.height);ctx.drawImage(drag.visible,0,0);drag.lastKey=key;target.dataset.quality='native';return region;}
    const current=affectedBoxes(p,drag.gesture),boxes=[...drag.lastBoxes,...current];
    const sx=region.scale,ox=region.x,oy=region.y;
    let clip={x:0,y:0,width:target.width,height:target.height};
    if(boxes.length){const x=Math.max(0,Math.floor((Math.min(...boxes.map(b=>b.x))-ox)*sx)-2),y=Math.max(0,Math.floor((Math.min(...boxes.map(b=>b.y))-oy)*sx)-2),right=Math.min(target.width,Math.ceil((Math.max(...boxes.map(b=>b.x+b.width))-ox)*sx)+2),bottom=Math.min(target.height,Math.ceil((Math.max(...boxes.map(b=>b.y+b.height))-oy)*sx)+2);clip={x,y,width:Math.max(0,right-x),height:Math.max(0,bottom-y)};}
    if(clip.width&&clip.height){const preview=drag.preview||(drag.preview=canvas(1,1));renderPreview(preview,p,undefined,true,{...view,matchDisplay:true,clip,patch:true});ctx.clearRect(clip.x,clip.y,clip.width,clip.height);ctx.drawImage(preview,clip.x,clip.y);}
    drag.lastBoxes=current;drag.lastKey=key;target.dataset.renderedPixels=clip.width*clip.height;target.dataset.dirtyRegion=JSON.stringify(clip);
    target.dataset.quality=editing?'preview':'native';target.dataset.renderSerial=Number(target.dataset.renderSerial||0)+1;
    return region;
  }
  function renderAsync(p,view){
    clearDrag();memoryBudget.activate(p);
    const serial=++previewSerial,key=signature(p),valid=()=>serial===previewSerial&&p===state.project()&&!released.has(p)&&signature(p)===key;
    clearTimeout(warmTimer);background.render(p,{...view,matchDisplay:true},valid).then(result=>{if(!result)return;if(!valid()){result.bitmap.close();return;}const target=state.display,r=result.region;target.width=result.bitmap.width;target.height=result.bitmap.height;Object.assign(target.style,{width:r.width+'px',height:r.height+'px',left:r.x+'px',top:r.y+'px'});Object.assign(target.dataset,{originX:r.x,originY:r.y,worldWidth:r.width,worldHeight:r.height,quality:'preview',renderSerial:Number(target.dataset.renderSerial||0)+1});target.getContext('2d').drawImage(result.bitmap,0,0);result.bitmap.close();state.decorate();}).catch(error=>{if(valid())state.status?.('预览生成失败：'+error.message);});
  }
  function schedule(){if(frame)return;const current=revision;frame=requestAnimationFrame(()=>{frame=null;if(current!==revision)return;state.decorate();if(!draw())state.render();});}
  function cancel(){revision++;previewSerial++;clearTimeout(warmTimer);cancelAnimationFrame(frame);frame=null;clearDrag();state.display.style.visibility='';state.viewport.dataset.viewUpdating='false';}
  function rendered(p,region,preview){previewSerial++;override=preview;p=preview||p;state.viewport.dataset.viewUpdating='false';clearTimeout(warmTimer);if(editingContent())return;warmTimer=setTimeout(()=>prepare(p).then(bitmap=>{if(bitmap&&(p===state.project()||p===override)&&!state.editingId()&&!editingContent())schedule();}),80);}
  function move(){state.viewport.dataset.viewUpdating='true';schedule();}
  async function thumbnail(p){
    const large=!nativePreviewView(p).source,key=signature(p),result=large?await background.render(p,{scale:Math.min(240/p.width,150/p.height),priority:0},()=>!released.has(p)&&signature(p)===key):null;
    const bitmap=large?result?.bitmap:await prepare(p);if(!bitmap)return null;
    const thumb=canvas(240,150),ctx=thumb.getContext('2d'),ratio=Math.min(240/p.width,150/p.height);
    ctx.fillStyle='#282828';ctx.fillRect(0,0,240,150);ctx.imageSmoothingQuality='high';ctx.drawImage(bitmap,(240-p.width*ratio)/2,(150-p.height*ratio)/2,p.width*ratio,p.height*ratio);if(large)bitmap.close();return thumb.toDataURL('image/png');
  }
  function release(p){released.add(p);const entry=cache.get(p);if(entry?.bitmap){memoryBudget.delete(entry);entry.bitmap.close();entries.delete(entry);}cache.delete(p);releasePreview(p);background.release(p);memoryBudget.release(p);if(drag?.project===p)clearDrag();if(override===p)override=null;}
  return{move,cancel,rendered,prepare,thumbnail,draw,release,beginDrag,renderDrag,renderAsync,adjustRaster:(...args)=>background.adjust(...args),cancelRaster:p=>background.cancel(p,'raster'),exportPNG:(...args)=>background.exportPNG(...args)};
}
