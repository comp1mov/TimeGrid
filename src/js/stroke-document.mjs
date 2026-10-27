import { getStroke } from 'perfect-freehand';
import {
  makeStamps,
  stampBounds,
  circleTouches,
  paintStamps,
  MAX_STAMPS,
} from './brush-geometry.mjs';

export const STROKE_FORMAT = 'timegrid-strokes';
export const STROKE_SCHEMA = 6;
export const ENGINE_VERSION = 'perfect-freehand@1.2.3';
export const BG_COORD_LIMIT = 32768;
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
  (s.fill?.runs.length || 0) * 80 +
  s.placements.length * 128 +
  (s.children || []).reduce((n, c) => n + storageCost(c), 0);
const geometryCost = (s) =>
  256 +
  s.points.length * 24 +
  s.outline.length * 16 +
  s.placements.length * 64 +
  (s.stamps?.length || 0) * 24 +
  (s.fill?.runs.length || 0) * 32 +
  (s.children || []).reduce((n, c) => n + geometryCost(c), 0);
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
  if (s.renderer.startsWith('stamps-')) {
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
  scatter = 1,
  dotScale = 1,
  placements,
  space,
  overflow,
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
      scatter,
      dotScale,
    },
    engine: ENGINE_VERSION,
    renderer: 'quadratic-v1',
    ...(space ? { space } : {}),
    ...(overflow ? { overflow: true } : {}),
  };
  if (stamped) {
    s.renderer = 'stamps-v1';
    s.stamps = makeStamps(points, s.brush, last);
    s.box = stampBounds(s.stamps);
  }
  s.placements =
    placements ??
    (surface === 'sheet'
      ? gridPlacements(s, target)
      : [{ surface, x: 0, y: 0 }]);
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
        x = s.overflow ? s.box.x + p.x : Math.max(0, s.box.x + p.x),
        y = s.overflow ? s.box.y + p.y : Math.max(0, s.box.y + p.y),
        right = s.overflow
          ? x + s.box.w
          : Math.min(extent.w, s.box.x + p.x + s.box.w),
        bottom = s.overflow
          ? y + s.box.h
          : Math.min(extent.h, s.box.y + p.y + s.box.h);
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
  if (s.fill) {
    s.fill.runs.forEach(Object.freeze);
    Object.freeze(s.fill.runs);
    Object.freeze(s.fill);
  }
  if (s.children) {
    s.children.forEach(freezeStroke);
    Object.freeze(s.children);
  }
  for (const a of [s.points, s.outline, ...(s.stamps ? [s.stamps] : [])]) {
    a.forEach(Object.freeze);
    Object.freeze(a);
  }
  s.placements.forEach(Object.freeze);
  Object.freeze(s.placements);
  if (s.space) Object.freeze(s.space);
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
    this.extendedSurfaces = new Set();
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
    this.revision = 0;
    this.nextId = 1;
    this.settings = {};
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
    if (s.overflow) this.extendedSurfaces.add(s.surface);
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
    this.extendedSurfaces.clear();
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
  replaceSurfaces(surfaces, additions = []) {
    const selected = new Set(surfaces),
      before = this.strokes;
    const kept = before
      .map((s) => {
        const placements = s.placements.filter((p) => !selected.has(p.surface));
        return placements.length === s.placements.length
          ? s
          : placements.length
            ? freezeStroke({ ...s, placements })
            : null;
      })
      .filter(Boolean);
    let last = Number(kept.at(-1)?.id.slice(1) || 0);
    for (const s of additions) {
      validateStroke(s);
      const n = Number(s.id.slice(1));
      if (n <= last) throw Error('Stroke IDs must preserve paint order.');
      last = n;
    }
    const after = [...kept, ...additions];
    if (
      after.length > LIMITS.strokes ||
      after.reduce((n, s) => n + s.points.length, 0) > LIMITS.points ||
      after.reduce((n, s) => n + storageCost(s), 0) > LIMITS.bytes - 4096
    )
      throw Error('Drawing storage limit reached.');
    additions.forEach(freezeStroke);
    this.nextId = Math.max(this.nextId, last + 1);
    this.strokes = after;
    this._reindex();
    this._record({
      kind: 'replace',
      before,
      after,
      items: [...before, ...additions],
    });
    this._emit([...before, ...after]);
  }
  undo() {
    const c = this.undoStack.pop();
    if (!c) return false;
    if (c.kind === 'replace') this.strokes = c.before;
    else if (c.kind === 'add')
      this.strokes = this.strokes.slice(0, -c.items.length);
    else this.strokes = [...c.items];
    this._reindex();
    this.redoStack.push(c);
    this._emit(c.items);
    return true;
  }
  redo() {
    const c = this.redoStack.pop();
    if (!c) return false;
    if (c.kind === 'replace') this.strokes = c.after;
    else if (c.kind === 'add') this.strokes.push(...c.items);
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
    return JSON.stringify(
      {
        format: STROKE_FORMAT,
        schema: STROKE_SCHEMA,
        engine: ENGINE_VERSION,
        frame: { width: FRAME_W, height: FRAME_H, count: 96 },
        settings: this.settings,
        strokes: this.strokes,
      },
      (key, value) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((k) => [k, value[k]]),
            )
          : value,
    );
  }
  static parse(text) {
    if (typeof text !== 'string' || text.length > LIMITS.bytes)
      throw Error('Drawing file is too large.');
    const data = JSON.parse(text);
    if (
      data?.format !== STROKE_FORMAT ||
      ![1, 2, 3, 4, 5, 6].includes(data.schema) ||
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
    if (data.schema >= 4) doc.settings = validateSettings(data.settings || {});
    let last = 0;
    for (const raw of data.strokes) {
      if (data.schema < 5 && raw?.overflow !== undefined)
        throw Error('Extended BG requires schema 5.');
      if (data.schema < 6 && (raw?.fill || raw?.children?.some((c) => c.fill)))
        throw Error('Fill requires schema 6.');
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
              ...(b.scatter !== undefined ? { scatter: b.scatter } : {}),
              ...(b.dotScale !== undefined ? { dotScale: b.dotScale } : {}),
              ...(b.density !== undefined ? { density: b.density } : {}),
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
        box: s.renderer.startsWith('stamps-')
          ? stampBounds(s.stamps)
          : bounds(s.outline, 1),
        brush: s.brush,
        engine: ENGINE_VERSION,
        renderer: s.renderer,
        ...(s.fill
          ? { fill: { ...s.fill, runs: s.fill.runs.map((r) => r.slice()) } }
          : {}),
        ...(s.space ? { space: { ...s.space } } : {}),
        ...(s.overflow ? { overflow: true } : {}),
        ...(s.renderer.startsWith('stamps-')
          ? { stamps: s.stamps.map((p) => p.slice()) }
          : {}),
        ...(s.children
          ? {
              children: s.children.map((child) => {
                const c = {
                  id: child.id,
                  surface: child.surface,
                  points: child.points.map((p) => p.slice()),
                  outline: child.outline.map((p) => p.slice()),
                  brush: { ...child.brush },
                  engine: ENGINE_VERSION,
                  renderer: child.renderer,
                  ...(child.fill
                    ? {
                        fill: {
                          ...child.fill,
                          runs: child.fill.runs.map((r) => r.slice()),
                        },
                      }
                    : {}),
                  placements: child.placements.map((p) => ({ ...p })),
                  ...(child.space ? { space: { ...child.space } } : {}),
                  ...(child.stamps
                    ? { stamps: child.stamps.map((p) => p.slice()) }
                    : {}),
                };
                c.box = c.stamps ? stampBounds(c.stamps) : bounds(c.outline, 1);
                return c;
              }),
            }
          : {}),
        placements: s.placements.map((p) => ({
          surface: p.surface,
          x: p.x,
          y: p.y,
          ...(p.visit !== undefined ? { visit: p.visit } : {}),
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
  if (s?.renderer === 'composite-v1') {
    if (
      !Array.isArray(s.children) ||
      !s.children.length ||
      s.children.length > LIMITS.strokes ||
      s.brush?.erase ||
      s.brush?.opacity !== 1
    )
      throw Error('Invalid composite.');
    for (const child of s.children) {
      if (
        child.renderer === 'composite-v1' ||
        child.children ||
        child.placements?.some((p) => p.surface !== 'tpl')
      )
        throw Error('Invalid composite child.');
      validateStroke(child);
    }
  } else if (s?.children !== undefined)
    throw Error('Unexpected composite children.');
  if (
    !s ||
    !/^s[1-9][0-9]{0,8}$/.test(s.id) ||
    !(validSurface(s.surface) || s.surface === 'sheet') ||
    s.engine !== ENGINE_VERSION ||
    ![
      'linear-v1',
      'quadratic-v1',
      'stamps-v1',
      'stamps-v2',
      'composite-v1',
      'fill-runs-v1',
    ].includes(s.renderer)
  )
    throw Error('Invalid stroke identity.');
  if (
    !Array.isArray(s.points) ||
    !s.points.length ||
    s.points.length > LIMITS.perStroke ||
    !Array.isArray(s.outline) ||
    (!s.renderer.startsWith('stamps-') && s.outline.length < 3) ||
    s.outline.length > LIMITS.perStroke * 4 + 100
  )
    throw Error('Invalid stroke geometry.');
  if (
    s.space &&
    (!finite(s.space.w) ||
      !finite(s.space.h) ||
      s.space.w < 1 ||
      s.space.h < 1 ||
      s.space.w > 131072 ||
      s.space.h > 131072)
  )
    throw Error('Invalid stroke coordinate space.');
  if (
    s.overflow !== undefined &&
    (s.overflow !== true ||
      !/^bg-(grid|single)$/.test(s.surface) ||
      !Array.isArray(s.placements) ||
      s.placements.some(
        (p) => p.surface !== s.surface || p.x !== 0 || p.y !== 0,
      ))
  )
    throw Error('Invalid extended background.');
  const extent = s.overflow
    ? { w: BG_COORD_LIMIT, h: BG_COORD_LIMIT }
    : s.space || surfaceSize(s.surface);
  const inputMin = s.overflow ? -BG_COORD_LIMIT : -1024;
  const geometryMin = s.overflow ? -BG_COORD_LIMIT - 4096 : -4096;
  for (const p of s.points)
    if (
      !Array.isArray(p) ||
      p.length !== 3 ||
      !p.every(finite) ||
      p[2] < 0 ||
      p[2] > 1 ||
      p[0] < inputMin ||
      p[1] < inputMin ||
      p[0] > extent.w + 1024 ||
      p[1] > extent.h + 1024
    )
      throw Error('Invalid input point.');
  for (const p of s.outline)
    if (
      !Array.isArray(p) ||
      p.length !== 2 ||
      !p.every(finite) ||
      p[0] < geometryMin ||
      p[1] < geometryMin ||
      p[0] > extent.w + 4096 ||
      p[1] > extent.h + 4096
    )
      throw Error('Invalid outline.');
  if (s.renderer.startsWith('stamps-')) {
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
        p[0] < geometryMin ||
        p[1] < geometryMin ||
        p[0] > extent.w + 4096 ||
        p[1] > extent.h + 4096
      )
        throw Error('Invalid stamp.');
    }
  } else if (s.stamps !== undefined) throw Error('Unexpected stamps.');
  if (s.renderer === 'fill-runs-v1') {
    const f = s.fill;
    if (
      !f ||
      ![0.5, 1].includes(f.step) ||
      !Number.isInteger(f.x / f.step) ||
      !Number.isInteger(f.y / f.step) ||
      !Number.isInteger(f.width) ||
      !Number.isInteger(f.height) ||
      f.width < 1 ||
      f.height < 1 ||
      f.width * f.height > 4194304 ||
      !Array.isArray(f.runs) ||
      !f.runs.length ||
      f.runs.length > 100000 ||
      f.x < geometryMin ||
      f.y < geometryMin ||
      f.x + f.width * f.step > extent.w + 4096 ||
      f.y + f.height * f.step > extent.h + 4096 ||
      s.brush.erase ||
      s.outline.length !== 4 ||
      JSON.stringify(s.outline) !==
        JSON.stringify([
          [f.x, f.y],
          [f.x + f.width * f.step, f.y],
          [f.x + f.width * f.step, f.y + f.height * f.step],
          [f.x, f.y + f.height * f.step],
        ])
    )
      throw Error('Invalid fill geometry.');
    let row = -1,
      end = -1;
    for (const r of f.runs) {
      if (
        !Array.isArray(r) ||
        r.length !== 3 ||
        !r.every(Number.isInteger) ||
        r[0] < 0 ||
        r[0] >= f.height ||
        r[1] < 0 ||
        r[2] < 1 ||
        r[1] + r[2] > f.width ||
        r[0] < row ||
        (r[0] === row && r[1] <= end)
      )
        throw Error('Invalid fill runs.');
      row = r[0];
      end = r[1] + r[2];
    }
  } else if (s.fill !== undefined) throw Error('Unexpected fill data.');
  const b = s.brush;
  if (
    !b ||
    !['round', 'spray'].includes(b.type) ||
    (b.scatter !== undefined &&
      (!finite(b.scatter) || b.scatter < 0.05 || b.scatter > 3)) ||
    (b.dotScale !== undefined &&
      (!finite(b.dotScale) || b.dotScale < 0.05 || b.dotScale > 3)) ||
    (b.density !== undefined &&
      (!finite(b.density) || b.density < 0.1 || b.density > 3)) ||
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
  if (!Array.isArray(s.placements) || s.placements.length > 2048)
    throw Error('Invalid placements.');
  const seen = new Set();
  for (const p of s.placements) {
    if (
      !p ||
      !validSurface(p.surface) ||
      !finite(p.x) ||
      !finite(p.y) ||
      Math.abs(p.x) > 131072 ||
      Math.abs(p.y) > 131072
    )
      throw Error('Invalid placement.');
    if (
      !s.space &&
      s.surface !== 'sheet' &&
      (p.surface !== s.surface || p.x !== 0 || p.y !== 0)
    )
      throw Error('Invalid local placement.');
    if (
      !s.space &&
      s.surface === 'sheet' &&
      (!/^(tpl|frame-\d+)$/.test(p.surface) || p.x % FRAME_W || p.y % FRAME_H)
    )
      throw Error('Invalid grid placement.');
    if (
      p.visit !== undefined &&
      (!s.space ||
        !Number.isInteger(p.visit) ||
        p.visit < 0 ||
        p.visit > 10000000)
    )
      throw Error('Invalid placement visit.');
    const key = p.surface + '|' + p.x + '|' + p.y + '|' + (p.visit || 0);
    if (seen.has(key)) throw Error('Duplicate placement.');
    seen.add(key);
  }
}
export function strokePath(value) {
  const s = value.stroke || value;
  if (s.renderer.startsWith('stamps-') || s.renderer === 'composite-v1')
    return null;
  const p = new Path2D();
  if (s.renderer === 'fill-runs-v1') {
    const f = s.fill;
    for (const [y, x, n] of f.runs)
      p.rect(f.x + x * f.step, f.y + y * f.step, n * f.step, f.step);
  } else traceOutline(s, p);
  return p;
}
export function paintStroke(
  ctx,
  value,
  path = strokePath(value),
  box,
  extendedBG = false,
) {
  const s = value.stroke || value,
    p = value.placement;
  ctx.save();
  // The destination clips each surface. Keep raster bleed outside its bounds
  // for bilinear sampling at fractional display scales.
  if (p) ctx.translate(p.x, p.y);
  // Old files keep their original composition crop even alongside new exterior ink.
  if (extendedBG && /^bg-/.test(s.surface) && !s.overflow) {
    const extent = surfaceSize(s.surface);
    ctx.beginPath();
    ctx.rect(0, 0, extent.w, extent.h);
    ctx.clip();
  }
  ctx.globalCompositeOperation = s.brush.erase
    ? 'destination-out'
    : 'source-over';
  ctx.globalAlpha = s.brush.opacity;
  ctx.fillStyle = s.brush.color;
  if (s.renderer === 'composite-v1')
    paintComposite(
      ctx,
      s,
      box ? { ...box, x: box.x - (p?.x || 0), y: box.y - (p?.y || 0) } : s.box,
    );
  else if (s.renderer.startsWith('stamps-'))
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

export function validateSettings(raw) {
  const settings = {};
  for (const [key, min, max] of [
    ['columns', 1, 16],
    ['gap', 0, 256],
    ['margin', 0, 512],
    ['fps', 1, 60],
    ['tick', 0, 10000000],
    ['loop', 0, 96],
    ['loopOffset', 0, 95],
    ['phases', 1, 96],
    ['trail', 0, 50],
  ]) {
    if (raw[key] !== undefined) {
      if (!Number.isInteger(raw[key]) || raw[key] < min || raw[key] > max)
        throw Error('Invalid ' + key);
      settings[key] = raw[key];
    }
  }
  for (const key of [
    'oneFrame',
    'longStroke',
    'onion',
    'templateVisible',
    'bgAbove',
    'touchDraw',
    'exportBg',
  ])
    if (raw[key] !== undefined) {
      if (typeof raw[key] !== 'boolean') throw Error('Invalid ' + key);
      settings[key] = raw[key];
    }
  for (const [key, values] of [
    [
      'direction',
      [
        'forward',
        'backward',
        'pingpong',
        'bounce-offset',
        'sync',
        'stutter',
        'holdskip',
        'random',
        'shuffleloop',
      ],
    ],
    [
      'pattern',
      [
        'sequential',
        'snake',
        'vertical',
        'vertical-snake',
        'checkerboard',
        'center',
        'spiral',
        'random',
      ],
    ],
    ['view', ['grid', 'single']],
  ])
    if (raw[key] !== undefined) {
      if (!values.includes(raw[key])) throw Error('Invalid ' + key);
      settings[key] = raw[key];
    }
  return settings;
}

export function makeComposite(doc, source, destinations) {
  const children = doc.strokes
    .filter((s) => s.placements.some((p) => p.surface === source))
    .map((s) => ({
      ...s,
      placements: s.placements.filter((p) => p.surface === source),
    }));
  if (!children.length) return null;
  const group = createStroke({
    id: doc.newId(),
    surface: 'sheet',
    space: { w: FRAME_W, h: FRAME_H },
    points: [
      [0, 0, 0.5],
      [FRAME_W, FRAME_H, 0.5],
    ],
    size: 1,
    placements: destinations.map((surface) => ({ surface, x: 0, y: 0 })),
  });
  group.renderer = 'composite-v1';
  group.children = children;
  group.outline = [
    [0, 0],
    [FRAME_W, 0],
    [FRAME_W, FRAME_H],
    [0, FRAME_H],
  ];
  group.box = bounds(group.outline, 1);
  return group;
}
const compositePaths = new WeakMap();
function paintComposite(ctx, s, region) {
  const tr = ctx.getTransform(),
    scale = Math.max(0.03125, Math.min(4, Math.hypot(tr.a, tr.b)));
  const x = Math.max(-2 / scale, region.x),
    y = Math.max(-2 / scale, region.y);
  const right = Math.min(FRAME_W + 2 / scale, region.x + region.w),
    bottom = Math.min(FRAME_H + 2 / scale, region.y + region.h);
  if (right <= x || bottom <= y) return;
  const off = document.createElement('canvas');
  off.width = Math.ceil((right - x) * scale);
  off.height = Math.ceil((bottom - y) * scale);
  const c = off.getContext('2d');
  c.setTransform(scale, 0, 0, scale, -x * scale, -y * scale);
  for (const child of s.children) {
    let path = compositePaths.get(child);
    if (path === undefined) {
      path = strokePath(child);
      compositePaths.set(child, path);
    }
    for (const instance of renderInstances(child))
      if (intersects(instance.box, region))
        paintStroke(c, instance, path, region);
  }
  ctx.drawImage(off, x, y, off.width / scale, off.height / scale);
  off.width = off.height = 0;
}
