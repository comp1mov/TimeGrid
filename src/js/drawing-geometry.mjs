// Geometry only: no DOM reads or stored frame IDs. Animation can change the frame
// displayed by a cell without changing its location.
export function buildDrawingHitMap(rects, columns) {
  const cols = Math.max(1, Math.floor(columns) || 1);
  const first = rects[0];
  let regular = null;
  if (first && first.w > 0 && first.h > 0) {
    const dx = rects[1] && cols > 1 ? rects[1].x - first.x : first.w;
    const dy = rects[cols] ? rects[cols].y - first.y : first.h;
    // Float rounding in transformed DOMRects can differ by a fraction of a
    // pixel. The grid only narrows candidates; exact rectangles decide the hit.
    const epsilon = .001;
    if (dx > 0 && dy > 0 && dx >= first.w-epsilon && dy >= first.h-epsilon && rects.every((r, i) =>
      Math.abs(r.w-first.w) <= epsilon && Math.abs(r.h-first.h) <= epsilon &&
      Math.abs(r.x-first.x-(i%cols)*dx) <= epsilon && Math.abs(r.y-first.y-Math.floor(i/cols)*dy) <= epsilon)) {
      regular = { x:first.x, y:first.y, w:first.w, h:first.h, dx, dy, cols, rows:Math.ceil(rects.length / cols), epsilon };
    }
  }
  return { rects, regular };
}

export function hitDrawingMap(map, point, tolerance) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  let candidates = map.rects;
  if (map.regular) {
    const g = map.regular;
    const margin = tolerance + 2*g.epsilon;
    // Include cells on both sides of exact edges and across gaps. DOM order
    // resolves edge/snap ties exactly as the original linear scan did.
    const c0 = Math.max(0, Math.ceil((point.x - margin - g.x - g.w) / g.dx));
    const c1 = Math.min(g.cols - 1, Math.floor((point.x + margin - g.x) / g.dx));
    const r0 = Math.max(0, Math.ceil((point.y - margin - g.y - g.h) / g.dy));
    const r1 = Math.min(g.rows - 1, Math.floor((point.y + margin - g.y) / g.dy));
    candidates = [];
    for (let row=r0; row<=r1; row++) for (let col=c0; col<=c1; col++) {
      const r = map.rects[row*g.cols+col];
      if (r) candidates.push(r);
    }
  }
  let best = null, bestD2 = Infinity;
  for (const r of candidates) {
    if (point.x >= r.x && point.x <= r.x+r.w && point.y >= r.y && point.y <= r.y+r.h) {
      return { rect:r, localX:point.x-r.x, localY:point.y-r.y, snapped:false };
    }
    const dx = point.x < r.x ? r.x-point.x : point.x > r.x+r.w ? point.x-(r.x+r.w) : 0;
    const dy = point.y < r.y ? r.y-point.y : point.y > r.y+r.h ? point.y-(r.y+r.h) : 0;
    const d2 = dx*dx+dy*dy;
    if (d2 < bestD2 && dx <= tolerance && dy <= tolerance) { best=r; bestD2=d2; }
  }
  return best ? { rect:best, localX:Math.min(best.w,Math.max(0,point.x-best.x)),
    localY:Math.min(best.h,Math.max(0,point.y-best.y)), snapped:true } : null;
}
