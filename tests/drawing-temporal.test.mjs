import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  StrokeDocument,
  createStroke,
  makeComposite,
} from '../src/js/stroke-document.mjs';
import { DrawingGesture } from '../src/js/drawing-gesture.mjs';
import { createFrameTiming } from '../src/js/drawing-time.mjs';
const brush = createStroke({
  id: 's1',
  surface: 'frame-0',
  points: [[20, 20, 0.5]],
}).brush;
const layout = (tick = 0, cols = 8) =>
  Array.from({ length: 96 }, (_, cell) => ({
    cell,
    id: (cell + tick) % 96,
    x: (cell % cols) * 1024,
    y: Math.floor(cell / cols) * 576,
    w: 1024,
    h: 576,
  }));
const make = (options = {}) => {
  const document = new StrokeDocument();
  return new DrawingGesture({
    document,
    brush,
    target: 'frm',
    view: 'single',
    layout: [layout()[0]],
    composition: { x: 0, y: 0, w: 1024, h: 576 },
    ...options,
  });
};
test('held mouse/touch/pen geometry addresses every new frame with no movement', () => {
  const g = make();
  g.feed([200, 200, 0.7]);
  for (let i = 1; i < 7; i++)
    g.transition({
      layout: [{ ...layout()[0], id: i }],
      composition: g.composition,
      tick: i,
      playing: true,
    });
  const strokes = g.finish();
  assert.deepEqual(
    strokes.flatMap((s) => s.placements.map((p) => p.surface)),
    Array.from({ length: 7 }, (_, i) => 'frame-' + i),
  );
  g.document.addGesture(strokes);
  const saved = g.document.serialize();
  g.document.undo();
  assert.equal(g.document.strokes.length, 0);
  g.document.redo();
  assert.equal(g.document.serialize(), saved);
});
test('repeat repaint does not add opacity, revisit after another frame does', () => {
  const g = make();
  g.feed([200, 200, 0.5]);
  for (const i of [0, 1, 0])
    g.transition({
      layout: [{ ...layout()[0], id: i }],
      composition: g.composition,
      tick: i,
      playing: true,
    });
  assert.equal(g.finish().length, 3);
});
test('Long Stroke accumulates, Trail limits carried segments, release keeps data', () => {
  for (const trail of [0, 2]) {
    const g = make({ longStroke: true, playing: true, trail });
    for (let i = 0; i < 5; i++) {
      if (i)
        g.transition({
          layout: [{ ...layout()[0], id: i }],
          composition: g.composition,
          tick: i,
          playing: true,
        });
      g.feed([120 + i * 100, 100, 0.5]);
      g.feed([170 + i * 100, 140, 0.5]);
    }
    const strokes = g.finish();
    const count = (id) =>
      strokes.filter((s) =>
        s.placements.some((p) => p.surface === 'frame-' + id),
      ).length;
    assert.equal(count(4), trail === 0 ? 5 : 2);
    assert.equal(count(0), 1);
    g.document.addGesture(strokes);
    assert.equal(
      StrokeDocument.parse(g.document.serialize()).serialize(),
      g.document.serialize(),
    );
  }
});
test('1F footprint clips current cell, off permits neighboring placement', () => {
  for (const oneFrame of [false, true]) {
    const g = make({
      oneFrame,
      view: 'grid',
      layout: layout(),
      composition: { x: 0, y: 0, w: 8192, h: 6912 },
    });
    g.feed([1020, 200, 0.5]);
    const s = g.finish();
    assert.equal(
      new Set(s.flatMap((s) => s.placements.map((p) => p.surface))).size,
      oneFrame ? 1 : 2,
    );
  }
});
test('columns, gaps, repeating frame mapping preserve explicit frame addresses', () => {
  const cells = layout(4, 6).map((r) => ({ ...r, x: r.x + (r.cell % 6) * 30 }));
  const g = make({
    view: 'grid',
    layout: cells,
    composition: { x: 0, y: 0, w: 6294, h: 9216 },
  });
  g.feed([50, 100, 0.5]);
  g.feed([100, 100, 0.5]);
  g.document.addGesture(g.finish());
  assert.equal(g.document.strokes[0].placements[0].surface, 'frame-4');
  assert.equal(
    StrokeDocument.parse(g.document.serialize()).serialize(),
    g.document.serialize(),
  );
});
test('streaming spray geometry prefix stays immutable and roundtrips', () => {
  const g = make({
    brush: {
      ...brush,
      type: 'spray',
      size: 80,
      softness: 0.7,
      scatter: 1.5,
      dotScale: 0.1,
    },
  });
  g.feed([100, 100, 0.5]);
  const first = JSON.stringify(g.materialize()[0]);
  for (let i = 0; i < 50; i++)
    g.feed([100 + i * 10, 120 + Math.sin(i) * 20, 0.5]);
  assert.equal(JSON.stringify(g.materialize()[0]), first);
  g.document.addGesture(g.finish());
  assert.equal(
    StrokeDocument.parse(g.document.serialize()).serialize(),
    g.document.serialize(),
  );
});
test('TPL bake keeps isolated erase geometry once with 96 placements, atomic undo', () => {
  const d = new StrokeDocument();
  d.addGesture([
    createStroke({
      id: d.newId(),
      surface: 'tpl',
      points: [[100, 100, 0.5]],
      size: 100,
    }),
    createStroke({
      id: d.newId(),
      surface: 'tpl',
      points: [[100, 100, 0.5]],
      size: 50,
      erase: true,
    }),
  ]);
  const before = d.serialize(),
    group = makeComposite(
      d,
      'tpl',
      Array.from({ length: 96 }, (_, i) => 'frame-' + i),
    );
  d.replaceSurfaces(['tpl'], [group]);
  assert.equal(d.strokes.length, 1);
  assert.equal(d.strokes[0].children.length, 2);
  const after = d.serialize();
  assert.equal(StrokeDocument.parse(after).serialize(), after);
  d.undo();
  assert.equal(d.serialize(), before);
  d.redo();
  assert.equal(d.serialize(), after);
});
test('timing adapter parity with actual stable source over patterns/directions/loops', () => {
  const source = fs.readFileSync(
    new URL('./fixtures/timegrid-28.34-timing.cjs', import.meta.url),
    'utf8',
  );
  function extract(name) {
    const re = new RegExp('function ' + name + '\\([^\\n]*\\)\\s*\\{');
    const match = re.exec(source);
    assert.ok(match, name);
    const start = match.index,
      body = start + match[0].length - 1;
    let n = 1,
      end = body + 1;
    while (n && end < source.length) {
      if (source[end] === '{') n++;
      if (source[end] === '}') n--;
      end++;
    }
    return source.slice(start, end);
  }
  const names = [
    'mulberry32',
    'buildShuffledOrder',
    'ensureAnimDirShuffle',
    'ensureAnimRandomStarts',
    'getAnimDirectionCycleLength',
    'resolveDirectionFrame',
    'applyLoopAfterN',
    'generateCellOrder',
    'getCellBaseFrameOffset',
    'getFrameCellInfo',
    'normalizeFrameIndex',
    'getEffectiveFrameTargetCount',
    'getEffectiveGridCellCount',
    'getEffectiveGridCols',
  ];
  let checks = 0;
  for (const pattern of [
    'sequential',
    'snake',
    'vertical',
    'vertical-snake',
    'checkerboard',
    'center',
    'spiral',
    'random',
  ])
    for (const direction of [
      'forward',
      'backward',
      'pingpong',
      'bounce-offset',
      'sync',
      'stutter',
      'holdskip',
      'random',
      'shuffleloop',
    ])
      for (const cols of [6, 8, 13])
        for (const loop of [0, 7]) {
          const config = {
            frames: Array(96),
            gridCols: cols,
            gridLoops: 3,
            sequenceMode: false,
            animPattern: pattern,
            animDirection: direction,
            animSeed: 1,
            animDirShuffleSeed: 1,
            loopAfterN: loop,
            loopOffset: 4,
          };
          const context = { state: { ...config }, window: {}, console, Map };
          vm.createContext(context);
          vm.runInContext(names.map(extract).join('\n'), context);
          const adapter = createFrameTiming(config);
          for (const view of ['grid', 'single']) {
            context.state.viewMode = view;
            const order = context.generateCellOrder(96, cols),
              map = new Map(order.map((v, i) => [v, i]));
            for (const tick of [0, 1, 7, 95, 96, 194])
              for (const cell of [0, 5, 23, 95]) {
                assert.equal(
                  adapter.frame(cell, tick, view),
                  context.getFrameCellInfo(cell, tick, {
                    cellCount: 96,
                    cellOrderMap: map,
                  }).frameIdx,
                  JSON.stringify({
                    pattern,
                    direction,
                    cols,
                    loop,
                    tick,
                    cell,
                    view,
                  }),
                );
                checks++;
              }
          }
        }
  console.log('Stable timing comparisons: ' + checks);
});

test('one column with maximum gaps remains serializable at 96 frames', () => {
  const cells = layout(0, 1).map((r) => ({ ...r, y: r.cell * 832 }));
  const g = make({
    view: 'grid',
    layout: cells,
    composition: { x: 0, y: 0, w: 1024, h: 96 * 832 },
  });
  g.feed([100, 95 * 832 + 100, 0.5]);
  g.feed([400, 95 * 832 + 300, 0.5]);
  g.document.addGesture(g.finish());
  assert.equal(
    StrokeDocument.parse(g.document.serialize()).serialize(),
    g.document.serialize(),
  );
});
