export const vertex=`#version 300 es
precision highp float;
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.0-1.0,0,1);}`;
const header=`#version 300 es
precision highp float;
precision highp int;
in vec2 uv;out vec4 result;
uniform sampler2D image,backdrop;
uniform vec2 size;
`;
export const copy=header+`void main(){result=texture(image,uv);}`;
// Framebuffers and source textures hold premultiplied sRGB, as Canvas 2D does.
export const source=header+`
uniform vec4 core,crop,color;
uniform vec2 origin,dimensions,translation,scale;
uniform bool solid,gradient;uniform vec4 endColor;uniform float angle;
void main(){
 vec2 p=origin+vec2(gl_FragCoord.x,size.y-gl_FragCoord.y),q=(p-translation)/scale;
 vec2 lo=max(core.xy,vec2(0)),hi=min(core.xy+core.zw,dimensions);
 vec2 footprint=1.0/abs(scale),outerLo=lo-mix(vec2(0),footprint*.5,vec2(equal(lo,vec2(0)))),outerHi=hi+mix(vec2(0),footprint*.5,vec2(equal(hi,dimensions)));
 if(any(lessThan(q,outerLo))||any(greaterThanEqual(q,outerHi)))discard;
 vec2 coverage=clamp(min(q,dimensions-q)/footprint+.5,0.0,1.0);
 if(solid){vec4 fill=color;if(gradient){vec2 direction=dimensions*vec2(cos(angle),sin(angle));float t=clamp(.5+dot(q-dimensions*.5,direction)/max(.00001,dot(direction,direction)),0.0,1.0);fill=mix(color,endColor,t);}result=fill*coverage.x*coverage.y;return;}
 vec2 samplePoint=clamp(q,vec2(.5),dimensions-.5);
 vec2 t=(samplePoint-crop.xy)/crop.zw;
 result=texture(image,t)*coverage.x*coverage.y;
}`;
export const blend=header+`
uniform float opacity;uniform int mode;
vec3 blendRGB(vec3 b,vec3 s){
 if(mode==1)return b*s;if(mode==2)return b+s-b*s;
 if(mode==3)return mix(2.0*b*s,1.0-2.0*(1.0-b)*(1.0-s),step(vec3(.500001),b));
 if(mode==4)return min(b,s);if(mode==5)return max(b,s);if(mode==6)return abs(b-s);
 if(mode==7)return mix(2.0*b*s,1.0-2.0*(1.0-b)*(1.0-s),step(vec3(.500001),s));
 if(mode==8){vec3 d=mix(((16.0*b-12.0)*b+4.0)*b,sqrt(b),step(vec3(.250001),b));return mix(b-(1.0-2.0*s)*b*(1.0-b),b+(2.0*s-1.0)*(d-b),step(vec3(.500001),s));}
 if(mode==9)return b+s-2.0*b*s;
 return s;
}
void main(){vec4 b=texture(backdrop,uv),s=texture(image,uv)*opacity;vec3 bc=b.a>0.0?b.rgb/b.a:vec3(0),sc=s.a>0.0?s.rgb/s.a:vec3(0);result=vec4((1.0-s.a)*b.rgb+(1.0-b.a)*s.rgb+b.a*s.a*blendRGB(bc,sc),s.a+b.a*(1.0-s.a));}`;
export const adjustment=header+`
uniform int kind;uniform vec4 a,b;uniform vec3 first,last;uniform float opacity;
vec3 adjust(vec3 c){
 float l=dot(c,vec3(.2126,.7152,.0722));
 if(kind==0)return (c-.5)*(1.0+a.y/100.0)+.5+a.x/255.0;
 if(kind==1)return c+a.x/100.0*(3.0*c*c-2.0*c*c*c-c);
 if(kind==2){float angle=radians(a.x),co=cos(angle),si=sin(angle);vec3 v=vec3(dot(c,vec3(.213+.787*co-.213*si,.715-.715*co-.715*si,.072-.072*co+.928*si)),dot(c,vec3(.213-.213*co+.143*si,.715+.285*co+.140*si,.072-.072*co-.283*si)),dot(c,vec3(.213-.213*co-.787*si,.715-.715*co+.715*si,.072+.928*co+.072*si)));return (vec3(l)+(v-l)*(1.0+a.y/100.0))*(1.0-abs(a.z/100.0))+max(0.0,a.z/100.0);}
 if(kind==3)return 1.0-c;
 if(kind==4)return pow(clamp((c-a.x/255.0)/max(1.0/255.0,(a.y-a.x)/255.0),0.0,1.0),vec3(1.0/a.z));
 if(kind==5)return pow(max(vec3(0),c*exp2(a.x)+a.y),vec3(1.0/a.z));
 if(kind==6){float chroma=max(max(c.r,c.g),c.b)-min(min(c.r,c.g),c.b);return vec3(l)+(c-l)*(1.0+a.y/100.0+a.x/100.0*(1.0-chroma));}
 if(kind==7)return c+a.xyz/255.0;
 if(kind==8)return vec3(dot(c,a.xyz)/100.0);
 if(kind==9)return mix(c,first,a.x/100.0);
 if(kind==10)return c*a.xyz/100.0;
 if(kind==11)return c+vec3((1.0-c.r)*.10,(127.0/255.0-c.g)*.06,-c.b*.15)*a.x/100.0;
 if(kind==12)return floor(c*(a.x-1.0)+.5)/(a.x-1.0);
 if(kind==13)return vec3(l*255.0>=a.x?1:0);
 if(kind==14)return mix(first,last,l);
 if(kind==15){float weight=b.x==1.0?max(0.0,c.r-max(c.g,c.b)):b.x==2.0?1.0-l:b.x==3.0?l:1.0-(max(max(c.r,c.g),c.b)-min(min(c.r,c.g),c.b));return c-(a.xyz+a.w)/100.0*weight;}
 return c;
}
void main(){vec4 v=texture(image,uv);vec3 c=v.a>0.0?floor(v.rgb/v.a*255.0+.50001)/255.0:vec3(0);vec3 adjusted=floor(clamp(adjust(c),0.0,1.0)*255.0+.50001)/255.0;vec3 rgb=floor(mix(c,adjusted,opacity)*255.0+.50001)/255.0;result=vec4(rgb*v.a,v.a);}`;
export const floatInput=header+`void main(){vec4 p=texelFetch(image,ivec2(gl_FragCoord.x,size.y-gl_FragCoord.y),0);vec3 c=p.a>0.0?floor(p.rgb/p.a*255.0+.50001)/255.0:vec3(0);result=vec4(c*p.a,p.a);}`;
export const floatOutput=header+`void main(){vec4 p=texture(image,uv);vec3 c=p.a>0.0?floor(clamp(p.rgb/p.a,0.0,1.0)*255.0+.50001)/255.0:vec3(0);float alpha=floor(clamp(p.a,0.0,1.0)*255.0+.50001)/255.0;result=vec4(c*alpha,alpha);}`;
export const prefix=header+`uniform ivec2 offset;void main(){ivec2 p=ivec2(gl_FragCoord.xy);result=texelFetch(image,p,0);if(all(greaterThanEqual(p-offset,ivec2(0))))result+=texelFetch(image,p-offset,0);}`;
export const box=header+`
uniform int radius;uniform ivec2 axis;
void main(){ivec2 p=ivec2(gl_FragCoord.xy),n=textureSize(image,0)-1,low=p-axis*(radius+1),high=min(p+axis*radius,n);vec4 sum=texelFetch(image,high,0);
 if(all(greaterThanEqual(low,ivec2(0))))sum-=texelFetch(image,low,0);
 ivec2 start=p*(ivec2(1)-axis),end=start+n*axis;
 int coordinate=axis.x==1?p.x:p.y,length=axis.x==1?n.x:n.y;
 sum+=texelFetch(backdrop,start,0)*float(max(0,radius-coordinate))+texelFetch(backdrop,end,0)*float(max(0,coordinate+radius-length));
 result=sum/float(2*radius+1);}`;
export const adjustmentKinds=['brightness','curves','hue','invert','levels','exposure','vibrance','balance','bw','photo','mixer','lookup','posterize','threshold','gradientMap','selective'];
const fields=[['brightness','contrast'],['amount'],['hue','saturation','lightness'],[],['black','white','gamma'],['exposure','offset','gamma'],['vibrance','saturation'],['red','green','blue'],['red','green','blue'],['density'],['red','green','blue'],['amount'],['levels'],['level'],[],['cyan','magenta','yellow','black']];
export function adjustmentUniforms(kind,p){const index=adjustmentKinds.indexOf(kind),a=[0,0,0,0];fields[index]?.forEach((key,n)=>a[n]=p[key]);const rgb=value=>(value||'#ec8d32').slice(1).match(/../g).map(x=>parseInt(x,16)/255);return{kind:index,a,b:[['neutrals','reds','blacks','whites'].indexOf(p.range),0,0,0],first:rgb(p.color),last:rgb(p.color2||'#ffffff')};}
