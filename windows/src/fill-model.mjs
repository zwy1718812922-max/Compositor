export const fillNames={solid:'纯色',gradient:'渐变',pattern:'图案'};
// Each adjustment has editable controls; the same model is used for preview and export.
export const adjustments={
 brightness:['亮度/对比度',[['brightness','亮度',0,-150,150,1],['contrast','对比度',0,-100,100,1]]],
 levels:['色阶',[['black','黑场',0,0,254,1],['white','白场',255,1,255,1],['gamma','中间调',1,.1,10,.01]]],
 curves:['曲线',[['amount','S 曲线强度',0,-100,100,1]]],
 exposure:['曝光度',[['exposure','曝光度',0,-10,10,.01],['offset','偏移',0,-.5,.5,.01],['gamma','灰度系数',1,.1,10,.01]]],
 vibrance:['自然饱和度',[['vibrance','自然饱和度',0,-100,100,1],['saturation','饱和度',0,-100,100,1]]],
 hue:['色相/饱和度',[['hue','色相',0,-180,180,1],['saturation','饱和度',0,-100,100,1],['lightness','明度',0,-100,100,1]]],
 balance:['色彩平衡',[['red','青色 ↔ 红色',0,-100,100,1],['green','洋红 ↔ 绿色',0,-100,100,1],['blue','黄色 ↔ 蓝色',0,-100,100,1]]],
 bw:['黑白',[['red','红色',21.26,-200,300,.1],['green','绿色',71.52,-200,300,.1],['blue','蓝色',7.22,-200,300,.1]]],
 photo:['照片滤镜',[['density','浓度',25,0,100,1]]],
 mixer:['通道混合器',[['red','红色',100,-200,200,1],['green','绿色',100,-200,200,1],['blue','蓝色',100,-200,200,1]]],
 lookup:['颜色查找',[['amount','暖色胶片强度',50,0,100,1]]],
 invert:['反相',[]],posterize:['色调分离',[['levels','色阶数',4,2,256,1]]],threshold:['阈值',[['level','阈值',128,0,255,1]]],
 gradientMap:['渐变映射',[]],selective:['可选颜色',[['cyan','青色',0,-100,100,1],['magenta','洋红',0,-100,100,1],['yellow','黄色',0,-100,100,1],['black','黑色',0,-100,100,1]]]
};
export function defaults(kind){return Object.fromEntries((adjustments[kind]?.[1]||[]).map(([key,,value])=>[key,value]));}
const color=c=>c.slice(1).match(/../g).map(x=>parseInt(x,16));
const clip=n=>Math.max(0,Math.min(255,n));
export function adjustPixels(data,kind,p={}) {
 const filter=color(p.color||'#ec8d32'), end=color(p.color2||'#ffffff');
 for(let i=0;i<data.length;i+=4){let r=data[i],g=data[i+1],b=data[i+2],rgb=[r,g,b],l=r*.2126+g*.7152+b*.0722;
  if(kind==='brightness'){const c=(100+p.contrast)/100;rgb=rgb.map(v=>(v-127.5)*c+127.5+p.brightness);}
  else if(kind==='levels')rgb=rgb.map(v=>Math.pow(Math.max(0,Math.min(1,(v-p.black)/Math.max(1,p.white-p.black))),1/p.gamma)*255);
  else if(kind==='curves')rgb=rgb.map(v=>{const x=v/255;return 255*(x+p.amount/100*(3*x*x-2*x*x*x-x));});
  else if(kind==='exposure')rgb=rgb.map(v=>Math.pow(Math.max(0,v/255*Math.pow(2,p.exposure)+p.offset),1/p.gamma)*255);
  else if(kind==='vibrance'){const chroma=(Math.max(...rgb)-Math.min(...rgb))/255,s=1+p.saturation/100+p.vibrance/100*(1-chroma);rgb=rgb.map(v=>l+(v-l)*s);}
  else if(kind==='hue'){const angle=p.hue*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle),s=1+p.saturation/100;rgb=[(.213+.787*cos-.213*sin)*r+(.715-.715*cos-.715*sin)*g+(.072-.072*cos+.928*sin)*b,(.213-.213*cos+.143*sin)*r+(.715+.285*cos+.140*sin)*g+(.072-.072*cos-.283*sin)*b,(.213-.213*cos-.787*sin)*r+(.715-.715*cos+.715*sin)*g+(.072+.928*cos+.072*sin)*b].map(v=>(l+(v-l)*s)*(1-Math.abs(p.lightness/100))+(p.lightness>0?255*p.lightness/100:0));}
  else if(kind==='balance')rgb=[r+p.red,g+p.green,b+p.blue];
  else if(kind==='bw'){l=(r*p.red+g*p.green+b*p.blue)/100;rgb=[l,l,l];}
  else if(kind==='photo')rgb=rgb.map((v,c)=>v*(1-p.density/100)+filter[c]*p.density/100);
  else if(kind==='mixer')rgb=[r*p.red/100,g*p.green/100,b*p.blue/100];
  else if(kind==='lookup')rgb=[r+(255-r)*.10*p.amount/100,g+(127-g)*.06*p.amount/100,b*(1-.15*p.amount/100)];
  else if(kind==='invert')rgb=rgb.map(v=>255-v);
  else if(kind==='posterize')rgb=rgb.map(v=>Math.round(v/255*(p.levels-1))*255/(p.levels-1));
  else if(kind==='threshold')rgb=[0,0,0].map(()=>l>=p.level?255:0);
  else if(kind==='gradientMap')rgb=filter.map((v,c)=>v+(end[c]-v)*l/255);
  else if(kind==='selective'){const weight=p.range==='reds'?Math.max(0,(r-Math.max(g,b))/255):p.range==='blacks'?1-l/255:p.range==='whites'?l/255:1-(Math.max(...rgb)-Math.min(...rgb))/255;rgb=[r-(p.cyan+p.black)*2.55*weight,g-(p.magenta+p.black)*2.55*weight,b-(p.yellow+p.black)*2.55*weight];}
  for(let c=0;c<3;c++)data[i+c]=clip(rgb[c]);
 }
 return data;
}
export function validateFill(layer) {
 const f=layer.fill;if(!f||!Object.hasOwn(fillNames,f.kind)||!/^#[\da-f]{6}$/i.test(f.color)||!/^#[\da-f]{6}$/i.test(f.color2)||!Number.isFinite(f.angle)||Math.abs(f.angle)>36000||!Number.isFinite(f.scale)||f.scale<1||f.scale>1000||!['checker','dots','stripes','image'].includes(f.pattern))throw new Error('填充参数无效。');
 for(const n of [layer.width,layer.height])if(!Number.isInteger(n)||n<1||n>16384)throw new Error('填充尺寸无效。');
}
export function validateAdjustment(layer) {
 const a=layer.adjustment;if(!a||!Object.hasOwn(adjustments,a.kind)||!a.values)throw new Error('调整参数无效。');
 for(const [key,,def,min,max] of adjustments[a.kind][1])if(!Number.isFinite(a.values[key])||a.values[key]<min||a.values[key]>max)throw new Error('调整值超出范围。');
 for(const c of ['color','color2'])if(a.values[c]!==undefined&&!/^#[\da-f]{6}$/i.test(a.values[c]))throw new Error('调整颜色无效。');
 if(a.values.range!==undefined&&!['reds','neutrals','blacks','whites'].includes(a.values.range))throw new Error('可选颜色范围无效。');
}
