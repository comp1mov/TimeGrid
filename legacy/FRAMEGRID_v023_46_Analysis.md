# FRAMEGRID v0.23.46 — Всесторонний архитектурный анализ

---

## 1. Обзор системы

FRAMEGRID — это браузерное приложение для видео-сэмплирования, извлечения кадров и анимации в формате single-file HTML (~11 500 строк). Приложение объединяет несколько крупных подсистем: видео-декодирование, сетку кадров с анимацией, многослойную систему рисования, аудио-секвенсор, систему экспорта и пользовательский интерфейс с боковым меню.

**Технологический стек:** чистый JavaScript (ES6+), HTML5 Canvas API, Web Audio API, MediaRecorder, CSS Grid/Flexbox. Без фреймворков, без сборщиков — всё в одном файле.

---

## 2. Архитектурная карта

### 2.1 Структура файла

| Зона | Строки (прибл.) | Описание |
|------|-----------------|----------|
| CSS | 1–800 | Стили, responsive-breakpoints, draw-palette, template-frame |
| HTML | 800–1855 | DOM-разметка: drop-zone, side-menu, quick-toolbar, canvas overlays |
| State + Init | 1860–2200 | Объект `state`, DOM-кэширование, утилиты |
| Core Logic | 2200–4400 | Grid rendering, frame capture, timecodes, canvas resize, undo |
| Drawing System | 4400–7600 | Многослойная система рисования (BG/TPL/FRM), brush engine, compositing |
| Ref Frame | 6900–7200 | Reference Frame overlay |
| Export | 7600–10200 | PNG/JPEG/MP4/WebM export, metadata bar, resampled video |
| Keyboard/Input | 10250–10600 | Hotkey system, input focus management |
| Audio Sequencer | 10660–11430 | Collision-based sequencer, mic recording, Web Audio playback |
| Perf Meter | 11450–11485 | FPS counter, composite cost tracker |

### 2.2 Ключевые подсистемы

```
┌─────────────────────────────────────────────────┐
│                  FRAMEGRID                        │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │  VIDEO    │  │  GRID    │  │  DRAW SYSTEM  │   │
│  │ Decoder   │→│ Renderer  │←│  (BG/TPL/FRM) │   │
│  └──────────┘  └────┬─────┘  └───────┬───────┘   │
│                     │                │            │
│                     ▼                ▼            │
│              ┌──────────┐  ┌───────────────┐     │
│              │ ANIMATION │  │  COMPOSITOR   │     │
│              │  Engine   │→│  (Canvas)      │     │
│              └────┬─────┘  └───────────────┘     │
│                   │                               │
│         ┌────────┴────────┐                      │
│         ▼                 ▼                      │
│  ┌──────────┐      ┌──────────┐                  │
│  │  AUDIO   │      │  EXPORT  │                  │
│  │ Sequencer│      │  System  │                  │
│  └──────────┘      └──────────┘                  │
└─────────────────────────────────────────────────┘
```

---

## 3. Анализ state management

### 3.1 Текущий подход

Единый мутабельный объект `state` (~100+ полей) работает как глобальное хранилище. Прямые мутации (`state.X = Y`) разбросаны по всему коду без какой-либо системы уведомлений.

### 3.2 Проблемы

**Неконтролируемые мутации.** Любая функция может изменить любое поле state в любой момент. Нет ни проверки, ни логирования изменений. Пример: `state.frameImgScale` мутируется минимум из 4 разных мест (slider oninput, number oninput, reset button, keyboard).

**Отсутствие реактивности.** Изменение состояния не вызывает автоматического обновления UI. Вместо этого после каждой мутации вручную вызываются цепочки функций: `renderGrid() → updateGridHint() → fitToScreen() → compositeAllLayers()`. Если хотя бы один вызов пропущен — рассинхронизация.

**Плоская структура.** 100+ полей в одном объекте без группировки. Поля рисования (`drawColor`, `drawSize`, `drawEraser`, `drawOnion`...), экспорта (`exportQuality`, `exportPaddingPx`, `exportLoops`...), аудио (`audioSeq` — единственный вложенный объект) — всё на одном уровне.

**Приватные/внутренние поля смешаны с данными.** Префикс `_` используется для внутренних (`_uiFps`, `_compAvgMs`, `_audioCtx`, `_audioRec`), но это конвенция, а не защита.

---

## 4. Рендеринг и производительность

### 4.1 Grid Rendering

`renderGrid()` полностью пересоздаёт DOM grid при каждом вызове. Для 100+ кадров это означает удаление и создание сотен DOM-элементов с `<img>`, `<div>` timecode, классами и data-атрибутами.

**Слабые места:**

- Полный DOM rebuild вместо дифференциального обновления. Каждый `renderGrid()` вызывает `framesGrid.innerHTML = ''` (или эквивалент) и строит всё заново.
- `updateAllCells()` вызывается на каждый тик анимации и перебирает все `.frame-item` через `querySelectorAll` — это O(n) DOM-запрос на каждый кадр.
- `getFrameAtPoint()` в drawing-коде также делает `querySelectorAll('.frame-item')` на каждое событие pointer.

### 4.2 Compositing Pipeline

Система compositing (`compositeAllLayers()`) отрисовывает 3 слоя (BG, Template, Frame drawings) поверх grid через overlay canvas. На каждый composite:

1. Clear drawCanvas
2. Render BG layer (один drawImage)
3. Render Ref Frame (итерация по всем cells, drawImage на каждый)
4. Render Template (итерация по всем cells, drawImage на каждый)
5. Render Frame Drawings (итерация по всем cells, drawImage на каждый)

Для грида 8×6 = 48 cells это ~150 вызовов `drawImage` на каждый composite. При animFps=24 это 3600 drawImage/секунду.

### 4.3 Memory Management

**Undo stack хранит полные ImageData.** `DRAW_UNDO_MAX = 8` записей. Для canvas 4000×3000 одна ImageData = ~48 MB. 8 записей = ~384 MB потенциальной памяти только на undo.

**Frame Sheet Canvas** может быть огромным: при 100 кадрах и tile 1920×1080, sheet = ~10×10 tiles = 19200×10800 px. Это 829 мегапикселей — превышает лимиты большинства браузеров.

**`canSnapshotCanvas()`** — хороший guard, но пороги (12M px для touch, 40M px для desktop) могут быть слишком высокими для устройств с ограниченной памятью.

---

## 5. Drawing System

### 5.1 Архитектура слоёв

Четырёхслойная система — сильная сторона приложения:

1. **BG (Background)** — рисование по фону вокруг кадров
2. **Video Frames** — сами кадры видео
3. **TPL (Template)** — overlay рисунок, одинаковый на всех кадрах
4. **FRM (Frame)** — индивидуальные рисунки на каждом кадре (frame sheet)

### 5.2 Проблемы

**getBoundingClientRect() в hot path.** Каждое получение координат рисования вызывает layout recalculation:

```javascript
function getCanvasPoint(e) {
    const rect = drawCanvas.getBoundingClientRect(); // forced layout!
    ...
}
function getFrameAtPoint(point) {
    const items = framesGrid.querySelectorAll('.frame-item'); // DOM query!
    // + getBoundingClientRect() на каждый item в цикле
}
```

При рисовании со скоростью 60+ событий/сек это серьёзный bottleneck.

**Brush stamp cache** (`_brushStampCache`) — правильная идея, но cache key включает цвет, размер, opacity и softness. При плавном изменении размера через slider каждое значение создаёт новый stamp — cache растёт без контроля.

**Long Stroke** система хранит snapshots per-frame (`longStrokeTileSnapshots`) как Map — потенциальная memory leak при длинных сессиях.

---

## 6. Audio Sequencer

### 6.1 Архитектура

Collision-based sequencer: playhead'ы — это статические позиции в grid'е, кадры перемещаются по grid через анимацию, и когда новый кадр "входит" в playhead cell, триггерится звук привязанного sample.

### 6.2 Проблемы

**Monkey-patching core функций:**

```javascript
const _fgOrigRenderGrid = renderGrid;
renderGrid = function() {
    _fgOrigRenderGrid();
    try { audioSyncPlayheads(); } catch (e) {}
    try { audioUpdateChips(); } catch (e) {}
};
```

Это паттерн, который очень хрупкий — функции подменяются глобально, цепочки вызовов непрозрачны, try/catch глотает ошибки.

**AudioContext lifecycle.** `audioEnsureCtx()` создаёт единственный AudioContext, но нет cleanup при отключении — context остаётся suspended, GainNode'ы не отсоединяются.

**Микрофон (AudioWorklet fallback).** Используется устаревший `createScriptProcessor` вместо AudioWorkletNode. ScriptProcessor deprecated и будет удалён из браузеров.

**Recording state machine** (`state._audioRec`) — сложный объект с полями `isRecording`, `requesting`, `holdActive`, `cancelRequested` — фактически state machine без явного определения состояний и переходов.

---

## 7. Export System

### 7.1 Форматы

| Формат | Режим | Технология |
|--------|-------|-----------|
| JPEG grid | snapshot | Canvas → toBlob |
| PNG grid/single | snapshot | Canvas → toBlob |
| MP4 grid/single | animated | mp4-muxer (CDN) |
| WebM A/V | animated | MediaRecorder + canvas.captureStream |
| Resampled video | animated | MediaRecorder + source video audio |
| PNG seq drawings | batch | per-frame canvas export |

### 7.2 Проблемы

**Lazy CDN loading без fallback:**

```javascript
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}
```

При offline-использовании (что логично для standalone HTML tool) все CDN-зависимые экспорты (mp4-muxer) молча сломаются.

**Синхронный metadata bar rendering.** `buildExportMetaText()`, `layoutMetaLinesNoEllipsis()`, `computeExportMetadataHeaderH()` — три прохода по метаданным для каждого экспорта, включая measureText в цикле.

**Export blocking.** Весь UI замирает на время экспорта, так как canvas-операции синхронны. Для больших grid'ов (100+ cells, 4K quality) это может заморозить вкладку на десятки секунд.

---

## 8. UI / UX Architecture

### 8.1 Сильные стороны

- **Responsive design.** Грамотное использование `@media (pointer: coarse)` для touch-устройств, adaptive palette sizing, snap tolerance для iPad drawing.
- **Keyboard accessibility.** Обширная система hotkeys с правильной обработкой typing context.
- **Progressive disclosure.** Collapsible menu sections, контекстная toolbar, draw palette с drag.

### 8.2 Слабые места

**Inline event handlers mixed with addEventListener.** В коде используются оба подхода:

```javascript
// Стиль 1: direct property
selectionModeSelect.onchange = () => { ... };
fontSizeSlider.oninput = () => { ... };

// Стиль 2: addEventListener
btn.addEventListener('click', () => { ... });
btn.addEventListener('pointerdown', startHold);
```

При `onchange = fn` предыдущий handler теряется. При наличии модулей (audio sequencer monkey-patches) это создаёт риск перезаписи.

**Menu section controls.** Каждый slider/toggle/input инициализируется индивидуально, ~200 строк повторяющегося boilerplate:

```javascript
if (frameImgScaleSlider) {
    frameImgScaleSlider.oninput = () => {
        state.frameImgScale = ...;
        if (frameImgScaleNum) frameImgScaleNum.value = ...;
        applyFrameImgTransform();
    };
}
if (frameImgScaleNum) {
    frameImgScaleNum.oninput = () => {
        ...
        if (frameImgScaleSlider) frameImgScaleSlider.value = ...;
        applyFrameImgTransform();
    };
}
```

Этот паттерн повторяется для каждого slider+number pair (offset X, offset Y, scale, opacity, ref frame controls...).

---

## 9. Качество кода

### 9.1 Хорошие практики

- **Defensive coding.** Повсеместные `try/catch`, `Number.isFinite()` checks, `|| 0` fallbacks — код устойчив к edge cases.
- **DPR awareness.** Корректная обработка devicePixelRatio для canvas-координат и brush sizing.
- **iOS/Safari compatibility.** Специфичные workaround'ы: double-rAF для seeked, gesture prevention, `100dvh`/`100svh` fallbacks.
- **Debug console.** Встроенный `dbg()` с ограничением 50 строк — полезно для iPad debugging.

### 9.2 Проблемы

**Отсутствие модульности.** 11 500 строк в одном IIFE. Функции обращаются к переменным через замыкание — всё связано со всем.

**Magic numbers.** Примеры по коду:

```javascript
const slow = 10;       // logo animation speed
const snapCss = _isCoarsePointer ? 22 : 12;  // snap tolerance
const thr = 0.003;     // audio silence threshold
const limit = _isCoarsePointer ? 12_000_000 : 40_000_000;  // pixel limit
```

**Dead code и legacy paths.** `frameDrawings: {}` (объект per-frame) определён в state, но фактически используется frameSheetCanvas. Комментарии вроде `// logging now integrated into original functions` указывают на не-вычищенный рефакторинг.

**Variable shadowing.** Несколько переменных `frameW` определены в разных scope'ах с разными значениями (export, info panel, timecode). Функция `getTimecodeFramePadWidth()` присваивает `const frameW = ...`, и в том же scope'е DOM-элемент `frameImgScaleSlider` — работает только благодаря замыканию.

---

## 10. Точки роста и оптимизация

### 10.1 Высокий приоритет (Performance)

**A. Кэширование геометрии grid.**
Вместо `querySelectorAll` + `getBoundingClientRect()` на каждый tick/pointer event — кэшировать массив `{ x, y, w, h, frameIdx }` при `renderGrid()` и инвалидировать при resize/zoom.

```
Ожидаемый эффект: -60-80% CPU в drawing hot path
Сложность: средняя
```

**B. Дифференциальное обновление cells.**
`updateAllCells()` может обновлять только те cells, чей frameIdx реально изменился на текущем тике. Хранить `prevFrameIdx` per-cell и сравнивать.

```
Ожидаемый эффект: -40-60% DOM operations при анимации
Сложность: средняя
```

**C. OffscreenCanvas для compositing.**
Перенести `compositeAllLayers()` в Web Worker с OffscreenCanvas. Основной поток освобождается для UI.

```
Ожидаемый эффект: устранение jank при compositing
Сложность: высокая (SharedArrayBuffer для frame data)
```

**D. Ограничение undo memory.**
Вместо полных ImageData — diff-based undo (хранить только изменённые регионы) или использовать compression (pako/zlib).

```
Ожидаемый эффект: -80% memory на undo stack
Сложность: средняя
```

### 10.2 Средний приоритет (Architecture)

**E. Event bus / простая реактивность.**
Минимальная pub/sub система для state changes:

```javascript
// Концепт
state.set('animFps', 24); // автоматически вызывает все подписчики
state.on('animFps', (val) => { updateMetaAnimFps(); });
```

Это устранит ручные цепочки `renderGrid() → updateGridHint() → fitToScreen()`.

```
Сложность: средняя, но фундаментальный рефакторинг
```

**F. Модульное разделение.**
Разбить monolith на модули через ES modules или хотя бы именованные IIFE:

```
core/state.js     — state + reactive proxy
core/grid.js      — grid rendering + cell management  
core/animation.js — tick engine + patterns
draw/engine.js    — brush, compositing, undo
draw/layers.js    — BG/TPL/FRM layer management
audio/sequencer.js — collision sequencer + Web Audio
export/image.js   — PNG/JPEG export
export/video.js   — MP4/WebM export
ui/menu.js        — side menu controls binding
ui/hotkeys.js     — keyboard shortcuts
```

При необходимости сохранить single-file distribution — использовать rollup/esbuild для бандлинга.

**G. Замена monkey-patching на хуки.**
Вместо:
```javascript
const _fgOrigRenderGrid = renderGrid;
renderGrid = function() { _fgOrigRenderGrid(); audioSyncPlayheads(); };
```
Использовать систему хуков:
```javascript
hooks.after('renderGrid', () => { audioSyncPlayheads(); audioUpdateChips(); });
```

### 10.3 Низкий приоритет (Polish)

**H. Unified slider binding.**
Создать утилиту `bindSliderPair(slider, numInput, stateKey, opts)` вместо 200+ строк boilerplate.

**I. AudioWorklet вместо ScriptProcessor.**
Заменить `createScriptProcessor` на `AudioWorkletNode` для recording. ScriptProcessor работает в main thread и deprecated.

**J. Service Worker для offline.**
CDN-зависимости (mp4-muxer) можно pre-cache через Service Worker для полностью offline operation.

**K. Typed constants.**
Заменить magic numbers на именованные константы:

```javascript
const LOGO_ANIM_DIVISOR = 10;
const SNAP_TOLERANCE_TOUCH = 22;
const SNAP_TOLERANCE_MOUSE = 12;
const SILENCE_THRESHOLD = 0.003;
const CANVAS_PIXEL_LIMIT_TOUCH = 12_000_000;
const CANVAS_PIXEL_LIMIT_DESKTOP = 40_000_000;
```

---

## 11. Сводная таблица рисков

| Риск | Вероятность | Влияние | Где проявляется |
|------|------------|---------|-----------------|
| OOM при большом grid + undo | Высокая | Crash вкладки | frameSheet + undo stack |
| Jank при анимации 48+ cells | Высокая | UX degradation | compositeAllLayers(), updateAllCells() |
| Silent failure при offline export | Средняя | Потеря работы | loadScript() CDN |
| ScriptProcessor deprecation | Средняя | Mic recording сломается | audioStartRecord() |
| State desync (пропущен render) | Средняя | Visual bugs | Любая мутация state без полной цепочки обновлений |
| Brush cache memory leak | Низкая | Slow GC pauses | _brushStampCache (при интенсивном рисовании) |
| Long stroke snapshot leak | Низкая | Gradual memory growth | longStrokeTileSnapshots |

---

## 12. Заключение

FRAMEGRID — это впечатляющий standalone инструмент, собранный с глубоким пониманием Canvas API, Web Audio и browser quirks. Архитектура "всё в одном файле" оправдана философией автономных micro-tools, но при текущем размере (11.5k строк) создаёт существенные барьеры для поддержки и развития.

**Главные архитектурные победы:**
- Многослойная drawing-система с корректной обработкой DPR
- Robust iOS/Safari compatibility
- Flexible export pipeline (6 форматов)
- Collision-based audio sequencer — уникальная механика

**Главные архитектурные вызовы:**
- Монолитная структура без модулей
- Императивный state management без реактивности
- DOM queries в hot paths (animation + drawing)
- Неконтролируемое потребление памяти при масштабировании

Рекомендуемая стратегия развития: **инкрементальная оптимизация**, начиная с кэширования геометрии (пункт A) и diff-based cell updates (пункт B) — они дадут наибольший performance boost при минимальном рефакторинге. Модуляризацию (пункт F) стоит вводить постепенно, при добавлении новых подсистем.
