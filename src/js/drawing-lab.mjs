import {
  StrokeDocument,
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
export const APP_VERSION = '28.35.0-drawing.4';
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
  scheduled = 0,
  fullDirty = true,
  dirty = [],
  gesture = null,
  pointers = new Map(),
  nav = null,
  space = false,
  playing = false,
  lastTick = 0,
  message = '';
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
  const cols = view === 'grid' ? 8 : 1,
    rows = view === 'grid' ? 12 : 1;
  const base = Math.min(
    (width - 24) / (cols * 1024),
    (height - 24) / (rows * 576),
  );
  const scale = base * zoom;
  gridRect = {
    x: (width - cols * 1024 * scale) / 2 + pan.x,
    y: (height - rows * 576 * scale) / 2 + pan.y,
    w: cols * 1024 * scale,
    h: rows * 576 * scale,
  };
  layout = Array.from({ length: view === 'grid' ? 96 : 1 }, (_, i) => ({
    id: view === 'grid' ? i : activeFrame,
    x: gridRect.x + (i % cols) * 1024 * scale,
    y: gridRect.y + Math.floor(i / cols) * 576 * scale,
    w: 1024 * scale,
    h: 576 * scale,
  }));
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
      ? [gridRect]
      : surface === 'tpl'
        ? layout
        : layout.filter((r) => surface === 'frame-' + r.id);
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
  c.save();
  c.fillStyle = 'hsla(' + ((r.id * 31) % 360) + ',30%,32%,.28)';
  c.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  c.strokeStyle = r.id === activeFrame ? '#f5b2c3' : '#545969';
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
  c.fillStyle = '#1a1c25';
  c.fillRect(region.x, region.y, region.w, region.h);
  renderer.draw(c, 'bg-' + view, gridRect, ratio, region);
  c.drawImage(fixtureCanvas, 0, 0, width, height);
  for (const r of layout) {
    if (!intersects(r, region)) continue;
    renderer.draw(c, 'tpl', r, ratio, region);
    renderer.draw(c, 'frame-' + r.id, r, ratio, region);
  }
  c.restore();
}
function markStroke(s) {
  for (const item of renderInstances(s)) markSurface(item.surface, item.box);
}
function refreshDrafts(last = false) {
  if (!gesture || gesture.mode !== 'draw') return;
  const changed = [];
  for (const s of gesture.segments) {
    if (s.changed || last) {
      const t = performance.now();
      s.stroke = createStroke({ ...s.options, points: s.points, last });
      metrics.geometryMs.push(performance.now() - t);
      s.changed = false;
      changed.push(s.stroke);
    }
  }
  const old = cache.drafts;
  cache.setDrafts(gesture.segments.map((s) => s.stroke).filter(Boolean));
  for (const s of [...old, ...changed]) markStroke(s);
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
  $('undo').disabled = !doc?.undoStack.length;
  $('redo').disabled = !doc?.redoStack.length;
  const c = cache?.stats();
  if (c)
    $('status').textContent =
      (message ? message + ' · ' : '') +
      doc.strokes.length +
      ' strokes · ' +
      c.tiles +
      ' tiles · ' +
      (c.bytes / 1048576).toFixed(2) +
      ' MB cache / 24 MB · ' +
      ((canvas.width * canvas.height * 8) / 1048576).toFixed(1) +
      ' MB display';
}
function resize() {
  cancelGesture();
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
  };
}
// A grid gesture is sampled in one stable sheet space. Only its completed
// outline is placed into frames; cell borders never restart the brush.
function feed(p, time) {
  const g = gesture,
    target = g.target;
  if (g.speed) p = [p[0], p[1], g.speed.sample(p[0], p[1], time)];
  const surface =
    target === 'bg'
      ? 'bg-' + g.view
      : g.view === 'grid'
        ? 'sheet'
        : target === 'tpl'
          ? 'tpl'
          : 'frame-' + activeFrame;
  let segment = g.segments.at(-1);
  if (!segment || segment.options.surface !== surface) {
    segment = {
      options: { ...g.brush, id: doc.newId(), surface, target },
      points: [],
      changed: true,
    };
    g.segments.push(segment);
  }
  const ext = surfaceSize(surface),
    q = [
      Math.max(
        -512,
        Math.min(ext.w + 512, ((p[0] - g.rect.x) / g.rect.w) * ext.w),
      ),
      Math.max(
        -512,
        Math.min(ext.h + 512, ((p[1] - g.rect.y) / g.rect.h) * ext.h),
      ),
      p[2],
    ];
  const previous = segment.points.at(-1);
  if (
    !previous ||
    Math.hypot(previous[0] - q[0], previous[1] - q[1]) > 0.2 ||
    Math.abs(previous[2] - q[2]) > 0.005
  ) {
    if (segment.points.length >= LIMITS.perStroke)
      throw Error('Long-stroke limit reached. Start another stroke.');
    segment.points.push(q);
    segment.changed = true;
  }
  g.lastPressure = p[2];
  metrics.samples++;
}
function cancelGesture() {
  if (gesture?.mode === 'draw') {
    for (const s of cache.drafts) markStroke(s);
    cache.setDrafts([]);
    schedule();
  }
  gesture = null;
  nav = null;
}
function finish() {
  if (!gesture || gesture.mode !== 'draw') {
    gesture = null;
    return;
  }
  try {
    refreshDrafts(true);
    const strokes = gesture.segments
      .map((s) => s.stroke)
      .filter((s) => s && renderInstances(s).length);
    cache.setDrafts([]);
    gesture = null;
    doc.addGesture(strokes);
    message = '';
  } catch (e) {
    cancelGesture();
    message = e.message;
  }
  schedule();
}
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
  e.preventDefault();
  measureRect();
  pointers.set(e.pointerId, point(e));
  canvas.setPointerCapture(e.pointerId);
  if (pointers.size === 2) {
    cancelGesture();
    const [a, b] = [...pointers.values()];
    nav = {
      distance: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])),
      center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
    };
    return;
  }
  if (pointers.size !== 1) return;
  if ($('tool').value === 'pan' || space || e.button !== 0) {
    gesture = { mode: 'pan', previous: point(e) };
    return;
  }
  gesture = {
    mode: 'draw',
    segments: [],
    target: $('target').value,
    brush: {
      ...brush(),
      pressure:
        ($('pressure').checked && e.pointerType === 'pen') ||
        $('velocity').checked,
    },
    speed:
      $('velocity').checked &&
      !($('pressure').checked && e.pointerType === 'pen')
        ? new SpeedPressure()
        : null,
    view,
    rect: { ...gridRect },
    previous: null,
    pointerId: e.pointerId,
  };
  firstPendingInput = performance.now();
  feed(point(e), e.timeStamp);
  schedule();
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const start = performance.now(),
    p = point(e);
  pointers.set(e.pointerId, p);
  if (pointers.size >= 2 && nav) {
    const [a, b] = [...pointers.values()];
    const dist = Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])),
      center = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    zoomAt(dist / nav.distance, ...nav.center, true);
    pan.x += center[0] - nav.center[0];
    pan.y += center[1] - nav.center[1];
    nav = { distance: dist, center };
    rects();
    fullDirty = true;
    schedule();
    return;
  }
  if (!gesture) return;
  if (gesture.mode === 'pan') {
    pan.x += p[0] - gesture.previous[0];
    pan.y += p[1] - gesture.previous[1];
    gesture.previous = p;
    rects();
    fullDirty = true;
    schedule();
    return;
  }
  if (e.pointerId !== gesture.pointerId) return;
  try {
    for (const sample of e.getCoalescedEvents?.().length
      ? e.getCoalescedEvents()
      : [e])
      feed(point(sample), sample.timeStamp);
    if (!firstPendingInput) firstPendingInput = performance.now();
    schedule();
  } catch (err) {
    cancelGesture();
    message = err.message;
    updateButtons();
  }
  metrics.inputMs.push(performance.now() - start);
});
canvas.addEventListener('pointerup', (e) => {
  if (gesture?.mode === 'draw' && e.pointerId === gesture.pointerId) {
    try {
      feed(point(e), e.timeStamp);
      finish();
    } catch (err) {
      cancelGesture();
      message = err.message;
      schedule();
    }
  } else if (pointers.size === 1) gesture = null;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) nav = null;
});
canvas.addEventListener('pointercancel', (e) => {
  pointers.delete(e.pointerId);
  cancelGesture();
});
canvas.addEventListener('lostpointercapture', (e) => {
  pointers.delete(e.pointerId);
  if (gesture?.pointerId === e.pointerId) cancelGesture();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', () => {
  pointers.clear();
  cancelGesture();
  space = false;
});
function zoomAt(factor, x = width / 2, y = height / 2, navigating = false) {
  if (!navigating) cancelGesture();
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
      Math.exp(-e.deltaY * 0.002),
      e.clientX - stageRect.left,
      e.clientY - stageRect.top,
    );
  },
  { passive: false },
);
$('zoomIn').onclick = () => zoomAt(1.5);
$('zoomOut').onclick = () => zoomAt(1 / 1.5);
$('fit').onclick = () => {
  cancelGesture();
  zoom = 1;
  pan = { x: 0, y: 0 };
  rects();
  fullDirty = true;
  schedule();
};
$('view').onchange = () => {
  cancelGesture();
  view = $('view').value;
  zoom = 1;
  pan = { x: 0, y: 0 };
  rects();
  fullDirty = true;
  schedule();
};
for (const id of ['target', 'tool', 'brushType'])
  $(id).onchange = cancelGesture;
function syncBrushControls(source) {
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
  cancelGesture();
  doc.undo();
  message = '';
  schedule();
};
$('redo').onclick = () => {
  cancelGesture();
  doc.redo();
  message = '';
  schedule();
};
$('clear').onclick = () => {
  cancelGesture();
  doc.clear();
  message = 'Cleared. Undo restores it.';
  schedule();
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
    message = 'Opened ' + f.name;
  } catch (e) {
    message = 'Could not open: ' + e.message;
  } finally {
    $('file').value = '';
    updateButtons();
  }
};
function setFrame(value) {
  cancelGesture();
  activeFrame = (value + 96) % 96;
  $('frame').value = activeFrame + 1;
  rects();
  fullDirty = true;
  schedule();
}
$('frame').onchange = () =>
  setFrame(Math.max(0, Math.min(95, (Number($('frame').value) || 1) - 1)));
$('prev').onclick = () => setFrame(activeFrame - 1);
$('next').onclick = () => setFrame(activeFrame + 1);
$('play').onclick = () => {
  playing = !playing;
  $('play').textContent = playing ? 'Pause · 8 fps' : 'Play · 8 fps';
  $('play').classList.toggle('active', playing);
  if (playing) {
    lastTick = performance.now();
    requestAnimationFrame(tick);
  }
};
function tick(now) {
  if (!playing) return;
  if (now - lastTick >= 125) {
    lastTick = now;
    activeFrame = (activeFrame + 1) % 96;
    $('frame').value = activeFrame + 1;
    rects();
    if (gesture?.mode === 'draw') gesture.previous = null;
    fullDirty = true;
    schedule();
  }
  requestAnimationFrame(tick);
}
function exportCanvas() {
  const out = document.createElement('canvas');
  out.width = view === 'grid' ? 1536 : 2048;
  out.height = view === 'grid' ? 1296 : 1152;
  const c = out.getContext('2d');
  c.fillStyle = '#1a1c25';
  c.fillRect(0, 0, out.width, out.height);
  const placements =
    view === 'grid'
      ? Array.from({ length: 96 }, (_, id) => ({
          id,
          x: (id % 8) * 192,
          y: Math.floor(id / 8) * 108,
          w: 192,
          h: 108,
        }))
      : [{ id: activeFrame, x: 0, y: 0, w: 2048, h: 1152 }];
  const exportCache = new StrokeTileCache(doc, { budget: 4 * 1024 * 1024 });
  function surface(id, r) {
    exportCache.draw(c, id, r, 1);
  }
  surface('bg-' + view, { x: 0, y: 0, w: out.width, h: out.height });
  for (const r of placements) {
    fixture(c, r);
    surface('tpl', r);
    surface('frame-' + r.id, r);
  }
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
window.addEventListener('keydown', (e) => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.code === 'Space') {
    e.preventDefault();
    space = true;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    $(e.shiftKey ? 'redo' : 'undo').click();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') space = false;
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
  benchmark,
  exportCanvas,
  reset: () => setDocument(new StrokeDocument()),
  add: (strokes) => doc.addGesture(strokes),
  createStroke,
  document: () => doc,
  cache: () => cache,
  flush: () =>
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
};
