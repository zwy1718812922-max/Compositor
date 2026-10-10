export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const fromHex=hex=>hex.replace('#','').match(/../g).map(v=>parseInt(v,16));
export const toHex=rgb=>'#'+rgb.map(v=>Math.round(clamp(v,0,255)).toString(16).padStart(2,'0')).join('');
export function rgbToHsv(rgb){const [r,g,b]=rgb.map(v=>v/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0;if(d)h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;return [(h*60+360)%360,max?d/max*100:0,max*100];}
export function hsvToRgb([h,s,v]){s=clamp(s/100);v=clamp(v/100);h=((h%360)+360)%360/60;const c=v*s,x=c*(1-Math.abs(h%2-1)),m=v-c,p=[[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][Math.floor(h)];return p.map(n=>(n+m)*255);}
const mult=(m,v)=>m.map(row=>row.reduce((n,x,i)=>n+x*v[i],0));
const rgbXyz=[[.4360747,.3850649,.1430804],[.2225045,.7168786,.0606169],[.0139322,.0971045,.7141733]];
const xyzRgb=[[3.1338561,-1.6168667,-.4906146],[-.9787684,1.9161415,.033454], [.0719453,-.2289914,1.4052427]];
const white=[.96422,1,.82521],epsilon=216/24389,kappa=24389/27;
export function rgbToLab(rgb){const linear=rgb.map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}),f=mult(rgbXyz,linear).map((n,i)=>{n/=white[i];return n>epsilon?Math.cbrt(n):(kappa*n+16)/116;});return [116*f[1]-16,500*(f[0]-f[1]),200*(f[1]-f[2])];}
export function labToRgb([l,a,b]){const fy=(l+16)/116,f=[fy+a/500,fy,fy-b/200],xyz=f.map((n,i)=>white[i]*(n**3>epsilon?n**3:(116*n-16)/kappa));return mult(xyzRgb,xyz).map(n=>255*(n<=.0031308?12.92*n:1.055*Math.max(0,n)**(1/2.4)-.055));}
export function rgbToCmyk(rgb,profile){if(profile)return [...profile.toCmyk(Uint8Array.from(rgb.map(Math.round)))].map(n=>n/255*100);const [r,g,b]=rgb.map(n=>n/255),k=1-Math.max(r,g,b);return k===1?[0,0,0,100]:[(1-r-k)/(1-k)*100,(1-g-k)/(1-k)*100,(1-b-k)/(1-k)*100,k*100];}
export function cmykToRgb(cmyk,profile){if(profile)return [...profile.toRgb(Uint8Array.from(cmyk.map(n=>clamp(n/100)*255)))];const [c,m,y,k]=cmyk.map(n=>clamp(n/100));return [c,m,y].map(n=>255*(1-n)*(1-k));}
