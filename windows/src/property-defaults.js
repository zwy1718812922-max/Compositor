import {validateShape} from './shape-model.mjs';
const key='compositor.propertyDefaults.v1';
let store={};try{store=JSON.parse(localStorage.getItem(key))||{};}catch{}
const keys=['x','y','boxWidth','boxHeight','opacity','blend','fillOpacity','rotation','scale','scaleY','skew','font','fontSize','fontWeight','bold','italic','underline','strike','align','lineHeight','letterSpacing','color','paragraph','styles','stylesEnabled','fill','adjustment'];
const category=l=>l.artboard?'artboard':l.type==='shape'?'shape-'+l.shape.kind:l.type==='fill'?'fill-'+l.fill.kind:l.type==='adjustment'?'adjustment-'+l.adjustment.kind:l.type;
function persist(){try{localStorage.setItem(key,JSON.stringify(store));}catch{}}
export function rememberDefaults(layer) {
  if(!layer)return;const values={};for(const name of keys)if(layer[name]!==undefined)values[name]=structuredClone(layer[name]);
  if(layer.shape)values.shape=structuredClone(layer.shape);if(layer.artboard)values.artboard=structuredClone(layer.artboard);if(layer.mask)values.mask={density:layer.mask.density,feather:layer.mask.feather};
  if(values.mask)store.mask=values.mask;store[category(layer)]=values;persist();
}
export function applyDefaults(layer) {
  const saved=store[category(layer)];if(!saved)return layer;
  const copy=structuredClone(saved),shape=layer.shape,artboard=layer.artboard;
  // Placement and drawn dimensions come from the user's current gesture.
  for(const name of keys)if(copy[name]!==undefined&&!['x','y','boxWidth','boxHeight'].includes(name))layer[name]=copy[name];
  layer.scale=layer.scaleY=1;layer.rotation=0;layer.skew=0;
  if(shape&&copy.shape){const maximum=Math.min(shape.width,shape.height)/2,next={...copy.shape,kind:shape.kind,width:shape.width,height:shape.height,radii:copy.shape.radii.map(r=>Math.min(r,maximum))};if(next.vertexRadii)next.vertexRadii=next.vertexRadii.map(r=>Math.min(r,maximum));try{validateShape(next);layer.shape=next;}catch{}}
  if(artboard&&copy.artboard)layer.artboard={...artboard,background:copy.artboard.background};return layer;
}
export function applyMaskDefaults(mask){const saved=store.mask;if(saved){mask.density=Math.max(0,Math.min(1,Number(saved.density)||0));mask.feather=Math.max(0,Math.min(100,Number(saved.feather)||0));}return mask;}
export function lastArtboard(){return structuredClone(store.artboard?.artboard||{width:1280,height:800,background:'#ffffff'});}
export function setupPropertyDefaults(){
  const panel=document.getElementById('properties-panel'),details=document.createElement('details'),button=document.createElement('button');details.className='property-more';details.innerHTML='<summary>默认参数</summary>';button.id='reset-property-defaults';button.className='wide-button';button.textContent='恢复默认参数';button.onclick=()=>{store={};persist();};details.append(button);panel.append(details);
}
