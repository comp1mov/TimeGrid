import { getStroke } from 'perfect-freehand';

export const STROKE_FORMAT = 'timegrid-strokes';
export const STROKE_SCHEMA = 1;
export const ENGINE_VERSION = 'perfect-freehand@1.2.3';
export const FRAME_W = 1024,
  FRAME_H = 576;
export const LIMITS = Object.freeze({
  strokes: 20000,
  points: 1000000,
  perStroke: 30000,
  bytes: 32 * 1024 * 1024,
});
const BUCKET = 256;
// Conservative serialized-size estimate keeps every accepted drawing reopenable.
const storageCost = (s) => 1024 + s.points.length * 100 + s.outline.length * 70;
const geometryCost = (s) => 256 + s.points.length * 24 + s.outline.length * 16;
const HISTORY_BUDGET = 16 * 1024 * 1024;
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
export const intersects = (a, b) =>
  a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
export const union = (a, b) =>
  !a
    ? { ...b }
    : {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x),
        h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y),
      };
export function bounds(points, pad = 0) {
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const p of points) {
    x = Math.min(x, p[0]);
    y = Math.min(y, p[1]);
    right = Math.max(right, p[0]);
    bottom = Math.max(bottom, p[1]);
  }
  return {
    x: x - pad,
    y: y - pad,
    w: right - x + pad * 2,
    h: bottom - y + pad * 2,
  };
}
export function surfaceSize(id) {
  if (id === 'bg-grid') return { w: 8 * FRAME_W, h: 12 * FRAME_H };
  return { w: FRAME_W, h: FRAME_H };
}
export function validSurface(id) {
  return /^(tpl|bg-grid|bg-single|frame-(?:[0-9]|[1-8][0-9]|9[0-5]))$/.test(id);
}
function cells(box) {
  const out = [];
  for (
    let y = Math.floor(box.y / BUCKET);
    y <= Math.floor((box.y + box.h) / BUCKET);
    y++
  )
    for (
      let x = Math.floor(box.x / BUCKET);
      x <= Math.floor((box.x + box.w) / BUCKET);
      x++
    )
      out.push(x + ',' + y);
  return out;
}
export function createStroke({
  id,
  surface,
  points,
  size = 16,
  color = '#ff6b9b',
  opacity = 1,
  erase = false,
  pressure = false,
  smoothing = 0.35,
  last = true,
}) {
  const options = {
    size,
    thinning: pressure ? 0.55 : 0,
    smoothing,
    streamline: 0.25,
    simulatePressure: false,
    last,
  };
  const outline = getStroke(points, options);
  return {
    id,
    surface,
    points: points.map((p) => [...p]),
    outline,
    box: bounds(outline, 1),
    brush: { size, color, opacity, erase, pressure, smoothing },
    engine: ENGINE_VERSION,
  };
}
function freezeStroke(s) {
  s.points.forEach(Object.freeze);
  s.outline.forEach(Object.freeze);
  Object.freeze(s.points);
  Object.freeze(s.outline);
  Object.freeze(s.box);
  Object.freeze(s.brush);
  return Object.freeze(s);
}
export class StrokeDocument {
  constructor() {
    this.strokes = [];
    this.byId = new Map();
    this.index = new Map();
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
    this.revision = 0;
    this.nextId = 1;
    this.totalPoints = 0;
    this.storageEstimate = 0;
  }
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  newId() {
    return 's' + this.nextId++;
  }
  _index(s) {
    let grid = this.index.get(s.surface);
    if (!grid) this.index.set(s.surface, (grid = new Map()));
    for (const k of cells(s.box)) {
      let ids = grid.get(k);
      if (!ids) grid.set(k, (ids = new Set()));
      ids.add(s.id);
    }
    this.byId.set(s.id, s);
  }
  _reindex() {
    this.index.clear();
    this.byId.clear();
    this.totalPoints = 0;
    this.storageEstimate = 0;
    for (const s of this.strokes) {
      this._index(s);
      this.totalPoints += s.points.length;
      this.storageEstimate += storageCost(s);
    }
  }
  _emit(changed) {
    this.revision++;
    const dirty = new Map();
    for (const s of changed)
      dirty.set(s.surface, union(dirty.get(s.surface), s.box));
    for (const fn of this.listeners) fn({ dirty, revision: this.revision });
  }
  _record(command) {
    this.undoStack.push(command);
    this.redoStack = [];
    let cost = 0,
      keep = 0;
    const seen = new Set();
    for (let i = this.undoStack.length - 1; i >= 0; i--) {
      for (const s of this.undoStack[i].items)
        if (!seen.has(s.id)) {
          seen.add(s.id);
          cost += geometryCost(s);
        }
      if (keep >= 100 || (cost > HISTORY_BUDGET && keep > 0)) break;
      keep++;
    }
    this.undoStack = this.undoStack.slice(-keep);
  }
  addGesture(strokes) {
    if (!strokes.length) return;
    if (
      this.strokes.length + strokes.length > LIMITS.strokes ||
      this.totalPoints + strokes.reduce((n, s) => n + s.points.length, 0) >
        LIMITS.points
    )
      throw Error(
        'Drawing limit reached. Save this drawing before continuing in a new one.',
      );
    let last = Number(this.strokes.at(-1)?.id.slice(1) || 0);
    const ids = new Set();
    for (const s of strokes) {
      if (Number(s.id.slice(1)) <= last)
        throw Error('Stroke IDs must preserve paint order.');
      last = Number(s.id.slice(1));
      validateStroke(s);
      if (this.byId.has(s.id) || ids.has(s.id))
        throw Error('Duplicate stroke ID');
      ids.add(s.id);
    }
    const extra = strokes.reduce((n, s) => n + storageCost(s), 0);
    if (this.storageEstimate + extra > LIMITS.bytes - 4096)
      throw Error(
        'Drawing storage limit reached. Save before starting another drawing.',
      );
    const items = strokes.map(freezeStroke);
    this.storageEstimate += extra;
    this.strokes.push(...items);
    for (const s of items) {
      this._index(s);
      this.totalPoints += s.points.length;
    }
    this.nextId = Math.max(this.nextId, last + 1);
    this._record({ kind: 'add', items });
    this._emit(items);
  }
  clear() {
    if (!this.strokes.length) return;
    const items = this.strokes;
    this.strokes = [];
    this._reindex();
    this._record({ kind: 'clear', items });
    this._emit(items);
  }
  undo() {
    const c = this.undoStack.pop();
    if (!c) return false;
    if (c.kind === 'add') this.strokes = this.strokes.slice(0, -c.items.length);
    else this.strokes = [...c.items];
    this._reindex();
    this.redoStack.push(c);
    this._emit(c.items);
    return true;
  }
  redo() {
    const c = this.redoStack.pop();
    if (!c) return false;
    if (c.kind === 'add') this.strokes.push(...c.items);
    else this.strokes = [];
    this._reindex();
    this.undoStack.push(c);
    this._emit(c.items);
    return true;
  }
  query(surface, box) {
    const grid = this.index.get(surface);
    if (!grid) return [];
    const ids = new Set();
    for (const k of cells(box)) for (const id of grid.get(k) || []) ids.add(id);
    // Stable sequence numbers preserve paint/erase order across spatial buckets.
    return [...ids]
      .map((id) => this.byId.get(id))
      .filter((s) => intersects(s.box, box))
      .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  }
  serialize() {
    return JSON.stringify({
      format: STROKE_FORMAT,
      schema: STROKE_SCHEMA,
      engine: ENGINE_VERSION,
      frame: { width: FRAME_W, height: FRAME_H, count: 96 },
      strokes: this.strokes,
    });
  }
  static parse(text) {
    if (typeof text !== 'string' || text.length > LIMITS.bytes)
      throw Error('Drawing file is too large.');
    const data = JSON.parse(text);
    if (
      data?.format !== STROKE_FORMAT ||
      data.schema !== STROKE_SCHEMA ||
      data.engine !== ENGINE_VERSION
    )
      throw Error('Unsupported drawing format or engine version.');
    if (
      data.frame?.width !== FRAME_W ||
      data.frame?.height !== FRAME_H ||
      data.frame?.count !== 96
    )
      throw Error('Unsupported frame geometry.');
    if (!Array.isArray(data.strokes) || data.strokes.length > LIMITS.strokes)
      throw Error('Invalid stroke list.');
    const doc = new StrokeDocument();
    let last = 0;
    for (const raw of data.strokes) {
      validateStroke(raw);
      const id = Number(raw.id.slice(1));
      if (id <= last) throw Error('Stroke order or ID is invalid.');
      last = id;
      doc.storageEstimate += storageCost(raw);
      if (doc.storageEstimate > LIMITS.bytes - 4096)
        throw Error('Drawing storage limit exceeded.');
      doc.totalPoints += raw.points.length;
      if (doc.totalPoints > LIMITS.points) throw Error('Too many points.');
      const s = {
        id: raw.id,
        surface: raw.surface,
        points: raw.points.map((p) => p.slice()),
        outline: raw.outline.map((p) => p.slice()),
        box: bounds(raw.outline, 1),
        brush: { ...raw.brush },
        engine: ENGINE_VERSION,
      };
      doc.strokes.push(freezeStroke(s));
      doc._index(s);
    }
    doc.nextId = last + 1;
    return doc;
  }
}
function validateStroke(s) {
  if (
    !s ||
    !/^s[1-9][0-9]{0,8}$/.test(s.id) ||
    !validSurface(s.surface) ||
    s.engine !== ENGINE_VERSION
  )
    throw Error('Invalid stroke identity.');
  if (
    !Array.isArray(s.points) ||
    !s.points.length ||
    s.points.length > LIMITS.perStroke ||
    !Array.isArray(s.outline) ||
    s.outline.length < 3 ||
    s.outline.length > LIMITS.perStroke * 4 + 100
  )
    throw Error('Invalid stroke geometry.');
  const extent = surfaceSize(s.surface);
  for (const p of s.points)
    if (
      !Array.isArray(p) ||
      p.length !== 3 ||
      !p.every(finite) ||
      p[2] < 0 ||
      p[2] > 1 ||
      p[0] < -1024 ||
      p[1] < -1024 ||
      p[0] > extent.w + 1024 ||
      p[1] > extent.h + 1024
    )
      throw Error('Invalid input point.');
  for (const p of s.outline)
    if (
      !Array.isArray(p) ||
      p.length !== 2 ||
      !p.every(finite) ||
      p[0] < -1024 ||
      p[1] < -1024 ||
      p[0] > extent.w + 1024 ||
      p[1] > extent.h + 1024
    )
      throw Error('Invalid outline.');
  const b = s.brush;
  if (
    !b ||
    !finite(b.size) ||
    b.size < 1 ||
    b.size > 256 ||
    !/^#[0-9a-f]{6}$/i.test(b.color) ||
    !finite(b.opacity) ||
    b.opacity < 0 ||
    b.opacity > 1 ||
    typeof b.erase !== 'boolean' ||
    typeof b.pressure !== 'boolean' ||
    !finite(b.smoothing) ||
    b.smoothing < 0 ||
    b.smoothing > 1
  )
    throw Error('Invalid brush.');
}
export function strokePath(stroke) {
  const p = new Path2D(),
    pts = stroke.outline;
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  p.closePath();
  return p;
}
export function paintStroke(ctx, stroke, path = strokePath(stroke)) {
  ctx.globalCompositeOperation = stroke.brush.erase
    ? 'destination-out'
    : 'source-over';
  ctx.globalAlpha = stroke.brush.opacity;
  ctx.fillStyle = stroke.brush.color;
  ctx.fill(path);
}
export function clipSegment(a, b, rect) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  let lo = 0,
    hi = 1;
  const ps = [-dx, dx, -dy, dy],
    qs = [
      a[0] - rect.x,
      rect.x + rect.w - a[0],
      a[1] - rect.y,
      rect.y + rect.h - a[1],
    ];
  for (let i = 0; i < 4; i++) {
    if (ps[i] === 0) {
      if (qs[i] < 0) return null;
    } else {
      const r = qs[i] / ps[i];
      if (ps[i] < 0) lo = Math.max(lo, r);
      else hi = Math.min(hi, r);
      if (lo > hi) return null;
    }
  }
  const point = (t) => [a[0] + dx * t, a[1] + dy * t, a[2] + (b[2] - a[2]) * t];
  return { a: point(lo), b: point(hi), t: lo };
}
