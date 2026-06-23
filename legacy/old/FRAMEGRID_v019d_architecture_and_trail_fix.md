# FRAMEGRID v0.19d: архитектура (architecture) и фикс Long Stroke Trail

Документ описывает текущую структуру **FRAMEGRID v0.19d**, с фокусом на модуле рисования (drawing system) и на том, как устроен режим **Long Stroke (long stroke)** с ограниченной длиной хвоста **Trail (trail)**.

---

## 1) Общая идея приложения (overall idea)

**FRAMEGRID** берет видео, извлекает кадры (frames), раскладывает их в сетку (grid), а затем проигрывает анимацию, меняя содержимое каждой ячейки (cell) по таймеру. Поверх сетки работает модуль рисования, который умеет:

- рисовать по фону (Background, BG) вокруг кадров
- рисовать шаблонный слой (Template, TPL), который накладывается на все кадры
- рисовать по кадрам (Per-frame, FRM), так, чтобы рисунок следовал за кадром во время анимации

---

## 2) Ключевое состояние (state)

Главный объект состояния: `state` (app state). Важные поля:

### Видео и кадры (video, frames)
- `state.frames` - массив извлеченных кадров, каждый кадр хранит `dataUrl` и метаданные
- `state.frameCount`, `state.gridCols` - параметры сетки
- `state.currentTick` - глобальный тик анимации (animation tick)

### Анимация (animation)
- `state.isPlaying`, `state.animFps`, `state.animDirection`, `state.animPattern`
- `updateAllCells()` - функция, которая на каждом тике пересчитывает, какой кадр показывать в каждой ячейке

### Рисование (drawing)
- `state.drawMode` - включен ли режим рисования
- `state.drawTarget` - цель рисования: `'background' | 'template' | 'frame'`
- `state.drawLongStroke` - включен ли режим Long Stroke
- `state.longStrokeFade` - в v0.19d используется как длина trail в кадрах (trail length in frames)

---

## 3) Архитектура слоев (layer architecture)

Внутри модуля рисования есть несколько канвасов (canvas layers). Композит собирается в `drawCanvas`.

**Слои снизу вверх (bottom to top):**
1. `bgCanvas` (Background canvas) - фон вокруг кадров
2. видео кадры (frame images) - DOM `img` внутри сетки
3. `tplCanvas` (Template canvas) - шаблон, который рисуется поверх каждого кадра
4. `frameSheetCanvas` (Frame sheet canvas) - большой атлас (sheet) с тайлами (tiles) по каждому кадру

Финальная сборка делается в:
- `compositeAllLayers()` - очищает `drawCanvas` и рисует туда `bgCanvas`, затем TPL на каждую ячейку, затем FRM-тайлы на каждую ячейку

Ключ: в режиме FRM рисование идет не в `drawCanvas`, а в `frameSheetCanvas`, а потом на композите показывается нужный тайл для текущего `frameIdx` в каждой ячейке.

---

## 4) Пер-кадровое рисование через sheet (per-frame via sheet)

### Зачем нужен sheet
Если хранить отдельный canvas на каждый кадр, это быстро становится тяжелым. Поэтому используется один большой `frameSheetCanvas`, который хранит рисунок на все кадры как атлас.

### Основные элементы
- `ensureFrameSheet()` - создает или пересобирает sheet при изменении размеров сетки, количества кадров, tile размеров
- `sheetPoint(frameIdx, u, v)` - преобразует нормализованные координаты внутри кадра (`u`, `v` от 0 до 1) в координаты внутри sheet (x, y в пикселях)

### Отображение
- `renderFrameDrawingsOnCanvas()` - для каждой видимой ячейки берет `frameIdx` из `item.dataset.frameIdx` и рисует соответствующий тайл sheet на позицию ячейки в `drawCanvas`

---

## 5) Long Stroke (long stroke): что это и почему было сложно

Long Stroke нужен, чтобы когда ты рисуешь по анимируемым кадрам (FRM), штрих превращался в след (trail) по кадрам.

Исторически было две проблемы:

1) **Прыжки вместо накопления (jump instead of trail)**  
При смене кадра логика не всегда “штамповала” накопленный путь на новый кадр. Кадр мог смениться, а `drawLongStrokeOnFrame(...)` не срабатывал вовремя.

2) **Резинка (rubber band)**  
Если продолжать рисовать как одну непрерывную линию, при переходе на другой кадр линия соединяет точки из разных кадров и получается растянутый сегмент.

---

## 6) Текущее решение Trail в v0.19d

### 6.1 Данные long stroke (long stroke data)
Используются дополнительные переменные:

- `longStrokePath` - массив точек, каждая точка хранит:
  - `u`, `v` - нормализованные координаты внутри кадра
  - `t` - тик (tick)
  - `brk` - флаг разрыва (break marker), чтобы не соединять сегменты
- `longStrokeLastFrame` - последний кадр, на котором был ввод
- `longStrokeFrameTicks` - `Map(frameIdx -> tick)` последний тик, когда этот кадр “получил” след
- `longStrokeSheetSnapshot` - снимок (snapshot) `frameSheetCanvas` на момент старта long stroke
- `longStrokeActiveFrames` - кадры, на которых хвост сейчас виден
- `longStrokeEndTick` - тик отпускания мыши, нужен чтобы хвост исчезал и не продолжал расти

### 6.2 Ограничение длины хвоста (fixed trail length)
Параметр `state.longStrokeFade` трактуется как:

- `trailFrames = N` - хвост живет только N кадров
- `trailFrames = 0` - legacy режим, след остается навсегда

Получение значения:
- `getLongStrokeTrailFrames()` берет `parseInt(state.longStrokeFade)` и clamp в `>= 0`

### 6.3 Зачем нужен snapshot (snapshot)
Чтобы хвост мог “исчезать”, нельзя просто постоянно дорисовывать в sheet навсегда. Поэтому:

- при старте long stroke вызывается `startLongStrokeTrailSnapshot()`
- он делает `longStrokeSheetSnapshot` как canvas-копию текущего `frameSheetCanvas`
- дальше каждый активный тайл сначала восстанавливается из snapshot, и поверх рисуется только актуальная часть хвоста

Восстановление тайла:
- `restoreLongStrokeTileFromSnapshot(frameIdx)` берет прямоугольник tile (sx, sy, tw, th) и копирует его из snapshot в `frameSheetCanvas`

### 6.4 Как рисуется хвост на конкретном кадре (render)
- `renderLongStrokeFrame(frameIdx)`:
  1) вычисляет окно (window) по тикам: `windowStart = nowTick - trailFrames + 1`
  2) восстанавливает тайл из snapshot
  3) проходит по `longStrokePath` и рисует только точки, у которых `t` попадает в окно, и `t <= frameTick`
  4) если `brk` или начало сегмента, ставит dot, иначе рисует line

Это решает сразу две вещи:
- хвост ограничен по длине N кадров
- между кадрами нет резинки, потому что `brk` разрывает сегменты

### 6.5 Как хвост исчезает (decay)
На каждом тике `updateAllCells()` вызывает:
- `updateLongStrokeTrail()`

`updateLongStrokeTrail()`:
- пересчитывает, какие кадры сейчас должны быть активны (чьи `frameTick` попадают в окно)
- кадры, которые выпали из окна, восстанавливает из snapshot
- активные кадры перерисовывает через `renderLongStrokeFrame(frameIdx)`
- когда `longStrokeEndTick != null` и `activeFrames.size == 0`, вызывает `cancelLongStrokeTrail(false)`

То есть хвост исчезает автоматически, просто потому что окно движется вперед.

---

## 7) Что конкретно было “пофиксено” по сравнению с проблемой v0.18c

### 7.1 Проблема “прыжков”
В v0.18c обновление `longStrokeLastFrame` могло происходить так, что тик анимации уже не видел смену кадра, и штамп не происходил.

В v0.19c+ это стабилизировано:
- в `updateAllCells()` добавлена проверка: если `isDrawing` и кадр под курсором сменился, добавляется `brk` точка и выполняется `renderLongStrokeFrame(newFrameIdx)` в trail режиме

### 7.2 Проблема “резинки”
Добавлен явный `brk` при смене `frameIdx`, и отрисовка учитывает `brk` как разрыв сегмента.

---

## 8) Где смотреть код (code map)

Если нужно быстро ориентироваться:

- Анимация: `updateAllCells()`, `startAnimation()`, `restartAnimation()`
- Композит: `requestComposite()`, `compositeAllLayers()`
- Sheet: `ensureFrameSheet()`, `sheetPoint()`, `renderFrameDrawingsOnCanvas()`
- Long Stroke trail:
  - `getLongStrokeTrailFrames()`
  - `startLongStrokeTrailSnapshot()`
  - `restoreLongStrokeTileFromSnapshot()`
  - `renderLongStrokeFrame()`
  - `updateLongStrokeTrail()`
  - `cancelLongStrokeTrail()`

---

## 9) Мини заметки по производительности (perf notes)

- `longStrokePath` ограничивается по длине (срез до последних 5000 точек)
- в trail режиме перерисовываются не все кадры, а только тайлы активных кадров (active frames)
- восстановление из snapshot идет тайл-в-тайл, это дешевле, чем пересобирать весь sheet

---

## 10) Версии (versions)

- **v0.19c**: корректный Long Stroke trail с фиксированной длиной и исчезновением, без резинки
- **v0.19d**: то же поведение, плюс мелкие правки UI (ui tweaks)

