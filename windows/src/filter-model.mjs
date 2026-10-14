import {beautyFields,validateBeauty} from './beauty-model.mjs';
import {blurNames,blurKernel,blurPixels} from './blur-model.mjs';
import {applyCurves,applyLUT,validateCurves,validateLUT} from './filter-color.mjs';
const radius=['radius','半径（px）',5,0,250,.1];
export const filters={
 gaussian:{name:blurNames.gaussian,fields:[radius]},box:{name:blurNames.box,fields:[radius]},surface:{name:blurNames.surface,fields:[['radius','半径（px）',5,0,20,1],['threshold','阈值',20,1,255,1]]},
 motion:{name:blurNames.motion,fields:[radius,['angle','角度（°）',0,-180,180,1]]},radial:{name:blurNames.radial,fields:[['radius','强度',5,0,100,1],['centerX','中心 X（%）',50,0,100,1],['centerY','中心 Y（%）',50,0,100,1]]},average:{name:blurNames.average,fields:[]},
 usm:{name:'USM 锐化',fields:[['radius','半径（px）',1,0,50,.1],['amount','数量（%）',100,0,500,1],['threshold','阈值',3,0,255,1]]},
 highpass:{name:'高反差保留',fields:[['radius','半径（px）',3,0,100,.1]]},median:{name:'中值去噪',fields:[['radius','半径（px）',1,1,8,1]]},
 beauty:{name:'AI 美颜',fields:beautyFields},curves:{name:'曲线',fields:[]},lut:{name:'颜色查找 / LUT',fields:[]}
};
export function filterDefaults(kind){const values=Object.fromEntries(filters[kind].fields.map(([key,,value])=>[key,value]));if(kind==='beauty')values.faces=[];if(kind==='curves')values.points={rgb:[[0,0],[255,255]]};if(kind==='radial')values.method='spin';return values;}
export function makeFilter(kind,values){return{id:crypto.randomUUID(),kind,enabled:true,strength:1,values:values||filterDefaults(kind)};}
export function validateFilters(stack){if(!Array.isArray(stack)||stack.length>32)throw new Error('每个素材最多支持 32 个滤镜。');const ids=new Set();for(const f of stack){if(!f||typeof f.id!=='string'||!f.id||f.id.length>200||ids.has(f.id)||!Object.hasOwn(filters,f.kind)||typeof f.enabled!=='boolean'||!Number.isFinite(f.strength)||f.strength<0||f.strength>1||!f.values)throw new Error('滤镜信息无效。');ids.add(f.id);for(const [key,,,min,max,step] of filters[f.kind].fields){const value=f.values[key];if(!Number.isFinite(value)||value<min||value>max||step===1&&!Number.isInteger(value))throw new Error('滤镜参数超出范围。');}if(f.kind==='beauty')validateBeauty(f.values);if(f.kind==='curves')validateCurves(f.values.points);if(f.kind==='lut'&&f.values.lut)validateLUT(f.values.lut);if(f.kind==='radial'&&!['spin','zoom'].includes(f.values.method))throw new Error('径向模糊方式无效。');}}
export const activeFilters=stack=>(stack||[]).filter(f=>f.enabled&&f.strength>0);
export function filterHalo(f){if(['gaussian','box','surface'].includes(f.kind))return blurKernel({kind:f.kind,...f.values}).halo;if(['usm','highpass'].includes(f.kind))return blurKernel({kind:'gaussian',radius:f.values.radius}).halo;if(f.kind==='median')return f.values.radius;if(f.kind==='motion')return Math.ceil(f.values.radius);return 0;}
export function filterPadding(stack){return activeFilters(stack).reduce((n,f)=>n+(['gaussian','box','motion'].includes(f.kind)?filterHalo(f):0),0);}
export function scaledFilters(stack,factor){return activeFilters(stack).map(f=>({...f,values:{...f.values,...(['gaussian','box','surface','motion','usm','highpass','median'].includes(f.kind)?{radius:f.kind==='median'?Math.max(1,Math.round(f.values.radius/factor)):f.values.radius/factor}:{} )}}));}
function median(data,w,h,r){const out=new Uint8ClampedArray(data),hist=new Uint32Array(256);for(let y=0;y<h;y++)for(let c=0;c<3;c++){hist.fill(0);let count=0;const add=(x,sign)=>{if(x<0||x>=w)return;for(let yy=Math.max(0,y-r);yy<=Math.min(h-1,y+r);yy++){const at=(yy*w+x)*4;if(data[at+3]){hist[data[at+c]]+=sign;count+=sign;}}};for(let x=0;x<=Math.min(w-1,r);x++)add(x,1);for(let x=0;x<w;x++){const at=(y*w+x)*4;if(data[at+3]&&count){let sum=0,k=0;for(;k<255;k++){sum+=hist[k];if(sum>Math.floor(count/2))break;}out[at+c]=k;}add(x-r,-1);add(x+r+1,1);}}return out;}
export function filterPixels(data,w,h,f){
 if(['gaussian','box','surface'].includes(f.kind))return blurPixels(data,w,h,{kind:f.kind,...f.values});
 if(f.kind==='median')return median(data,w,h,f.values.radius);
 const out=new Uint8ClampedArray(data);
 if(f.kind==='curves')return applyCurves(out,f.values.points);
 if(f.kind==='lut')return f.values.lut?applyLUT(out,f.values.lut):out;
 if(['usm','highpass'].includes(f.kind))return sharpenPixels(data,blurPixels(data,w,h,{kind:'gaussian',radius:f.values.radius}),f);
 throw new Error('此滤镜需要全局坐标采样。');
}
export function sharpenPixels(data,smooth,f){const out=new Uint8ClampedArray(data);for(let i=0;i<data.length;i+=4)for(let c=0;c<3;c++){const difference=data[i+c]-smooth[i+c];out[i+c]=f.kind==='highpass'?128+difference:Math.abs(difference)>=f.values.threshold?data[i+c]+difference*f.values.amount/100:data[i+c];}return out;}
export function mixFilter(before,after,strength){if(strength===1)return after;const out=new Uint8ClampedArray(after.length);for(let i=0;i<out.length;i+=4){const a=before[i+3]*(1-strength),b=after[i+3]*strength,total=a+b;for(let c=0;c<3;c++)out[i+c]=total?(before[i+c]*a+after[i+c]*b)/total:0;out[i+3]=total;}return out;}
