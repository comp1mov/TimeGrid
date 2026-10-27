import { getStrokePoints } from 'perfect-freehand';

export const MAX_STAMPS = 120000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// CSS pixels / millisecond, independent of zoom, DPR and pointer event count.
// Real pen pressure is routed separately by the input controller.
export class SpeedPressure {
  constructor() {
    this.previous = null;
    this.velocity = 0;
    this.pressure = 0.2;
  }
  sample(x, y, time) {
    const previous = this.previous;
    if (!previous) {
      this.previous = [x, y, time];
      return this.pressure;
    }
    const dt = time - previous[2],
      distance = Math.hypot(x - previous[0], y - previous[1]);
    if (dt <= 0 || distance < 0.01) return this.pressure;
    this.previous = [x, y, time];
    const velocity = Math.min(4, distance / dt);
    this.velocity += (velocity - this.velocity) * (1 - Math.exp(-dt / 35));
    this.pressure = 0.2 + 0.8 * clamp(this.velocity / 1.2, 0, 1);
    return this.pressure;
  }
}
function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
export function makeStamps(points, brush, last) {
  const path = getStrokePoints(points, {
      size: brush.size,
      streamline: brush.streamline,
      last,
    }),
    random = randomGenerator(brush.seed),
    stamps = [],
    spacing = Math.max(1, brush.size * (brush.type === 'spray' ? 0.22 : 0.16));
  function dab(x, y, pressure) {
    const scale = brush.pressure ? 0.45 + 1.1 * pressure : 1;
    const size = brush.size * scale;
    if (brush.type === 'spray') {
      const count = clamp(Math.round(brush.size * 1.6), 10, 90);
      if (stamps.length + count > MAX_STAMPS)
        throw Error('Spray stroke limit reached. Start a shorter stroke.');
      for (let i = 0; i < count; i++) {
        const angle = random() * Math.PI * 2,
          r =
            Math.sqrt(random()) *
            Math.max(2, size * 0.95 * (brush.scatter ?? 1)),
          radius =
            Math.max(0.9, size * 0.1) *
            (brush.dotScale ?? 1) *
            (0.55 + random() * 0.45);
        stamps.push([x + Math.cos(angle) * r, y + Math.sin(angle) * r, radius]);
      }
    } else {
      if (stamps.length >= MAX_STAMPS)
        throw Error('Soft stroke limit reached. Start a shorter stroke.');
      stamps.push([x, y, size * 0.5]);
    }
  }
  if (!path.length) return stamps;
  dab(...path[0].point, path[0].pressure);
  let remaining = spacing;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      length = Math.hypot(b.point[0] - a.point[0], b.point[1] - a.point[1]);
    if (!length) continue;
    for (let at = remaining; at <= length; at += spacing) {
      const t = at / length;
      dab(
        a.point[0] + (b.point[0] - a.point[0]) * t,
        a.point[1] + (b.point[1] - a.point[1]) * t,
        a.pressure + (b.pressure - a.pressure) * t,
      );
    }
    remaining = (((remaining - length) % spacing) + spacing) % spacing;
    if (remaining < 1e-8) remaining = spacing;
  }
  // Fixed geometry precision: 0.0001 logical pixel; at max 4x raster LOD the
  // largest quantization error is 0.0002 output pixel. Bounds are recomputed.
  return stamps.map((p) => p.map((n) => Math.round(n * 10000) / 10000));
}
export function stampBounds(stamps) {
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const [cx, cy, r] of stamps) {
    x = Math.min(x, cx - r);
    y = Math.min(y, cy - r);
    right = Math.max(right, cx + r);
    bottom = Math.max(bottom, cy + r);
  }
  return { x: x - 1, y: y - 1, w: right - x + 2, h: bottom - y + 2 };
}
export function circleTouches([x, y, r], box) {
  return (
    Math.hypot(
      x - clamp(x, box.x, box.x + box.w),
      y - clamp(y, box.y, box.y + box.h),
    ) <=
    r + 0.5
  );
}
const indexes = new WeakMap(),
  BUCKET = 256;
export function queryStamps(stroke, box) {
  if (!box) return stroke.stamps;
  let index = indexes.get(stroke);
  if (!index) {
    index = new Map();
    stroke.stamps.forEach(([x, y, r], i) => {
      for (
        let row = Math.floor((y - r - 1) / BUCKET);
        row <= Math.floor((y + r + 1) / BUCKET);
        row++
      )
        for (
          let col = Math.floor((x - r - 1) / BUCKET);
          col <= Math.floor((x + r + 1) / BUCKET);
          col++
        ) {
          const key = col + ',' + row;
          if (!index.has(key)) index.set(key, []);
          index.get(key).push(i);
        }
    });
    indexes.set(stroke, index);
  }
  const ids = new Set();
  for (
    let row = Math.floor(box.y / BUCKET);
    row <= Math.floor((box.y + box.h) / BUCKET);
    row++
  )
    for (
      let col = Math.floor(box.x / BUCKET);
      col <= Math.floor((box.x + box.w) / BUCKET);
      col++
    )
      for (const i of index.get(col + ',' + row) || []) ids.add(i);
  return [...ids]
    .sort((a, b) => a - b)
    .map((i) => stroke.stamps[i])
    .filter((p) => circleTouches(p, box));
}
export function paintStamps(ctx, s, box) {
  const b = s.brush;
  if (s.renderer === 'stamps-v2' && b.softness > 0)
    return paintSoftStamps(ctx, s, box);
  ctx.globalAlpha = b.opacity * (b.type === 'spray' && !b.erase ? 0.35 : 1);
  for (const [x, y, r] of queryStamps(s, box)) {
    if (b.softness > 0) {
      const gradient = ctx.createRadialGradient(
        x,
        y,
        r * (1 - b.softness),
        x,
        y,
        r,
      );
      gradient.addColorStop(0, b.color);
      gradient.addColorStop(1, b.color + '00');
      ctx.fillStyle = gradient;
    } else ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Streaming stamps: stable input filter + spatial resampling + a persistent RNG.
// Only newly generated geometry is returned. Finalization never rebuilds old dots.
export class StampStream {
  constructor(brush) {
    this.brush = brush;
    this.random = randomGenerator(brush.seed);
    this.previous = null;
    this.remaining = 0;
    this.count = 0;
  }
  push(point) {
    const b = this.brush,
      stamps = [],
      old = this.previous;
    const response = 1 - 0.85 * b.streamline;
    const p = old
      ? [
          old[0] + (point[0] - old[0]) * response,
          old[1] + (point[1] - old[1]) * response,
          point[2],
        ]
      : [...point];
    const spacing = Math.max(1, b.size * (b.type === 'spray' ? 0.22 : 0.16));
    const add = (x, y, pressure) => {
      const size = b.size * (b.pressure ? 0.45 + 1.1 * pressure : 1);
      const count =
        b.type === 'spray'
          ? Math.max(
              1,
              Math.round(
                clamp(Math.round(b.size * 1.6), 10, 90) * (b.density ?? 1),
              ),
            )
          : 1;
      if (this.count + count > MAX_STAMPS)
        throw Error('Stroke particle limit reached. Release to continue.');
      this.count += count;
      for (let j = 0; j < count; j++) {
        if (b.type === 'spray') {
          const a = this.random() * Math.PI * 2,
            r =
              Math.sqrt(this.random()) *
              Math.max(2, size * 0.95 * (b.scatter ?? 1));
          const radius =
            Math.max(0.9, size * 0.1) *
            (b.dotScale ?? 1) *
            (0.55 + this.random() * 0.45);
          stamps.push([x + Math.cos(a) * r, y + Math.sin(a) * r, radius]);
        } else stamps.push([x, y, size / 2]);
      }
    };
    if (!old) {
      add(...p);
      this.remaining = spacing;
    } else {
      const length = Math.hypot(p[0] - old[0], p[1] - old[1]);
      if (length) {
        for (let at = this.remaining; at <= length; at += spacing) {
          const f = at / length;
          add(
            old[0] + (p[0] - old[0]) * f,
            old[1] + (p[1] - old[1]) * f,
            old[2] + (p[2] - old[2]) * f,
          );
        }
        this.remaining =
          (((this.remaining - length) % spacing) + spacing) % spacing ||
          spacing;
      }
    }
    this.previous = p;
    return stamps.map((p) => p.map((v) => Math.round(v * 10000) / 10000));
  }
}
const softSprites = new Map();
function softSprite(b) {
  const key = b.color + '|' + b.softness;
  let sprite = softSprites.get(key);
  if (sprite) {
    softSprites.delete(key);
    softSprites.set(key, sprite);
    return sprite;
  }
  sprite = document.createElement('canvas');
  sprite.width = sprite.height = 256;
  const c = sprite.getContext('2d'),
    r = 127;
  const g = c.createRadialGradient(128, 128, r * (1 - b.softness), 128, 128, r);
  g.addColorStop(0, b.color);
  g.addColorStop(1, b.color + '00');
  c.fillStyle = g;
  c.fillRect(0, 0, 256, 256);
  softSprites.set(key, sprite);
  if (softSprites.size > 16) {
    const k = softSprites.keys().next().value,
      old = softSprites.get(k);
    old.width = old.height = 0;
    softSprites.delete(k);
  }
  return sprite;
}
function paintSoftStamps(ctx, s, box) {
  const b = s.brush,
    sprite = softSprite(b);
  ctx.globalAlpha = b.opacity * (b.type === 'spray' && !b.erase ? 0.35 : 1);
  for (const [x, y, r] of queryStamps(s, box))
    ctx.drawImage(
      sprite,
      x - (r * 128) / 127,
      y - (r * 128) / 127,
      (r * 256) / 127,
      (r * 256) / 127,
    );
}
