import {memoryBudget} from './memory-budget.mjs';
const idle=new Set(),MAX_BYTES=16*1024*1024;let bytes=0;
function remove(buffer){if(idle.delete(buffer)){bytes-=buffer.byteLength;memoryBudget.delete(buffer);}}
export function takePixels(length){for(const buffer of idle)if(buffer.length===length){remove(buffer);return buffer;}return new Uint8ClampedArray(length);}
export function returnPixels(buffer,owner){if(idle.has(buffer)||buffer.byteLength>Math.min(MAX_BYTES,memoryBudget.limit))return;idle.add(buffer);bytes+=buffer.byteLength;memoryBudget.set(buffer,buffer.byteLength,()=>remove(buffer),owner,'temporary');while(bytes>MAX_BYTES)remove(idle.values().next().value);}
