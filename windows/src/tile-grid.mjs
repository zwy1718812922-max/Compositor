export function* tiles(width,height,size=512,region={x:0,y:0,width,height}){
 const left=Math.max(0,Math.floor(region.x/size)*size),top=Math.max(0,Math.floor(region.y/size)*size),right=Math.min(width,region.x+region.width),bottom=Math.min(height,region.y+region.height);
 for(let y=top;y<bottom;y+=size)for(let x=left;x<right;x+=size)yield{x,y,width:Math.min(size,width-x),height:Math.min(size,height-y)};
}
export function tileWindow(tile,width,height,padding){const x=Math.max(0,tile.x-padding),y=Math.max(0,tile.y-padding),right=Math.min(width,tile.x+tile.width+padding),bottom=Math.min(height,tile.y+tile.height+padding);return{x,y,width:right-x,height:bottom-y,offsetX:tile.x-x,offsetY:tile.y-y};}
