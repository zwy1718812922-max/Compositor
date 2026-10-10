export function validateArtboard(a) {
  if(!a||![a.width,a.height].every(n=>Number.isInteger(n)&&n>=1&&n<=16384)||a.width*a.height>64*1024*1024||!(a.background==='transparent'||/^#[\da-f]{6}$/i.test(a.background)))throw new Error('画板属性无效。');
}
export const artboards = p => p.layers.filter(l=>l.type==='group'&&l.artboard);
export function artboardAt(p,point) {
  return artboards(p).slice().reverse().find(l=>l.visible&&point.x>=l.x&&point.y>=l.y&&point.x<=l.x+l.artboard.width&&point.y<=l.y+l.artboard.height);
}
