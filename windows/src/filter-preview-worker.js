import {filterRegion,filterStats,releaseFilters} from './filter-renderer.js';
import {validateFilters} from './filter-model.mjs';
import {memoryBudget} from './memory-budget.mjs';
let source,pending,busy=false,latest=0;const owner={};
async function drain(){if(busy)return;busy=true;try{while(pending){const job=pending;pending=null;try{validateFilters(job.stack);const output=await filterRegion(source,job.stack,job.region,{scale:job.scale,owner,valid:()=>latest===job.id});if(!output)continue;const bitmap=output.transferToImageBitmap();output.width=output.height=1;if(latest!==job.id){bitmap.close();continue;}postMessage({id:job.id,bitmap,stats:filterStats(owner),retainedBytes:memoryBudget.stats(owner).bytes+source.width*source.height*4},[bitmap]);}catch(error){if(latest===job.id)postMessage({id:job.id,error:error.message});}}}finally{busy=false;}}
self.onmessage=({data})=>{if(data.source){source?.close();releaseFilters(owner);source=data.source;memoryBudget.activate(owner);memoryBudget.setLimit(data.cacheLimit??96*1024*1024);}if(data.cancel){latest=data.cancel;pending=null;return;}if(data.stack){latest=data.id;pending=data;drain();}};
