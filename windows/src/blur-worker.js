import {blurPixels} from './blur-model.mjs';
self.onmessage=({data})=>{try{const pixels=blurPixels(new Uint8ClampedArray(data.pixels),data.width,data.height,data.settings,progress=>self.postMessage({progress}));self.postMessage({pixels:pixels.buffer},[pixels.buffer]);}catch(e){self.postMessage({error:e.message});}};
