# FRAMEGRID v0.16 - План рефакторинга

## Проблемы v0.15

### Критические
1. **iPad** - при открытии меню пропадают изображения
2. **iPad** - падает разрешение фотографий
3. **iPad** - рисование в режиме FRM не работает
4. **Архитектура** - кадры и рисунки живут отдельной жизнью, не связаны
5. **Код** - 3900+ строк, сложно отлаживать

### Причины
- Touch handlers для рисования используют другую систему (frameDrawings) чем mouse handlers (frameSheet)
- fitToScreen() вызывается при открытии меню и ломает отображение
- Много переопределений функций в конце файла
- devicePixelRatio умножение может убивать память на iPad

---

## Архитектура v0.16

### Принцип: Модульность + Единый State

```
┌─────────────────────────────────────────────────────────┐
│                      STATE                               │
│  - frames[] (extracted from video)                       │
│  - drawings{} (linked to frame indices)                  │
│  - view (scale, pan, mode)                               │
│  - animation (tick, fps, direction)                      │
│  - ui (menu, toolbar, palette)                           │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                    MODULES                               │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │  Video   │  │   Grid   │  │ Animation│  │ Drawing  │ │
│  │ Loader   │  │ Renderer │  │  Player  │  │  System  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │  Export  │  │   UI     │  │  Touch   │  │  Mouse   │ │
│  │  Engine  │  │ Manager  │  │ Handler  │  │ Handler  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Новая система кадров

### Параметры (вместо cellSize)

```javascript
state.frameSelection = {
  total: 240,        // сколько кадров извлечено из видео
  visible: 1,        // показываем каждый N-й кадр (1=все, 2=каждый второй)
  offset: 0,         // смещение между ячейками при анимации
  startFrame: 0,     // начальный кадр диапазона
  endFrame: 239      // конечный кадр диапазона
};
```

### Логика отображения
```javascript
// Количество видимых ячеек
const cellCount = Math.ceil(total / visible);

// Какой кадр показывать в ячейке N при tick T
function getFrameForCell(cellIdx, tick) {
  const baseFrame = cellIdx * visible; // стартовый кадр ячейки
  const frameOffset = offset * cellIdx; // смещение для волны
  return (baseFrame + tick + frameOffset) % total;
}
```

### Преимущества
- Простая математика
- Легко понять что происходит
- Не тормозит при больших значениях

---

## Новая система рисования

### Единый Drawing Layer

```javascript
state.drawing = {
  // Background - рисунок вокруг кадров (не привязан к кадрам)
  background: {
    canvas: null,
    ctx: null
  },
  
  // Template - накладывается на ВСЕ кадры одинаково
  template: {
    canvas: null,  // размер = один кадр
    ctx: null
  },
  
  // Per-frame - отдельный рисунок для каждого кадра
  frames: {
    // frameIndex: { canvas, ctx }
    0: { canvas, ctx },
    5: { canvas, ctx },
    // ...только те кадры где есть рисунок
  }
};
```

### Единый Input Handler

```javascript
// Один обработчик для mouse И touch
function handlePointerStart(x, y, pointerId) {
  // Определяем target
  const hit = getFrameAtPoint(x, y);
  
  // Начинаем stroke
  currentStroke = {
    id: pointerId,
    target: state.drawTarget, // 'background' | 'template' | 'frame'
    frameIdx: hit?.frameIdx,
    points: [{x, y, u: hit?.u, v: hit?.v}],
    color: state.drawColor,
    size: state.drawSize,
    eraser: state.drawEraser
  };
}

function handlePointerMove(x, y, pointerId) {
  if (!currentStroke || currentStroke.id !== pointerId) return;
  
  // Добавляем точку
  const hit = getFrameAtPoint(x, y);
  currentStroke.points.push({x, y, u: hit?.u, v: hit?.v});
  
  // Рисуем
  drawStrokeSegment(currentStroke);
}

function handlePointerEnd(pointerId) {
  if (!currentStroke || currentStroke.id !== pointerId) return;
  
  // Сохраняем stroke
  commitStroke(currentStroke);
  currentStroke = null;
}

// Привязываем к событиям
canvas.onpointerdown = e => handlePointerStart(e.clientX, e.clientY, e.pointerId);
canvas.onpointermove = e => handlePointerMove(e.clientX, e.clientY, e.pointerId);
canvas.onpointerup = e => handlePointerEnd(e.pointerId);
```

### Long Stroke Mode

```javascript
state.longStroke = {
  enabled: false,
  fade: 8,  // кадров до затухания (0 = без затухания)
  path: [], // накопленные точки {u, v}
  framesDrawn: new Set() // на какие кадры уже нарисовали
};

// При смене кадра в анимации
function onFrameChange(newFrameIdx) {
  if (state.longStroke.enabled && currentStroke) {
    // Рисуем накопленный path на новый кадр
    drawPathOnFrame(newFrameIdx, state.longStroke.path);
    state.longStroke.framesDrawn.add(newFrameIdx);
  }
}
```

---

## UI / Toolbar

### Порядок кнопок
```
[GRID/1] [FIT] [|◀] [◀] [▶] [▶|] [●DRAW] [≡MENU]
```

### Клавиши
- `G` - Grid view
- `1` - Single frame view  
- `F` - Fit to screen
- `Space` - Play/Pause
- `←` `→` - Prev/Next frame
- `Home` - Reset to start
- `D` - Toggle draw mode
- `M` - Toggle menu
- `E` - Eraser toggle
- `[` `]` - Brush size
- `O` - Onion skin
- `L` - Long stroke toggle
- `B` - BG target
- `T` - TPL target (открывает template window)
- `Ctrl+Z` - Undo

---

## Touch / iPad

### Жесты
- **1 палец (не draw mode)** - Pan
- **1 палец (draw mode)** - Рисование
- **2 пальца** - Pan + Zoom (всегда, даже в draw mode)
- **Tap на кадре** - Select frame (в single mode)

### Оптимизация для iPad
```javascript
// Детекция iPad
const isIPad = /iPad|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;

// Уменьшаем нагрузку
if (isIPad) {
  MAX_CANVAS_SIZE = 2048; // лимит размера canvas
  DRAW_QUALITY = 1; // без devicePixelRatio
}
```

---

## Меню Settings

### Секции

1. **Frame Selection**
   - Mode: Fixed Count / Interval / All
   - Frame Count: [input]
   - Start Frame: [input]
   - End Frame: [input]
   - Quality: Low / Half / High

2. **Grid Layout**
   - Target Aspect: Auto / 1:1 / 16:9 / 9:16 / 4:3
   - Columns: [input]
   - Cell Visible: 1,2,3,4,5... (каждый N-й кадр)
   - Frame Offset: [input] (авто = Cell Visible)
   - Auto-fit: [toggle]
   - Spacing: [slider]

3. **Display & Style**
   - Metadata Bar: [toggle]
   - Timecode: [toggle]
     - Show Index #: [toggle]
     - Show Time: [toggle]
     - Show Frame F: [toggle]
   - TC Colors, Position, Align...
   - Background Color: [color]

4. **Animation Preview**
   - FPS: [input]
   - Direction: Forward / Backward / Ping-pong / Sync / Random
   - Pattern: Sequential / Center-out / Snake / Vertical
   - Long Stroke Fade: [input] frames

5. **Export**
   - Quality: Low / Medium / High / Max
   - Format buttons: JPEG / PNG / GIF / MP4
   - Export Screen: [button] (то что вижу на экране)

---

## Export System

### Режимы экспорта

1. **Grid Static** - JPEG/PNG сетки как видим
2. **Grid Animated** - GIF/MP4 сетки с анимацией
3. **Single Frame** - один кадр большой
4. **Single Animated** - GIF/MP4 одного кадра
5. **Screen Capture** - экспорт viewport как видим (с рамкой аспекта)

### Screen Capture
```javascript
// Рамка выбора области
state.screenCapture = {
  enabled: false,
  aspect: '16:9', // или 1:1, 9:16, 4:3, free
  rect: { x, y, width, height },
  recording: false
};

// При экспорте - рендерим только то что в рамке
function exportScreen() {
  const { x, y, width, height } = state.screenCapture.rect;
  // Создаём canvas нужного размера
  // Рендерим видимую часть с рисунками
  // Экспортируем
}
```

---

## Timecode формат

```javascript
// Модульный формат: #1 | 00:05 | F123
function formatTimecode(frame, cellIndex) {
  const parts = [];
  if (state.tcShowIndex) parts.push(`#${cellIndex + 1}`);
  if (state.tcShowTime) parts.push(formatTime(frame.time));
  if (state.tcShowFrame) parts.push(`F${frame.frameNumber}`);
  return parts.join(' | ');
}
```

---

## План реализации

### Фаза 1: Базовый каркас (без рисования)
1. HTML структура (минимальная)
2. CSS стили
3. State management
4. Video loader
5. Grid renderer
6. Zoom/Pan (pointer events)
7. Animation player
8. **Тест на iPad** ✓

### Фаза 2: UI
1. Toolbar
2. Menu (секции)
3. Keyboard shortcuts
4. **Тест на iPad** ✓

### Фаза 3: Рисование
1. Drawing system (единый pointer handler)
2. Background layer
3. Template layer + window
4. Per-frame layer
5. Long stroke
6. **Тест на iPad** ✓

### Фаза 4: Экспорт
1. JPEG/PNG export
2. GIF export
3. MP4 export
4. Screen capture
5. **Тест на iPad** ✓

---

## Файлы проекта

```
/framegrid/
  index.html          # Основной файл приложения
  FRAMEGRID_HANDBOOK.md   # Документация (уже есть)
  FRAMEGRID_v016_PLAN.md  # Этот файл
```

---

## Что сохранить из v0.15

### Рабочий код (скопировать)
- `formatTime()` - форматирование времени
- `generateCellOrder()` - паттерны анимации (snake, center, etc)
- `drawSmoothLine()`, `drawDot()` - функции рисования
- MP4 muxer интеграция
- GIF.js интеграция

### Логика (переписать)
- Frame extraction - упростить
- Grid rendering - связать с drawing
- Touch handlers - использовать Pointer Events
- Export - унифицировать

### Удалить
- Дублирующиеся переопределения функций
- Старую систему frameDrawings
- Избыточное логирование

---

## Критерии готовности v0.16

- [ ] Загрузка видео работает на iPad
- [ ] Grid отображается корректно на iPad
- [ ] Меню открывается БЕЗ пропадания картинки
- [ ] Zoom/Pan работает на iPad (2 пальца)
- [ ] Рисование работает на iPad (1 палец в draw mode)
- [ ] Анимация работает плавно
- [ ] Экспорт с рисунками работает
- [ ] Код < 2000 строк (чистый, модульный)
