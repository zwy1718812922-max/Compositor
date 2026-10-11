export const shapeKinds = ['rect', 'ellipse', 'triangle', 'polygon', 'line'];
export function shapeSettings(kind, width, height, color = '#ffffff') {
  return { kind, width, height, fill:kind === 'line' ? 'none' : color, stroke:kind === 'line' ? color : 'none', strokeWidth:kind === 'line' ? 2 : 1, dash:'solid', sides:6, radii:[0,0,0,0], linked:true };
}
export function validateShape(s) {
  const finite = (n,a,b) => Number.isFinite(n) && n >= a && n <= b;
  const color = v => v === 'none' || /^#[\da-f]{6}$/i.test(v);
  if (!s || !shapeKinds.includes(s.kind) || !finite(s.width,.0001,16384) || !finite(s.height,.0001,16384) || !color(s.fill) || !color(s.stroke) || !finite(s.strokeWidth,0,500) || !['solid','dash','dot'].includes(s.dash) || !Number.isInteger(s.sides) || !finite(s.sides,3,32) || typeof s.linked !== 'boolean' || !Array.isArray(s.radii) || s.radii.length !== 4 || s.radii.some(n=>!finite(n,0,Math.min(s.width,s.height)/2))||['horizontal','vertical'].some(k=>s[k]!==undefined&&typeof s[k]!=='boolean')) throw new Error('形状属性无效。');
  if(s.vertexRadii!==undefined&&(!Array.isArray(s.vertexRadii)||s.vertexRadii.length!==cornerVertices(s).length||s.vertexRadii.some(n=>!finite(n,0,Math.min(s.width,s.height)/2))))throw new Error('顶点圆角无效。');
}
export function cornerVertices(s) {
  if(s.kind==='rect')return [{x:0,y:0},{x:s.width,y:0},{x:s.width,y:s.height},{x:0,y:s.height}];
  if(!['triangle','polygon'].includes(s.kind))return [];
  return Array.from({length:s.kind==='triangle'?3:s.sides},(_,i)=>{const a=-Math.PI/2+i*Math.PI*2/(s.kind==='triangle'?3:s.sides);return{x:s.width/2+Math.cos(a)*s.width/2,y:s.height/2+Math.sin(a)*s.height/2};});
}
export function cornerGeometry(s) {
  const vertices=cornerVertices(s),n=vertices.length;
  const corners=vertices.map((v,i)=>{const prev=vertices[(i+n-1)%n],next=vertices[(i+1)%n],a={x:prev.x-v.x,y:prev.y-v.y},b={x:next.x-v.x,y:next.y-v.y},la=Math.hypot(a.x,a.y),lb=Math.hypot(b.x,b.y);a.x/=la;a.y/=la;b.x/=lb;b.y/=lb;const half=Math.acos(Math.max(-1,Math.min(1,a.x*b.x+a.y*b.y)))/2,tan=Math.tan(half),direction={x:a.x+b.x,y:a.y+b.y},d=Math.hypot(direction.x,direction.y);direction.x/=d;direction.y/=d;const radius=(s.kind==='rect'?s.radii:s.vertexRadii||[])[i]||0;return{v,a,b,la,lb,tan,direction,radius,cut:radius/Math.max(.0001,tan)};});
  let factor=1;for(let i=0;i<n;i++){const sum=corners[i].cut+corners[(i+1)%n].cut;if(sum>0)factor=Math.min(factor,corners[i].lb/sum);}
  return corners.map(c=>({...c,radius:c.radius*factor,cut:c.cut*factor}));
}
export function normalizeShapeTransform(layer) {
  if(layer.type!=='shape')return layer;
  const sx=layer.scale,sy=layer.scaleY??sx;
  if(sx===1&&sy===1)return layer;
  const s={...layer.shape,width:layer.shape.width*sx,height:layer.shape.height*sy},maximum=Math.min(s.width,s.height)/2;
  s.radii=s.radii.map(r=>Math.min(r,maximum));if(s.vertexRadii)s.vertexRadii=s.vertexRadii.map(r=>Math.min(r,maximum));validateShape(s);
  layer.shape=s;layer.scale=layer.scaleY=1;return layer;
}
export function shapePath(ctx, s) {
  const w=s.width,h=s.height;ctx.beginPath();
  if (s.kind === 'rect') {
    const [a,b,c,d]=s.radii.map(r=>Math.min(r,w/2,h/2));
    ctx.moveTo(a,0);ctx.lineTo(w-b,0);ctx.arcTo(w,0,w,b,b);ctx.lineTo(w,h-c);ctx.arcTo(w,h,w-c,h,c);ctx.lineTo(d,h);ctx.arcTo(0,h,0,h-d,d);ctx.lineTo(0,a);ctx.arcTo(0,0,a,0,a);ctx.closePath();
  } else if(s.kind === 'ellipse')ctx.ellipse(w/2,h/2,w/2,h/2,0,0,Math.PI*2);
  else if(s.kind === 'line'){ctx.moveTo(0,0);ctx.lineTo(s.vertical?0:w,s.horizontal?0:h);}
  else {
    for(const [i,c] of cornerGeometry(s).entries()){const p={x:c.v.x+c.a.x*c.cut,y:c.v.y+c.a.y*c.cut},q={x:c.v.x+c.b.x*c.cut,y:c.v.y+c.b.y*c.cut};i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);if(c.radius>0)ctx.arcTo(c.v.x,c.v.y,q.x,q.y,c.radius);else ctx.lineTo(c.v.x,c.v.y);}ctx.closePath();
  }
}
export function paintShape(ctx,s) {
  shapePath(ctx,s);
  if(s.fill!=='none'&&s.kind!=='line'){ctx.fillStyle=s.fill;ctx.fill();}
  if(s.stroke!=='none'&&s.strokeWidth>0){ctx.strokeStyle=s.stroke;ctx.lineWidth=s.strokeWidth;ctx.lineJoin='round';ctx.lineCap=s.dash==='dot'?'round':'butt';ctx.setLineDash(s.dash==='dash'?[s.strokeWidth*4,s.strokeWidth*2]:s.dash==='dot'?[.01,s.strokeWidth*2]:[]);ctx.stroke();ctx.setLineDash([]);}
}
