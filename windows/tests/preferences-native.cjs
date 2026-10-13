const {chromium}=require('@playwright/test'),{spawn}=require('node:child_process'),net=require('node:net'),path=require('node:path'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
  const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  const profile=path.join(root,'validation','preferences-native','profile-'+Date.now());await fs.mkdir(profile,{recursive:true});
  const child=spawn(path.join(root,'dist','lite-unpacked','Compositor 中文版.exe'),[],{env:{...process.env,COMPOSITOR_TEST:'1',COMPOSITOR_DEBUG_PORT:String(port),COMPOSITOR_PROFILE:profile},windowsHide:true,stdio:'ignore'});let browser;
  try {
    let endpoint;for(let i=0;i<100;i++){try{endpoint=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert(endpoint,'原生宿主未启动');
    browser=await chromium.connectOverCDP(endpoint.webSocketDebuggerUrl);const page=browser.contexts()[0].pages()[0],errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.locator('#startup-screen').waitFor({state:'hidden'});
    await page.locator('#menu-bar>button').filter({hasText:'编辑(E)'}).click();await page.getByRole('menuitem',{name:/首选项/}).click();
    await page.locator('#preferences-dialog').waitFor({state:'visible'});
    await page.locator('#pref-canvasBackground').selectOption('#606060');await page.locator('#pref-historySteps').selectOption('5');await page.locator('#preferences-form button[type=submit]').click();
    assert.equal(await page.locator('#viewport').evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(96, 96, 96)');
    await page.reload();await page.locator('#startup-screen').waitFor({state:'hidden'});
    assert.equal(await page.locator('#viewport').evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(96, 96, 96)');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('compositor.preferences.v1')).historySteps),5);
    await page.keyboard.press('Control+k');await page.locator('#preferences-dialog').waitFor({state:'visible'});
    assert.deepEqual(errors,[]);console.log('原生宿主首选项：菜单、保存、重启恢复通过');
    await page.evaluate(()=>window.desktop.testConfigure({exit:true})).catch(()=>{});
  } finally {if(browser)await browser.close().catch(()=>{});if(child.exitCode===null)child.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
