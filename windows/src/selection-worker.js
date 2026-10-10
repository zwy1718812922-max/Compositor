import {colorSelection} from './selection-model.mjs';
self.onmessage=({data})=>{try{const mask=colorSelection(new Uint8ClampedArray(data.pixels),data.width,data.height,data.seeds,data.tolerance,data.contiguous);self.postMessage({mask:mask.buffer},[mask.buffer]);}catch(e){self.postMessage({error:e.message});}};
