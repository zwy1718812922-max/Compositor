export const shapeKinds = ['rect', 'ellipse', 'triangle', 'polygon', 'line'];
export function shapeSettings(kind, width, height, color = '#ffffff') {
  return { kind, width, height, fill:kind === 'line' ? 'none' : color, stroke:kind === 'line' ? color : 'none', strokeWidth:kind === 'line' ? 2 : 1, dash:'solid', sides:6, radii:[0,0,0,0], linked:true };
}
export function validateShape(s) {
  const finite = (n,a,b) => Number.isFinite(n) && n >= a && n <= b;
  const color = v => v === 'none' || /^#[\da-f]{6}$/i.test(v);
  if (!s || !shapeKinds.includes(s.kind) || !finite(s.width,.0001,16384) || !finite(s.height,.0001,16384) || !color(s.fill) || !color(s.stroke) || !finite(s.strokeWidth,0,500) || !['solid','dash','dot'].includes(s.dash) || !Number.isInteger(s.sides) || !finite(s.sides,3,32) || typeof s.linked !== 'boolean' || !Array.isArray(s.radii) || s.radii.length !== 4 || s.radii.some(n=>!finite(n,0,Math.min(s.width,s.height)/2))||['horizontal','vertical'].some(k=>s[k]!==undefined&&typeof s[k]!=='boolean')) throw new Error('形状属性无效。');
}
export function shapePath(ctx, s) {
  const w=s.width,h=s.height;ctx.beginPath();
  if (s.kind === 'rect') {
    const [a,b,c,d]=s.radii.map(r=>Math.min(r,w/2,h/2));
    ctx.moveTo(a,0);ctx.lineTo(w-b,0);ctx.arcTo(w,0,w,b,b);ctx.lineTo(w,h-c);ctx.arcTo(w,h,w-c,h,c);ctx.lineTo(d,h);ctx.arcTo(0,h,0,h-d,d);ctx.lineTo(0,a);ctx.arcTo(0,0,a,0,a);ctx.closePath();
  } else if(s.kind === 'ellipse')ctx.ellipse(w/2,h/2,w/2,h/2,0,0,Math.PI*2);
  else if(s.kind === 'line'){ctx.moveTo(0,0);ctx.lineTo(s.vertical?0:w,s.horizontal?0:h);}
  else {
    const count=s.kind==='triangle'?3:s.sides;
    for(let i=0;i<count;i++){const angle=-Math.PI/2+i*Math.PI*2/count,x=w/2+Math.cos(angle)*w/2,y=h/2+Math.sin(angle)*h/2;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();
  }
}
export function paintShape(ctx,s) {
  shapePath(ctx,s);
  if(s.fill!=='none'&&s.kind!=='line'){ctx.fillStyle=s.fill;ctx.fill();}
  if(s.stroke!=='none'&&s.strokeWidth>0){ctx.strokeStyle=s.stroke;ctx.lineWidth=s.strokeWidth;ctx.lineJoin='round';ctx.lineCap=s.dash==='dot'?'round':'butt';ctx.setLineDash(s.dash==='dash'?[s.strokeWidth*4,s.strokeWidth*2]:s.dash==='dot'?[.01,s.strokeWidth*2]:[]);ctx.stroke();ctx.setLineDash([]);}
}
