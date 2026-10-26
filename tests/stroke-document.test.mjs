import test from 'node:test';
import assert from 'node:assert/strict';
import {
  StrokeDocument,
  createStroke,
  clipSegment,
} from '../src/js/stroke-document.mjs';
const stroke = (d, surface = 'frame-0', extra = {}) =>
  createStroke({
    id: d.newId(),
    surface,
    points: [
      [10, 20, 0.2],
      [80, 30, 0.8],
      [180, 80, 0.5],
    ],
    ...extra,
  });
test('one cross-frame gesture is one undo and redo transaction', () => {
  const d = new StrokeDocument();
  const before = d.serialize();
  d.addGesture([stroke(d), stroke(d, 'frame-1'), stroke(d, 'frame-95')]);
  const painted = d.serialize();
  assert.equal(d.undoStack.length, 1);
  d.undo();
  assert.equal(d.serialize(), before);
  d.redo();
  assert.equal(d.serialize(), painted);
});
test('clear is reversible and new drawing invalidates redo', () => {
  const d = new StrokeDocument();
  d.addGesture([stroke(d)]);
  const before = d.serialize();
  d.clear();
  assert.equal(d.strokes.length, 0);
  d.undo();
  assert.equal(d.serialize(), before);
  d.undo();
  d.addGesture([stroke(d, 'tpl')]);
  assert.equal(d.redo(), false);
  assert.equal(d.strokes[0].surface, 'tpl');
});
test('100 gestures, 50 undo and redo preserve ordered contours', () => {
  const d = new StrokeDocument();
  for (let i = 0; i < 100; i++) d.addGesture([stroke(d, 'frame-' + (i % 96))]);
  const before = d.serialize();
  for (let i = 0; i < 50; i++) assert.equal(d.undo(), true);
  assert.equal(d.strokes.length, 50);
  for (let i = 0; i < 50; i++) assert.equal(d.redo(), true);
  assert.equal(d.serialize(), before);
});
test('ten save/open cycles preserve all data, pressure, alpha and erase order', () => {
  let d = new StrokeDocument();
  for (const surface of ['tpl', 'bg-grid', 'bg-single', 'frame-0', 'frame-95'])
    d.addGesture([
      stroke(d, surface, { opacity: 0.25, pressure: true }),
      stroke(d, surface, { erase: true }),
    ]);
  const original = d.serialize();
  for (let i = 0; i < 10; i++) {
    d = StrokeDocument.parse(d.serialize());
    assert.equal(d.serialize(), original);
    assert.equal(d.undoStack.length, 0);
  }
  d.addGesture([stroke(d)]);
  assert.equal(d.strokes.at(-1).id, 's11');
});
test('spatial query returns intersecting strokes in compositing order', () => {
  const d = new StrokeDocument();
  d.addGesture([
    stroke(d),
    stroke(d, 'frame-0', { erase: true }),
    stroke(d, 'tpl'),
  ]);
  assert.deepEqual(
    d.query('frame-0', { x: 0, y: 0, w: 200, h: 100 }).map((s) => s.id),
    ['s1', 's2'],
  );
  assert.equal(d.query('frame-0', { x: 800, y: 400, w: 10, h: 10 }).length, 0);
  d.undo();
  assert.equal(d.query('frame-0', { x: 0, y: 0, w: 200, h: 100 }).length, 0);
});
test('untrusted files reject invalid engine, identity, coordinates, opacity and order', () => {
  const d = new StrokeDocument();
  d.addGesture([stroke(d), stroke(d)]);
  const raw = JSON.parse(d.serialize());
  for (const change of [
    (x) => (x.engine = 'other'),
    (x) => (x.strokes[0].surface = 'frame-96'),
    (x) => (x.strokes[0].points[0][0] = null),
    (x) => (x.strokes[0].brush.opacity = 2),
    (x) => x.strokes.reverse(),
    (x) => (x.strokes[1].id = x.strokes[0].id),
  ]) {
    const bad = structuredClone(raw);
    change(bad);
    assert.throws(() => StrokeDocument.parse(JSON.stringify(bad)));
  }
  assert.equal(d.strokes.length, 2);
});
test('stored bounds are recomputed and imported contours stay immutable', () => {
  const d = new StrokeDocument();
  d.addGesture([stroke(d)]);
  const raw = JSON.parse(d.serialize());
  raw.strokes[0].box = { x: 99999, y: 9999, w: 1, h: 1 };
  const imported = StrokeDocument.parse(JSON.stringify(raw));
  assert.deepEqual(imported.strokes[0].box, d.strokes[0].box);
  assert.throws(() => (imported.strokes[0].outline[0][0] = 50));
});
test('atomic add rejects unordered or duplicate IDs without partial write', () => {
  const d = new StrokeDocument();
  const a = stroke(d),
    b = stroke(d);
  assert.throws(() => d.addGesture([b, a]));
  assert.equal(d.strokes.length, 0);
  d.addGesture([a, b]);
  assert.throws(() => d.addGesture([a]));
  assert.equal(d.strokes.length, 2);
});
test('fast segment crossing clips exact boundaries and interpolates pressure', () => {
  const hit = clipSegment([-10, 50, 0], [110, 50, 1], {
    x: 0,
    y: 0,
    w: 100,
    h: 100,
  });
  assert.equal(hit.a[0], 0);
  assert.equal(hit.b[0], 100);
  assert.ok(Math.abs(hit.a[2] - 1 / 12) < 1e-9);
  assert.equal(
    clipSegment([-10, -5, 0.5], [110, -5, 0.5], { x: 0, y: 0, w: 100, h: 100 }),
    null,
  );
});

import { getStroke } from 'perfect-freehand';
import { renderInstances, traceOutline } from '../src/js/stroke-document.mjs';

test('grid keeps one library contour across all cell boundaries', () => {
  const d = new StrokeDocument();
  const points = Array.from({ length: 160 }, (_, i) => [
    100 + i * 50,
    288 + Math.sin(i * 0.1) * 180,
    0.2 + i / 200,
  ]);
  const s = createStroke({
    id: d.newId(),
    surface: 'sheet',
    points,
    size: 80,
    pressure: true,
    smoothing: 0.7,
    streamline: 0.65,
  });
  assert.deepEqual(
    s.outline,
    getStroke(points, {
      size: 80,
      thinning: 0.55,
      smoothing: 0.7,
      streamline: 0.65,
      simulatePressure: false,
      last: true,
    }),
  );
  assert.equal(s.placements.length, 8);
  d.addGesture([s]);
  assert.equal(d.strokes.length, 1);
  for (let i = 0; i < 8; i++) {
    const hit = d.query('frame-' + i, { x: 0, y: 0, w: 1024, h: 576 });
    assert.equal(hit.length, 1);
    assert.equal(hit[0].stroke, s);
    assert.equal(hit[0].placement.x, -i * 1024);
  }
  const before = d.serialize();
  d.undo();
  assert.equal(d.instances.size, 0);
  d.redo();
  assert.equal(d.serialize(), before);
  assert.equal(StrokeDocument.parse(before).serialize(), before);
});
test('thin diagonal indexes touched frames, not its entire sheet bounding box', () => {
  const s = createStroke({
    id: 's1',
    surface: 'sheet',
    points: [
      [100, 100, 0.5],
      [8100, 6800, 0.5],
    ],
    size: 20,
    streamline: 0,
  });
  assert.ok(
    s.placements.length >= 12 && s.placements.length < 30,
    s.placements.length,
  );
  assert.equal(s.placements[0].surface, 'frame-0');
  assert.equal(s.placements.at(-1).surface, 'frame-95');
  assert.equal(renderInstances(s).length, s.placements.length);
});
test('TPL uses shared geometry with multiple ordered placements', () => {
  const d = new StrokeDocument(),
    s = createStroke({
      id: d.newId(),
      surface: 'sheet',
      target: 'tpl',
      points: [
        [50, 200, 0.5],
        [8150, 200, 0.5],
      ],
      size: 40,
    });
  d.addGesture([s]);
  const instances = d.query('tpl', { x: 0, y: 0, w: 1024, h: 576 });
  assert.equal(instances.length, 8);
  assert.ok(instances.every((i) => i.stroke === s));
  assert.deepEqual(
    instances.map((i) => i.order),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
});
test('schema 1 imports fixed contours with its original linear renderer', () => {
  const d = new StrokeDocument();
  d.addGesture([stroke(d)]);
  const raw = JSON.parse(d.serialize());
  raw.schema = 1;
  for (const s of raw.strokes) {
    delete s.renderer;
    delete s.placements;
    delete s.brush.streamline;
    delete s.brush.simulatePressure;
  }
  const migrated = StrokeDocument.parse(JSON.stringify(raw)),
    s = migrated.strokes[0];
  assert.deepEqual(s.outline, raw.strokes[0].outline);
  assert.deepEqual(s.points, raw.strokes[0].points);
  assert.equal(s.renderer, 'linear-v1');
  assert.equal(s.brush.streamline, 0.25);
  let lines = 0;
  traceOutline(s, {
    moveTo() {},
    lineTo() {
      lines++;
    },
    closePath() {},
    quadraticCurveTo() {
      assert.fail('legacy shape changed');
    },
  });
  assert.equal(lines, s.outline.length - 1);
  assert.equal(
    StrokeDocument.parse(migrated.serialize()).serialize(),
    migrated.serialize(),
  );
});
test('placement and brush validation is atomic', () => {
  const d = new StrokeDocument();
  d.addGesture([stroke(d)]);
  const raw = JSON.parse(d.serialize());
  for (const change of [
    (x) => (x.strokes[0].placements[0].x = 20),
    (x) => (x.strokes[0].placements[0].surface = 'frame-96'),
    (x) => x.strokes[0].placements.push(x.strokes[0].placements[0]),
    (x) => (x.strokes[0].renderer = 'arbitrary'),
    (x) => (x.strokes[0].brush.streamline = 2),
  ]) {
    const bad = structuredClone(raw);
    change(bad);
    assert.throws(() => StrokeDocument.parse(JSON.stringify(bad)));
  }
});

import { SpeedPressure, queryStamps } from '../src/js/brush-geometry.mjs';

test('Spray saves fixed particles, deterministic seed and immutable roundtrip geometry', () => {
  const d = new StrokeDocument(),
    a = stroke(d, 'frame-0', { type: 'spray', seed: 410, size: 32 });
  const b = stroke(d, 'frame-0', { type: 'spray', seed: 410, size: 32 });
  assert.deepEqual(a.stamps, b.stamps);
  assert.notDeepEqual(
    a.stamps,
    stroke(d, 'frame-0', { type: 'spray', seed: 411, size: 32 }).stamps,
  );
  d.addGesture([a]);
  const json = d.serialize(),
    restored = StrokeDocument.parse(json);
  assert.equal(restored.serialize(), json);
  assert.ok(Object.isFrozen(restored.strokes[0].stamps[0]));
  d.undo();
  d.redo();
  assert.equal(d.serialize(), json);
});
test('stamp spatial queries preserve order and agree with full footprint filtering', () => {
  const d = new StrokeDocument(),
    s = stroke(d, 'frame-0', { type: 'spray', size: 90 });
  const box = { x: 70, y: 20, w: 50, h: 50 };
  const expected = s.stamps.filter(
    ([x, y, r]) =>
      Math.hypot(
        x - Math.max(box.x, Math.min(box.x + box.w, x)),
        y - Math.max(box.y, Math.min(box.y + box.h, y)),
      ) <=
      r + 0.5,
  );
  assert.deepEqual(queryStamps(s, box), expected);
});
test('soft round uses saved pressure-scaled dabs, no outline regeneration on Open', () => {
  const d = new StrokeDocument(),
    s = stroke(d, 'tpl', { softness: 0.7, pressure: true });
  assert.equal(s.renderer, 'stamps-v1');
  assert.equal(s.outline.length, 0);
  assert.ok(s.stamps.length > 5);
  assert.ok(new Set(s.stamps.map((p) => p[2])).size > 2);
  d.addGesture([s]);
  assert.equal(StrokeDocument.parse(d.serialize()).serialize(), d.serialize());
});
test('schema 2 opens its exact contour with original renderer and pressure flags', () => {
  const d = new StrokeDocument();
  d.addGesture([
    stroke(d, 'frame-0', { pressure: true, simulatePressure: true }),
  ]);
  const data = JSON.parse(d.serialize());
  data.schema = 2;
  for (const s of data.strokes)
    for (const k of ['type', 'softness', 'seed']) delete s.brush[k];
  const loaded = StrokeDocument.parse(JSON.stringify(data)).strokes[0];
  assert.deepEqual(loaded.outline, data.strokes[0].outline);
  assert.equal(loaded.brush.simulatePressure, true);
  assert.equal(loaded.renderer, 'quadratic-v1');
});
test('invalid particles and brush parameters are rejected atomically', () => {
  const d = new StrokeDocument();
  d.addGesture([stroke(d, 'frame-0', { type: 'spray' })]);
  const data = JSON.parse(d.serialize());
  for (const change of [
    (s) => (s.stamps[0][2] = -1),
    (s) => (s.stamps[0][2] = 10000),
    (s) => (s.stamps[0][0] = null),
    (s) => (s.stamps = []),
    (s) => (s.brush.softness = 2),
    (s) => (s.brush.seed = -1),
    (s) => (s.brush.type = 'unknown'),
    (s) =>
      (s.outline = [
        [1, 1],
        [2, 2],
        [3, 3],
      ]),
  ]) {
    const copy = structuredClone(data);
    change(copy.strokes[0]);
    assert.throws(() => StrokeDocument.parse(JSON.stringify(copy)));
  }
});
test('speed response is fast-thick and independent of event frequency at constant velocity', () => {
  function run(velocity, dt) {
    const s = new SpeedPressure();
    s.sample(0, 0, 0);
    for (let time = dt; time <= 1000; time += dt)
      s.sample(time * velocity, 0, time);
    return s;
  }
  const slow = run(0.05, 10),
    fast = run(1.2, 10);
  assert.ok(fast.pressure > slow.pressure * 3);
  assert.ok(Math.abs(run(0.4, 5).pressure - run(0.4, 20).pressure) < 1e-6);
  const pressure = fast.pressure;
  assert.equal(fast.sample(1200, 0, 1100), pressure);
});
test('stamp placement includes brush footprint across frame borders', () => {
  const d = new StrokeDocument();
  const s = stroke(d, 'sheet', {
    points: [
      [1020, 288, 0.5],
      [1021, 289, 0.5],
    ],
    type: 'spray',
    size: 64,
    seed: 1,
  });
  assert.deepEqual(
    s.placements.map((p) => p.surface),
    ['frame-0', 'frame-1'],
  );
});
