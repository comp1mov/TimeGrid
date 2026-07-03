# Chronophoto Architecture Notes

Обновлено: 2026-06-30

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

## Предлагаемый будущий режим: Seam Blend

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
- **Seam Blend** — будущий режим crossfade/composite на loop seam.
- **Ghost frame** — предыдущий/соседний кадр, наложенный Chronophoto.
- **Base frame** — основной кадр ячейки до overlay.
## 2026-07-03 Seam Blend implementation

`Seam Blend` is now implemented as a separate mode from `Clean Loop`.

State:

- `chronoSeamBlend`: on/off.
- `chronoSeamLength`: manual seam length in frames; `0` means Auto.

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
- Canvas export draws the same target base frame and target Chronophoto stack.
- `Clean Loop` still only clips wrapped ghost history; it is not a crossfade.

Export coverage:

- MP4 grid and single paths use tick-based seam alpha.
- PNG/JPEG still exports preload seam target images before drawing.
- PNG sequence export applies the single-frame seam path.
