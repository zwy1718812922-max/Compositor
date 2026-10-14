// One budget covers retained render surfaces, worker assets, and undo pixels.
export function createMemoryBudget(limit=512*1024*1024){
 const entries=new Map();let bytes=0,active,evicting=false;
 function remove(key){const entry=entries.get(key);if(entry){bytes-=entry.bytes;entries.delete(key);}}
 function trim(protectedKey){if(evicting)return;evicting=true;try{const candidates=[...entries].filter(([key,entry])=>key!==protectedKey||entry.owner!==active&&entry.kind!=='history').sort((a,b)=>rank(a[1])-rank(b[1]));for(const [key,entry] of candidates){if(bytes<=limit)break;if(entry.evict()!==false)remove(key);}}finally{evicting=false;}}
 function rank(entry){return entry.kind==='history'?2:entry.owner===active?1:0;}
 return{get limit(){return limit;},setLimit(value){limit=Math.max(0,value);trim();},isActive(owner){return active===owner;},activate(owner){active=owner;},release(owner){if(active===owner)active=undefined;for(const [key,entry] of [...entries])if(entry.owner===owner&&entry.kind!=='history'){entry.evict();remove(key);}},set(key,size,evict,owner,kind='render'){remove(key);if(size>0){entries.set(key,{bytes:size,evict,owner,kind});bytes+=size;}trim(key);},touch(key){const entry=entries.get(key);if(entry){entries.delete(key);entries.set(key,entry);}},delete:remove,trim,stats(owner){const selected=owner?[...entries.values()].filter(e=>e.owner===owner):[...entries.values()],kinds={};for(const entry of selected)kinds[entry.kind]=(kinds[entry.kind]||0)+entry.bytes;return{bytes:selected.reduce((n,e)=>n+e.bytes,0),limit,entries:selected.length,kinds};}};
}
export const memoryBudget=createMemoryBudget();
