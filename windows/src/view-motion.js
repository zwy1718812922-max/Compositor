import {canvas} from './editor.js';
import {renderPreview} from './render-preview.js';
import {setupBackgroundPreview} from './background-preview.js';

// Wheel motion transforms cached pixels; compositing waits until motion stops.
export function setupViewMotion(state) {
  const fallback=canvas(1,1);fallback.id='canvas-overview';fallback.hidden=true;state.display.before(fallback);
  let project,frame,timer,warmTimer,revision=0;const background=setupBackgroundPreview();
  function reset(p) { if(project===p)return;background.clear();project=p;fallback.width=fallback.height=1;fallback.style.width=p.width+'px';fallback.style.height=p.height+'px';revision++; }
  function cancel() { revision++;clearTimeout(timer);cancelAnimationFrame(frame);frame=null;fallback.hidden=true;state.display.style.visibility='';state.viewport.dataset.viewUpdating='false'; }
  function publish(target,result){const {region,bitmap}=result;target.width=bitmap.width;target.height=bitmap.height;Object.assign(target.style,{width:region.width+'px',height:region.height+'px',left:region.x+'px',top:region.y+'px'});Object.assign(target.dataset,{originX:region.x,originY:region.y,worldWidth:region.width,worldHeight:region.height,renderSerial:Number(target.dataset.renderSerial||0)+1});target.getContext('2d').drawImage(bitmap,0,0);bitmap.close();}
  function rendered(p,region,preserveOverview=false) {
    cancel();reset(p);revision++;
    if(region.x===0&&region.y===0&&region.width===p.width&&region.height===p.height){
      fallback.width=state.display.width;fallback.height=state.display.height;fallback.getContext('2d').drawImage(state.display,0,0);
      clearTimeout(warmTimer);
    }else if(!preserveOverview){
      clearTimeout(warmTimer);const current=revision;
      warmTimer=setTimeout(async()=>{const valid=()=>current===revision&&project===state.project()&&!state.gesture()&&state.viewport.dataset.viewUpdating!=='true';if(!valid())return;try{const result=await background.render(p,{scale:Math.min(1,700/Math.max(p.width,p.height)),editingId:state.editingId()},valid);if(result){if(valid())publish(fallback,result);else result.bitmap.close();}}catch{if(valid())renderPreview(fallback,p,undefined,true,{scale:Math.min(1,700/Math.max(p.width,p.height)),editingId:state.editingId()});}},160);
    }
  }
  function move() {
    revision++;reset(state.project());state.viewport.dataset.viewUpdating='true';fallback.hidden=false;state.display.style.visibility='hidden';
    if(!frame)frame=requestAnimationFrame(()=>{frame=null;state.decorate();});
    clearTimeout(timer);const current=revision,p=project;timer=setTimeout(async()=>{
      const valid=()=>current===revision&&p===state.project()&&!state.gesture();if(!valid())return;
      if(p.width*p.height<=2*1024*1024||typeof OffscreenCanvas==='undefined'){cancel();state.render();return;}
      try{const result=await background.render(p,{...state.view(),editingId:state.editingId()},valid);if(!result)return;if(!valid()){result.bitmap.close();return;}publish(state.display,result);rendered(p,result.region,true);state.decorate();}catch{if(valid()){cancel();state.render();}}
    },120);
  }
  return{move,cancel,rendered};
}
