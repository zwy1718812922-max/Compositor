const {adjustments,defaults,adjustPixels}=require('./src/fill-model.mjs');
const color=hex=>{const [r,g,b]=hex.slice(1).match(/../g).map(x=>parseInt(x,16));return {r,g,b};};
const hex=c=>'#'+['r','g','b'].map(k=>Math.max(0,Math.min(255,Math.round(c?.[k]||0))).toString(16).padStart(2,'0')).join('');
function exportAdjustment(a){const p=a.values,kind=a.kind;
 if(kind==='brightness')return {type:'brightness/contrast',brightness:p.brightness,contrast:p.contrast,useLegacy:true};
 if(kind==='levels')return {type:'levels',rgb:{shadowInput:p.black,highlightInput:p.white,shadowOutput:0,highlightOutput:255,midtoneInput:p.gamma}};
 if(kind==='curves')return {type:'curves',rgb:Array.from({length:17},(_,i)=>{const input=Math.round(i/16*255),pixel=new Uint8ClampedArray([input,input,input,255]);adjustPixels(pixel,kind,p);return{input,output:pixel[0]};})};
 if(kind==='exposure')return {type:'exposure',exposure:p.exposure,offset:p.offset,gamma:p.gamma};
 if(kind==='vibrance')return {type:'vibrance',vibrance:p.vibrance,saturation:p.saturation};
 if(kind==='hue')return {type:'hue/saturation',master:{a:0,b:0,c:0,d:0,hue:p.hue,saturation:p.saturation,lightness:p.lightness}};
 if(kind==='balance')return {type:'color balance',midtones:{cyanRed:p.red,magentaGreen:p.green,yellowBlue:p.blue},preserveLuminosity:false};
 if(kind==='bw')return {type:'black & white',reds:p.red,greens:p.green,blues:p.blue,yellows:(p.red+p.green)/2,cyans:(p.green+p.blue)/2,magentas:(p.red+p.blue)/2,useTint:false};
 if(kind==='photo')return {type:'photo filter',color:color(p.color),density:p.density/100,preserveLuminosity:false};
 if(kind==='mixer')return {type:'channel mixer',monochrome:false,red:{red:p.red,green:0,blue:0,constant:0},green:{red:0,green:p.green,blue:0,constant:0},blue:{red:0,green:0,blue:p.blue,constant:0}};
 if(kind==='lookup'){const lines=['TITLE "Compositor Warm Film"','LUT_3D_SIZE 2'];for(let b=0;b<2;b++)for(let g=0;g<2;g++)for(let r=0;r<2;r++){const pixel=new Uint8ClampedArray([r*255,g*255,b*255,255]);adjustPixels(pixel,kind,p);lines.push([...pixel.slice(0,3)].map(v=>(v/255).toFixed(6)).join(' '));}return {type:'color lookup',lookupType:'3dlut',name:'Compositor Warm Film',lutFormat:'cube',dataOrder:'rgb',tableOrder:'rgb',lut3DFileName:'Compositor-Warm.cube',lut3DFileData:Buffer.from(lines.join('\n')+'\n')};}
 if(kind==='invert')return {type:'invert'};
 if(kind==='posterize')return {type:'posterize',levels:p.levels};if(kind==='threshold')return {type:'threshold',level:p.level};
 if(kind==='gradientMap')return {type:'gradient map',gradientType:'solid',name:'Compositor 渐变映射',smoothness:1,colorStops:[{color:color(p.color),location:0,midpoint:.5},{color:color(p.color2),location:1,midpoint:.5}],opacityStops:[{opacity:1,location:0,midpoint:.5},{opacity:1,location:1,midpoint:.5}]};
 if(kind==='selective')return {type:'selective color',mode:'absolute',[p.range]:{c:p.cyan,m:p.magenta,y:p.yellow,k:p.black}};
 throw new Error('不支持此调整类型。');
}
function importAdjustment(a){let kind,values={};
 if(a.type==='brightness/contrast'){kind='brightness';values={brightness:a.brightness||0,contrast:a.contrast||0};}
 else if(a.type==='levels'){kind='levels';const c=a.rgb||{};values={black:c.shadowInput||0,white:c.highlightInput??255,gamma:c.midtoneInput||1};if(['red','green','blue'].some(k=>a[k]&&JSON.stringify(a[k])!==JSON.stringify({shadowInput:0,highlightInput:255,shadowOutput:0,highlightOutput:255,midtoneInput:1})))return null;}
 else if(a.type==='curves'){if(a.red||a.green||a.blue)return null;kind='curves';const point=a.rgb?.find(p=>p.input>=50&&p.input<=80);values={amount:point?Math.max(-100,Math.min(100,(point.output-point.input)/(3*(point.input/255)**2-2*(point.input/255)**3-point.input/255)/255*100)):0};}
 else if(a.type==='exposure'){kind='exposure';values={exposure:a.exposure||0,offset:a.offset||0,gamma:a.gamma||1};}
 else if(a.type==='vibrance'){kind='vibrance';values={vibrance:a.vibrance||0,saturation:a.saturation||0};}
 else if(a.type==='hue/saturation'){kind='hue';const c=a.master||{};values={hue:c.hue||0,saturation:c.saturation||0,lightness:c.lightness||0};}
 else if(a.type==='color balance'){kind='balance';const c=a.midtones||{};values={red:c.cyanRed||0,green:c.magentaGreen||0,blue:c.yellowBlue||0};}
 else if(a.type==='black & white'){kind='bw';values={red:a.reds??21.26,green:a.greens??71.52,blue:a.blues??7.22};}
 else if(a.type==='photo filter'){kind='photo';values={density:(a.density??.25)*100,color:hex(a.color)};}
 else if(a.type==='channel mixer'){if(a.monochrome||a.red?.green||a.red?.blue||a.green?.red||a.green?.blue||a.blue?.red||a.blue?.green)return null;kind='mixer';values={red:a.red?.red??100,green:a.green?.green??100,blue:a.blue?.blue??100};}
 else if(a.type==='color lookup'&&a.lut3DFileName==='Compositor-Warm.cube'){kind='lookup';const lines=Buffer.from(a.lut3DFileData||[]).toString('utf8').trim().split('\n');const last=Number(lines.at(-1)?.split(' ')[2]);values={amount:Math.max(0,Math.min(100,(1-last)/.15*100))};}
 else if(a.type==='invert')kind='invert';else if(a.type==='posterize'){kind='posterize';values={levels:a.levels||4};}else if(a.type==='threshold'){kind='threshold';values={level:a.level??128};}
 else if(a.type==='gradient map'&&a.colorStops?.length===2){kind='gradientMap';values={color:hex(a.colorStops[0].color),color2:hex(a.colorStops[1].color)};}
 else if(a.type==='selective color'){kind='selective';const range=['reds','neutrals','blacks','whites'].find(k=>a[k]&&Object.values(a[k]).some(v=>v));const c=a[range]||{};values={range:range||'neutrals',cyan:c.c||0,magenta:c.m||0,yellow:c.y||0,black:c.k||0};}
 if(!kind)return null;
 values={...defaults(kind),...values};for(const [k,,def,min,max] of adjustments[kind][1])values[k]=Math.max(min,Math.min(max,values[k]??def));return {kind,values};
}
function exportFill(f){if(f.kind==='solid')return {type:'color',color:color(f.color)};if(f.kind==='gradient')return {type:'solid',name:'Compositor 渐变填充',angle:-f.angle,scale:1,style:'linear',align:true,smoothness:1,colorStops:[{color:color(f.color),location:0,midpoint:.5},{color:color(f.color2),location:1,midpoint:.5}],opacityStops:[{opacity:1,location:0,midpoint:.5},{opacity:1,location:1,midpoint:.5}]};return null;}
function importFill(f){if(f.type==='color')return {kind:'solid',color:hex(f.color),color2:'#ffffff',angle:0,scale:100,pattern:'checker'};if(f.type==='solid'&&f.colorStops?.length===2&&(!f.style||f.style==='linear'))return {kind:'gradient',color:hex(f.colorStops[0].color),color2:hex(f.colorStops[1].color),angle:-(f.angle||0),scale:100,pattern:'checker'};return null;}
module.exports={exportAdjustment,importAdjustment,exportFill,importFill};
