const {chromium}=require('@playwright/test'),{spawn}=require('node:child_process'),net=require('node:net'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
(async()=>{
  const file=process.env.COMPOSITOR_VERIFY_PSD;if(!file)throw new Error('Set COMPOSITOR_VERIFY_PSD to a layered PSD.');
  const folder=path.join(root,'validation','performance');await fs.mkdir(folder,{recursive:true});
  const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
  const child=spawn(path.join(root,'dist','lite-unpacked','Compositor 中文版.exe'),[],{env:{...process.env,COMPOSITOR_TEST:'1',COMPOSITOR_DEBUG_PORT:String(port),COMPOSITOR_PROFILE:path.join(folder,'profile')},windowsHide:true,stdio:'ignore'});let browser;
  try{
    let endpoint;for(let n=0;n<120;n++){try{endpoint=await(await fetch(`http://127.0.0.1:${port}/json/version`)).json();break;}catch{}await new Promise(r=>setTimeout(r,100));}assert(endpoint);
    browser=await chromium.connectOverCDP(endpoint.webSocketDebuggerUrl);const page=browser.contexts()[0].pages()[0],errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>console.error(r.url(),r.failure()));page.on('console',m=>{if(m.type()==='error')console.error(m.text());});await page.waitForURL('https://compositor.local/src/index.html');await page.locator('#startup-screen').waitFor({state:'hidden'});
    const result=await page.evaluate(async file=>{
      const e=await import('./editor.js'),start=performance.now(),response=await window.desktop.openProject(file);if(!response.ok)throw new Error(response.error);
      const importedMs=performance.now()-start,t=performance.now(),p=await e.deserialize(response.value.project),decodeMs=performance.now()-t;
      const preview=e.canvas(p.width,p.height);let renderer=e.renderInto;try{renderer=(await import('./render-preview.js')).renderPreview;}catch{}
      const render=()=>renderer(preview,p,undefined,true,{scale:Math.min(1,800/p.height),pixelRatio:1});
      const frame=()=>{const t=performance.now();render();preview.getContext('2d').getImageData(0,0,1,1);return performance.now()-t;};
      const firstRenderMs=frame(),layer=p.layers.find(l=>l.canvas&&l.styles&&Object.values(l.styles).some(s=>s.enabled));assertLayer(layer);
      const dragMs=[];for(let n=0;n<6;n++){layer.x+=5;dragMs.push(frame());}
      const fill={...e.baseLayer('性能测试纯色','fill'),width:p.width,height:p.height,fill:{kind:'solid',color:'#112233',color2:'#ffffff',scale:100,angle:0}};p.layers.push(fill);
      const fillMs=[];for(const color of ['#225533','#663311','#114488','#882255','#2299aa','#334455']){fill.fill.color=color;delete fill._fill;fillMs.push(frame());}
      const s=performance.now();e.serialize(p);const snapshotMs=performance.now()-s;
      const h=performance.now();e.serialize(p,true);const undoSnapshotMs=performance.now()-h;
      function assertLayer(l){if(!l)throw new Error('Fixture needs a raster layer with FX.');}
      return{importedMs,decodeMs,firstRenderMs,dragMs,fillMs,snapshotMs,undoSnapshotMs,layers:p.layers.length-1,width:p.width,height:p.height,previewWidth:preview.width,previewHeight:preview.height};
    },file);
    const label=process.env.COMPOSITOR_BENCH_LABEL||'latest';await fs.writeFile(path.join(folder,label+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
    if(process.env.COMPOSITOR_BENCH_UI==='1'){
      const configure=p=>page.evaluate(p=>window.desktop.testConfigure(p),p),command=async action=>{const serial=await page.evaluate(()=>Number(document.body.dataset.commandSerial||0));await configure({command:action});await page.waitForFunction(s=>Number(document.body.dataset.commandSerial||0)>s,serial);await page.waitForFunction(()=>document.body.getAttribute('aria-busy')==='false'||!!document.querySelector('dialog[open]'));};
      const opened=performance.now();await configure({open:file});await command('open');if(await page.locator('#psd-warning-dialog').isVisible())await page.locator('[data-psd-choice=layers]').click();await page.waitForFunction(()=>document.querySelector('#layer-count').textContent==='36 个图层'&&document.body.getAttribute('aria-busy')==='false');
      const openUiMs=performance.now()-opened;await page.locator('#auto-select').uncheck();const row=page.locator('.layer-row').filter({has:page.locator('.fx-badge')}).first();await row.click();
      await page.evaluate(()=>{const v=document.querySelector('#viewport');window.performanceDrag={samples:[]};for(const type of ['pointerdown','pointermove','pointerup']){let start;v.addEventListener(type,()=>start=performance.now(),true);v.addEventListener(type,event=>{if(type==='pointermove'&&!event.buttons)return;document.querySelector('#canvas').getContext('2d').getImageData(0,0,1,1);const ms=performance.now()-start;if(type==='pointermove')performanceDrag.samples.push(ms);else performanceDrag[type==='pointerdown'?'startMs':'endMs']=ms;});}});
      const v=await page.locator('#viewport').boundingBox(),start={x:v.x+v.width*.5,y:v.y+v.height*.5};await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+24,start.y+12,{steps:12});await page.mouse.up();const drag=await page.evaluate(()=>performanceDrag);assert.equal(drag.samples.length,12);
      await command('undo');await command('createFill');await page.locator('[data-fill=solid]').click();const colors=await page.evaluate(()=>{const input=document.querySelector('#fill-color'),times=[];for(const value of ['#ff0000','#00ff00','#0000ff','#d6bd82','#347977','#6699ff']){const t=performance.now();input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));const c=document.querySelector('#canvas');c.getContext('2d').getImageData(0,0,1,1);times.push(performance.now()-t);}return times;});await page.locator('#fill-cancel').click();
      const output=path.join(folder,'optimized-board.ccomp');await configure({save:output});await command('save');await page.waitForFunction(()=>document.querySelector('#dirty-dot').hidden);const saved=JSON.parse(await fs.readFile(output,'utf8'));assert.equal(saved.layers.length,36);assert.equal(saved.layers.filter(l=>l.type==='text').length,9);assert.equal(saved.layers.filter(l=>l.type==='group').length,4);assert.deepEqual([saved.width,saved.height],[3508,4961]);
      const ui={openUiMs,drag,colorInputMs:colors,savedLayers:saved.layers.length};await fs.writeFile(path.join(folder,label+'-ui.json'),JSON.stringify(ui,null,2));console.log(JSON.stringify(ui,null,2));await page.screenshot({path:path.join(folder,'optimized-board.png')});
    }
    assert.deepEqual(errors,[]);await page.evaluate(()=>window.desktop.setDirty(false));
  }finally{if(browser)await browser.close().catch(()=>{});if(child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}}
})().catch(e=>{console.error(e);process.exitCode=1;});
