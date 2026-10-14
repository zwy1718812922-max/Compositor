const finite=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
export function validateCurves(points){
 if(!points||Object.keys(points).some(k=>!['rgb','red','green','blue'].includes(k)))throw new Error('曲线通道无效。');
 for(const list of Object.values(points)){if(!Array.isArray(list)||list.length<2||list.length>32||list.some((p,i)=>!Array.isArray(p)||p.length!==2||!p.every(v=>finite(v,0,255))||i&&p[0]<=list[i-1][0])||list[0][0]!==0||list.at(-1)[0]!==255)throw new Error('曲线需要 2–32 个按输入值递增的控制点，首尾输入为 0 和 255。');}
}
export function curveTable(points=[[0,0],[255,255]]){const out=new Float32Array(256);let j=0;for(let x=0;x<256;x++){while(j<points.length-2&&x>points[j+1][0])j++;const a=points[j],b=points[j+1];out[x]=a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);}return out;}
const tables=new WeakMap();
export function applyCurves(data,points){let lookup=tables.get(points);if(!lookup){lookup=['rgb','red','green','blue'].map(k=>curveTable(points[k]));tables.set(points,lookup);}for(let i=0;i<data.length;i+=4)for(let c=0;c<3;c++){const value=lookup[0][data[i+c]],lo=Math.floor(value),hi=Math.min(255,lo+1),fraction=value-lo;data[i+c]=lookup[c+1][lo]*(1-fraction)+lookup[c+1][hi]*fraction;}return data;}
export function validateLUT(lut){if(!lut||!Number.isInteger(lut.size)||lut.size<2||lut.size>65||typeof lut.name!=='string'||lut.name.length>200||!Array.isArray(lut.data)||lut.data.length!==lut.size**3*3||!lut.data.every(v=>finite(v,-16,16))||!Array.isArray(lut.min)||!Array.isArray(lut.max)||lut.min.length!==3||lut.max.length!==3||lut.min.some((v,i)=>!finite(v,-16,16)||!finite(lut.max[i],-16,16)||lut.max[i]<=v))throw new Error('3D LUT 数据无效（支持 2–65 阶）。');}
export function parseCube(text,name='自定义 LUT'){
 if(typeof text!=='string'||text.length>32*1024*1024)throw new Error('LUT 文件过大。');const lut={name:name.slice(0,200),size:0,min:[0,0,0],max:[1,1,1],data:[]};let sizeSeen=false;
 for(const raw of text.replace(/^\uFEFF/,'').split(/\r?\n/)){const line=raw.replace(/#.*$/,'').trim();if(!line)continue;const parts=line.split(/\s+/),key=parts[0];if(key==='TITLE'){const title=line.match(/^TITLE\s+"(.*)"$/);if(!title)throw new Error('LUT 标题格式无效。');lut.name=title[1].slice(0,200);}
 else if(key==='LUT_3D_SIZE'){if(sizeSeen||parts.length!==2)throw new Error('LUT 尺寸重复或无效。');sizeSeen=true;lut.size=Number(parts[1]);if(!Number.isInteger(lut.size)||lut.size<2||lut.size>65)throw new Error('支持 2–65 阶 3D LUT。');}
 else if(key==='DOMAIN_MIN'||key==='DOMAIN_MAX'){if(parts.length!==4)throw new Error('LUT 输入范围无效。');lut[key==='DOMAIN_MIN'?'min':'max']=parts.slice(1).map(Number);}
 else if(/^[A-Za-z_]/.test(key))throw new Error('仅支持标准 3D .cube LUT，暂不支持 1D 或组合 LUT。');
 else{if(!sizeSeen||parts.length!==3||parts.some(v=>!Number.isFinite(Number(v))))throw new Error('LUT 采样行无效。');lut.data.push(...parts.map(Number));if(lut.data.length>lut.size**3*3)throw new Error('LUT 采样数量超过声明尺寸。');}}
 validateLUT(lut);return lut;
}
export function applyLUT(data,lut,amount=1){const n=lut.size,values=lut.data;for(let i=0;i<data.length;i+=4){const source=[data[i],data[i+1],data[i+2]],p=source.map((v,c)=>Math.max(0,Math.min(n-1,(v/255-lut.min[c])/(lut.max[c]-lut.min[c])*(n-1)))),base=p.map(Math.floor),fraction=p.map((v,c)=>v-base[c]),out=[0,0,0];
 for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++){const weight=(x?fraction[0]:1-fraction[0])*(y?fraction[1]:1-fraction[1])*(z?fraction[2]:1-fraction[2]),at=((Math.min(n-1,base[2]+z)*n+Math.min(n-1,base[1]+y))*n+Math.min(n-1,base[0]+x))*3;for(let c=0;c<3;c++)out[c]+=values[at+c]*255*weight;}
 for(let c=0;c<3;c++)data[i+c]=source[c]*(1-amount)+Math.max(0,Math.min(255,out[c]))*amount;}return data;}
