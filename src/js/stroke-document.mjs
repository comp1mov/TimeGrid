import { getStroke } from 'perfect-freehand';
import {
  makeStamps,
  stampBounds,
  circleTouches,
  paintStamps,
  MAX_STAMPS,
} from './brush-geometry.mjs';

export const STROKE_FORMAT = 'timegrid-strokes';
export const STROKE_SCHEMA = 3;
export const ENGINE_VERSION = 'perfect-freehand@1.2.3';
export const FRAME_W = 1024,
  FRAME_H = 576;
export const LIMITS = Object.freeze({
  strokes: 20000,
  points: 1000000,
  perStroke: 30000,
  bytes: 32 * 1024 * 1024,
});
const BUCKET = 256,
  HISTORY_BUDGET = 16 * 1024 * 1024;
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const storageCost = (s) =>
  1024 +
  s.points.length * 100 +
  s.outline.length * 70 +
  (s.stamps?.length || 0) * 40 +
  s.placements.length * 128;
const geometryCost = (s) =>
  256 +
  s.points.length * 24 +
  s.outline.length * 16 +
  s.placements.length * 64 +
  (s.stamps?.length || 0) * 24;
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
  return id === 'bg-grid' || id === 'sheet'
    ? { w: 8 * FRAME_W, h: 12 * FRAME_H }
    : { w: FRAME_W, h: FRAME_H };
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
const midpoint = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

// Match the quadratic midpoint path in the library example. This is renderer
// metadata, not a reason to regenerate saved outlines when reopening a file.
export function traceOutline(s, sink) {
  const pts = s.outline;
  sink.moveTo(...pts[0]);
  if (s.renderer === 'quadratic-v1' && pts.length >= 4) {
    for (let i = 1; i < pts.length - 1; i++)
      sink.quadraticCurveTo(...pts[i], ...midpoint(pts[i], pts[i + 1]));
  } else for (let i = 1; i < pts.length; i++) sink.lineTo(...pts[i]);
  sink.closePath();
}
function flattenOutline(s) {
  const points = [];
  let current;
  function quadratic(a, c, b, depth = 0) {
    const error =
      Math.hypot(2 * c[0] - a[0] - b[0], 2 * c[1] - a[1] - b[1]) / 4;
    if (error <= 0.25 || depth >= 12) {
      points.push(b);
      return;
    }
    const ac = midpoint(a, c),
      cb = midpoint(c, b),
      m = midpoint(ac, cb);
    quadratic(a, ac, m, depth + 1);
    quadratic(m, cb, b, depth + 1);
  }
  traceOutline(s, {
    moveTo: (x, y) => {
      current = [x, y];
      points.push(current);
    },
    lineTo: (x, y) => {
      current = [x, y];
      points.push(current);
    },
    quadraticCurveTo: (cx, cy, x, y) => {
      quadratic(current, [cx, cy], [x, y]);
      current = [x, y];
    },
    closePath: () => {},
  });
  return points;
}
function pointInside(poly, x, y) {
  let winding = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j],
      b = poly[i],
      cross = (b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1]);
    if (a[1] <= y && b[1] > y && cross > 0) winding++;
    if (a[1] > y && b[1] <= y && cross < 0) winding--;
  }
  return winding !== 0;
}
function touches(poly, r) {
  const pad = 0.5,
    box = { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad };
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j],
      b = poly[i];
    if (clipSegment([a[0], a[1], 0.5], [b[0], b[1], 0.5], box)) return true;
  }
  return pointInside(poly, r.x + r.w / 2, r.y + r.h / 2);
}
function gridPlacements(s, target) {
  if (s.renderer === 'stamps-v1') {
    const hit = new Set();
    for (const p of s.stamps) {
      const [x, y, r] = p;
      for (
        let row = Math.max(0, Math.floor((y - r - 0.5) / FRAME_H));
        row <= Math.min(11, Math.floor((y + r + 0.5) / FRAME_H));
        row++
      )
        for (
          let col = Math.max(0, Math.floor((x - r - 0.5) / FRAME_W));
          col <= Math.min(7, Math.floor((x + r + 0.5) / FRAME_W));
          col++
        )
          if (
            circleTouches(p, {
              x: col * FRAME_W,
              y: row * FRAME_H,
              w: FRAME_W,
              h: FRAME_H,
            })
          )
            hit.add(row * 8 + col);
    }
    return [...hit]
      .sort((a, b) => a - b)
      .map((i) => ({
        surface: target === 'tpl' ? 'tpl' : 'frame-' + i,
        x: -(i % 8) * FRAME_W,
        y: -Math.floor(i / 8) * FRAME_H,
      }));
  }
  const poly = flattenOutline(s),
    out = [];
  for (let i = 0; i < 96; i++) {
    const x = (i % 8) * FRAME_W,
      y = Math.floor(i / 8) * FRAME_H,
      r = { x, y, w: FRAME_W, h: FRAME_H };
    if (intersects(s.box, r) && touches(poly, r))
      out.push({
        surface: target === 'tpl' ? 'tpl' : 'frame-' + i,
        x: -x,
        y: -y,
      });
  }
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
  smoothing = 0.5,
  streamline = 0.5,
  simulatePressure = false,
  last = true,
  target = 'frm',
  type = 'round',
  softness = 0,
  seed = 1,
}) {
  const stamped = type === 'spray' || softness > 0;
  const outline = stamped
    ? []
    : getStroke(points, {
        size,
        thinning: pressure ? 0.55 : 0,
        smoothing,
        streamline,
        simulatePressure,
        last,
      });
  const s = {
    id,
    surface,
    points: points.map((p) => [...p]),
    outline,
    box: bounds(outline, 1),
    brush: {
      size,
      color,
      opacity,
      erase,
      pressure,
      smoothing,
      streamline,
      simulatePressure,
      type,
      softness,
      seed,
    },
    engine: ENGINE_VERSION,
    renderer: 'quadratic-v1',
  };
  if (stamped) {
    s.renderer = 'stamps-v1';
    s.stamps = makeStamps(points, s.brush, last);
    s.box = stampBounds(s.stamps);
  }
  s.placements =
    surface === 'sheet' ? gridPlacements(s, target) : [{ surface, x: 0, y: 0 }];
  return s;
}
const instanceMemo = new WeakMap();
// Instances reference one immutable geometry. Crossing 96 frames never copies
// the points or restarts pressure, caps, streamline, or edge smoothing.
export function renderInstances(s) {
  let out = instanceMemo.get(s);
  if (out) return out;
  out = s.placements
    .map((p, order) => {
      const extent = surfaceSize(p.surface),
        x = Math.max(0, s.box.x + p.x),
        y = Math.max(0, s.box.y + p.y),
        right = Math.min(extent.w, s.box.x + p.x + s.box.w),
        bottom = Math.min(extent.h, s.box.y + p.y + s.box.h);
      return {
        id: s.id,
        key: s.id + '@' + order,
        surface: p.surface,
        stroke: s,
        placement: p,
        brush: s.brush,
        order,
        box: { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) },
      };
    })
    .filter((i) => i.box.w > 0 && i.box.h > 0);
  instanceMemo.set(s, out);
  return out;
}
function freezeStroke(s) {
  for (const a of [s.points, s.outline, ...(s.stamps ? [s.stamps] : [])]) {
    a.forEach(Object.freeze);
    Object.freeze(a);
  }
  s.placements.forEach(Object.freeze);
  Object.freeze(s.placements);
  Object.freeze(s.brush);
  Object.freeze(s.box);
  return Object.freeze(s);
}
export class StrokeDocument {
  constructor() {
    this.strokes = [];
    this.byId = new Map();
    this.instances = new Map();
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
    this.byId.set(s.id, s);
    for (const item of renderInstances(s)) {
      this.instances.set(item.key, item);
      let grid = this.index.get(item.surface);
      if (!grid) this.index.set(item.surface, (grid = new Map()));
      for (const k of cells(item.box)) {
        let ids = grid.get(k);
        if (!ids) grid.set(k, (ids = new Set()));
        ids.add(item.key);
      }
    }
  }
  _reindex() {
    this.index.clear();
    this.byId.clear();
    this.instances.clear();
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
      for (const item of renderInstances(s))
        dirty.set(item.surface, union(dirty.get(item.surface), item.box));
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
        'Drawing limit reached. Save before starting another drawing.',
      );
    let last = Number(this.strokes.at(-1)?.id.slice(1) || 0);
    for (const s of strokes) {
      validateStroke(s);
      const n = Number(s.id.slice(1));
      if (n <= last) throw Error('Stroke IDs must preserve paint order.');
      last = n;
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
    return [...ids]
      .map((id) => this.instances.get(id))
      .filter((s) => intersects(s.box, box))
      .sort(
        (a, b) =>
          Number(a.id.slice(1)) - Number(b.id.slice(1)) || a.order - b.order,
      );
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
      ![1, 2, 3].includes(data.schema) ||
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
      const b = raw?.brush;
      const s = {
        ...raw,
        renderer: data.schema === 1 ? 'linear-v1' : raw.renderer,
        placements:
          data.schema === 1
            ? [{ surface: raw.surface, x: 0, y: 0 }]
            : raw.placements,
        brush: b
          ? {
              size: b.size,
              color: b.color,
              opacity: b.opacity,
              erase: b.erase,
              pressure: b.pressure,
              smoothing: b.smoothing,
              streamline: data.schema === 1 ? 0.25 : b.streamline,
              simulatePressure: data.schema === 1 ? false : b.simulatePressure,
              type: data.schema < 3 ? 'round' : b.type,
              softness: data.schema < 3 ? 0 : b.softness,
              seed: data.schema < 3 ? 1 : b.seed,
            }
          : null,
      };
      validateStroke(s);
      const id = Number(s.id.slice(1));
      if (id <= last) throw Error('Stroke order or ID is invalid.');
      last = id;
      doc.totalPoints += s.points.length;
      doc.storageEstimate += storageCost(s);
      if (
        doc.totalPoints > LIMITS.points ||
        doc.storageEstimate > LIMITS.bytes - 4096
      )
        throw Error('Drawing storage limit exceeded.');
      const clean = {
        id: s.id,
        surface: s.surface,
        points: s.points.map((p) => p.slice()),
        outline: s.outline.map((p) => p.slice()),
        box:
          s.renderer === 'stamps-v1'
            ? stampBounds(s.stamps)
            : bounds(s.outline, 1),
        brush: s.brush,
        engine: ENGINE_VERSION,
        renderer: s.renderer,
        ...(s.renderer === 'stamps-v1'
          ? { stamps: s.stamps.map((p) => p.slice()) }
          : {}),
        placements: s.placements.map((p) => ({
          surface: p.surface,
          x: p.x,
          y: p.y,
        })),
      };
      doc.strokes.push(freezeStroke(clean));
      doc._index(clean);
    }
    doc.nextId = last + 1;
    return doc;
  }
}
function validateStroke(s) {
  if (
    !s ||
    !/^s[1-9][0-9]{0,8}$/.test(s.id) ||
    !(validSurface(s.surface) || s.surface === 'sheet') ||
    s.engine !== ENGINE_VERSION ||
    !['linear-v1', 'quadratic-v1', 'stamps-v1'].includes(s.renderer)
  )
    throw Error('Invalid stroke identity.');
  if (
    !Array.isArray(s.points) ||
    !s.points.length ||
    s.points.length > LIMITS.perStroke ||
    !Array.isArray(s.outline) ||
    (s.renderer !== 'stamps-v1' && s.outline.length < 3) ||
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
      p[0] < -2048 ||
      p[1] < -2048 ||
      p[0] > extent.w + 2048 ||
      p[1] > extent.h + 2048
    )
      throw Error('Invalid outline.');
  if (s.renderer === 'stamps-v1') {
    if (
      s.outline.length ||
      !Array.isArray(s.stamps) ||
      !s.stamps.length ||
      s.stamps.length > MAX_STAMPS
    )
      throw Error('Invalid stamp geometry.');
    for (const p of s.stamps) {
      if (
        !Array.isArray(p) ||
        p.length !== 3 ||
        !p.every((n) => finite(n) && n === Math.round(n * 10000) / 10000) ||
        p[2] <= 0 ||
        p[2] > 256 ||
        p[0] < -2048 ||
        p[1] < -2048 ||
        p[0] > extent.w + 2048 ||
        p[1] > extent.h + 2048
      )
        throw Error('Invalid stamp.');
    }
  } else if (s.stamps !== undefined) throw Error('Unexpected stamps.');
  const b = s.brush;
  if (
    !b ||
    !['round', 'spray'].includes(b.type) ||
    !finite(b.softness) ||
    b.softness < 0 ||
    b.softness > 1 ||
    !Number.isInteger(b.seed) ||
    b.seed < 0 ||
    b.seed > 4294967295 ||
    !finite(b.size) ||
    b.size < 1 ||
    b.size > 256 ||
    !/^#[0-9a-f]{6}$/i.test(b.color) ||
    !finite(b.opacity) ||
    b.opacity < 0 ||
    b.opacity > 1 ||
    typeof b.erase !== 'boolean' ||
    typeof b.pressure !== 'boolean' ||
    typeof b.simulatePressure !== 'boolean' ||
    !finite(b.smoothing) ||
    b.smoothing < 0 ||
    b.smoothing > 1 ||
    !finite(b.streamline) ||
    b.streamline < 0 ||
    b.streamline > 1
  )
    throw Error('Invalid brush.');
  if (!Array.isArray(s.placements) || s.placements.length > 96)
    throw Error('Invalid placements.');
  const seen = new Set();
  for (const p of s.placements) {
    if (
      !p ||
      !validSurface(p.surface) ||
      !finite(p.x) ||
      !finite(p.y) ||
      p.x > 0 ||
      p.x < -7 * FRAME_W ||
      p.y > 0 ||
      p.y < -11 * FRAME_H
    )
      throw Error('Invalid placement.');
    if (
      s.surface !== 'sheet' &&
      (p.surface !== s.surface || p.x !== 0 || p.y !== 0)
    )
      throw Error('Invalid local placement.');
    if (
      s.surface === 'sheet' &&
      (!/^(tpl|frame-\d+)$/.test(p.surface) || p.x % FRAME_W || p.y % FRAME_H)
    )
      throw Error('Invalid grid placement.');
    const key = p.surface + '|' + p.x + '|' + p.y;
    if (seen.has(key)) throw Error('Duplicate placement.');
    seen.add(key);
  }
}
export function strokePath(value) {
  const s = value.stroke || value;
  if (s.renderer === 'stamps-v1') return null;
  const p = new Path2D();
  traceOutline(s, p);
  return p;
}
export function paintStroke(ctx, value, path = strokePath(value), box) {
  const s = value.stroke || value,
    p = value.placement;
  ctx.save();
  // The destination clips each surface. Keep raster bleed outside its bounds
  // for bilinear sampling at fractional display scales.
  if (p) ctx.translate(p.x, p.y);
  ctx.globalCompositeOperation = s.brush.erase
    ? 'destination-out'
    : 'source-over';
  ctx.globalAlpha = s.brush.opacity;
  ctx.fillStyle = s.brush.color;
  if (s.renderer === 'stamps-v1')
    paintStamps(
      ctx,
      s,
      box ? { ...box, x: box.x - (p?.x || 0), y: box.y - (p?.y || 0) } : null,
    );
  else ctx.fill(path);
  ctx.restore();
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
