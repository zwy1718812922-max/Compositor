const {chromium}=require('@playwright/test'),{spawn,spawnSync}=require('node:child_process'),fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net');
const root=path.join(__dirname,'..');
async function port(){const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const p=server.address().port;await new Promise(r=>server.close(r));return p;}
async function measure(executable,lite,index){
  const debugPort=await port(),profile=path.join(root,'validation','startup-profiles',(lite?'lite':'old')+'-'+Date.now()+'-'+index),start=performance.now();
  const env={...process.env,COMPOSITOR_TEST:'1',COMPOSITOR_DEBUG_PORT:String(debugPort),COMPOSITOR_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(executable,lite?[]:['--remote-debugging-port='+debugPort,'--user-data-dir='+profile],{env,stdio:'ignore',windowsHide:true});let browser;
  try{
    for(let n=0;n<600;n++){try{const response=await fetch('http://127.0.0.1:'+debugPort+'/json/version');if(response.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    browser=await chromium.connectOverCDP('http://127.0.0.1:'+debugPort);const page=browser.contexts()[0].pages()[0];
    await page.waitForFunction(()=>document.querySelector('#layer-count')?.textContent==='1 个图层' && (!document.querySelector('#startup-screen') || document.querySelector('#startup-screen').hidden));
    const elapsed=Math.round(performance.now()-start);
    await page.evaluate(()=>{window.desktop.setDirty(false);window.desktop.close();}).catch(()=>{});return elapsed;
  }finally{if(browser)await browser.close().catch(()=>{});if(child.exitCode===null)spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}
}
(async()=>{
  await fs.mkdir(path.join(root,'validation'),{recursive:true});const results={method:'Process spawn to ready editor, CDP polling every 100 ms; fresh profile per run; local machine, Windows 11 x64',oldPortable:[],lite:[]};
  for(let i=0;i<3;i++){results.oldPortable.push(await measure(path.join(root,'dist','Compositor-ZH-0.4.0-x64-Portable.exe'),false,i));results.lite.push(await measure(path.join(root,'dist','lite-unpacked','Compositor 中文版.exe'),true,i));}
  results.medianMs={oldPortable:[...results.oldPortable].sort((a,b)=>a-b)[1],lite:[...results.lite].sort((a,b)=>a-b)[1]};await fs.writeFile(path.join(root,'validation','startup-benchmark.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
