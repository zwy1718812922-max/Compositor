const { app, BrowserWindow, Menu, ipcMain, dialog, session, clipboard, ClipboardItem, nativeImage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { readProject, saveProject, atomicWrite, MAX_BYTES } = require('./project.cjs');
const { setImageResolution } = require('./image-metadata.cjs');
const { Worker } = require('node:worker_threads');
let psdWorker, psdSerial = 0; const pendingPsd = new Map();
function processPsd(action,payload) {
  if (!psdWorker) {
    psdWorker = new Worker(path.join(__dirname,'psd-worker.cjs'));
    psdWorker.on('message',message => { const request = pendingPsd.get(message.id); if (!request) return; pendingPsd.delete(message.id); message.error ? request.reject(new Error(message.error)) : request.resolve(message.value); });
    const fail = error => { for (const request of pendingPsd.values()) request.reject(error); pendingPsd.clear(); psdWorker = null; };
    psdWorker.on('error',fail); psdWorker.on('exit',code => { if (code !== 0) fail(new Error('PSD 处理进程已结束，请重试。')); });
  }
  return new Promise((resolve,reject) => { const id = ++psdSerial; pendingPsd.set(id,{resolve,reject}); psdWorker.postMessage({id,action,payload}); });
}
let win, dirty = false, currentPath = null, pendingPath = null;
const index = pathToFileURL(path.join(__dirname, 'src/index.html')).href;
app.commandLine.appendSwitch('lang', 'zh-CN');
app.setName('Compositor 中文版');
const send = command => win.webContents.send('command', command);
function trusted(event) {
  if (event.sender !== win.webContents || event.senderFrame?.url !== index) throw new Error('拒绝未知页面的请求。');
}
function handle(name, callback) {
  ipcMain.handle(name, async (event, ...args) => {
    trusted(event);
    try { return { ok: true, value: await callback(...args) }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
}
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_web, _permission, callback) => callback(false));
  win = new BrowserWindow({ width: 1440, height: 960, minWidth: 1024, minHeight: 720, frame: false, backgroundColor: '#262626', title: 'Compositor 中文版', icon: path.join(__dirname, 'assets/icon.ico'), webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.on('close', event => {
    if (dirty) {
      event.preventDefault();
      send('close');
    }
  });
  const item = (label, accelerator, command) => ({ label, accelerator, registerAccelerator:false, click: () => send(command) });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '文件(&F)', submenu: [item('关闭当前项目','Ctrl+W','closeDocument'), item('新建画布', 'Ctrl+N', 'new'), item('打开项目或 PSD…', 'Ctrl+O', 'open'), item('导入图片…', 'Ctrl+I', 'import'), { type: 'separator' }, item('保存项目', 'Ctrl+S', 'save'), item('项目另存为…', 'Ctrl+Shift+S', 'saveAs'), item('导出图片…', 'Ctrl+Shift+E', 'export'), { type: 'separator' }, { label: '退出', click: () => win.close() }] },
    { label: '编辑(&E)', submenu: [item('后退一步', 'Ctrl+Z', 'undo'), item('前进一步', 'Ctrl+Y', 'redo'), {...item('重做', 'Ctrl+Shift+Z', 'redo'),visible:false}, { type: 'separator' }, { label: '剪切文字', role: 'cut' }, { label: '复制文字', role: 'copy' }, { label: '粘贴文字', role: 'paste' }, { type: 'separator' }, item('复制可见画面（选区或全画布）', 'Ctrl+Shift+C', 'copyMerged'), item('粘贴图片为图层', 'Ctrl+Shift+V', 'pasteImage'), item('使用前景色填充', 'Shift+F5', 'fillSelection'), item('清除像素（选区或整个图层）', undefined, 'clearSelection')] },
    { label: '图像(&I)', submenu: [item('图像大小…', undefined, 'imageSize'), item('画布大小…', undefined, 'canvasSize'), item('裁剪到选区', undefined, 'cropSelection'), { type: 'separator' }, item('图像调整…', undefined, 'adjust')] },
    { label: '图层(&L)', submenu: [item('新建图层', 'Ctrl+Shift+N', 'addLayer'), item('复制图层', 'Ctrl+J', 'duplicate'), item('删除图层', undefined, 'deleteLayer'), item('向上移动', undefined, 'raise'), item('向下移动', undefined, 'lower'), item('创建图层组', 'Ctrl+G', 'group'), item('取消分组', 'Ctrl+Shift+G', 'ungroup'), item('创建 / 释放剪贴蒙版', 'Ctrl+Alt+G', 'clipping'), { type: 'separator' }, item('栅格化文字', undefined, 'rasterize'), item('向下合并', 'Ctrl+E', 'mergeDown'), item('合并可见图层', 'Ctrl+Shift+M', 'mergeVisible')] },
    { label: '图层样式', submenu: [item('自由变换','Ctrl+T','freeTransform'),item('图层样式…',undefined,'layerStyles'),item('清除图层样式',undefined,'clearStyles')] },
    { label: '选择(&S)', submenu: [item('全选', 'Ctrl+A', 'selectAll'), item('取消选区', 'Ctrl+D', 'deselect')] },
    { label:'滤镜(&T)',submenu:[{label:'模糊',submenu:[['gaussian','高斯模糊…'],['box','方框模糊…'],['motion','动感模糊…'],['radial','径向模糊…'],['surface','表面模糊…'],['average','平均']].map(([kind,label])=>item(label,undefined,'blur:'+kind))},item('选择主体 / 移除背景…',undefined,'removeBackground')] },
    { label: '视图(&V)', submenu: [item('标尺','Ctrl+R','toggleRulers'),item('参考线','Ctrl+;','toggleGuides'),item('适合窗口', 'Ctrl+0', 'fit'), item('实际像素', 'Ctrl+1', 'actual'), { label: '全屏', role: 'togglefullscreen' }] },
    { label: '帮助(&H)', submenu: [item('使用说明与快捷键', undefined, 'help'), { label: '关于 Compositor 中文版', click: () => dialog.showMessageBox(win, { type: 'info', title: '关于', message: 'Compositor 中文版 ' + app.getVersion(), detail: '基于 robbietilton/Compositor 的独立 Windows 核心功能移植。\n原项目及本移植使用 MIT 许可证。\n支持分层 PSD、图层组、像素蒙版、剪贴蒙版、绘画、中文文字、选区裁剪、渐变、调整与图片导入导出。' }) }] }
  ]));
  win.setMenuBarVisibility(false);
  handle('window:action', action => {
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
    else if (action === 'close') win.close();
    else throw new Error('未知窗口操作。');
  });
  ipcMain.on('document:dirty', (event, value) => { trusted(event); dirty = Boolean(value); });
  const ai=require('./ai-service.cjs').createAiService(p=>{if(!win.isDestroyed())win.webContents.send('ai:progress',p);});
  handle('ai:run',p=>ai.run(p));handle('ai:cancel',()=>ai.cancel());win.on('closed',()=>ai.cancel());
  handle('fonts:list',()=>new Promise((resolve,reject)=>{require('node:child_process').execFile('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname.replace('app.asar','app.asar.unpacked'),'native','fonts.ps1')],{windowsHide:true,encoding:'utf8',maxBuffer:2*1024*1024},(error,out)=>error?reject(error):resolve(JSON.parse(out.replace(/^\uFEFF/,''))));}));
  handle('color:profile',async kind=>{let file=path.join(process.env.WINDIR,'System32','spool','drivers','color','RSWOP.icm');if(kind==='custom'){const r=await dialog.showOpenDialog(win,{title:'选择 CMYK ICC 配置文件',filters:[{name:'ICC 配置文件',extensions:['icc','icm']}],properties:['openFile']});if(r.canceled)return null;file=r.filePaths[0];}const b=await fs.readFile(file);if(b.length<128||b.length>4*1024*1024||b.toString('ascii',36,40)!=='acsp'||b.toString('ascii',16,20)!=='CMYK')throw new Error('请选择 CMYK ICC 配置文件。');return b.toString('base64');});
  handle('recent:source',async payload=>{const file=payload.path;if(!path.isAbsolute(file)||!['.psd','.ccomp'].includes(path.extname(file).toLowerCase()))throw new Error('最近项目路径无效。');const stat=await fs.stat(file),stamp=stat.mtimeMs+':'+stat.size;if(payload.stamp===stamp)return{stamp};const source=path.extname(file).toLowerCase()==='.psd'?await processPsd('preview',await fs.readFile(file)):{project:await readProject(file)};return{...source,stamp};});
  handle('project:open', async requestedPath => {
    if(requestedPath&&(!path.isAbsolute(requestedPath)||!['.ccomp','.psd'].includes(path.extname(requestedPath).toLowerCase())))throw new Error('最近项目路径无效。');
    const result = requestedPath?{canceled:false,filePaths:[requestedPath]}:await dialog.showOpenDialog(win, { title: '打开项目或 PSD', filters: [{ name: '项目与 Photoshop 文件', extensions: ['ccomp', 'psd'] }, { name: 'Photoshop PSD', extensions: ['psd'] }, { name: 'Compositor 项目', extensions: ['ccomp'] }], properties: ['openFile'] });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    if (path.extname(file).toLowerCase() === '.psd') {
      const imported = await processPsd('read',await fs.readFile(file)); pendingPath = null;
      return { ...imported, path: file, name: path.basename(file, path.extname(file)) };
    }
    const project = await readProject(result.filePaths[0]);
    pendingPath = result.filePaths[0];
    return { project, path: result.filePaths[0], name: path.basename(result.filePaths[0], '.ccomp') };
  });
  handle('psd:export', async payload => {
    const result = await dialog.showSaveDialog(win, { title: '导出分层 PSD', defaultPath: '作品.psd', filters: [{ name: 'Photoshop PSD', extensions: ['psd'] }] });
    if (result.canceled) return null;
    const bytes = await processPsd('write',payload); await atomicWrite(result.filePath, bytes); return result.filePath;
  });
  handle('project:save', async (project, saveAs) => {
    let file = currentPath;
    if (!file || saveAs) {
      const result = await dialog.showSaveDialog(win, { title: '保存项目', defaultPath: file || '未命名.ccomp', filters: [{ name: 'Compositor 中文版项目', extensions: ['ccomp'] }] });
      if (result.canceled) return null;
      file = result.filePath;
    }
    await saveProject(file, project);
    currentPath = file;
    return { name: path.basename(file, '.ccomp'), path: file };
  });
  handle('image:import', async () => {
    const result = await dialog.showOpenDialog(win, { title: '导入图片为图层', filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }], properties: ['openFile', 'multiSelections'] });
    if (result.canceled) return [];
    let bytes = 0;
    const images = [];
    for (const file of result.filePaths) {
      bytes += (await fs.stat(file)).size;
      const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.bmp': 'image/bmp' }[path.extname(file).toLowerCase()];
      if (!mime) throw new Error('不支持此图片格式。');
      images.push({ name: path.basename(file), data: `data:${mime};base64,${(await fs.readFile(file)).toString('base64')}` });
    }
    return images;
  });
  handle('artboards:export',async(items,format,resolution=72)=>{
    if(!['png','jpeg'].includes(format)||!Array.isArray(items)||!items.length)throw new Error('画板导出数据无效。');
    const mime='image/'+format;let size=0;for(const item of items){if(typeof item.data!=='string'||!item.data.startsWith('data:'+mime+';base64,')||(size+=item.data.length)>MAX_BYTES*1.4)throw new Error('画板导出数据过大或格式无效。');}
    const chosen=await dialog.showOpenDialog(win,{title:'选择全部画板的导出文件夹',properties:['openDirectory','createDirectory']});if(chosen.canceled)return null;
    const directory=chosen.filePaths[0],extension=format==='jpeg'?'jpg':'png',output=[],{exportName}=require('./src/export-name.mjs');
    for(const item of items){const name=exportName(item.name);let index=1,file;do{file=path.join(directory,name+(index===1?'':' ('+index+')')+'.'+extension);index++;}while(await fs.stat(file).then(()=>true,()=>false));await atomicWrite(file,setImageResolution(Buffer.from(item.data.split(',')[1],'base64'),format,resolution));output.push(file);}return output;
  });
  handle('image:export', async (data, format, resolution = 72) => {
    const mime = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : null;
    if (!mime || typeof data !== 'string' || !data.startsWith(`data:${mime};base64,`) || data.length > MAX_BYTES * 1.4) throw new Error('导出数据无效。');
    const extension = format === 'jpeg' ? 'jpg' : 'png';
    const result = await dialog.showSaveDialog(win, { title: '导出图片', defaultPath: `作品.${extension}`, filters: [{ name: mime, extensions: [extension] }] });
    if (result.canceled) return null;
    await atomicWrite(result.filePath, setImageResolution(Buffer.from(data.split(',')[1], 'base64'), format, resolution));
    return result.filePath;
  });
  handle('image:copy', async data => {
    if (typeof data !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data) || data.length > MAX_BYTES * 1.4) throw new Error('复制的图片数据无效。');
    const bytes = Buffer.from(data.split(',')[1], 'base64');
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('复制的图片数据无效。');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (!width || !height || width > 16384 || height > 16384 || width * height > 16384 * 16384) throw new Error('复制图片超过尺寸限制。');
    const image = nativeImage.createFromBuffer(bytes); if (image.isEmpty()) throw new Error('图片无法解码。');
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([image.toPNG()], { type: 'image/png' }) })]); return true;
  });
  handle('image:paste', async () => {
    const items = await clipboard.read();
    const item = items.find(i => i.types.includes('image/png')) || items.find(i => i.types.some(t => t.startsWith('image/')));
    if (!item) return null;
    const type = item.types.includes('image/png') ? 'image/png' : item.types.find(t => t.startsWith('image/'));
    const blob = await item.getType(type); if (blob.size > MAX_BYTES) throw new Error('剪贴板图片超过 128 MB。');
    const image = nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer())); if (image.isEmpty()) throw new Error('剪贴板图片无法解码。');
    const { width, height } = image.getSize();
    if (width > 16384 || height > 16384 || width * height > 16384 * 16384) throw new Error('剪贴板图片超过尺寸限制。');
    const data = image.toDataURL(); if (data.length > MAX_BYTES * 1.4) throw new Error('剪贴板图片超过 128 MB。');
    return data;
  });
  // The renderer commits a path only after all project images decode successfully.
  ipcMain.on('document:commit', (event, kind) => { trusted(event); currentPath = kind?.kind==='activate'?kind.path:kind === 'open' ? pendingPath : null; pendingPath = null; });
  ipcMain.on('document:close', event => { trusted(event); if (!dirty) win.close(); });
  ipcMain.on('renderer:ready',event => { trusted(event); win.webContents.send('startup:complete'); });
  win.loadURL(index);
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit',() => psdWorker?.terminate());
