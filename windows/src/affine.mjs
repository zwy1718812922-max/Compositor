// A rotation, two scales and a shear retain a full invertible 2D transform.
export function affine(l) {
  const r = l.rotation * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), y = l.scaleY ?? l.scale, k = l.skew || 0;
  const x=l.scale*(l.flipX?-1:1),sy=y*(l.flipY?-1:1);return [c*x,s*x,(c*k-s)*sy,(s*k+c)*sy];
}
export function multiply(a,b) { return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3]]; }
export function inverse(a) { const d=a[0]*a[3]-a[1]*a[2]; if(Math.abs(d)<1e-12) throw new Error('变换不可逆。'); return [a[3]/d,-a[1]/d,-a[2]/d,a[0]/d]; }
export function vector(a,p) { return {x:a[0]*p.x+a[2]*p.y,y:a[1]*p.x+a[3]*p.y}; }
export function decompose(a) {
  const scale=Math.hypot(a[0],a[1]), scaleY=(a[0]*a[3]-a[1]*a[2])/scale, rotation=Math.atan2(a[1],a[0])*180/Math.PI, skew=(a[0]*a[2]+a[1]*a[3])/(scale*scaleY);
  if (![scale,scaleY,rotation,skew].every(Number.isFinite) || Math.min(scale,Math.abs(scaleY))<.01-1e-8 || Math.max(scale,Math.abs(scaleY))>100+1e-8 || Math.abs(skew)>100) throw new Error('变换比例须在 1%–10000% 内。');
  return {scale:Math.max(.01,Math.min(100,scale)),scaleY:Math.max(.01,Math.min(100,Math.abs(scaleY))),rotation,skew,flipX:false,flipY:scaleY<0};
}
