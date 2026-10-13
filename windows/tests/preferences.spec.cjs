const {test,expect,_electron:electron}=require('@playwright/test'),path=require('node:path');
let app,page,errors;
test.beforeEach(async()=>{const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({args:[path.join(__dirname,'..'),'--user-data-dir='+test.info().outputPath('profile')],env});page=await app.firstWindow();errors=[];page.on('pageerror',error=>errors.push(error.message));await expect(page.locator('#startup-screen')).toBeHidden();});
test.afterEach(async()=>{if(app){await app.evaluate(({app})=>app.exit(0));await app.close();}expect(errors).toEqual([]);});
async function openPreferences(){await page.locator('#menu-bar>button').filter({hasText:'编辑(E)'}).click();await page.getByRole('menuitem',{name:/首选项/}).click();await expect(page.locator('#preferences-dialog')).toBeVisible();}

test('首选项可从主页打开，取消不保存，保存后生效并跨重启保留',async()=>{
  await openPreferences();await page.locator('#preferences-dialog').screenshot({path:test.info().outputPath('preferences.png')});
  await page.locator('#pref-canvasBackground').selectOption('#606060');
  await page.getByRole('button',{name:'取消'}).last().click();
  await openPreferences();
  await expect(page.locator('#pref-canvasBackground')).toHaveValue('#262626');
  await page.locator('#pref-canvasBackground').selectOption('#404040');
  await page.locator('#pref-checkerSize').selectOption('32');
  await page.locator('#pref-historySteps').selectOption('5');
  await page.locator('#pref-recentLimit').selectOption('5');
  await page.locator('#pref-snap').uncheck();
  await page.getByRole('button',{name:'保存设置'}).click();
  await expect(page.locator('#preferences-dialog')).toBeHidden();
  expect(await page.evaluate(()=>({background:getComputedStyle(document.getElementById('viewport')).backgroundColor,grid:getComputedStyle(document.getElementById('canvas-wrap')).backgroundSize,snap:document.getElementById('snap-enabled').checked,stored:JSON.parse(localStorage.getItem('compositor.preferences.v1'))}))).toEqual({background:'rgb(64, 64, 64)',grid:'32px 32px',snap:false,stored:{canvasBackground:'#404040',checkerSize:32,historySteps:5,recentLimit:5}});
  expect(await page.evaluate(async()=>{const {History}=await import('./editor.js');const history=new History();for(let i=0;i<7;i++)history.push({layers:[]});return history.undoStack.length;})).toBe(5);
  await page.evaluate(()=>localStorage.setItem('compositor.recentProjects.v1',JSON.stringify(Array.from({length:7},(_,index)=>({path:'C:\\不存在\\'+index+'.ccomp',name:'示例 '+index,modified:Date.now()-index})))));
  await page.reload();await expect(page.locator('#startup-screen')).toBeHidden();
  await expect(page.locator('.recent-project')).toHaveCount(5);
  await page.keyboard.press('Control+k');await expect(page.locator('#preferences-dialog')).toBeVisible();
  await expect(page.locator('#pref-historySteps')).toHaveValue('5');
  await expect(page.locator('#pref-snap')).not.toBeChecked();
  await page.locator('#preferences-reset').click();
  await page.getByRole('button',{name:'保存设置'}).click();
  await expect(page.locator('#snap-enabled')).toBeChecked();
  await expect(page.locator('#pref-canvasBackground')).toHaveValue('#262626');
});
