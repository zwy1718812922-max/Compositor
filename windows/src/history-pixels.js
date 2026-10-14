const previous=new WeakMap(),TILE_SIZE=256;
export function inheritHistoryPixels(canvas,source){const old=previous.get(source);if(old&&canvas.width===source.width&&canvas.height===source.height)previous.set(canvas,{revision:-1,snapshot:old.snapshot});}
export function markHistoryPixels(canvas,region){
 const old=previous.get(canvas);if(!old)return;
 if(!region){old.full=true;return;}
 const dirty=old.dirty||(old.dirty=new Set()),left=Math.max(0,Math.floor(region.x/TILE_SIZE)*TILE_SIZE),top=Math.max(0,Math.floor(region.y/TILE_SIZE)*TILE_SIZE),right=Math.min(canvas.width,region.x+region.width),bottom=Math.min(canvas.height,region.y+region.height);
 for(let y=top;y<bottom;y+=TILE_SIZE)for(let x=left;x<right;x+=TILE_SIZE)dirty.add(y*canvas.width+x);
}
export function captureHistoryPixels(canvas,revision){
 const old=previous.get(canvas);if(old?.revision===revision)return old.snapshot;
 const width=canvas.width,height=canvas.height;
 // Keep one immutable base; later snapshots share it and replace edited tiles.
 if(!old||old.snapshot.width!==width||old.snapshot.height!==height){const bitmap=typeof document==='undefined'?new OffscreenCanvas(width,height):document.createElement('canvas');bitmap.width=width;bitmap.height=height;bitmap.getContext('2d').drawImage(canvas,0,0);const snapshot={width,height,bitmap,tiles:[]};previous.set(canvas,{revision,snapshot});return snapshot;}
 const dirty=!old.full&&old.dirty?old.dirty:new Set();if(old.full||!old.dirty)for(let y=0;y<height;y+=TILE_SIZE)for(let x=0;x<width;x+=TILE_SIZE)dirty.add(y*width+x);
 const ctx=canvas.getContext('2d'),base=old.snapshot.bitmap.getContext('2d'),tiles=new Map(old.snapshot.tiles.map(tile=>[tile.y*width+tile.x,tile]));
 for(const key of dirty){const x=key%width,y=Math.floor(key/width),w=Math.min(TILE_SIZE,width-x),h=Math.min(TILE_SIZE,height-y),data=ctx.getImageData(x,y,w,h).data,pixels=new Uint32Array(data.buffer),prior=tiles.get(key),original=prior?null:base.getImageData(x,y,w,h).data,source=prior?prior.data:original,words=source&&new Uint32Array(source.buffer);
  if(pixels.every((value,n)=>value===(words?.[n]||0)))continue;
  const baseline=new Uint32Array((original||base.getImageData(x,y,w,h).data).buffer);
  if(pixels.every((value,n)=>value===baseline[n]))tiles.delete(key);else tiles.set(key,{x,y,width:w,height:h,data:pixels.some(value=>value!==0)?data:null});
 }
 const snapshot={width,height,bitmap:old.snapshot.bitmap,tiles:[...tiles.values()]};previous.set(canvas,{revision,snapshot});return snapshot;
}
export function restoreHistoryPixels(canvas,snapshot){const ctx=canvas.getContext('2d');ctx.drawImage(snapshot.bitmap,0,0);for(const tile of snapshot.tiles)if(tile.data)ctx.putImageData(new ImageData(tile.data,tile.width,tile.height),tile.x,tile.y);else ctx.clearRect(tile.x,tile.y,tile.width,tile.height);previous.set(canvas,{revision:0,snapshot});}
export function historyBytes(snapshots){let bytes=0;const seen=new Set();for(const s of snapshots)for(const l of s.layers)for(const item of [l,l.mask].filter(Boolean)){const bitmap=item._tiles?.bitmap||item._bitmap;if(bitmap&&!seen.has(bitmap)){seen.add(bitmap);bytes+=bitmap.width*bitmap.height*4;}if(item._tiles){for(const tile of item._tiles.tiles)if(tile.data&&!seen.has(tile.data)){seen.add(tile.data);bytes+=tile.data.byteLength;}}else if(!bitmap)bytes+=(item.data?.length||item.text?.length||0);}return bytes;}
