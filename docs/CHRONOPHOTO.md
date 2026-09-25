# Chronophoto Architecture Notes

Обновлено: 2026-09-25

## Depth animation

`Animate Depth` is a collapsible key table inside Chronophoto. Its switch enables
animation independently of the disclosure arrow. The main Chronophoto switch
still controls whether the effect is visible.

- Frame numbers are **one-based indices in the sampled frame bank**, not original
  video frame numbers or elapsed export ticks. Each grid cell evaluates the curve
  at its own displayed frame. Repeated loops reuse it; reverse playback traverses
  it backwards.
- First activation creates keys at frame 1 / midpoint / last frame with
  0 / 100 / 0 percent. One-frame clips get a single 100% key; two-frame clips get
  0 / 100%. There are no duplicate indices or artificial key count limits.
- Percent scales the existing Frame Depth. Linear, Smooth (smoothstep per segment),
  and Step interpolation are available. Values before/after the key range hold
  the nearest key. Matching first/last values produce a continuous loop boundary.
- Add Key uses the primary cell's current frame and interpolated value. Existing
  keys are focused instead of duplicated. Frame edits sort the table, and duplicate
  frame edits are rejected. The small arrow in each row seeks the primary cell to
  that frame; frames skipped by the playback pattern are reported.
- Disabling animation preserves keys. An empty table uses static Frame Depth;
  deleting everything does not recreate defaults. There is no Reset control.
- If resampling shortens the frame bank, keys retain their indices, including
  those beyond its end. The table reports these keys instead of silently deleting
  them. The curve remains indexed to the prepared frames, not source timestamps.
- Keys live in application state for the current session; this does not add project
  files or persistence across page reloads.

`src/js/chrono-animation.mjs` contains pure curve and opacity calculations.
Fractional depth blends the alpha profiles of the neighboring integer stacks,
including Cascade/Mirror, so both the additional copy and the existing copies
change continuously. At integer depths the existing opacity profiles are preserved.
Clean Loop still clips ghost history, so the number of visible copies can be lower
than the requested depth at the start of a loop.

DOM preview, canvas video/still/PNG-sequence export, and the Frame Diff visual
source use the shared calculations with an explicit displayed frame index.
The table/editor is isolated in `src/js/chrono-animation-ui.mjs`.

Validation: `npm test` runs the pure calculation tests. The optional browser suite
`tests/chrono-animation.browser.cjs` runs against Vite (`TEST_URL`, default
`http://127.0.0.1:5180`), using Playwright (`PLAYWRIGHT_MODULE` if not installed in
the project) and Edge (`BROWSER_CHANNEL` to override). It checks table interactions,
frame-based Grid/Single behavior, alpha parity, real MP4 downloads and PNG export.
Its response-only test hooks never modify the app on disk. Artifacts are written
to a temporary `timegrid-chrono-*` directory.

## Что делает Chronophoto

Chronophoto рисует стек предыдущих фаз поверх текущего кадра. Это не просто визуальный фильтр, а temporal effect: он зависит от текущего tick, направления анимации, phase offset ячейки, depth, stride и порядка кадров.

Текущие основные параметры:

- `chronoEnabled` — включает overlay;
- `chronoBlend` — canvas/global или CSS blend mode;
- `chronoDepth` — сколько ghost-слоёв рисовать;
- `chronoOpacity` — базовая opacity каждого ghost-слоя;
- `chronoCascade` — включает спад opacity по depth;
- `chronoCascadeMirror` — меняет форму cascade: центр плотнее, края мягче;
- `chronoCascadeConst` — сколько слоёв остаётся на полной opacity перед спадом;
- `chronoStride` — шаг между ghost-кадрами;
- `chronoCleanLoop` — обрезает ghost-историю на начале цикла.

## Где это находится в коде

UI и state:

- `index.html` — секция `CHRONOPHOTO`;
- `src/js/main.js` — поля `state.chrono*`;
- `toggleChronophoto`, `chronoBlend`, `chronoDepth`, `chronoOpacity`, `toggleChronoCascade`, `toggleChronoCleanLoop`.

Preview:

- `computeCascadeOpacity(step, depth, alphaBase)`;
- `buildChronoGhostIndices(tick, baseOffset, frameCount, dir, shuffle)`;
- `updateChronoForItem(item, ghostIndices)`;
- вызов из `updateAllCells()`.

Canvas/export:

- `buildChronoGhostIndicesRaw(...)`;
- `buildChronoGhostIndicesStill(frameIdx, n)`;
- `drawChronophotoStack(ctx, ghostIndices, x, y, w, h)`;
- вызовы из MP4/grid/single и PNG/JPEG export paths.

## Как работает Clean Loop сейчас

Фактическая логика:

```js
ghostTick = tick - step * stride

if (chronoCleanLoop && ghostTick < 0) {
  ghost = null
} else {
  ghost = resolve frame from ghostTick
}
```

То есть Clean Loop не делает crossfade. Он запрещает Chronophoto брать ghost-кадры из конца прошлого цикла, когда текущий tick находится в начале цикла.

Пример: `depth = 5`, `stride = 1`, `tick = 0`.

- Clean Loop off: ghost stack может стать `last, last-1, ...`;
- Clean Loop on: все ghost-слои с отрицательным `ghostTick` становятся `null`.

Это полезно, если конец и начало клипа визуально разные и wrapped ghosts выглядят грязно. Но это не решает скачок базового кадра `last -> first`.

## Почему скачок остаётся

На границе лупа меняются две вещи:

1. Базовый кадр резко переключается с последнего на первый.
2. Chronophoto stack резко пересобирается.

Clean Loop влияет только на пункт 2. Он даже может сделать стек чище, но основной визуальный jump остаётся.

Если нужен действительно плавный loop, нужно подмешивать начало клипа ещё до шва, на последних кадрах цикла.

## Режим Seam Blend

Новый режим лучше не смешивать с Clean Loop. Рабочее название:

- `Seam Blend`

UI-идея:

- `Off`;
- `Chrono only`;
- `Frame + Chrono`;
- `Length: Auto / N`;

`Auto` можно считать как:

```js
seamLength = chronoDepth * chronoStride
```

Поведение:

1. В конце цикла вычислить `seamProgress` от `0` до `1`.
2. До шва постепенно рисовать первые кадры поверх текущих.
3. После перехода на первый кадр визуальное состояние уже близко к нему, поэтому jump меньше.
4. Для Chronophoto можно дополнительно blend’ить wrapped ghost stack с тем же `seamProgress`.

Важно: это художественный loop-smoothing, а не исправление индексации кадров.

## Архитектурный план реализации

Сначала сделать чистую функцию, без UI:

```js
getLoopSeamProgress(tick, frameCount, seamLength, direction)
getSeamBlendFrames(tick, frameCount, seamLength, direction)
getChronoStack({ tick, baseOffset, frameCount, direction, depth, stride, cleanLoop, seamBlend })
```

Затем подключить:

1. Preview DOM path.
2. Canvas path для MP4/WebM.
3. Still export path.

Только после этого добавлять UI.

## Проверочный чеклист

- Forward direction: last -> first with very different frames.
- Pingpong/bounce: не ломать естественный разворот.
- Sequence Mode on/off.
- Frame Target меньше исходного количества кадров.
- Chronophoto on/off.
- Clean Loop on/off.
- Cascade/Mirror on/off.
- PNG/JPEG still export.
- MP4/WebM export.

## Термины

- **Clean Loop** — текущий режим clipping ghost history.
- **Seam Blend** — crossfade/composite на loop seam.
- **Ghost frame** — предыдущий/соседний кадр, наложенный Chronophoto.
- **Base frame** — основной кадр ячейки до overlay.
## 2026-07-03 Seam Blend implementation

`Seam Blend` is now implemented as a separate mode from `Clean Loop`.

State:

- `chronoSeamBlend`: on/off.
- `chronoSeamLength`: manual seam length in frames; `0` means Auto.
- `chronoSeamMode`: `chrono`, `frame-soft`, or `frame-full`.
- `chronoSeamStrength`: max opacity for `chrono` and `frame-soft`.

Auto length:

```js
seamLength = chronoDepth * chronoStride
```

Core helpers in `src/js/main.js`:

- `getChronoSeamBlendInfo(tick, frameCount, opts)`;
- `getChronoSeamForCell(cellIdx, tick, opts)`;
- `drawChronoSeamBlend(ctx, seamInfo, x, y, w, h, frameImages, filterId)`.

Behavior:

- The last `seamLength` ticks of each loop fade toward tick `0`.
- The target is computed per cell, not globally, through `getFrameCellInfo(cellIdx, 0, ...)`.
- Preview uses `.frame-seam-blend` and `.frame-seam-chrono` DOM layers.
- Canvas export draws the same seam mode as preview: ghost-only, soft base+ghost, or full base+ghost.
- `Clean Loop` still only clips wrapped ghost history; it is not a crossfade.

Export coverage:

- MP4 grid and single paths use tick-based seam alpha.
- PNG/JPEG still exports preload seam target images before drawing.
- PNG sequence export applies the single-frame seam path.

## 2026-07-03 Seam Modes v28.14

The first v28.13 implementation could look frozen when the first and last base frames were very different, because it faded the first visible base frame over the loop end.

v28.14 keeps that behavior available as `Frame Full`, but adds safer test modes:

- `Chrono Only`: crossfades the current ghost stack into the wrapped ghost stack and never draws the first base frame.
- `Frame Soft`: draws the first base frame and wrapped ghost stack, capped by `Seam Strength`.
- `Frame Full`: the original full-strength base-frame seam for A/B comparison.

`Chrono Only` is the default. It will not hide a huge `last -> first` base-frame jump by itself, but it should keep Chronophoto continuity without the static-frame freeze artifact.

## 2026-07-04 Simplified Seam Blend v28.24

The mode/strength experiment was removed from the active UI.

Current model:

- `Seam Blend` toggles the feature.
- `Seam Frames` is the only control.
- `1` means: overlay the first frame of the next cycle on the last frame of the current cycle.
- `N` means: overlay the first `N` beginning frames backward across the last `N` ending frames.
- Opacity is automatic and cascades toward the loop seam.

This keeps the feature testable: turn it on, set `Seam Frames = 1`, and the last frame should visibly receive the first frame.

## 2026-07-04 Static Seam Preview v28.25

Seam Blend is now frame-based instead of only tick-based.

- The seam helper receives the displayed `frameIdx` from preview/export paths.
- A static grid cell that already shows an ending frame can show the seam without playback.
- `Seam Frames = 1` maps the visible last frame to frame `0`.
- Larger values map ending frames backward to the corresponding beginning frames with the same automatic cascade.
- Grid rebuilds run a post-build visual sync so DOM seam overlays are created before the animation starts.
