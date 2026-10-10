const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  openProject: file => ipcRenderer.invoke('project:open',file),
  colorProfile:kind=>ipcRenderer.invoke('color:profile',kind),
  saveProject: (project, saveAs) => ipcRenderer.invoke('project:save', project, saveAs),
  aiRun:payload=>ipcRenderer.invoke('ai:run',payload),aiCancel:()=>ipcRenderer.invoke('ai:cancel'),onAiProgress:fn=>ipcRenderer.on('ai:progress',(_e,p)=>fn(p)),
  fonts:()=>ipcRenderer.invoke('fonts:list'),
  importImages: () => ipcRenderer.invoke('image:import'),
  exportImage: (data, format, resolution) => ipcRenderer.invoke('image:export', data, format, resolution),
  exportPsd: payload => ipcRenderer.invoke('psd:export', payload),
  windowAction: action => ipcRenderer.invoke('window:action', action),
  copyImage: data => ipcRenderer.invoke('image:copy', data),
  pasteImage: () => ipcRenderer.invoke('image:paste'),
  setDirty: dirty => ipcRenderer.send('document:dirty', dirty),
  commitDocument: kind => ipcRenderer.send('document:commit', kind),
  rendererReady: () => ipcRenderer.send('renderer:ready'),
  close: () => ipcRenderer.send('document:close'),
  onCommand: callback => { ipcRenderer.on('command', (_event, command) => callback(command)); }
});
