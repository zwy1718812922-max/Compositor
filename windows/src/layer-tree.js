export const childrenOf = (project, parentId = null) => project.layers.filter(l => (l.parentId || null) === parentId);
export function descendants(project, id) {
  const output = [];
  for (const l of childrenOf(project, id)) { if (l.type === 'group') output.push(...descendants(project, l.id)); output.push(l); }
  return output;
}
export function ancestors(project, layer) {
  const result = []; let parent = layer.parentId;
  while (parent) { const l = project.layers.find(p => p.id === parent); if (!l || result.length >= 10) break; result.push(l); parent = l.parentId; }
  return result;
}
export const isLocked = (project, layer) => [layer, ...ancestors(project, layer)].some(l => l.locked);
export const isVisible = (project, layer) => [layer, ...ancestors(project, layer)].every(l => l.visible);
export function canonicalize(project) {
  const result = [];
  const visit = parent => {
    let base = false;
    for (const l of childrenOf(project, parent)) {
      if (l.clipping && !base) l.clipping = false;
      if (!l.clipping) base = true;
      if (l.type === 'group') visit(l.id); result.push(l);
    }
  };
  visit(null); project.layers = result;
}
export function panelLayers(project) {
  const result = [];
  const visit = (parent, depth) => { for (const l of [...childrenOf(project, parent)].reverse()) { result.push({ layer: l, depth }); if (l.type === 'group' && !l.collapsed) visit(l.id, depth + 1); } };
  visit(null, 0); return result;
}
export function moveToGroup(project, layer, parentId) {
  if (parentId === layer.id || ancestors(project, project.layers.find(l => l.id === parentId) || {}).some(l => l.id === layer.id)) throw new Error('不能将图层组移入自身或子组。');
  if (parentId && ancestors(project, project.layers.find(l => l.id === parentId)).length + (layer.type === 'group' ? maxDepth(project, layer) : 0) >= 9) throw new Error('图层组最多嵌套 10 层。');
  layer.parentId = parentId || null; canonicalize(project);
}
function maxDepth(project, layer) { return Math.max(0, ...childrenOf(project, layer.id).map(l => l.type === 'group' ? 1 + maxDepth(project, l) : 1)); }
export function moveSibling(project, layer, delta) {
  const siblings = childrenOf(project, layer.parentId), index = siblings.indexOf(layer), other = siblings[index + delta];
  if (!other) return false;
  const a = project.layers.indexOf(layer), b = project.layers.indexOf(other);
  [project.layers[a], project.layers[b]] = [project.layers[b], project.layers[a]]; canonicalize(project); return true;
}
