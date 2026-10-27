import {
  createStroke,
  renderInstances,
  intersects,
  FRAME_W,
  FRAME_H,
  surfaceSize,
  ENGINE_VERSION,
  bounds,
  LIMITS,
  BG_COORD_LIMIT,
} from './stroke-document.mjs';
import { StampStream, stampBounds } from './brush-geometry.mjs';
const W = FRAME_W,
  H = FRAME_H,
  copy = (p) => p.slice(),
  unique = (ps) => {
    const seen = new Set();
    return ps.filter((p) => {
      const k = p.surface + '|' + p.x + '|' + p.y + '|' + (p.visit || 0);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
export class DrawingGesture {
  constructor({
    document,
    brush,
    target,
    view,
    layout,
    composition,
    oneFrame = false,
    longStroke = false,
    trail = 8,
    tick = 0,
    playing = false,
  }) {
    Object.assign(this, {
      document,
      brush: { ...brush },
      target,
      view,
      layout,
      composition,
      oneFrame,
      longStroke,
      trail,
      tick,
      playing,
    });
    this.parts = [];
    this.active = null;
    this.lastPoint = null;
    this.lastHit = null;
    this.visits = 0;
    this.changed = true;
    this.samples = 0;
    this.estimatedBytes = 0;
  }
  hit(p) {
    let best = null,
      distance = Infinity;
    for (const r of this.layout) {
      const dx = Math.max(r.x - p[0], 0, p[0] - r.x - r.w),
        dy = Math.max(r.y - p[1], 0, p[1] - r.y - r.h),
        d = Math.hypot(dx, dy);
      if (d < distance) {
        best = r;
        distance = d;
      }
    }
    // Gap snapping only in isolated/local drawing. Free grid geometry crosses gaps.
    return best && distance <= Math.min(12, best.w * 0.5) ? best : null;
  }
  mapping(p) {
    const c = this.composition;
    if (
      this.target !== 'bg' &&
      (p[0] < c.x || p[1] < c.y || p[0] > c.x + c.w || p[1] > c.y + c.h)
    )
      return null;
    if (this.target === 'bg') {
      const r = this.composition,
        ext = surfaceSize('bg-' + this.view);
      const q = [
        ((p[0] - r.x) / r.w) * ext.w,
        ((p[1] - r.y) / r.h) * ext.h,
        p[2],
      ];
      if (Math.abs(q[0]) > BG_COORD_LIMIT || Math.abs(q[1]) > BG_COORD_LIMIT)
        throw Error(
          'BG coordinate limit reached. Move closer to the composition.',
        );
      return {
        q,
        surface: 'bg-' + this.view,
        key: 'bg',
        space: ext,
        origin: null,
      };
    }
    const hit = this.hit(p);
    const local =
      this.view === 'single' ||
      this.oneFrame ||
      (this.longStroke && this.playing);
    if (local && !hit) return null;
    const r = local ? hit : this.layout[0],
      scale = r.w / W;
    return {
      q: [(p[0] - r.x) / scale, (p[1] - r.y) / scale, p[2]],
      surface: 'sheet',
      key: local ? 'local-' + hit.cell + '-' + hit.id : 'grid',
      origin: r,
      space: local
        ? { w: W, h: H }
        : {
            w: Math.max(W, this.composition.w / scale),
            h: Math.max(H, this.composition.h / scale),
          },
      hit,
      local,
    };
  }
  placements(stroke, mapping, visit = this.visits) {
    if (this.target === 'bg') return [{ surface: stroke.surface, x: 0, y: 0 }];
    const origin = mapping.origin,
      scale = origin.w / W;
    const cells =
      this.oneFrame || this.view === 'single'
        ? [mapping.hit || origin]
        : this.layout;
    return unique(
      cells
        .map((r) => ({
          surface: this.target === 'tpl' ? 'tpl' : 'frame-' + r.id,
          x: Math.round(((origin.x - r.x) / scale) * 1e6) / 1e6,
          y: Math.round(((origin.y - r.y) / scale) * 1e6) / 1e6,
          visit,
        }))
        .filter((p) =>
          intersects(
            {
              x: stroke.box.x + p.x,
              y: stroke.box.y + p.y,
              w: stroke.box.w,
              h: stroke.box.h,
            },
            { x: 0, y: 0, w: W, h: H },
          ),
        ),
    );
  }
  newPart(m) {
    const p = {
      options: {
        ...this.brush,
        id: this.document.newId(),
        surface: m.surface,
        placements: [],
        space: m.space,
        ...(this.target === 'bg' ? { overflow: true } : {}),
      },
      mapping: m,
      points: [],
      born: this.tick,
      stroke: null,
      changed: true,
    };
    if (this.brush.type === 'spray' || this.brush.softness > 0)
      p.stream = new StampStream(this.brush);
    this.active = p;
    return p;
  }
  feed(point) {
    const m = this.mapping(point);
    this.lastPoint = copy(point);
    if (!m) {
      this.seal();
      this.lastHit = null;
      return;
    }
    if (this.active && this.active.mapping.key !== m.key) {
      this.seal();
      this.visits++;
      if (this.target === 'frm' && this.longStroke && this.playing)
        this.carry(m);
    }
    const p = this.active || this.newPart(m),
      q = m.q;
    this.lastHit = m.hit || null;
    const previous = p.points.at(-1);
    if (
      previous &&
      Math.hypot(previous[0] - q[0], previous[1] - q[1]) < 0.2 &&
      Math.abs(previous[2] - q[2]) < 0.005
    )
      return;
    if (++this.samples > LIMITS.perStroke)
      throw Error('Gesture point limit reached. Release to continue.');
    p.points.push(q);
    p.changed = true;
    this.changed = true;
    if (p.stream) {
      const stamps = p.stream.push(q);
      if (stamps.length) {
        const stroke = {
          id: this.document.newId(),
          surface: m.surface,
          points: [copy(q)],
          outline: [],
          stamps,
          box: stampBounds(stamps),
          brush: this.brush,
          engine: ENGINE_VERSION,
          renderer: 'stamps-v2',
          space: m.space,
          ...(this.target === 'bg' ? { overflow: true } : {}),
        };
        stroke.placements = this.placements(stroke, m);
        this.estimatedBytes +=
          1024 + stamps.length * 40 + stroke.placements.length * 128;
        if (
          this.document.storageEstimate + this.estimatedBytes >
          LIMITS.bytes - 8192
        )
          throw Error('Drawing storage limit reached. Save before continuing.');
        this.parts.push({ stroke, born: this.tick, mapping: m });
      }
    }
  }
  materialize(last = false) {
    const p = this.active;
    if (p && !p.stream && (p.changed || last)) {
      p.stroke = createStroke({ ...p.options, points: p.points, last });
      p.stroke.placements = this.placements(p.stroke, p.mapping);
      p.changed = false;
    }
    return [
      ...this.parts.map((p) => p.stroke),
      ...(p?.stroke ? [p.stroke] : []),
    ].filter((s) => s.placements.length);
  }
  seal() {
    if (!this.active) return;
    this.materialize(true);
    if (this.active.stroke) this.parts.push(this.active);
    this.active = null;
  }
  transition({ layout, composition, tick, playing }) {
    const previousHit = this.lastHit,
      oldPoint = this.lastPoint;
    this.layout = layout;
    this.composition = composition;
    this.tick = tick;
    this.playing = playing;
    if (!oldPoint || this.target !== 'frm') return;
    const hit = this.hit(oldPoint);
    if (hit?.id === previousHit?.id && hit?.cell === previousHit?.cell) return;
    this.seal();
    this.visits++;
    if (hit && this.longStroke && playing) {
      const mapping = this.mapping(oldPoint);
      this.carry(mapping);
    }
    this.lastHit = hit;
    this.feed(oldPoint);
  }
  carry(mapping) {
    for (const part of this.parts)
      if (
        part.mapping.local &&
        (this.trail === 0 || this.tick - part.born < this.trail)
      ) {
        const placements = unique([
          ...part.stroke.placements,
          ...this.placements(part.stroke, mapping),
        ]);
        if (placements.length > 2048)
          throw Error('Temporal gesture limit reached. Release to continue.');
        const extra = (placements.length - part.stroke.placements.length) * 128;
        if (
          this.document.storageEstimate + this.estimatedBytes + extra >
          LIMITS.bytes - 8192
        )
          throw Error('Drawing storage limit reached.');
        this.estimatedBytes += extra;
        part.stroke = { ...part.stroke, placements };
      }
  }
  finish() {
    this.seal();
    return this.parts
      .map((p) => p.stroke)
      .filter((s) => renderInstances(s).length);
  }
}
