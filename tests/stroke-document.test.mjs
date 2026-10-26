import test from "node:test";
import assert from "node:assert/strict";
import {
  StrokeDocument,
  createStroke,
  clipSegment,
} from "../src/js/stroke-document.mjs";
const stroke = (d, surface = "frame-0", extra = {}) =>
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
test("one cross-frame gesture is one undo and redo transaction", () => {
  const d = new StrokeDocument();
  const before = d.serialize();
  d.addGesture([stroke(d), stroke(d, "frame-1"), stroke(d, "frame-95")]);
  const painted = d.serialize();
  assert.equal(d.undoStack.length, 1);
  d.undo();
  assert.equal(d.serialize(), before);
  d.redo();
  assert.equal(d.serialize(), painted);
});
test("clear is reversible and new drawing invalidates redo", () => {
  const d = new StrokeDocument();
  d.addGesture([stroke(d)]);
  const before = d.serialize();
  d.clear();
  assert.equal(d.strokes.length, 0);
  d.undo();
  assert.equal(d.serialize(), before);
  d.undo();
  d.addGesture([stroke(d, "tpl")]);
  assert.equal(d.redo(), false);
  assert.equal(d.strokes[0].surface, "tpl");
});
test("100 gestures, 50 undo and redo preserve ordered contours", () => {
  const d = new StrokeDocument();
  for (let i = 0; i < 100; i++) d.addGesture([stroke(d, "frame-" + (i % 96))]);
  const before = d.serialize();
  for (let i = 0; i < 50; i++) assert.equal(d.undo(), true);
  assert.equal(d.strokes.length, 50);
  for (let i = 0; i < 50; i++) assert.equal(d.redo(), true);
  assert.equal(d.serialize(), before);
});
test("ten save/open cycles preserve all data, pressure, alpha and erase order", () => {
  let d = new StrokeDocument();
  for (const surface of ["tpl", "bg-grid", "bg-single", "frame-0", "frame-95"])
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
  assert.equal(d.strokes.at(-1).id, "s11");
});
test("spatial query returns intersecting strokes in compositing order", () => {
  const d = new StrokeDocument();
  d.addGesture([
    stroke(d),
    stroke(d, "frame-0", { erase: true }),
    stroke(d, "tpl"),
  ]);
  assert.deepEqual(
    d.query("frame-0", { x: 0, y: 0, w: 200, h: 100 }).map((s) => s.id),
    ["s1", "s2"],
  );
  assert.equal(d.query("frame-0", { x: 800, y: 400, w: 10, h: 10 }).length, 0);
  d.undo();
  assert.equal(d.query("frame-0", { x: 0, y: 0, w: 200, h: 100 }).length, 0);
});
test("untrusted files reject invalid engine, identity, coordinates, opacity and order", () => {
  const d = new StrokeDocument();
  d.addGesture([stroke(d), stroke(d)]);
  const raw = JSON.parse(d.serialize());
  for (const change of [
    (x) => (x.engine = "other"),
    (x) => (x.strokes[0].surface = "frame-96"),
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
test("stored bounds are recomputed and imported contours stay immutable", () => {
  const d = new StrokeDocument();
  d.addGesture([stroke(d)]);
  const raw = JSON.parse(d.serialize());
  raw.strokes[0].box = { x: 99999, y: 9999, w: 1, h: 1 };
  const imported = StrokeDocument.parse(JSON.stringify(raw));
  assert.deepEqual(imported.strokes[0].box, d.strokes[0].box);
  assert.throws(() => (imported.strokes[0].outline[0][0] = 50));
});
test("atomic add rejects unordered or duplicate IDs without partial write", () => {
  const d = new StrokeDocument();
  const a = stroke(d),
    b = stroke(d);
  assert.throws(() => d.addGesture([b, a]));
  assert.equal(d.strokes.length, 0);
  d.addGesture([a, b]);
  assert.throws(() => d.addGesture([a]));
  assert.equal(d.strokes.length, 2);
});
test("fast segment crossing clips exact boundaries and interpolates pressure", () => {
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
