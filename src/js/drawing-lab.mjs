import { createDrawingPanel } from './drawing-panel.mjs';
import { DrawingGesture } from './drawing-gesture.mjs';
import { createFrameTiming } from './drawing-time.mjs';
import {
  StrokeDocument,
  makeComposite,
  createStroke,
  renderInstances,
  surfaceSize,
  intersects,
  union,
  paintStroke,
  LIMITS,
} from './stroke-document.mjs';
import { SpeedPressure } from './brush-geometry.mjs';
import { StrokeTileCache } from './stroke-cache.mjs';
export const APP_VERSION = '28.35.0-drawing.7';
let drawingPanel;
const $ = (id) => document.getElementById(id),
  canvas = $('canvas'),
  ctx = canvas.getContext('2d', {
    alpha: false,
    willReadFrequently: new URLSearchParams(location.search).has(
      'verifyPixels',
    ),
  });
const fixtureCanvas = document.createElement('canvas'),
  fixtureContext = fixtureCanvas.getContext('2d');
let doc,
  cache,
  unsubscribe,
  view = 'grid',
  activeFrame = 0,
  zoom = 1,
  pan = { x: 0, y: 0 },
  width = 1,
  height = 1,
  dpr = 1,
  stageRect;
let layout = [],
  gridRect,
  compositionRect,
  timing,
  timelineTick = 0,
  scheduled = 0,
  fullDirty = true,
  dirty = [],
  gesture = null,
  pointers = new Map(),
  nav = null,
  playing = false,
  lastTick = 0,
  message = '';
let previewImages = [];
const metrics = {
  rectReads: 0,
  inputMs: [],
  geometryMs: [],
  renderMs: [],
  eventToRenderEndMs: [],
  samples: 0,
};
let firstPendingInput = 0;
function measureRect() {
  stageRect = canvas.getBoundingClientRect();
  metrics.rectReads++;
}
function setDocument(next) {
  unsubscribe?.();
  cache?.dispose();
  doc = next;
  cache = new StrokeTileCache(doc);
  unsubscribe = doc.onChange(({ dirty: changes }) => {
    for (const [surface, box] of changes) markSurface(surface, box);
    schedule();
  });
  fullDirty = true;
  updateButtons();
  schedule();
}
function rects() {
  const cols = view === 'grid' ? Number($('columns').value) : 1,
    count = view === 'grid' ? 96 : 1,
    rows = Math.ceil(count / cols);
  const gap = view === 'grid' ? Number($('gap').value) : 0,
    margin = Number($('margin').value);
  const logicalW = cols * 1024 + (cols - 1) * gap + 2 * margin,
    logicalH = rows * 576 + (rows - 1) * gap + 2 * margin;
  const scale =
    Math.min((width - 24) / logicalW, (height - 24) / logicalH) * zoom;
  compositionRect = {
    x: (width - logicalW * scale) / 2 + pan.x,
    y: (height - logicalH * scale) / 2 + pan.y,
    w: logicalW * scale,
    h: logicalH * scale,
  };
  gridRect = {
    x: compositionRect.x + margin * scale,
    y: compositionRect.y + margin * scale,
    w: (logicalW - 2 * margin) * scale,
    h: (logicalH - 2 * margin) * scale,
  };
  timing = createFrameTiming({
    gridCols: Number($('columns').value),
    animDirection: $('direction').value,
    animPattern: $('pattern').value,
    loopAfterN: Number($('loop').value),
    loopOffset: Number($('loopOffset').value),
    gridLoops: Number($('phases').value),
  });
  layout = Array.from({ length: count }, (_, i) => ({
    cell: i,
    id: timing.frame(i, timelineTick, view),
    x: gridRect.x + (i % cols) * (1024 + gap) * scale,
    y: gridRect.y + Math.floor(i / cols) * (576 + gap) * scale,
    w: 1024 * scale,
    h: 576 * scale,
  }));
  activeFrame = layout[0].id;
  $('frame').value = timelineTick + 1;
  $('zoomLabel').textContent = Math.round(zoom * 100) + '%';
  syncBrushControls();
}
function visible(r) {
  return intersects(r, { x: 0, y: 0, w: width, h: height });
}
function markSurface(surface, box) {
  const ext = surfaceSize(surface);
  const placements =
    surface === 'bg-' + view
      ? [compositionRect]
      : surface === 'tpl'
        ? layout
        : layout.filter(
            (r) =>
              surface === 'frame-' + r.id ||
              ($('onion').checked &&
                $('target').value === 'frm' &&
                [r.id - 1, r.id + 1].some(
                  (id) => id >= 0 && id < 96 && surface === 'frame-' + id,
                )),
          );
  for (const r of placements) {
    const b = {
      x: r.x + (box.x / ext.w) * r.w - 3,
      y: r.y + (box.y / ext.h) * r.h - 3,
      w: (box.w / ext.w) * r.w + 6,
      h: (box.h / ext.h) * r.h + 6,
    };
    if (visible(b)) dirty.push(b);
  }
}
function schedule() {
  if (!scheduled) scheduled = requestAnimationFrame(render);
}
function fixture(c, r) {
  if (previewImages.length) {
    c.drawImage(previewImages[r.id % previewImages.length], r.x, r.y, r.w, r.h);
    return;
  }
  c.save();
  c.fillStyle = 'hsla(' + ((r.id * 31) % 360) + ',30%,32%,.28)';
  c.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  c.strokeStyle = r.id === activeFrame ? '#35f2a3' : '#545969';
  c.lineWidth = r.id === activeFrame ? 2 : 1;
  c.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  c.fillStyle = '#b7bdcf';
  c.font = Math.max(8, Math.min(20, r.w * 0.12)) + 'px Inter, system-ui';
  c.fillText(
    String(r.id + 1).padStart(2, '0'),
    r.x + 5,
    r.y + Math.min(r.h - 3, 18),
  );
  c.strokeStyle = '#77809a66';
  c.lineWidth = 1;
  const phase = (r.id / 96) * Math.PI * 2;
  c.beginPath();
  c.arc(
    r.x + r.w * (0.5 + Math.sin(phase) * 0.22),
    r.y + r.h * 0.58,
    Math.max(1, r.h * 0.13),
    0,
    Math.PI * 2,
  );
  c.stroke();
  c.restore();
}
function drawScene(c, region, ratio = dpr, renderer = cache) {
  region = {
    x: Math.floor(region.x * ratio) / ratio,
    y: Math.floor(region.y * ratio) / ratio,
    w:
      (Math.ceil((region.x + region.w) * ratio) -
        Math.floor(region.x * ratio)) /
      ratio,
    h:
      (Math.ceil((region.y + region.h) * ratio) -
        Math.floor(region.y * ratio)) /
      ratio,
  };
  c.save();
  c.beginPath();
  c.rect(region.x, region.y, region.w, region.h);
  c.clip();
  c.fillStyle = '#282828';
  c.fillRect(region.x, region.y, region.w, region.h);
  if (!$('bgAbove').checked)
    renderer.draw(c, 'bg-' + view, compositionRect, ratio, region);
  c.drawImage(fixtureCanvas, 0, 0, width, height);
  for (const r of layout) {
    if (!intersects(r, region)) continue;
    if ($('onion').checked && $('target').value === 'frm') {
      c.save();
      c.globalAlpha = 0.35;
      for (const id of [r.id - 1, r.id + 1])
        if (id >= 0 && id < 96)
          renderer.draw(c, 'frame-' + id, r, ratio, region);
      c.restore();
    }
    if ($('templateVisible').checked) renderer.draw(c, 'tpl', r, ratio, region);
    renderer.draw(c, 'frame-' + r.id, r, ratio, region);
  }
  if ($('bgAbove').checked)
    renderer.draw(c, 'bg-' + view, compositionRect, ratio, region);
  c.restore();
}
function markStroke(s) {
  for (const item of renderInstances(s)) markSurface(item.surface, item.box);
}
function refreshDrafts(last = false) {
  if (gesture?.mode !== 'draw') return;
  const start = performance.now(),
    next = gesture.engine.materialize(last),
    old = cache.drafts;
  const before = new Map(old.map((s) => [s.id, s])),
    after = new Map(next.map((s) => [s.id, s]));
  cache.setDrafts(next);
  for (const s of old) if (after.get(s.id) !== s) markStroke(s);
  for (const s of next) if (before.get(s.id) !== s) markStroke(s);
  metrics.geometryMs.push(performance.now() - start);
}
function render(now) {
  scheduled = 0;
  if (!gridRect) return;
  const start = performance.now();
  try {
    refreshDrafts();
  } catch (error) {
    cancelGesture();
    message = error.message;
  }
  if (fullDirty) {
    fixtureContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    fixtureContext.clearRect(0, 0, width, height);
    for (const r of layout) if (visible(r)) fixture(fixtureContext, r);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (fullDirty || dirty.length > 80) {
    drawScene(ctx, { x: 0, y: 0, w: width, h: height });
  } else if (dirty.length) {
    let box = null;
    for (const b of dirty) box = union(box, b);
    if (box) {
      const affected = layout.filter((r) => intersects(r, box));
      for (const r of affected)
        box = union(box, { x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 });
      drawScene(ctx, box);
    }
  }
  fullDirty = false;
  dirty = [];
  metrics.renderMs.push(performance.now() - start);
  if (firstPendingInput) {
    metrics.eventToRenderEndMs.push(performance.now() - firstPendingInput);
    firstPendingInput = 0;
  }
  trimMetrics();
  updateButtons();
}
function trimMetrics() {
  for (const k of ['inputMs', 'geometryMs', 'renderMs', 'eventToRenderEndMs'])
    if (metrics[k].length > 2000)
      metrics[k].splice(0, metrics[k].length - 2000);
}
function updateButtons() {
  $('undo').disabled = !doc?.undoStack.length && gesture?.mode !== 'draw';
  $('redo').disabled = !doc?.redoStack.length;
  const c = cache?.stats();
  $('status').textContent =
    message ||
    $('target').value.toUpperCase() +
      ' · ' +
      ($('brushOff').checked
        ? 'Brush off'
        : $('tool').value === 'erase'
          ? 'Eraser'
          : $('brushType').value === 'spray'
            ? 'Spray'
            : 'Round') +
      ($('oneFrame').checked ? ' · 1F' : '') +
      ($('onion').checked ? ' · Onion' : '') +
      ($('longStroke').checked ? ' · Long ' + $('trail').value : '');
  if (c)
    $('diagnostics').textContent =
      (message ? message + ' · ' : '') +
      doc.strokes.length +
      ' operations · ' +
      c.tiles +
      ' tiles · ' +
      (c.bytes / 1048576).toFixed(2) +
      ' MB cache / 24 MB · ' +
      ((canvas.width * canvas.height * 8) / 1048576).toFixed(1) +
      ' MB display';
}
function resize() {
  finish();
  measureRect();
  width = stageRect.width;
  height = stageRect.height;
  dpr = Math.min(
    devicePixelRatio || 1,
    2,
    Math.sqrt(4000000 / (width * height)),
  );
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  fixtureCanvas.width = canvas.width;
  fixtureCanvas.height = canvas.height;
  rects();
  fullDirty = true;
  schedule();
}
function point(e) {
  return [
    e.clientX - stageRect.left,
    e.clientY - stageRect.top,
    e.pointerType === 'pen'
      ? e.pressure > 0
        ? e.pressure
        : gesture?.lastPressure || 0.5
      : 0.5,
  ];
}
function brush() {
  return {
    size: Number($('size').value),
    color: $('color').value,
    opacity: Number($('opacity').value) / 100,
    erase: $('tool').value === 'erase',
    pressure: $('pressure').checked,
    smoothing: Number($('smooth').value) / 100,
    streamline: Number($('streamline').value) / 100,
    simulatePressure: false,
    type: $('brushType').value,
    softness: Number($('softness').value) / 100,
    seed: crypto.getRandomValues(new Uint32Array(1))[0],
    scatter: Number($('scatter').value) / 100,
    dotScale: Number($('dotScale').value) / 100,
    density: Number($('density').value) / 100,
  };
}
function feed(p, time, shift = false) {
  const g = gesture;
  if (!g || g.mode !== 'draw') return;
  if (g.speed) p = [p[0], p[1], g.speed.sample(p[0], p[1], time)];
  if (shift && g.anchor) {
    const dx = p[0] - g.anchor[0],
      dy = p[1] - g.anchor[1],
      a = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI) / 4,
      n = Math.hypot(dx, dy);
    p = [g.anchor[0] + Math.cos(a) * n, g.anchor[1] + Math.sin(a) * n, p[2]];
  }
  g.engine.feed(p);
  g.lastPressure = p[2];
  metrics.samples++;
}
function cancelGesture() {
  if (gesture?.mode === 'draw') {
    for (const s of cache.drafts) markStroke(s);
    cache.setDrafts([]);
  }
  gesture = null;
  nav = null;
  schedule();
}
function finish() {
  if (gesture?.mode !== 'draw') {
    gesture = null;
    return;
  }
  try {
    const strokes = gesture.engine.finish();
    const old = cache.drafts;
    cache.setDrafts(strokes);
    for (const s of [...old, ...strokes]) markStroke(s);
    cache.commitDrafts(strokes);
    gesture = null;
    message = '';
  } catch (e) {
    cancelGesture();
    message = e.message;
  }
  schedule();
}
let penActive = null,
  suppressTouch = false,
  lastPenTime = -Infinity;
function startNavigation() {
  const contacts = [...pointers.values()].filter((p) => p.type === 'touch');
  if (contacts.length < 2) return;
  const [a, b] = contacts.map((p) => p.point);
  nav = {
    distance: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])),
    center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
  };
}
canvas.addEventListener('pointerdown', (e) => {
  if (![0, 1, 2, 5].includes(e.button)) return;
  if (
    e.pointerType === 'touch' &&
    (penActive !== null || performance.now() - lastPenTime < 350)
  )
    return;
  if (e.pointerType === 'pen') {
    lastPenTime = performance.now();
    penActive = e.pointerId;
    // A pen takes ownership from touch navigation/accidental palm contact.
    if (gesture && pointers.get(gesture.pointerId)?.type === 'touch') finish();
    for (const [id, p] of pointers) if (p.type === 'touch') pointers.delete(id);
    nav = null;
    suppressTouch = false;
  }
  e.preventDefault();
  measureRect();
  const p = point(e);
  pointers.set(e.pointerId, { point: p, type: e.pointerType });
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {}
  const contacts = [...pointers.values()].filter((p) => p.type === 'touch');
  if (contacts.length >= 2) {
    if (gesture?.mode === 'draw') {
      if (
        performance.now() - gesture.started < 90 &&
        gesture.engine.samples < 3
      )
        cancelGesture();
      else finish();
    }
    suppressTouch = true;
    startNavigation();
    return;
  }
  if (gesture || suppressTouch) return;
  const penEraser =
    e.pointerType === 'pen' && (e.button === 5 || Boolean(e.buttons & 32));
  if (
    $('tool').value === 'pan' ||
    $('brushOff').checked ||
    (e.button !== 0 && !penEraser) ||
    (e.pointerType === 'touch' && !$('touchDraw').checked)
  ) {
    gesture = { mode: 'pan', previous: p, pointerId: e.pointerId };
    return;
  }
  const b = {
    ...brush(),
    erase: penEraser || $('tool').value === 'erase',
    pressure:
      ($('pressure').checked && e.pointerType === 'pen') ||
      $('velocity').checked,
  };
  gesture = {
    mode: 'draw',
    pointerId: e.pointerId,
    pointerType: e.pointerType,
    started: performance.now(),
    anchor: p,
    speed:
      $('velocity').checked &&
      !($('pressure').checked && e.pointerType === 'pen')
        ? new SpeedPressure()
        : null,
    engine: new DrawingGesture({
      document: doc,
      brush: b,
      target: $('target').value,
      view,
      layout: layout.map((r) => ({ ...r })),
      composition: { ...compositionRect },
      oneFrame: $('oneFrame').checked,
      longStroke: $('longStroke').checked,
      trail: Number($('trail').value),
      tick: timelineTick,
      playing,
    }),
  };
  firstPendingInput = performance.now();
  try {
    feed(p, e.timeStamp);
    schedule();
  } catch (error) {
    cancelGesture();
    message = error.message;
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'pen') lastPenTime = performance.now();
  if (!pointers.has(e.pointerId)) return;
  const started = performance.now(),
    p = point(e);
  pointers.set(e.pointerId, { point: p, type: e.pointerType });
  const touches = [...pointers.values()].filter((p) => p.type === 'touch');
  if (touches.length >= 2 && nav) {
    const [a, b] = touches.map((p) => p.point),
      distance = Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])),
      center = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    zoomAt(distance / nav.distance, ...nav.center, true);
    pan.x += center[0] - nav.center[0];
    pan.y += center[1] - nav.center[1];
    nav = { distance, center };
    rects();
    fullDirty = true;
    schedule();
    return;
  }
  if (!gesture || gesture.pointerId !== e.pointerId) return;
  if (gesture.mode === 'pan') {
    pan.x += p[0] - gesture.previous[0];
    pan.y += p[1] - gesture.previous[1];
    gesture.previous = p;
    rects();
    fullDirty = true;
    schedule();
    return;
  }
  e.preventDefault();
  try {
    const coalesced = e.getCoalescedEvents?.();
    for (const sample of coalesced?.length ? coalesced : [e])
      feed(point(sample), sample.timeStamp, e.shiftKey);
    if (!firstPendingInput) firstPendingInput = performance.now();
    schedule();
  } catch (error) {
    finish();
    message = error.message;
    schedule();
  }
  metrics.inputMs.push(performance.now() - started);
});
function endPointer(e, includePoint = false) {
  if (gesture?.pointerId === e.pointerId) {
    if (gesture.mode === 'draw' && includePoint) {
      try {
        feed(point(e), e.timeStamp, e.shiftKey);
      } catch (error) {
        message = error.message;
      }
    }
    finish();
  }
  pointers.delete(e.pointerId);
  if (penActive === e.pointerId) penActive = null;
  if ([...pointers.values()].filter((p) => p.type === 'touch').length < 2)
    nav = null;
  if (![...pointers.values()].some((p) => p.type === 'touch'))
    suppressTouch = false;
}
canvas.addEventListener('pointerup', (e) => endPointer(e, true));
canvas.addEventListener('pointercancel', (e) => endPointer(e));
canvas.addEventListener('lostpointercapture', (e) => endPointer(e));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', () => {
  finish();
  pointers.clear();
  penActive = null;
  suppressTouch = false;
  nav = null;
});
function zoomAt(factor, x = width / 2, y = height / 2, navigating = false) {
  if (!navigating) finish();
  const next = Math.max(0.75, Math.min(16, zoom * factor)),
    f = next / zoom;
  pan.x = x - width / 2 - (x - width / 2 - pan.x) * f;
  pan.y = y - height / 2 - (y - height / 2 - pan.y) * f;
  zoom = next;
  rects();
  fullDirty = true;
  schedule();
}
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    measureRect();
    zoomAt(
      Math.exp(
        -Math.max(
          -200,
          Math.min(
            200,
            e.deltaY *
              (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1),
          ),
        ) * 0.002,
      ),
      e.clientX - stageRect.left,
      e.clientY - stageRect.top,
    );
  },
  { passive: false },
);
$('zoomIn').onclick = () => zoomAt(1.5);
$('zoomOut').onclick = () => zoomAt(1 / 1.5);
$('fit').onclick = () => {
  finish();
  zoom = 1;
  pan = { x: 0, y: 0 };
  rects();
  fullDirty = true;
  schedule();
};
$('view').onchange = () => {
  finish();
  view = $('view').value;
  zoom = 1;
  pan = { x: 0, y: 0 };
  rects();
  fullDirty = true;
  schedule();
};
for (const id of ['target', 'tool', 'brushType'])
  $(id).onchange = () => {
    finish();
    syncBrushControls();
    fullDirty = true;
    schedule();
  };
function syncBrushControls(source) {
  $('sprayControls').hidden = $('brushType').value !== 'spray';
  $('smooth').closest('label').hidden =
    $('brushType').value === 'spray' || Number($('softness').value) > 0;
  if (source === 'number') {
    const n = Number($('sizeNumber').value);
    if (n < 2 || n > 180) return;
    $('size').value = String(n);
  }
  if (source !== 'number') $('sizeNumber').value = $('size').value;
  for (const [id, out] of [
    ['size', 'sizeOut'],
    ['smooth', 'smoothOut'],
    ['streamline', 'streamlineOut'],
    ['opacity', 'opacityOut'],
    ['softness', 'softnessOut'],
  ])
    $(out).textContent = $(id).value;
  const scale = layout[0]?.w / 1024 || 1;
  $('brushHint').textContent =
    'Width ' +
    $('size').value +
    ' frame px · ' +
    (Number($('size').value) * scale).toFixed(1) +
    ' px on screen';
  drawingPanel?.sync();
}
$('size').oninput = () => syncBrushControls('range');
$('sizeNumber').oninput = () => syncBrushControls('number');
$('sizeNumber').onchange = () => {
  $('size').value = String(
    Math.max(2, Math.min(180, Number($('sizeNumber').value) || 2)),
  );
  syncBrushControls();
};
for (const id of ['smooth', 'streamline', 'opacity', 'softness'])
  $(id).oninput = () => syncBrushControls();
$('undo').onclick = () => {
  finish();
  doc.undo();
  message = '';
  schedule();
};
$('redo').onclick = () => {
  finish();
  doc.redo();
  message = '';
  schedule();
};
$('clear').onclick = () => {
  finish();
  const target = $('target').value;
  doc.replaceSurfaces(
    target === 'frm'
      ? Array.from({ length: 96 }, (_, i) => 'frame-' + i)
      : [target === 'bg' ? 'bg-' + view : 'tpl'],
  );
  message = 'Cleared. Undo restores it.';
  schedule();
};
const numericSettings = [
  'columns',
  'gap',
  'margin',
  'fps',
  'loop',
  'loopOffset',
  'phases',
  'trail',
];
const booleanSettings = [
  'oneFrame',
  'longStroke',
  'onion',
  'templateVisible',
  'bgAbove',
  'touchDraw',
  'exportBg',
];
const selectSettings = ['direction', 'pattern'];
function captureSettings() {
  doc.settings = { tick: timelineTick, view };
  for (const id of numericSettings) doc.settings[id] = Number($(id).value);
  for (const id of booleanSettings) doc.settings[id] = $(id).checked;
  for (const id of selectSettings) doc.settings[id] = $(id).value;
}
function restoreSettings() {
  const defaults = {
    columns: 8,
    gap: 0,
    margin: 0,
    fps: 8,
    loop: 0,
    loopOffset: 0,
    phases: 1,
    trail: 8,
    oneFrame: false,
    longStroke: false,
    onion: false,
    templateVisible: true,
    bgAbove: false,
    touchDraw: true,
    exportBg: true,
    direction: 'forward',
    pattern: 'sequential',
    tick: 0,
    view: 'grid',
  };
  const settings = { ...defaults, ...doc.settings };
  for (const id of numericSettings) $(id).value = settings[id];
  for (const id of booleanSettings) $(id).checked = settings[id];
  for (const id of selectSettings) $(id).value = settings[id];
  view = settings.view;
  $('view').value = view;
  timelineTick = settings.tick;
  playing = false;
  syncPlay();
  zoom = 1;
  pan = { x: 0, y: 0 };
  rects();
  fullDirty = true;
  schedule();
}
for (const id of [
  ...numericSettings,
  ...booleanSettings,
  ...selectSettings,
  'brushOff',
  'scatter',
  'dotScale',
  'density',
]) {
  $(id).addEventListener('change', () => {
    finish();
    if ($(id).type === 'number')
      $(id).value = Math.max(
        Number($(id).min),
        Math.min(Number($(id).max), Math.round(Number($(id).value) || 0)),
      );
    rects();
    syncPlay();
    fullDirty = true;
    schedule();
  });
}
$('bake').onclick = () => {
  finish();
  try {
    const s = makeComposite(
      doc,
      'tpl',
      Array.from({ length: 96 }, (_, i) => 'frame-' + i),
    );
    if (s) doc.replaceSurfaces(['tpl'], [s]);
    message = s
      ? 'TPL applied to 96 frames. Undo restores both layers.'
      : 'TPL is empty.';
  } catch (e) {
    message = e.message;
  }
  schedule();
};
let imageLoad = 0;
$('images').onclick = () => $('imageFiles').click();
$('resetImages').onclick = () => {
  imageLoad++;
  for (const i of previewImages) i.close();
  previewImages = [];
  fullDirty = true;
  schedule();
};
$('imageFiles').onchange = async () => {
  const generation = ++imageLoad,
    decoded = [];
  try {
    const files = [...$('imageFiles').files].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
    if (files.length > 96) throw Error('Choose at most 96 images.');
    if (files.reduce((n, f) => n + f.size, 0) > 64 * 1024 * 1024)
      throw Error('Image selection exceeds 64 MiB.');
    for (const f of files) {
      // Session preview is deliberately bounded. Original media project support is a later step.
      decoded.push(
        await createImageBitmap(f, {
          resizeWidth: 512,
          resizeHeight: 288,
          resizeQuality: 'high',
        }),
      );
      if (generation !== imageLoad) {
        decoded.forEach((i) => i.close());
        return;
      }
    }
    for (const i of previewImages) i.close();
    previewImages = decoded;
    message =
      files.length +
      ' preview images. Save strokes does not include these images.';
    fullDirty = true;
    schedule();
  } catch (e) {
    decoded.forEach((i) => i.close());
    message = e.message;
    updateButtons();
  } finally {
    $('imageFiles').value = '';
  }
};

function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
$('save').onclick = () => {
  finish();
  captureSettings();
  download(
    new Blob([doc.serialize()], { type: 'application/json' }),
    'TimeGrid-' + APP_VERSION + '.timegrid-drawing.json',
  );
  message = 'Drawing saved. Undo history stays in this session.';
  updateButtons();
};
$('open').onclick = () => $('file').click();
$('file').onchange = async () => {
  const f = $('file').files[0];
  if (!f) return;
  try {
    if (f.size > LIMITS.bytes) throw Error('File exceeds 32 MB.');
    const next = StrokeDocument.parse(await f.text());
    cancelGesture();
    setDocument(next);
    restoreSettings();
    message = 'Opened ' + f.name;
  } catch (e) {
    message = 'Could not open: ' + e.message;
  } finally {
    $('file').value = '';
    updateButtons();
  }
};
function advanceTo(value) {
  const oldTick = timelineTick;
  timelineTick = Math.max(0, Math.min(10000000, Math.floor(value)));
  rects();
  if (gesture?.mode === 'draw' && oldTick !== timelineTick) {
    try {
      gesture.engine.transition({
        layout: layout.map((r) => ({ ...r })),
        composition: { ...compositionRect },
        tick: timelineTick,
        playing,
      });
    } catch (error) {
      finish();
      message = error.message;
    }
  }
  fullDirty = true;
  schedule();
}
function setFrame(value) {
  playing = false;
  syncPlay();
  advanceTo(value);
}
$('frame').onchange = () => setFrame((Number($('frame').value) || 1) - 1);
$('prev').onclick = () => setFrame(Math.max(0, timelineTick - 1));
$('next').onclick = () => setFrame(timelineTick + 1);
let tickRequest = 0;
function syncPlay() {
  $('play').textContent =
    (playing ? 'Pause' : 'Play') + ' · ' + $('fps').value + ' fps';
  $('play').classList.toggle('active', playing);
}
$('play').onclick = () => {
  playing = !playing;
  syncPlay();
  if (gesture?.mode === 'draw') gesture.engine.playing = playing;
  cancelAnimationFrame(tickRequest);
  if (playing) {
    lastTick = performance.now();
    tickRequest = requestAnimationFrame(tick);
  }
};
function tick(now) {
  if (!playing) return;
  const interval = 1000 / Number($('fps').value);
  // Match TimeGrid's clock: one delivered transition per rAF, retain phase.
  if (now - lastTick >= interval) {
    lastTick = now - ((now - lastTick) % interval);
    advanceTo(timelineTick + 1);
  }
  tickRequest = requestAnimationFrame(tick);
}
function exportBounds() {
  let box = { ...compositionRect };
  if (!$('exportBg').checked) return box;
  const ext = surfaceSize('bg-' + view);
  for (const item of doc.instances.values()) {
    if (item.surface !== 'bg-' + view || item.brush.erase) continue;
    const r = item.box;
    box = union(box, {
      x: compositionRect.x + (r.x / ext.w) * compositionRect.w,
      y: compositionRect.y + (r.y / ext.h) * compositionRect.h,
      w: (r.w / ext.w) * compositionRect.w,
      h: (r.h / ext.h) * compositionRect.h,
    });
  }
  return box;
}
function exportCanvas() {
  const out = document.createElement('canvas'),
    size = Number($('exportSize').value);
  const crop = exportBounds();
  const scale = size / Math.max(crop.w, crop.h);
  out.width = Math.max(1, Math.round(crop.w * scale));
  out.height = Math.max(1, Math.round(crop.h * scale));
  const c = out.getContext('2d'),
    exportCache = new StrokeTileCache(doc, { budget: 4 * 1024 * 1024 });
  if (!$('transparent').checked) {
    c.fillStyle = '#282828';
    c.fillRect(0, 0, out.width, out.height);
  }
  const viewport = { x: 0, y: 0, w: out.width, h: out.height };
  const surface = (id, r) => exportCache.draw(c, id, r, 1, viewport);
  const bg = {
    x: (compositionRect.x - crop.x) * scale,
    y: (compositionRect.y - crop.y) * scale,
    w: compositionRect.w * scale,
    h: compositionRect.h * scale,
  };
  if ($('exportBg').checked && !$('bgAbove').checked) surface('bg-' + view, bg);
  for (const item of layout) {
    const r = {
      ...item,
      x: (item.x - crop.x) * scale,
      y: (item.y - crop.y) * scale,
      w: item.w * scale,
      h: item.h * scale,
    };
    if (!$('transparent').checked) fixture(c, r);
    if ($('templateVisible').checked) surface('tpl', r);
    surface('frame-' + r.id, r);
  }
  if ($('exportBg').checked && $('bgAbove').checked) surface('bg-' + view, bg);
  exportCache.dispose();
  return out;
}
$('png').onclick = () => {
  finish();
  const out = exportCanvas();
  out.toBlob((blob) => {
    if (blob) download(blob, 'TimeGrid-drawing-' + view + '.png');
    out.width = 0;
  }, 'image/png');
};
// Physical codes preserve TimeGrid bindings on Russian and English layouts.
function changeControl(id, value) {
  const el = $(id);
  if (el.type === 'checkbox') el.checked = value;
  else el.value = value;
  el.dispatchEvent(new Event('change'));
}
function stepControl(id, delta) {
  const el = $(id);
  changeControl(
    id,
    Math.max(
      Number(el.min),
      Math.min(Number(el.max), Number(el.value) + delta),
    ),
  );
  syncBrushControls();
}
function cycleControl(id, delta) {
  const el = $(id),
    n = el.options.length;
  changeControl(id, el.options[(el.selectedIndex + delta + n) % n].value);
}
window.addEventListener('keydown', (e) => {
  const el = e.target,
    code = e.code,
    mod = e.ctrlKey || e.metaKey;
  if (el.isContentEditable || el.closest?.('input, textarea, select')) return;
  if (e.altKey) return;
  let action;
  if (mod) {
    if (code === 'KeyZ') action = () => $(e.shiftKey ? 'redo' : 'undo').click();
    else if (code === 'BracketLeft' || code === 'BracketRight')
      action = () => stepControl('opacity', code === 'BracketLeft' ? -10 : 10);
    else if (['Equal', 'NumpadAdd', 'Minus', 'NumpadSubtract'].includes(code))
      action = () =>
        stepControl(
          'fps',
          (['Minus', 'NumpadSubtract'].includes(code) ? -1 : 1) *
            (e.shiftKey ? 10 : 5),
        );
    else if (code === 'ArrowUp' || code === 'ArrowDown')
      action = () => cycleControl('direction', code === 'ArrowUp' ? -1 : 1);
  } else {
    if (code === 'Space') action = () => $('play').click();
    else if (code === 'KeyG')
      action = () => changeControl('view', view === 'grid' ? 'single' : 'grid');
    else if (code === 'KeyF') action = () => $('fit').click();
    else if (['KeyQ', 'KeyW', 'KeyE'].includes(code))
      action = () => {
        changeControl('brushOff', false);
        changeControl('target', { KeyQ: 'bg', KeyW: 'tpl', KeyE: 'frm' }[code]);
      };
    else if (code === 'KeyZ')
      action = () => $(e.shiftKey ? 'redo' : 'undo').click();
    else if (code === 'KeyC') action = () => $('clear').click();
    else if (code === 'KeyA')
      action = () => changeControl('brushOff', !$('brushOff').checked);
    else if (code === 'Escape') action = () => changeControl('brushOff', true);
    else if (code === 'KeyL')
      action = () => changeControl('longStroke', !$('longStroke').checked);
    else if (code === 'KeyT')
      action = () =>
        changeControl('templateVisible', !$('templateVisible').checked);
    else if (code === 'BracketLeft' || code === 'BracketRight')
      action = () =>
        stepControl(
          e.shiftKey ? 'softness' : 'size',
          (code === 'BracketLeft' ? -1 : 1) * (e.shiftKey ? 5 : 4),
        );
    else if (['Equal', 'NumpadAdd', 'Minus', 'NumpadSubtract'].includes(code))
      action = () =>
        stepControl(
          'fps',
          (['Minus', 'NumpadSubtract'].includes(code) ? -1 : 1) *
            (e.shiftKey ? 5 : 1),
        );
    else if (code === 'ArrowUp' || code === 'ArrowDown')
      action = () =>
        e.shiftKey
          ? stepControl('columns', code === 'ArrowUp' ? 1 : -1)
          : cycleControl('pattern', code === 'ArrowUp' ? -1 : 1);
    else if (code === 'ArrowLeft' || code === 'ArrowRight')
      action = () =>
        e.shiftKey
          ? stepControl('phases', code === 'ArrowLeft' ? -1 : 1)
          : $(code === 'ArrowLeft' ? 'prev' : 'next').click();
    else if (code === 'Home' || code === 'End')
      action = () => {
        finish();
        advanceTo(code === 'Home' ? 0 : 95);
      };
  }
  if (action) {
    e.preventDefault();
    // Toggle keys and destructive commands must not repeat while held.
    if (e.repeat && /^(Space|Key|Escape)/.test(code)) return;
    action();
  }
});
const pct = (values, p) =>
  values.length
    ? [...values].sort((a, b) => a - b)[
        Math.min(values.length - 1, Math.floor(values.length * p))
      ]
    : null;
const summary = (values) => ({
  n: values.length,
  p50: pct(values, 0.5),
  p95: pct(values, 0.95),
  p99: pct(values, 0.99),
  max: values.length ? Math.max(...values) : null,
});
async function benchmark() {
  const report = {
    version: APP_VERSION,
    date: new Date().toISOString(),
    userAgent: navigator.userAgent,
    viewport: { width, height, dpr },
    units: 'milliseconds; RGBA backing bytes, not process memory',
    cases: [],
    longStroke: [],
    interactive: Object.fromEntries(
      ['inputMs', 'geometryMs', 'renderMs', 'eventToRenderEndMs'].map((k) => [
        k,
        summary(metrics[k]),
      ]),
    ),
    rectReads: metrics.rectReads,
  };
  for (const count of [1, 12, 96])
    for (const n of [100, 1000]) {
      const d = new StrokeDocument(),
        tc = new StrokeTileCache(d),
        off = document.createElement('canvas');
      off.width = 1536;
      off.height = 1296;
      const c = off.getContext('2d'),
        geom = [];
      const empty = tc.stats().bytes;
      for (let i = 0; i < n; i++) {
        const t = performance.now(),
          pts = Array.from({ length: 24 }, (_, j) => [
            80 + j * 32,
            80 + (i % 8) * 50 + Math.sin(j * 0.4 + i) * 24,
            0.5,
          ]);
        const s = createStroke({
          id: d.newId(),
          surface: 'frame-' + (i % count),
          points: pts,
          size: 12,
          opacity: 0.7,
        });
        geom.push(performance.now() - t);
        d.addGesture([s]);
      }
      const render = () => {
        c.clearRect(0, 0, 1536, 1296);
        for (let i = 0; i < count; i++)
          tc.draw(
            c,
            'frame-' + i,
            { x: (i % 8) * 192, y: Math.floor(i / 8) * 108, w: 192, h: 108 },
            1,
          );
      };
      let t = performance.now();
      render();
      const cold = performance.now() - t,
        warm = [];
      for (let j = 0; j < 10; j++) {
        t = performance.now();
        render();
        warm.push(performance.now() - t);
      }
      const warmCache = tc.stats();
      const serialized = d.serialize();
      t = performance.now();
      const restored = StrokeDocument.parse(serialized);
      const openMs = performance.now() - t;
      t = performance.now();
      d.undo();
      const undoMs = performance.now() - t;
      d.redo();
      report.cases.push({
        frames: count,
        strokes: n,
        emptyBytes: empty,
        cache: warmCache,
        fileBytes: new Blob([serialized]).size,
        geometryMs: summary(geom),
        coldRenderMs: cold,
        warmRenderMs: summary(warm),
        undoMs,
        openMs,
        roundTripExact: restored.serialize() === serialized,
      });
      tc.dispose();
      off.width = 0;
      await new Promise((r) => setTimeout(r, 0));
    }
  for (const n of [1000, 10000]) {
    const pts = Array.from({ length: n }, (_, i) => [
        50 + (i / (n - 1)) * 900,
        288 + Math.sin(i * 0.07) * 180,
        0.5,
      ]),
      times = [];
    for (let j = 0; j < 5; j++) {
      const t = performance.now();
      createStroke({ id: 's1', surface: 'frame-0', points: pts, size: 16 });
      times.push(performance.now() - t);
    }
    report.longStroke.push({ points: n, geometryMs: summary(times) });
  }
  return report;
}
$('bench').onclick = async () => {
  $('bench').disabled = true;
  message = 'Benchmark running…';
  updateButtons();
  try {
    const report = await benchmark();
    download(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
      'TimeGrid-benchmark-' + APP_VERSION + '.json',
    );
    message = 'Benchmark saved. Your drawing is unchanged.';
  } catch (e) {
    message = e.message;
  } finally {
    $('bench').disabled = false;
    updateButtons();
  }
};
document.fonts.ready.then(() => {
  fullDirty = true;
  schedule();
});
drawingPanel = createDrawingPanel({ change: changeControl, finish });
drawingPanel.sync();
setDocument(new StrokeDocument());
new ResizeObserver(resize).observe($('stage'));
window.addEventListener('scroll', measureRect, { passive: true });
window.timegridLab = {
  version: APP_VERSION,
  serialize: () => doc.serialize(),
  load: (text) => {
    cancelGesture();
    setDocument(StrokeDocument.parse(text));
  },
  captureSettings,
  restoreSettings,
  stats: () => ({
    strokes: doc.strokes.length,
    points: doc.totalPoints,
    cache: cache.stats(),
    displayBytes: canvas.width * canvas.height * 8,
    metrics,
    view,
    activeFrame,
  }),
  layout: () => layout.map((r) => ({ ...r })),
  composition: () => ({ ...compositionRect }),
  advance: advanceTo,
  tick: () => timelineTick,
  gesture: () => gesture?.engine,
  finish,
  benchmark,
  exportCanvas,
  exportBounds,
  reset: () => setDocument(new StrokeDocument()),
  add: (strokes) => doc.addGesture(strokes),
  createStroke,
  document: () => doc,
  cache: () => cache,
  flush: () =>
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
};
