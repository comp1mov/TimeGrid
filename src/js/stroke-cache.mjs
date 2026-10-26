import {
  intersects,
  surfaceSize,
  paintStroke,
  strokePath,
  renderInstances,
} from './stroke-document.mjs';
const TILE = 256,
  BLEED = 2;
export class StrokeTileCache {
  constructor(
    doc,
    {
      budget = 24 * 1024 * 1024,
      canvasFactory = () => document.createElement('canvas'),
    } = {},
  ) {
    this.drafts = [];
    this.doc = doc;
    this.budget = budget;
    this.canvasFactory = canvasFactory;
    this.tiles = new Map();
    this.paths = new Map();
    this.bytes = 0;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.rasterMs = 0;
    this.unsubscribe = doc.onChange(({ dirty }) => {
      for (const [surface, box] of dirty) this.invalidate(surface, box);
    });
  }
  setDrafts(next) {
    const before = new Map(this.drafts.map((s) => [s.id, s])),
      after = new Map(next.map((s) => [s.id, s]));
    for (const s of [...this.drafts, ...next])
      if (before.get(s.id) !== after.get(s.id)) {
        for (const item of renderInstances(s))
          this.invalidate(item.surface, item.box);
        this.paths.delete(s.id);
      }
    this.drafts = next;
  }
  path(s) {
    s = s.stroke || s;
    let p = this.paths.get(s.id);
    if (p) {
      this.paths.delete(s.id);
      this.paths.set(s.id, p);
      return p;
    }
    p = strokePath(s);
    this.paths.set(s.id, p);
    if (this.paths.size > 1024)
      this.paths.delete(this.paths.keys().next().value);
    return p;
  }
  _drop(key) {
    const t = this.tiles.get(key);
    if (!t) return;
    this.bytes -= t.bytes;
    t.canvas.width = 0;
    t.canvas.height = 0;
    this.tiles.delete(key);
  }
  invalidate(surface, box) {
    for (const [key, t] of this.tiles)
      if (t.surface === surface && intersects(t.box, box)) this._drop(key);
  }
  clear() {
    for (const key of [...this.tiles.keys()]) this._drop(key);
    this.paths.clear();
  }
  dispose() {
    this.unsubscribe();
    this.clear();
  }
  tile(surface, level, tx, ty) {
    const key = surface + '|' + level + '|' + tx + '|' + ty;
    let tile = this.tiles.get(key);
    if (tile) {
      this.tiles.delete(key);
      this.tiles.set(key, tile);
      this.hits++;
      return tile;
    }
    const size = surfaceSize(surface),
      step = TILE / level;
    const x = tx * step,
      y = ty * step,
      w = Math.min(step, size.w - x),
      h = Math.min(step, size.h - y);
    if (w <= 0 || h <= 0) return null;
    const box = {
      x: x - BLEED / level,
      y: y - BLEED / level,
      w: w + (2 * BLEED) / level,
      h: h + (2 * BLEED) / level,
    };
    const strokes = [
      ...this.doc.query(surface, box),
      ...this.drafts
        .flatMap(renderInstances)
        .filter((s) => s.surface === surface && intersects(s.box, box)),
    ];
    if (!strokes.some((s) => !s.brush.erase)) return null;
    const start = performance.now(),
      canvas = this.canvasFactory();
    canvas.width = Math.ceil(w * level) + 2 * BLEED;
    canvas.height = Math.ceil(h * level) + 2 * BLEED;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(level, 0, 0, level, BLEED - x * level, BLEED - y * level);
    for (const s of strokes) paintStroke(ctx, s, this.path(s));
    tile = {
      canvas,
      surface,
      box,
      x,
      y,
      w,
      h,
      level,
      bytes: canvas.width * canvas.height * 4,
    };
    while (this.bytes + tile.bytes > this.budget && this.tiles.size) {
      this._drop(this.tiles.keys().next().value);
      this.evictions++;
    }
    this.tiles.set(key, tile);
    this.bytes += tile.bytes;
    this.misses++;
    this.rasterMs += performance.now() - start;
    return tile;
  }
  draw(ctx, surface, rect, dpr = 1, clip = rect) {
    const size = surfaceSize(surface);
    const level = Math.max(
      1 / 32,
      Math.min(
        4,
        2 ** Math.ceil(Math.log2(Math.max(0.001, (rect.w / size.w) * dpr))),
      ),
    );
    const step = TILE / level;
    ctx.save();
    ctx.beginPath();
    // Adjacent tiles must own disjoint device pixels. Fractional drawImage
    // edges blend twice with the background and expose a grid in thick ink.
    const snap = (v) => Math.round(v * dpr) / dpr;
    ctx.rect(
      snap(rect.x),
      snap(rect.y),
      snap(rect.x + rect.w) - snap(rect.x),
      snap(rect.y + rect.h) - snap(rect.y),
    );
    ctx.clip();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const x0 = Math.max(
        0,
        Math.floor((((clip.x - rect.x) / rect.w) * size.w) / step),
      ),
      y0 = Math.max(
        0,
        Math.floor((((clip.y - rect.y) / rect.h) * size.h) / step),
      );
    const x1 = Math.min(
        Math.ceil(size.w / step),
        Math.ceil((((clip.x + clip.w - rect.x) / rect.w) * size.w) / step),
      ),
      y1 = Math.min(
        Math.ceil(size.h / step),
        Math.ceil((((clip.y + clip.h - rect.y) / rect.h) * size.h) / step),
      );
    for (let ty = y0; ty < y1; ty++)
      for (let tx = x0; tx < x1; tx++) {
        const tile = this.tile(surface, level, tx, ty);
        if (!tile) continue;
        const left = snap(rect.x + (tile.x / size.w) * rect.w),
          top = snap(rect.y + (tile.y / size.h) * rect.h),
          right = snap(rect.x + ((tile.x + tile.w) / size.w) * rect.w),
          bottom = snap(rect.y + ((tile.y + tile.h) / size.h) * rect.h);
        if (right <= left || bottom <= top) continue;
        // Sample the bleed at the corresponding logical coordinates, so pixel
        // alignment changes ownership, not the shape or scale of the stroke.
        const sx =
            BLEED + (((left - rect.x) / rect.w) * size.w - tile.x) * level,
          sy = BLEED + (((top - rect.y) / rect.h) * size.h - tile.y) * level,
          sw = ((right - left) / rect.w) * size.w * level,
          sh = ((bottom - top) / rect.h) * size.h * level;
        ctx.drawImage(
          tile.canvas,
          sx,
          sy,
          sw,
          sh,
          left,
          top,
          right - left,
          bottom - top,
        );
      }
    ctx.restore();
  }
  stats() {
    return {
      tiles: this.tiles.size,
      bytes: this.bytes,
      budget: this.budget,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      pathCount: this.paths.size,
      rasterMs: this.rasterMs,
    };
  }
}
