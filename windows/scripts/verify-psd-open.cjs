const {chromium}=require('@playwright/test'),{spawn}=require('node:child_process'),net=require('node:net'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
  const file=process.env.COMPOSITOR_VERIFY_PSD;if(!file)throw Error('Set COMPOSITOR_VERIFY_PSD to a layered PSD.');
  const exe=process.env.COMPOSITOR_NATIVE_EXECUTABLE||path.join(root,'dist','lite-unpacked','Compositor 中文版.exe');
  const folder=path.join(root,'validation','psd-open',process.env.COMPOSITOR_BENCH_LABEL||'current');await fs.mkdir(folder,{recursive:true});
  const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
  const child=spawn(exe,[],{env:{...process.env,COMPOSITOR_TEST:'1',COMPOSITOR_DEBUG_PORT:String(port),COMPOSITOR_PROFILE:process.env.COMPOSITOR_VERIFY_PROFILE||path.join(folder,'profile')},windowsHide:true,stdio:'ignore'});let browser;
  try{
    let endpoint;for(let n=0;n<100;n++){try{endpoint=await(await fetch(`http://127.0.0.1:${port}/json/version`)).json();break;}catch{}await new Promise(r=>setTimeout(r,100));}
    assert(endpoint,'WebView2 debugging endpoint did not start');browser=await chromium.connectOverCDP(endpoint.webSocketDebuggerUrl);const page=browser.contexts()[0].pages()[0],errors=[],failed=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push({url:r.url(),failure:r.failure()}));
    await page.waitForURL('https://compositor.local/src/index.html');await page.locator('#startup-screen').waitFor({state:'hidden'});
    const result=await page.evaluate(async file=>{const t=performance.now(),r=await window.desktop.openProject(file);if(!r.ok)throw Error(r.error);const p=r.value.project;return{layers:p.layers.length,groups:p.layers.filter(l=>l.type==='group').length,text:p.layers.filter(l=>l.type==='text').length,masks:p.layers.filter(l=>l.mask).length,fx:p.layers.filter(l=>l.styles&&Object.values(l.styles).some(s=>s.enabled)).length,width:p.width,height:p.height,importMs:performance.now()-t};},file);
    if(process.env.COMPOSITOR_EXPECT_LAYERS)assert.equal(result.layers,Number(process.env.COMPOSITOR_EXPECT_LAYERS));
    const serial=await page.evaluate(()=>Number(document.body.dataset.commandSerial||0));await page.evaluate(open=>window.desktop.testConfigure({open,command:'open'}),file);
    await page.waitForFunction(s=>Number(document.body.dataset.commandSerial||0)>s,serial);await page.waitForFunction(()=>document.body.getAttribute('aria-busy')==='false'||!!document.querySelector('dialog[open]'));
    if(await page.locator('#psd-warning-dialog').isVisible())await page.locator('[data-psd-choice=layers]').click();
    await page.waitForFunction(count=>document.querySelector('#layer-count').textContent===count+' 个图层'&&document.body.getAttribute('aria-busy')==='false',result.layers);
    assert.equal(await page.locator('#home-screen').isVisible(),false);assert.equal(await page.locator('#canvas').isVisible(),true);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
    await page.screenshot({path:path.join(folder,'opened.png')});await page.evaluate(()=>window.desktop.setDirty(false));
    const output={exe,...result,uiOpen:true,errors,failed};await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
  }finally{if(browser)await browser.close().catch(()=>{});if(child.exitCode===null)child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
