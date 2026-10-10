export function colorSelection(data,w,h,seeds,tolerance=32,contiguous=true){
 if(data.length!==w*h*4||w*h>64*1024*1024)throw new Error('Selection image size is invalid');const mask=new Uint8Array(w*h),seen=new Uint8Array(w*h),queue=new Uint32Array(w*h),tol=Math.max(0,Math.min(255,tolerance));
 for(const seed of seeds){const x=Math.max(0,Math.min(w-1,Math.round(seed.x))),y=Math.max(0,Math.min(h-1,Math.round(seed.y))),start=y*w+x,base=start*4;const matches=i=>{i*=4;return Math.abs(data[i+3]-data[base+3])<=tol&&(data[base+3]===0||Math.max(Math.abs(data[i]-data[base]),Math.abs(data[i+1]-data[base+1]),Math.abs(data[i+2]-data[base+2]))<=tol);};
  if(!contiguous){for(let i=0;i<mask.length;i++)if(matches(i))mask[i]=255;continue;}
  if(mask[start])continue;seen.fill(0);let head=0,tail=1;queue[0]=start;seen[start]=1;while(head<tail){const i=queue[head++];if(!matches(i))continue;mask[i]=255;const xx=i%w;for(const n of [xx?i-1:-1,xx<w-1?i+1:-1,i>=w?i-w:-1,i+w<mask.length?i+w:-1])if(n>=0&&!seen[n]){seen[n]=1;queue[tail++]=n;}}}
 return mask;
}
export function combineSelection(a,b,mode){if(a&&a.length!==b.length)throw new Error('Selection sizes differ');const out=new Uint8Array(b.length);for(let i=0;i<b.length;i++)out[i]=mode==='add'?Math.max(a?.[i]||0,b[i]):mode==='subtract'?Math.max(0,(a?.[i]||0)-b[i]):mode==='intersect'?Math.min(a?.[i]||0,b[i]):b[i];return out;}
