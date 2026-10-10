import { Buffer } from 'buffer';
import { validateProject } from '../project.cjs';
import { setImageResolution } from '../image-metadata.cjs';
globalThis.Buffer=Buffer;
let serial=0,worker;const requests=new Map(),psdRequests=new Map(),listeners=[],aiListeners=[];
function invoke(method,payload){return new Promise(resolve=>{const id=++serial;requests.set(id,resolve);chrome.webview.postMessage({id,method,payload});});}
chrome.webview.addEventListener('message',({data})=>{if(data.aiProgress){aiListeners.forEach(fn=>fn(data.aiProgress));return;}if(data.command){listeners.forEach(fn=>fn(data.command));return;}const resolve=requests.get(data.id);if(resolve){requests.delete(data.id);resolve(data.result);}});
function psd(action,payload){if(!worker){worker=new Worker('/native/psd-browser-worker.js');worker.onmessage=({data})=>{const r=psdRequests.get(data.id);if(!r)return;psdRequests.delete(data.id);data.error?r.reject(new Error(data.error)):r.resolve(data.value);};worker.onerror=()=>{for(const r of psdRequests.values())r.reject(new Error('PSD 处理进程已结束。'));psdRequests.clear();worker.terminate();worker=null;};}return new Promise((resolve,reject)=>{const id=++serial;psdRequests.set(id,{resolve,reject});worker.postMessage({id,action,payload});});}
window.desktop={
  async openProject(){const response=await invoke('project:open');if(!response.ok||!response.value)return response;try{const opened=response.value;if(opened.source==='psd'){const imported=await psd('read',Buffer.from(opened.data,'base64'));return{ok:true,value:{...imported,name:opened.name,path:opened.path}};}validateProject(opened.project);return response;}catch(error){return{ok:false,error:error.message};}},
  async saveProject(project,saveAs){try{validateProject(project);return await invoke('project:save',{project,saveAs});}catch(error){return{ok:false,error:error.message};}},
  aiRun:payload=>invoke('ai:run',payload),aiCancel:()=>invoke('ai:cancel'),onAiProgress:fn=>aiListeners.push(fn),
  fonts:()=>invoke('fonts:list'),
  importImages:()=>invoke('image:import'),
  async exportImage(data,format,resolution){try{const bytes=setImageResolution(Buffer.from(data.split(',')[1],'base64'),format,resolution);return await invoke('image:export',{data:bytes.toString('base64'),format});}catch(error){return{ok:false,error:error.message};}},
  async exportPsd(payload){try{const selected=await invoke('psd:select');if(!selected.ok||!selected.value)return selected;const bytes=await psd('write',payload);return await invoke('psd:write',{path:selected.value,data:Buffer.from(bytes).toString('base64')});}catch(error){return{ok:false,error:error.message};}},
  windowAction:action=>invoke('window:action',action),copyImage:data=>invoke('image:copy',data),pasteImage:()=>invoke('image:paste'),setDirty:dirty=>invoke('document:dirty',dirty),commitDocument:kind=>invoke('document:commit',kind),close:()=>invoke('document:close'),rendererReady:()=>invoke('renderer:ready'),onCommand:callback=>listeners.push(callback)
};
if(window.__COMPOSITOR_TEST_HOST__)window.desktop.testConfigure=payload=>invoke('test:configure',payload);
document.addEventListener('pointerdown',event=>{if(event.button===0&&event.target.closest('.topbar')&&!event.target.closest('button,nav,input'))invoke('window:drag');});
document.addEventListener('keydown',event=>{
  if(event.isComposing)return;
  if(event.ctrlKey){const input=event.target.matches('input,textarea,select');if(input&&['a','c','x','v','z','y'].includes(event.key.toLowerCase())&&!event.shiftKey)return;
    const key=(event.shiftKey?'shift+':'')+(event.altKey?'alt+':'')+event.key.toLowerCase(),commands={n:'new',w:'closeDocument',r:'toggleRulers',';':'toggleGuides',o:'open',i:'import',s:'save','shift+s':'saveAs','shift+e':'export',z:'undo','shift+z':'redo',y:'redo',j:'duplicate',g:'group','shift+g':'ungroup','alt+g':'clipping',t:'freeTransform',e:'mergeDown','shift+m':'mergeVisible',a:'selectAll',d:'deselect','0':'fit','1':'actual','shift+c':'copyMerged','shift+v':'pasteImage','shift+n':'addLayer'};
    if(commands[key]){event.preventDefault();listeners.forEach(fn=>fn(commands[key]));}
  }else if(event.key==='F5'){event.preventDefault();if(event.shiftKey)listeners.forEach(fn=>fn('fillSelection'));}
},true);
