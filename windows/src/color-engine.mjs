import { instantiate,TYPE_RGB_8,TYPE_CMYK_8,INTENT_RELATIVE_COLORIMETRIC,cmsFLAGS_BLACKPOINTCOMPENSATION,cmsInfoDescription } from './vendor/lcms/lcms.js';
let engine;const profiles=new Map();
export function validIcc(bytes){return bytes.length>=128&&bytes.length<=4*1024*1024&&String.fromCharCode(...bytes.slice(36,40))==='acsp'&&String.fromCharCode(...bytes.slice(16,20))==='CMYK';}
export async function initColorProfile(encoded){
 if(profiles.has(encoded))return profiles.get(encoded);
 const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));if(!validIcc(bytes))throw new Error('需要有效的 CMYK ICC 配置文件。');
 if(!engine){const url=new URL('./vendor/lcms/lcms.wasm',import.meta.url);const binary=typeof process!=='undefined'&&process.versions?.node?await(await import('node:fs/promises')).readFile(url):new Uint8Array(await(await fetch(url)).arrayBuffer());engine=await instantiate({wasmBinary:binary});}
 const cmyk=engine.cmsOpenProfileFromMem(bytes,bytes.length),rgb=engine.cmsCreate_sRGBProfile();if(!cmyk||engine.cmsGetColorSpaceASCII(cmyk)!=='CMYK')throw new Error('CMYK 配置文件无法加载。');
 const flags=cmsFLAGS_BLACKPOINTCOMPENSATION,forward=engine.cmsCreateTransform(rgb,TYPE_RGB_8,cmyk,TYPE_CMYK_8,INTENT_RELATIVE_COLORIMETRIC,flags),reverse=engine.cmsCreateTransform(cmyk,TYPE_CMYK_8,rgb,TYPE_RGB_8,INTENT_RELATIVE_COLORIMETRIC,flags);
 const name=engine.cmsGetProfileInfoASCII(cmyk,cmsInfoDescription,'en','US');engine.cmsCloseProfile(rgb);engine.cmsCloseProfile(cmyk);if(!forward||!reverse)throw new Error('无法创建 CMYK 颜色转换。');
 const profile={name,bytes,toCmyk:rgb=>engine.cmsDoTransform(forward,rgb,rgb.length/3),toRgb:cmyk=>engine.cmsDoTransform(reverse,cmyk,cmyk.length/4)};profiles.set(encoded,profile);return profile;
}
export function colorProfile(encoded){return profiles.get(encoded);}
export function proofPixels(image,profile){const rgb=new Uint8Array(image.data.length/4*3);for(let i=0,j=0;i<image.data.length;i+=4,j+=3)rgb.set(image.data.subarray(i,i+3),j);const proof=profile.toRgb(profile.toCmyk(rgb));for(let i=0,j=0;i<image.data.length;i+=4,j+=3)image.data.set(proof.subarray(j,j+3),i);return image;}
