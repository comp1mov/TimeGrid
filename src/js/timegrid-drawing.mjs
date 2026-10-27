import {
  StrokeDocument,
  documentGeometry,
  LEGACY_GEOMETRY,
  makeComposite,
  union,
  LIMITS,
} from './stroke-document.mjs';
import { StrokeTileCache } from './stroke-cache.mjs';
import { DrawingGesture } from './drawing-gesture.mjs';
import { createFill } from './drawing-fill.mjs';
import { SpeedPressure } from './brush-geometry.mjs';

// The app owns media, layout, navigation and the playback clock. This adapter
// owns only drawing operations; it never creates a second frame sequencer.
export function createTimeGridDrawing({
  state,
  canvas,
  templateCanvas,
  getGeometry,
  getComposition,
  requestRender,
  isLocked,
  navigate,
  getAspect,
  changed = () => {},
  report = console.warn,
}) {
  let doc = new StrokeDocument({
    width: 1024,
    height: 576,
    count: 1,
    gridWidth: 8192,
    gridHeight: 6912,
  });
  const cache = new StrokeTileCache(doc);
  let bank = null,
    bankLength = -1,
    addresses = [],
    currentKeys = [],
    active = null,
    pending = 0,
    pen = null,
    lastPen = -Infinity;
  let suppressedTouch = false,
    nav = null,
    frameTick = 0,
    lastFrameSignature = '',
    geometrySeen = doc.geometry;
  const pointers = new Map(),
    slots = [null, null, null];
  const view = () => (state.viewMode === 'single' ? 'single' : 'grid');
  const target = () =>
    ({ background: 'bg', template: 'tpl', frame: 'frm' })[state.drawTarget] ||
    'frm';
  const localSize = () => {
    const r = getGeometry().rects.find((r) => r.w > 0 && r.h > 0);
    const aspect =
      getAspect?.() ||
      (r ? r.w / r.h : (state.videoWidth || 16) / (state.videoHeight || 9));
    return aspect >= 1
      ? { w: 1024, h: Math.max(1, 1024 / aspect) }
      : { w: Math.max(1, 1024 * aspect), h: 1024 };
  };
  const frameSurface = (i) =>
    addresses[i] === undefined ? null : 'frame-' + addresses[i];
  function layout() {
    return getGeometry()
      .rects.filter((r) => r.w > 0 && r.h > 0)
      .map((r) => ({
        cell: r.i,
        id: addresses[Number(r.cellEl.dataset.frameIdx) || 0],
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
      }))
      .filter((r) => r.id !== undefined);
  }
  function fileKey(f) {
    return f ? JSON.stringify([f.name, f.size, f.lastModified]) : 'session';
  }
  function keys() {
    const signature = state.isSingleImage
      ? JSON.stringify((state.imageFiles || []).map(fileKey))
      : fileKey(state.videoFile);
    const source = signature.length > 350 ? hash(signature) : signature;
    const occurrences = new Map();
    return (state.frames || []).map((f, i) => {
      const base = state.isSingleImage
        ? source +
          '|' +
          state.imageImportMode +
          '|' +
          (f.sourceIndex ?? 0) +
          '|' +
          (state.imageImportMode === 'cut'
            ? state.cutCols + 'x' + state.cutRows + '|' + i
            : '')
        : source +
          '|video|' +
          Number(f.time ?? 0).toFixed(7) +
          '|' +
          (f.frameNumber ?? i);
      const occurrence = occurrences.get(base) || 0;
      occurrences.set(base, occurrence + 1);
      return base + '|' + occurrence;
    });
  }
  function hash(text) {
    let a = 2166136261,
      b = 5381;
    for (let i = 0; i < text.length; i++) {
      a = Math.imul(a ^ text.charCodeAt(i), 16777619);
      b = Math.imul(b, 33) ^ text.charCodeAt(i);
    }
    return (
      'files:' +
      (a >>> 0).toString(16) +
      ':' +
      (b >>> 0).toString(16) +
      ':' +
      text.length
    );
  }
  function bindBank(force = false) {
    if (!force && bank === state.frames && bankLength === state.frames.length)
      return;
    finish();
    bank = state.frames;
    bankLength = state.frames.length;
    currentKeys = keys();
    if (!currentKeys.length) {
      addresses = [];
      return;
    }
    if (!doc.strokes.length && !doc.bindings.length) {
      const size = localSize(),
        cols = Math.max(1, state.gridCols || 1),
        rows = Math.ceil(currentKeys.length / cols);
      const factor = Math.min(
        1,
        16384 / Math.max(cols * size.w, rows * size.h),
      );
      doc.geometry = documentGeometry({
        width: size.w,
        height: size.h,
        count: Math.max(1, currentKeys.length),
        gridWidth: Math.max(1, cols * size.w * factor),
        gridHeight: Math.max(1, rows * size.h * factor),
      });
    }
    // A legacy Lab has explicit frame indices. Assign only a bank of equal size.
    if (doc.geometry === LEGACY_GEOMETRY && !doc.bindings.length) {
      if (currentKeys.length !== 96) {
        addresses = [];
        report(
          'This Lab drawing has 96 frames. Load matching material before editing.',
        );
        return;
      }
      doc.geometry = documentGeometry(doc.geometry);
      doc.bindings = currentKeys.slice();
    }
    const byKey = new Map(doc.bindings.map((key, i) => [key, i]));
    const bindings = doc.bindings.slice();
    addresses = currentKeys.map((key) => {
      if (!byKey.has(key)) {
        byKey.set(key, bindings.length);
        bindings.push(key);
      }
      return byKey.get(key);
    });
    if (bindings.length > 10000) {
      addresses = [];
      report(
        'Drawing frame-address limit reached. Save before starting another document.',
      );
      return;
    }
    doc.bindings = bindings;
    doc.geometry = documentGeometry({
      ...doc.geometry,
      count: Math.max(doc.geometry.count, bindings.length),
    });
    doc._reindex();
    cache.clear();
    geometrySeen = doc.geometry;
    doc.revision++;
    requestRender();
    changed();
  }
  doc.onChange(() => {
    if (geometrySeen !== doc.geometry) {
      cache.clear();
      geometrySeen = doc.geometry;
    }
    requestRender();
    changed();
  });
  function flush() {
    if (active?.engine) cache.setDrafts(active.engine.materialize());
  }
  function finish(cancel = false) {
    pending++;
    if (!active) return;
    const previous = active;
    active = null;
    if (previous.engine) {
      try {
        if (cancel) cache.setDrafts([]);
        else {
          const strokes = previous.engine.finish();
          cache.setDrafts(strokes);
          cache.commitDrafts(strokes);
        }
      } catch (e) {
        cache.setDrafts([]);
        report(e.message);
      }
    }
    requestRender();
    changed();
  }
  function transition() {
    bindBank();
    if (!active?.engine || active.template) return;
    const cells = layout(),
      signature = cells.map((r) => r.cell + ':' + r.id).join('|');
    if (signature !== lastFrameSignature) {
      lastFrameSignature = signature;
      frameTick++;
    }
    try {
      active.engine.transition({
        layout: cells,
        composition: getComposition(),
        tick: frameTick,
        playing: !!state.isPlaying,
      });
    } catch (e) {
      finish();
      report(e.message);
    }
    requestRender();
  }
  function point(e, el) {
    const r =
      el === canvas ? getGeometry().drawRect : el.getBoundingClientRect();
    const sx = el.width / Math.max(1, r.width),
      sy = el.height / Math.max(1, r.height);
    return [
      (e.clientX - r.left) * sx,
      (e.clientY - r.top) * sy,
      e.pointerType === 'pen'
        ? Math.max(0, Math.min(1, e.pressure || 0.5))
        : 0.5,
    ];
  }
  function feed(e) {
    if (!active?.engine) return;
    let p = point(e, active.element);
    if (active.speed)
      p[2] = active.speed.sample(e.clientX, e.clientY, e.timeStamp);
    if (e.shiftKey) {
      const a = active.anchor,
        dx = p[0] - a[0],
        dy = p[1] - a[1];
      if (Math.abs(dx) > Math.abs(dy)) p[1] = a[1];
      else p[0] = a[0];
    }
    active.engine.feed(p);
  }
  async function fill(args) {
    const seq = ++pending,
      revision = doc.revision;
    try {
      const s = await createFill({
        document: doc,
        ...args,
        cancelled: () => seq !== pending || revision !== doc.revision,
      });
      if (seq === pending && revision === doc.revision) doc.addGesture([s]);
    } catch (e) {
      if (seq === pending) report(e.message);
    }
    requestRender();
  }
  function start(e, el) {
    if (!state.drawMode || ![0, 1, 2, 5].includes(e.button)) return;
    if (
      e.pointerType === 'touch' &&
      (pen !== null || performance.now() - lastPen < 350)
    )
      return;
    if (e.pointerType === 'pen') {
      lastPen = performance.now();
      pen = e.pointerId;
      if (active?.type === 'touch') finish();
      for (const [id, p] of pointers)
        if (p.type === 'touch') pointers.delete(id);
      nav = null;
      suppressedTouch = false;
    }
    bindBank();
    if (!addresses.length) return;
    const p = point(e, el);
    pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      type: e.pointerType,
    });
    const touches = [...pointers.values()].filter((p) => p.type === 'touch');
    try {
      el.setPointerCapture(e.pointerId);
    } catch {}
    e.preventDefault();
    e.stopPropagation();
    if (touches.length >= 2) {
      const cancel =
        active?.engine &&
        performance.now() - active.started < 90 &&
        active.engine.samples < 3;
      finish(cancel);
      suppressedTouch = true;
      nav = navState(touches);
      return;
    }
    if (active || suppressedTouch) return;
    const erase =
      e.pointerType === 'pen' && (e.button === 5 || Boolean(e.buttons & 32));
    if (
      isLocked() ||
      (e.button !== 0 && !erase) ||
      (e.pointerType === 'touch' && state.drawWithFinger === false)
    ) {
      active = {
        mode: 'pan',
        element: el,
        pointer: e.pointerId,
        previous: [e.clientX, e.clientY],
      };
      return;
    }
    const template = el === templateCanvas,
      t = template ? 'tpl' : target(),
      cells = template
        ? [{ cell: 0, id: addresses[0], x: 0, y: 0, w: el.width, h: el.height }]
        : layout();
    const composition = template ? cells[0] : getComposition(),
      hit = cells.find(
        (r) =>
          p[0] >= r.x && p[1] >= r.y && p[0] <= r.x + r.w && p[1] <= r.y + r.h,
      );
    if (state.brushType === 'fill' && !erase && !state.drawEraser) {
      const r = t === 'bg' ? composition : hit;
      if (!r) return;
      const surface =
          t === 'bg' ? 'bg-' + view() : t === 'tpl' ? 'tpl' : 'frame-' + r.id,
        ext = doc.size(surface);
      active = {
        mode: 'fill',
        type: e.pointerType,
        element: el,
        pointer: e.pointerId,
        anchor: p,
        args: {
          surface,
          x: ((p[0] - r.x) / r.w) * ext.w,
          y: ((p[1] - r.y) / r.h) * ext.h,
          color: state.drawColor,
          opacity: state.drawOpacity,
        },
      };
      return;
    }
    const frameSize = localSize(),
      base = cells[0];
    if (!base) return;
    const screenScale =
      (el === canvas
        ? getGeometry().scaleX
        : el.width / el.getBoundingClientRect().width) *
      Math.max(0.001, state.scale);
    const size =
      t === 'bg'
        ? (state.drawSize * screenScale * doc.size('bg-' + view()).w) /
          composition.w
        : (state.drawSize * frameSize.w) / (state.previewCellW || 240);
    const brush = {
      size: Math.max(1, Math.min(2048, size)),
      color: state.drawColor,
      opacity: state.drawOpacity,
      erase: erase || !!state.drawEraser,
      pressure:
        (e.pointerType === 'pen' && state.drawPressure !== false) ||
        !!state.drawSpeed,
      smoothing: state.drawSmoothing ?? 0.5,
      streamline: state.drawStabilizer ?? 0.5,
      simulatePressure: false,
      type: state.brushType === 'spray' ? 'spray' : 'round',
      softness: state.edgeSoftness || 0,
      seed: crypto.getRandomValues(new Uint32Array(1))[0],
      scatter: state.sprayScatter ?? 1.5,
      dotScale: state.sprayDotScale ?? 0.5,
      density: state.sprayDensity ?? 1,
    };
    active = {
      mode: 'draw',
      element: el,
      template,
      type: e.pointerType,
      pointer: e.pointerId,
      anchor: p,
      started: performance.now(),
      speed:
        state.drawSpeed &&
        !(e.pointerType === 'pen' && state.drawPressure !== false)
          ? new SpeedPressure()
          : null,
      engine: new DrawingGesture({
        document: doc,
        brush,
        target: t,
        view: template ? 'single' : view(),
        layout: cells,
        composition,
        frameSize,
        oneFrame: template || !!state.drawOneFrame,
        longStroke: !!state.drawLongStroke,
        trail: state.longStrokeFade ?? 8,
        tick: frameTick,
        playing: !template && !!state.isPlaying,
      }),
    };
    try {
      feed(e);
      requestRender();
    } catch (error) {
      finish(true);
      report(error.message);
    }
  }
  function navState(t) {
    return {
      distance: Math.max(1, Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y)),
      x: (t[0].x + t[1].x) / 2,
      y: (t[0].y + t[1].y) / 2,
    };
  }
  function move(e, el) {
    if (e.pointerType === 'pen') lastPen = performance.now();
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { ...prev, x: e.clientX, y: e.clientY });
    const touches = [...pointers.values()].filter((p) => p.type === 'touch');
    if (nav && touches.length >= 2) {
      const next = navState(touches);
      navigate({
        factor: next.distance / nav.distance,
        x: nav.x,
        y: nav.y,
        dx: next.x - nav.x,
        dy: next.y - nav.y,
      });
      nav = next;
      e.preventDefault();
      return;
    }
    if (!active || active.pointer !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    if (active.mode === 'pan') {
      navigate({
        dx: e.clientX - active.previous[0],
        dy: e.clientY - active.previous[1],
      });
      active.previous = [e.clientX, e.clientY];
      return;
    }
    if (active.mode === 'fill') {
      const p = point(e, el);
      if (Math.hypot(p[0] - active.anchor[0], p[1] - active.anchor[1]) > 8)
        finish(true);
      return;
    }
    try {
      const batch = e.getCoalescedEvents?.();
      for (const sample of batch?.length ? batch : [e]) feed(sample);
      requestRender();
    } catch (error) {
      finish();
      report(error.message);
    }
  }
  function end(e, commitFill = false) {
    if (active?.pointer === e.pointerId) {
      const args = commitFill && active.mode === 'fill' ? active.args : null;
      finish();
      if (args) fill(args);
    }
    pointers.delete(e.pointerId);
    if (pen === e.pointerId) {
      pen = null;
      lastPen = performance.now();
    }
    if (![...pointers.values()].some((p) => p.type === 'touch')) {
      suppressedTouch = false;
      nav = null;
    }
  }
  for (const el of [canvas, templateCanvas].filter(Boolean)) {
    el.addEventListener('pointerdown', (e) => start(e, el));
    el.addEventListener('pointermove', (e) => move(e, el));
    el.addEventListener('pointerup', (e) => end(e, true));
    el.addEventListener('pointercancel', (e) => end(e));
    el.addEventListener('lostpointercapture', (e) => end(e));
  }
  window.addEventListener('blur', () => {
    finish();
    pointers.clear();
    nav = null;
    pen = null;
    suppressedTouch = false;
  });
  function paintFrame(ctx, i, rect, dpr = 1) {
    const surface = frameSurface(i);
    if (state.showTemplateDrawing) cache.draw(ctx, 'tpl', rect, dpr);
    if (surface) cache.draw(ctx, surface, rect, dpr);
  }
  function paintBackground(ctx, rect, clip, mode = view(), dpr = 1) {
    cache.draw(ctx, 'bg-' + mode, rect, dpr, clip || rect);
  }
  function bgBounds(mode = view()) {
    let b = null;
    for (const i of doc.instances.values())
      if (i.surface === 'bg-' + mode && !i.brush.erase) b = union(b, i.box);
    return b;
  }
  function clearTarget() {
    finish();
    const t = target();
    doc.replaceSurfaces(
      t === 'bg'
        ? ['bg-' + view()]
        : t === 'tpl'
          ? ['tpl']
          : [...doc.index.keys()].filter((k) => k.startsWith('frame-')),
    );
  }
  function bake() {
    finish();
    bindBank();
    const group = makeComposite(
      doc,
      'tpl',
      [...new Set(addresses)].map((i) => 'frame-' + i),
    );
    if (group) doc.replaceSurfaces(['tpl'], [group]);
  }
  function undo() {
    finish();
    if (doc.undo()) {
      bank = null;
      bindBank();
      cache.clear();
    }
  }
  function redo() {
    finish();
    if (doc.redo()) {
      bank = null;
      bindBank();
      cache.clear();
    }
  }
  function save() {
    finish();
    bindBank();
    const blob = new Blob([doc.serialize()], { type: 'application/json' }),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = 'TimeGrid-drawing.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function openText(text) {
    const candidate = StrokeDocument.parse(text);
    finish();
    doc.replaceDocument(candidate);
    bank = null;
    bindBank();
    cache.clear();
  }
  async function openFile(file) {
    if (!file) return;
    if (file.size > LIMITS.bytes) throw Error('Drawing file is too large.');
    openText(await file.text());
  }
  function saveSlot(index) {
    finish();
    const json = doc.serialize();
    if (
      slots.reduce(
        (sum, s, i) => sum + (i === index ? json.length : s?.length || 0) * 2,
        0,
      ) > LIMITS.bytes
    )
      throw Error('Slot memory limit reached. Save a drawing file.');
    slots[index] = json;
    changed();
  }
  function loadSlot(index) {
    if (slots[index]) openText(slots[index]);
  }
  function reset() {
    finish();
    doc.clear();
    doc.undoStack = [];
    doc.redoStack = [];
    cache.clear();
    requestRender();
  }
  return {
    get document() {
      return doc;
    },
    cache,
    slots,
    bindBank,
    layout,
    localSize,
    frameSurface,
    flush,
    finish,
    transition,
    paintFrame,
    paintBackground,
    bgBounds,
    clearTarget,
    bake,
    undo,
    redo,
    save,
    openFile,
    openText,
    saveSlot,
    loadSlot,
    reset,
    paintTemplate: (ctx, rect, dpr = 1) => cache.draw(ctx, 'tpl', rect, dpr),
    paintOnion(ctx, index, rect, dpr = 1) {
      if (!state.drawMode || state.drawTarget !== 'frame' || !state.drawOnion)
        return;
      ctx.save();
      ctx.globalAlpha = 0.35;
      for (const i of [index - 1, index + 1]) {
        const surface = frameSurface(i);
        if (surface) cache.draw(ctx, surface, rect, dpr);
      }
      ctx.restore();
    },
    get hasInk() {
      return doc.strokes.length > 0 || !!active?.engine;
    },
    get busy() {
      return !!active;
    },
  };
}
