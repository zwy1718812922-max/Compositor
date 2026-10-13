const {test,expect,_electron:electron}=require('@playwright/test'),path=require('node:path'),fs=require('node:fs/promises');
let app,page,errors;
test.beforeEach(async()=>{const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const profile='--user-data-dir='+test.info().outputPath('profile');app=await electron.launch(process.env.COMPOSITOR_EXECUTABLE?{executablePath:process.env.COMPOSITOR_EXECUTABLE,args:[profile],env}:{args:[path.join(__dirname,'..'),profile],env});page=await app.firstWindow();errors=[];page.on('pageerror',e=>errors.push(e.message));await expect(page.locator('#startup-screen')).toBeHidden();});
test.afterEach(async()=>{if(app){await app.evaluate(({app})=>app.exit(0));await app.close();}expect(errors).toEqual([]);});
async function command(action){const serial=await page.evaluate(()=>Number(document.body.dataset.commandSerial||0));await app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('command',action),action);await page.waitForFunction(s=>Number(document.body.dataset.commandSerial||0)>s,serial);await page.waitForFunction(()=>document.body.getAttribute('aria-busy')==='false'||!!document.querySelector('dialog[open]'));}
async function create(){await command('new');await page.locator('[data-category=web]').click();await page.locator('[data-preset=web-1280]').click();await page.locator('#new-width').fill('640');await page.locator('#new-height').fill('480');await page.locator('#create-document').click();await expect(page.locator('#new-dialog')).toBeHidden();}
async function point(x,y){return page.locator('#canvas-wrap').evaluate((c,p)=>{const b=c.getBoundingClientRect(),width=parseFloat(c.style.width),height=parseFloat(c.style.height);return{x:b.x+p.x*b.width/width,y:b.y+p.y*b.height/height};},{x,y});}
async function drag(x,y,xx,yy){const a=await point(x,y),b=await point(xx,yy);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});await page.mouse.up();}
async function save(){const file=test.info().outputPath('验证.ccomp');await fs.mkdir(path.dirname(file),{recursive:true});await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await command('save');await expect(page.locator('#dirty-dot')).toBeHidden();return JSON.parse(await fs.readFile(file,'utf8'));}

test('移动工具选项在工具切换和重启后保持',async()=>{
  await create();await page.locator('#auto-select').check();await page.locator('#auto-select-mode').selectOption('group');await page.locator('#show-transform').uncheck();
  await page.locator('.tools [data-tool=brush]').click();await page.locator('.tools [data-tool=move]').click();
  await expect(page.locator('#auto-select')).toBeChecked();await expect(page.locator('#auto-select-mode')).toHaveValue('group');await expect(page.locator('#show-transform')).not.toBeChecked();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('compositor.moveTool.v1')))).toEqual({autoSelect:true,mode:'group',showTransform:false});
  await page.reload();await expect(page.locator('#startup-screen')).toBeHidden();await expect(page.locator('#auto-select')).toBeChecked();await expect(page.locator('#auto-select-mode')).toHaveValue('group');await expect(page.locator('#show-transform')).not.toBeChecked();
});

test('四角显示旋转光标并围绕图层中心旋转',async()=>{
  await create();await page.locator('.tools [data-tool=rect]').click();await drag(100,100,300,240);await page.locator('.tools [data-tool=move]').click();
  const before=(await save()).layers.at(-1),corner=page.locator('#transform-controls [data-rotate-corner=ne]');await expect(corner).toBeVisible();
  const zone=await corner.boundingBox(),frame=await page.locator('#transform-controls').boundingBox(),start={x:zone.x+zone.width/2,y:zone.y+zone.height/2},center={x:frame.x+frame.width/2,y:frame.y+frame.height/2};
  await page.mouse.move(start.x,start.y);expect(await corner.evaluate(b=>getComputedStyle(b).cursor)).toContain('data:image/svg+xml');expect(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.dataset.rotateCorner,start)).toBe('ne');
  await page.mouse.down();await page.mouse.move(center.x-(start.y-center.y),center.y+(start.x-center.x),{steps:8});await page.mouse.up();
  const after=(await save()).layers.at(-1),visualCenter=l=>{const r=l.rotation*Math.PI/180,sx=l.scale,sy=l.scaleY??sx,w=l.shape.width/2,h=l.shape.height/2;return{x:l.x+Math.cos(r)*w*sx-Math.sin(r)*h*sy,y:l.y+Math.sin(r)*w*sx+Math.cos(r)*h*sy};};
  const a=visualCenter(before),b=visualCenter(after);expect(after.rotation).toBeCloseTo(90,0);expect(b.x).toBeCloseTo(a.x,1);expect(b.y).toBeCloseTo(a.y,1);
});

test('短按固定切换，长按松开恢复，输入框和失焦不残留临时工具',async()=>{
  await create();await page.locator('#viewport').focus();await page.keyboard.press('b');await expect(page.locator('#tool-name')).toHaveText('画笔工具');
  await page.keyboard.down('v');await expect(page.locator('#tool-name')).toHaveText('移动工具');await page.waitForTimeout(280);await page.keyboard.up('v');await expect(page.locator('#tool-name')).toHaveText('画笔工具');
  await page.keyboard.press('e');await expect(page.locator('#tool-name')).toHaveText('橡皮擦工具');await page.keyboard.down('b');await page.waitForTimeout(280);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await expect(page.locator('#tool-name')).toHaveText('橡皮擦工具');await page.keyboard.up('b');
  await page.locator('#layer-search').focus();await page.keyboard.press('v');await expect(page.locator('#tool-name')).toHaveText('橡皮擦工具');
  await page.locator('.tools [data-tool=rect]').click();await drag(100,100,200,200);await page.locator('.tools [data-tool=brush]').click();await page.locator('#viewport').focus();await page.keyboard.down('v');await page.waitForTimeout(280);
  const from=await point(150,150);await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(from.x+20,from.y+20,{steps:3});await page.keyboard.up('v');await expect(page.locator('#tool-name')).toHaveText('移动工具');await page.mouse.up();await expect(page.locator('#tool-name')).toHaveText('画笔工具');
  await page.keyboard.press('Shift+V');await expect(page.locator('#tool-name')).toHaveText('画板工具');
});
