import {
  createStroke,
  paintStroke,
  bounds,
  union,
  surfaceSize,
} from './stroke-document.mjs';

// A fill is computed once in document coordinates, never from the preview proxy.
// Only occupied horizontal runs are retained. No frame-sized bitmap survives it.
const MAX_PIXELS = 4194304;
const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
export async function createFill({
  document: doc,
  surface,
  x,
  y,
  color,
  opacity,
  cancelled = () => false,
}) {
  const bg = surface.startsWith('bg-');
  let step = bg ? 1 : 0.5;
  const extent = doc.size(surface);
  let area = bg ? null : { x: -2, y: -2, w: extent.w + 4, h: extent.h + 4 };
  if (bg) {
    for (const item of doc.instances.values())
      if (item.surface === surface && !item.brush.erase)
        area = union(area, item.box);
    if (!area) throw Error('Fill: draw a closed shape first.');
    // Exterior BG is sparse too. Refuse an unclosed search window, never seal its edge.
    const left = Math.max(Math.floor(area.x) - 2, Math.floor(x) - 1024);
    const top = Math.max(Math.floor(area.y) - 2, Math.floor(y) - 1024);
    const right = Math.min(
      Math.ceil(area.x + area.w) + 2,
      Math.floor(x) + 1024,
    );
    const bottom = Math.min(
      Math.ceil(area.y + area.h) + 2,
      Math.floor(y) + 1024,
    );
    area = { x: left, y: top, w: right - left, h: bottom - top };
  }
  // Square/custom frames also respect the temporary-mask budget.
  if (!bg && Math.ceil(area.w / step) * Math.ceil(area.h / step) > MAX_PIXELS)
    step = 1;
  const w = Math.ceil(area.w / step),
    h = Math.ceil(area.h / step);
  if (
    w < 1 ||
    h < 1 ||
    w * h > MAX_PIXELS ||
    x <= area.x ||
    y <= area.y ||
    x >= area.x + area.w ||
    y >= area.y + area.h
  )
    throw Error('Fill: click inside a closed drawing.');
  const check = () => {
    if (cancelled()) throw Error('Fill cancelled because the drawing changed.');
  };
  const canvas = window.document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let deadline = performance.now() + 8;
  try {
    ctx.setTransform(1 / step, 0, 0, 1 / step, -area.x / step, -area.y / step);
    if (!bg) {
      ctx.beginPath();
      ctx.rect(0, 0, extent.w, extent.h);
      ctx.clip();
    }
    for (const item of doc.query(surface, area)) {
      paintStroke(ctx, item, undefined, area, bg);
      if (performance.now() > deadline) {
        await pause();
        check();
        deadline = performance.now() + 8;
      }
    }
    const rgba = ctx.getImageData(0, 0, w, h).data;
    canvas.width = canvas.height = 0;
    const seed =
      Math.floor((y - area.y) / step) * w + Math.floor((x - area.x) / step);
    if (rgba[seed * 4 + 3] >= 8)
      throw Error('Fill: click the empty interior, not the outline.');
    const seen = new Uint8Array(w * h),
      queue = new Uint32Array(w * h);
    let read = 0,
      write = 1;
    queue[0] = seed;
    seen[seed] = 1;
    while (read < write) {
      const i = queue[read++],
        col = i % w;
      if (col === 0 || col === w - 1 || i < w || i >= w * (h - 1))
        throw Error(
          bg
            ? 'Fill: outline is open or exceeds the 2048 px BG search area.'
            : 'Fill: outline is open. Close the gap first.',
        );
      for (const n of [i - 1, i + 1, i - w, i + w]) {
        if (!seen[n] && rgba[n * 4 + 3] < 8) {
          seen[n] = 1;
          queue[write++] = n;
        }
      }
      if ((read & 8191) === 0 && performance.now() > deadline) {
        await pause();
        check();
        deadline = performance.now() + 8;
      }
    }
    // One sample of overlap into the ink removes an antialiasing hairline.
    // Do not expand through transparent pixels, so narrow holes remain holes.
    for (let i = 0; i < write; i++) {
      const at = queue[i];
      for (const n of [at - 1, at + 1, at - w, at + w])
        if (!seen[n] && rgba[n * 4 + 3] >= 8) seen[n] = 2;
      if ((i & 8191) === 0 && performance.now() > deadline) {
        await pause();
        check();
        deadline = performance.now() + 8;
      }
    }
    const runs = [];
    let minX = w,
      minY = h,
      maxX = 0,
      maxY = 0;
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; ) {
        if (!seen[row * w + col]) {
          col++;
          continue;
        }
        const start = col;
        while (col < w && seen[row * w + col]) col++;
        runs.push([row, start, col - start]);
        minX = Math.min(minX, start);
        minY = Math.min(minY, row);
        maxX = Math.max(maxX, col);
        maxY = Math.max(maxY, row + 1);
        if (runs.length > 100000) throw Error('Fill area is too complex.');
      }
      if (performance.now() > deadline) {
        await pause();
        check();
        deadline = performance.now() + 8;
      }
    }
    check();
    const f = {
      x: area.x + minX * step,
      y: area.y + minY * step,
      width: maxX - minX,
      height: maxY - minY,
      step,
      runs: runs.map(([r, c, n]) => [r - minY, c - minX, n]),
    };
    const s = createStroke({
      id: doc.newId(),
      surface,
      points: [[x, y, 0.5]],
      color,
      opacity,
      size: 1,
      overflow: bg,
      space: extent,
    });
    s.renderer = 'fill-runs-v1';
    s.fill = f;
    s.outline = [
      [f.x, f.y],
      [f.x + f.width * step, f.y],
      [f.x + f.width * step, f.y + f.height * step],
      [f.x, f.y + f.height * step],
    ];
    s.box = bounds(s.outline, 1);
    return s;
  } finally {
    canvas.width = canvas.height = 0;
  }
}
