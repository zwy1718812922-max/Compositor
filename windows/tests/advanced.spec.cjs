const { test,expect,_electron:electron }=require('@playwright/test');
const path=require('node:path'),fs=require('node:fs/promises');
let app,page,errors;
test.beforeEach(async()=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;errors=[];
  const args=['--user-data-dir='+test.info().outputPath('profile')];
  app=await electron.launch(process.env.COMPOSITOR_EXECUTABLE ? {executablePath:process.env.COMPOSITOR_EXECUTABLE,args,env} : {args:[path.join(__dirname,'..'),...args],env});
  page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await expect(page.locator('#startup-screen')).toBeHidden();await expect(page.locator('#home-screen')).toBeVisible();await command('new');await page.locator('[data-category=web]').click();await page.locator('[data-preset=web-1280]').click();await page.locator('#new-background').selectOption('transparent');await page.locator('#create-document').click();await expect(page.locator('#new-dialog')).toBeHidden();await expect(page.locator('#layer-count')).toHaveText('1 个图层');
});
test.afterEach(async()=>{if(app){await app.evaluate(({app})=>app.exit(0));await app.close();}expect(errors).toEqual([]);});
async function command(action){await page.waitForFunction(()=>document.body.getAttribute('aria-busy')==='false');const s=await page.evaluate(()=>Number(document.body.dataset.commandSerial||0));await app.evaluate(({BrowserWindow},v)=>BrowserWindow.getAllWindows()[0].webContents.send('command',v),action);await page.waitForFunction(v=>Number(document.body.dataset.commandSerial||0)>v,s);await page.waitForFunction(()=>document.body.getAttribute('aria-busy')==='false'||!!document.querySelector('dialog[open]'));}
async function point(x,y){return page.locator('#canvas').evaluate((c,p)=>{const b=c.getBoundingClientRect();return{x:b.x+p.x*b.width/c.width,y:b.y+p.y*b.height/c.height};},{x,y});}
async function drag(x,y,xx,yy){const a=await point(x,y),b=await point(xx,yy);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();}
const pixel=(x,y)=>page.locator('#canvas').evaluate((c,p)=>Array.from(c.getContext('2d').getImageData(p.x,p.y,1,1).data),{x,y});
const image=async()=>{const data=await page.locator('#canvas').evaluate(c=>c.toDataURL());return require('node:crypto').createHash('sha256').update(require('pngjs').PNG.sync.read(Buffer.from(data.slice(22),'base64')).data).digest('hex');};
async function shape(){await page.locator('[data-tool=rect]').click();await drag(100,100,200,200);await page.locator('[data-tool=move]').click();}
async function save(file){await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await command('save');}

test('实际缩放手柄、旋转、链接蒙版及 Esc 取消保持单步撤销',async()=>{
  await shape();await command('addMask');await page.locator('.layer-row.active [data-target=image]').click();
  const handle=page.locator('[data-handle=se]');await expect(handle).toBeVisible();
  await drag(200,200,300,300);await expect(page.locator('#layer-scale')).toHaveValue('200');expect((await pixel(280,280))[3]).toBe(255);expect((await pixel(310,310))[3]).toBe(0);
  const file=test.info().outputPath('transform.ccomp');await save(file);const p=JSON.parse(await fs.readFile(file,'utf8'));expect(p.layers[1].mask.scale).toBeCloseTo(2);expect(p.layers[1].mask.x).toBeCloseTo(-100);
  const beforePixels=require('pngjs').PNG.sync.read(Buffer.from((await page.locator('#canvas').evaluate(c=>c.toDataURL())).slice(22),'base64')).data;const a=await point(300,300),b=await point(400,400);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:4});await page.keyboard.press('Escape');await page.mouse.up();
  const afterPixels=require('pngjs').PNG.sync.read(Buffer.from((await page.locator('#canvas').evaluate(c=>c.toDataURL())).slice(22),'base64')).data;let differences=0,max=0;for(let i=0;i<beforePixels.length;i++){const d=Math.abs(beforePixels[i]-afterPixels[i]);if(d){differences++;max=Math.max(max,d);}}expect(max).toBeLessThanOrEqual(1);expect(differences).toBeLessThanOrEqual(16);await expect(page.locator('#layer-x')).toHaveValue('-100');await expect(page.locator('#layer-scale')).toHaveValue('200');await expect(page.locator('#dirty-dot')).toBeHidden();
  await command('undo');await expect(page.locator('#layer-scale')).toHaveValue('100');await command('redo');await expect(page.locator('#layer-scale')).toHaveValue('200');
  const frame=await page.locator('#transform-controls').boundingBox(),rotate=await page.locator('[data-handle=rotate]').boundingBox();const center={x:frame.x+frame.width/2,y:frame.y+frame.height/2},start={x:rotate.x+rotate.width/2,y:rotate.y+rotate.height/2};
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(center.x+center.y-start.y,center.y,{steps:8});await page.mouse.up();await expect(page.locator('#layer-rotation')).toHaveValue('90');
});

test('点文字与段落文字在画布编辑，单击重编辑、取消、单步撤销和 PSD 原生文字',async()=>{
  await page.locator('[data-tool=text]').click();let a=await point(120,120);await page.mouse.click(a.x,a.y);await expect(page.locator('#inline-text')).toBeVisible();await page.locator('#inline-text').fill('中文测试');await page.locator('#inline-text').press('Control+Enter');await expect(page.locator('#layer-count')).toHaveText('2 个图层');
  await command('undo');await expect(page.locator('#layer-count')).toHaveText('1 个图层');await command('redo');await expect(page.locator('#layer-count')).toHaveText('2 个图层');
  const file=test.info().outputPath('type.ccomp');await save(file);const before=await image();a=await point(140,130);await page.mouse.click(a.x,a.y);await page.locator('#inline-text').fill('应取消');await page.locator('#inline-text').press('Escape');await expect(page.locator('#layer-count')).toHaveText('2 个图层');expect(await image()).toBe(before);await expect(page.locator('#dirty-dot')).toBeHidden();
  await page.locator('#type-size').fill('40');await page.locator('#type-size').press('Tab');await drag(400,120,480,320);await page.locator('#inline-text').fill('段落文字自动换行测试');await page.locator('#inline-text').press('Control+Enter');
  expect((await pixel(500,160))[3]).toBe(0);await save(file);const p=JSON.parse(await fs.readFile(file,'utf8')),l=p.layers.at(-1);expect(l.textMode).toBe('paragraph');expect(l.boxWidth).toBeCloseTo(80);expect(l.boxHeight).toBeCloseTo(200);
  const psd=test.info().outputPath('text.psd');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},psd);await command('export');await page.locator('#export-format').selectOption('psd');await page.locator('#export-form button[type=submit]').click();await expect(page.locator('#export-dialog')).toBeHidden();
  const {readPsd}=require('ag-psd');const raw=readPsd(await fs.readFile(psd),{skipLayerImageData:true,skipCompositeImageData:true});expect(raw.children.filter(l=>l.text).length).toBe(2);expect(raw.children.at(-1).text.shapeType).toBe('box');
});

test('所有 FX 都实际渲染，预览开关、取消、填充与保存重开及样式预设',async()=>{
  await shape();const file=test.info().outputPath('fx.ccomp');await save(file);const before=await image();await command('layerStyles');
  for(const key of ['stroke','dropShadow','innerShadow','outerGlow','innerGlow','colorOverlay','gradientOverlay','patternOverlay','bevel','satin']){
    const toggle=page.locator(`[data-effect-check="${key}"]`);await toggle.check();await expect.poll(image).not.toBe(before);await toggle.uncheck();await expect.poll(image).toBe(before);
  }
  await page.locator('[data-effect-check=stroke]').check();await page.locator('#fx-color').fill('#ff00ff');await page.locator('#fx-size').fill('8');await page.locator('#fx-size').dispatchEvent('input');await expect.poll(async()=> (await pixel(95,120))[3]).toBeGreaterThan(0);
  await page.locator('#fx-preview').uncheck();await expect.poll(image).toBe(before);await page.locator('#fx-preview').check();await expect.poll(image).not.toBe(before);await page.locator('#fx-cancel').click();await expect.poll(image).toBe(before);await expect(page.locator('#dirty-dot')).toBeHidden();
  await command('layerStyles');await page.locator('[data-effect-check=colorOverlay]').check();await page.locator('#fx-color').fill('#ff0000');await page.locator('[data-effect=blending]').click();await page.locator('#fx-fill-opacity').fill('0');await page.locator('#fx-fill-opacity').dispatchEvent('input');await expect.poll(async()=>await pixel(150,150)).toEqual([255,0,0,255]);
  await page.locator('#fx-preset-name').fill('红色叠加');await page.locator('#fx-save-style').click();await page.locator('#fx-apply').click();await save(file);const saved=JSON.parse(await fs.readFile(file,'utf8'));expect(saved.layers[1].styles.colorOverlay.enabled).toBe(true);expect(saved.layers[1].fillOpacity).toBe(0);
  const styled=await image();await command('clearStyles');expect((await pixel(150,150))[3]).toBe(0);await command('undo');expect(await image()).toBe(styled);
  await command('layerStyles');await page.locator('#fx-reset').click();await page.locator('#fx-presets').selectOption('0');await page.locator('#fx-apply').click();expect(await image()).toBe(styled);
  await command('save');await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await command('open');expect(await image()).toBe(styled);await page.screenshot({path:test.info().outputPath('fx-result.png')});
});

test('转换报告默认提供保留图层，复杂 PSD 在界面仍打开为多个图层',async()=>{
  const {psdFixture,bitmap}=require('./psd-fixture.cjs');const file=test.info().outputPath('complex.psd');await fs.writeFile(file,psdFixture({children:[{name:'底层',imageData:bitmap(8,6,[25,50,90,255])},{name:'复杂混合',blendMode:'color dodge',imageData:bitmap(2,2,[100,100,100,255])}]}));
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await command('open');await expect(page.locator('[data-psd-choice=layers]')).toBeVisible();await page.locator('[data-psd-choice=layers]').click();await expect(page.locator('#layer-count')).toHaveText('2 个图层');await expect(page.locator('.layer-name span')).toHaveText(['复杂混合','底层']);
});

test('移动吸附到图层与画布，显示真实间距，Ctrl 绕过、关闭、取消及撤销',async()=>{
  await shape();await page.locator('[data-tool=rect]').click();await drag(320,300,420,400);await page.locator('[data-tool=move]').click();
  const a=await point(350,330),b=await point(135,331);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});
  await expect(page.locator('#smart-guides')).toBeVisible();await expect(page.locator('#smart-guides [data-distance="100"]')).toBeVisible();await expect(page.locator('#status')).toContainText('已吸附');
  await page.screenshot({path:path.join(__dirname,'..','snap-preview.png')});await page.mouse.up();await expect(page.locator('#smart-guides')).toBeHidden();await expect(page.locator('#layer-x')).toHaveValue('-220');
  await command('undo');await expect(page.locator('#layer-x')).toHaveValue('0');await command('redo');await expect(page.locator('#layer-x')).toHaveValue('-220');
  await command('undo');await page.keyboard.down('Control');await drag(350,330,135,331);await page.keyboard.up('Control');await expect(page.locator('#layer-x')).toHaveValue('-215');
  await command('undo');await page.locator('#snap-enabled').uncheck();await drag(350,330,135,331);await expect(page.locator('#layer-x')).toHaveValue('-215');await command('undo');await page.locator('#snap-enabled').check();
  const file=test.info().outputPath('snap.ccomp');await save(file);const before=await image();await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y);await page.keyboard.press('Escape');await page.mouse.up();await expect(page.locator('#smart-guides')).toBeHidden();await expect(page.locator('#dirty-dot')).toBeHidden();expect(await image()).toBe(before);
  await drag(350,330,619,331);await expect(page.locator('#layer-x')).toHaveValue('270');await save(file);const saved=JSON.parse(await fs.readFile(file,'utf8'));expect(saved.layers[2].x+370).toBe(640);
});

test('多选作为整体移动及吸附，链接蒙版跟随，锁定成员阻止整组移动',async()=>{
  await shape();await command('addMask');await page.locator('.layer-row.active [data-target=image]').click();await page.locator('[data-tool=rect]').click();await drag(320,100,420,200);await page.locator('[data-tool=move]').click();
  await page.locator('.layer-row').nth(1).click({modifiers:['Control']});await page.locator('#auto-select').check();await drag(150,150,527,353);
  const file=test.info().outputPath('multi.ccomp');await save(file);let p=JSON.parse(await fs.readFile(file,'utf8'));expect(p.layers[1].x).toBe(380);expect(p.layers[2].x).toBe(380);expect(p.layers[1].mask.x).toBe(380);expect(p.layers[1].y).toBe(200);expect(p.layers[2].y).toBe(200);
  await command('undo');await page.locator('.layer-row').nth(0).click();await page.locator('.layer-row').nth(1).click({modifiers:['Control']});await command('group');await command('addMask');await page.locator('.layer-row.active [data-target=image]').click();await drag(150,150,527,353);await save(file);p=JSON.parse(await fs.readFile(file,'utf8'));expect(p.layers.find(l=>l.type==='group').mask.x).toBe(380);
  await command('undo');await page.locator('.layer-row').nth(1).click();await page.locator('.layer-row.active button[aria-label="锁定图层"]').click();await page.locator('.layer-row').nth(0).click();await drag(150,150,300,300);await expect(page.locator('#toast')).toContainText('锁定');
});

test('PSD 文字外观缓存随图像尺寸只缩放一次，保存及撤销保持正确',async()=>{
  const file=test.info().outputPath('cached-text.ccomp'),{PNG}=require('pngjs'),png=new PNG({width:64,height:32});for(let i=0;i<png.data.length;i+=4){png.data[i+1]=255;png.data[i+3]=255;}
  const l={id:'cached',name:'PSD 文字',type:'text',x:100,y:100,scale:1,rotation:0,opacity:1,blend:'source-over',visible:true,locked:false,text:'缓存文字',font:'Arial',fontSize:32,bold:false,color:'#00ff00',textRasterCache:true,data:'data:image/png;base64,'+PNG.sync.write(png).toString('base64')};await fs.writeFile(file,JSON.stringify({format:'com.compositor.windows',version:4,width:640,height:480,resolution:72,colorSpace:'sRGB',activeId:l.id,layers:[l]}));
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await command('open');expect(await pixel(120,120)).toEqual([0,255,0,255]);await command('imageSize');await page.locator('#size-width').fill('320');await page.locator('#size-form button[type=submit]').click();expect(await pixel(60,60)).toEqual([0,255,0,255]);expect((await pixel(84,60))[3]).toBe(0);await command('save');const p=JSON.parse(await fs.readFile(file,'utf8'));expect(p.layers[0].scale).toBe(.5);expect(PNG.sync.read(Buffer.from(p.layers[0].data.slice(22),'base64')).width).toBe(64);
  await command('undo');expect(await pixel(120,120)).toEqual([0,255,0,255]);
});
