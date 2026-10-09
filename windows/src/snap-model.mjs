export const shiftedBox = (box, dx, dy) => ({ ...box, x: box.x + dx, y: box.y + dy });
const start = (b, axis) => b[axis];
const size = (b, axis) => b[axis === 'x' ? 'width' : 'height'];
const end = (b, axis) => start(b, axis) + size(b, axis);
const anchors = (b, axis) => [start(b, axis), start(b, axis) + size(b, axis) / 2, end(b, axis)];
const overlaps = (a, b, axis) => end(a, axis) >= start(b, axis) && end(b, axis) >= start(a, axis);

// Work from the pointer's original displacement so a snapped frame never accumulates drift.
export function snapBox(box, targets, dx, dy, threshold) {
  const proposed = shiftedBox(box, dx, dy), hits = [];
  for (const axis of ['x', 'y']) {
    const other = axis === 'x' ? 'y' : 'x', candidates = [];
    for (const target of targets) for (const value of anchors(target, axis)) for (const source of anchors(proposed, axis)) {
      const delta = value - source;
      if (Math.abs(delta) <= threshold) candidates.push({ axis, delta, value, target, kind: 'align' });
    }
    const neighbors = targets.filter(t => !t.canvas && overlaps(t, proposed, other));
    for (const a of neighbors) for (const b of neighbors) {
      if (a === b || end(a, axis) > start(b, axis)) continue;
      const gap = start(b, axis) - end(a, axis), width = size(proposed, axis);
      const values = [end(b, axis) + gap, start(a, axis) - gap - width];
      if (gap >= width) values.push((end(a, axis) + start(b, axis) - width) / 2);
      for (const value of values) {
        const delta = value - start(proposed, axis);
        if (Math.abs(delta) <= threshold) candidates.push({ axis, delta, value, target: b, pair: a, kind: 'spacing' });
      }
    }
    candidates.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || Number(a.kind !== 'align') - Number(b.kind !== 'align'));
    if (candidates[0]) { const hit = candidates[0]; hits.push(hit); if (axis === 'x') dx += hit.delta; else dy += hit.delta; }
  }
  return { dx, dy, box: shiftedBox(box, dx, dy), hits };
}

export function boxGap(a, b, axis) {
  if (end(a, axis) <= start(b, axis)) return { start: end(a, axis), end: start(b, axis) };
  if (end(b, axis) <= start(a, axis)) return { start: end(b, axis), end: start(a, axis) };
  return null;
}
