import test from 'node:test';
import assert from 'node:assert/strict';
import {
  StrokeDocument,
  createStroke,
  renderInstances,
  makeComposite,
} from '../src/js/stroke-document.mjs';
import { DrawingGesture } from '../src/js/drawing-gesture.mjs';
const geometry = {
  width: 576,
  height: 1024,
  count: 128,
  gridWidth: 4608,
  gridHeight: 16384,
};
const brush = {
  size: 40,
  color: '#ffffff',
  opacity: 1,
  erase: false,
  pressure: false,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: false,
  type: 'round',
  softness: 0,
  seed: 1,
};
function gesture(doc, id = 127, frameSize = doc.size('tpl')) {
  const layout = [{ cell: 0, id, x: 0, y: 0, w: frameSize.w, h: frameSize.h }];
  const g = new DrawingGesture({
    document: doc,
    brush,
    target: 'frm',
    view: 'single',
    layout,
    composition: layout[0],
    frameSize,
  });
  g.feed([frameSize.w / 2, frameSize.h * 0.8, 0.5]);
  g.feed([frameSize.w / 2 + 30, frameSize.h * 0.85, 0.5]);
  doc.addGesture(g.finish());
  return doc.strokes.at(-1);
}
test('portrait frame >95 persists below the legacy 576px clipping boundary', () => {
  const d = new StrokeDocument(geometry);
  d.bindings = ['source:a'];
  gesture(d);
  assert.ok(d.query('frame-127', { x: 0, y: 700, w: 576, h: 324 }).length);
  const loaded = StrokeDocument.parse(d.serialize());
  assert.deepEqual(loaded.geometry, d.geometry);
  assert.deepEqual(loaded.bindings, d.bindings);
  assert.equal(loaded.serialize(), d.serialize());
  assert.equal(JSON.parse(d.serialize()).schema, 7);
  assert.ok(loaded.undo() === false);
  d.undo();
  assert.equal(d.strokes.length, 0);
  d.redo();
  assert.equal(d.strokes.length, 1);
});
test('same immutable contour has document-specific clipping/index memo', () => {
  const s = createStroke({
    id: 's1',
    surface: 'frame-0',
    points: [
      [200, 800, 0.5],
      [230, 830, 0.5],
    ],
    space: { w: 576, h: 1024 },
  });
  const a = new StrokeDocument(),
    b = new StrokeDocument(geometry);
  assert.equal(a.instancesFor(s).length, 0);
  assert.equal(b.instancesFor(s).length, 1);
  assert.equal(a.instancesFor(s).length, 0);
});
test('changing aspect keeps prior data immutable and gives new strokes their own coordinates', () => {
  const d = new StrokeDocument(geometry);
  const original = gesture(d);
  const before = JSON.stringify(original);
  const square = gesture(d, 127, { w: 1024, h: 1024 });
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(square.coordinateFrame, { w: 1024, h: 1024 });
  const instance = d.instancesFor(square)[0];
  assert.equal(instance.transform.sx, 576 / 1024);
  assert.equal(instance.transform.sy, 1);
  assert.equal(StrokeDocument.parse(d.serialize()).serialize(), d.serialize());
});
test('dynamic template composite addresses entire real bank and is one undo transaction', () => {
  const d = new StrokeDocument(geometry);
  d.addGesture([
    createStroke({
      id: d.newId(),
      surface: 'tpl',
      points: [
        [200, 800, 0.5],
        [300, 900, 0.5],
      ],
      space: d.size('tpl'),
    }),
  ]);
  const before = d.serialize();
  const group = makeComposite(
    d,
    'tpl',
    Array.from({ length: 128 }, (_, i) => 'frame-' + i),
  );
  d.replaceSurfaces(['tpl'], [group]);
  assert.ok(d.query('frame-127', { x: 0, y: 700, w: 576, h: 324 }).length);
  d.undo();
  assert.equal(d.serialize(), before);
  d.redo();
  assert.equal(StrokeDocument.parse(d.serialize()).serialize(), d.serialize());
});
test('custom document rejects out-of-bank placements and malformed reference geometry atomically', () => {
  const d = new StrokeDocument(geometry);
  gesture(d);
  const before = d.serialize();
  for (const mutate of [
    (x) => (x.frame.count = 0),
    (x) => (x.frame.width = Infinity),
    (x) => (x.bindings = [{}]),
    (x) => (x.strokes[0].coordinateFrame.w = -1),
    (x) => (x.strokes[0].placements[0].surface = 'frame-128'),
  ]) {
    const raw = JSON.parse(before);
    mutate(raw);
    assert.throws(() => StrokeDocument.parse(JSON.stringify(raw)));
    assert.equal(d.serialize(), before);
  }
});

test('Open and slots restore geometry atomically, subsequent drawing never mutates history', () => {
  const a = new StrokeDocument(geometry);
  gesture(a);
  a.bindings = ['portrait'];
  const before = a.serialize();
  const b = new StrokeDocument({ ...geometry, width: 1024, height: 576 });
  gesture(b);
  b.bindings = ['landscape'];
  const after = b.serialize();
  a.replaceDocument(b);
  gesture(a);
  a.undo();
  assert.equal(a.serialize(), after);
  a.undo();
  assert.equal(a.serialize(), before);
  a.redo();
  assert.equal(a.serialize(), after);
  a.redo();
  assert.equal(a.strokes.length, 2);
  a.undo();
  a.undo();
  assert.equal(a.serialize(), before);
});
