# Framegrid v0.14 (framegrid_v014_03.html) - карта модулей

Формат: один self-contained HTML (CSS + разметка + один большой `<script>`). Ниже карта по модулям, с точками входа, ключевым состоянием и функциями.

## 0) Быстрая ориентация по файлу
- CSS секции (комментарии вверху файла): metadata bar, canvas/grid, side menu, about, progress/loading, drawing overlay/palette, template frame, draw target selector, onion skin.
- JS начинается примерно с **стр. 793** и заканчивается у `</script>`.

## 1) Core: состояние и ссылки на DOM
### Назначение
Единый `state` хранит всю правду о приложении: видео, кадры, сетка, режимы, анимация, рисование, экспорт.

### Что держит state (важные группы)
- Video: url/file, `duration`, `w/h`, fps, дата
- Frames: `frames[]` (time, frameNumber, dataUrl)
- Grid/UI: cols, spacing, fontSize, cellSize, viewMode (grid/single)
- Viewport: pan/zoom (scale, panX/panY), menuOpen
- Animation: playing, fps, direction, pattern, loop, tick
- Drawing (v0.14): `bgDrawing`, `templateDrawing`, `frameDrawings{}`, `drawTarget`, `drawOnion`, `exportDrawings`

### Функции-утилиты
- `$` (стр. 839): короткий getElementById.

## 2) Меню и базовый UI
### Назначение
Открытие/закрытие side menu и синхронизация UI с state.

### Функции
- `openMenu` (892)
- `closeMenu` (901)
- `toggleMenu` (908)

## 3) Загрузка видео и метаданные
### Назначение
Приём файла, инициализация `<video>`, чтение метаданных, подготовка диапазонов.

### Функции
- `handleFile` (918)
- `updateMetaDisplay` (959)

### Точки входа
- input file / drag&drop (обработчики рядом с этими функциями)

## 4) Выбор кадров и генерация сетки
### Назначение
Рассчитать времена кадров, подобрать колонки, захватить изображения из видео и построить DOM-сетку.

### Функции
- `calculateFrameTimes` (1009)
- `calculateOptimalColumns` (1034)
- `updateGridHint` (1068)
- `captureFrame` (1138)
- `renderGrid` (1157)
- `updateTimecodeStyles` (1148)

### Ключевые зависимости
- `captureFrame` зависит от последовательного `seek` по `<video>`.
- `renderGrid` создаёт DOM-ячейки и кладёт `<img src=dataUrl>`.

## 5) Viewport controller: pan/zoom/fit
### Назначение
Управление трансформацией контейнера (translate + scale), плюс авто-fit.

### Функции
- `updateTransform` (1277)
- `fitToScreen` (1281)
- `fitToSingleFrame` (1310)
- `setViewMode` (1333)

### Точки входа
- wheel/mouse/touch обработчики, которые меняют `state.scale/panX/panY`.

## 6) Интервалы, таймкоды, контроль UI
### Назначение
Синхронизация элементов меню/панели с выбранным режимом интервалов и состоянием.

### Функции
- `updateIntervalUI` (1400)

## 7) Animation engine
### Назначение
Проигрывание кадров в сетке или в single view, логика направления и паттернов.

### Функции
- `updatePlayButton` (1489)
- `restartAnimation` (1513)
- `startAnimation` (1565)
- `generateCellOrder` (1617)
- `stopAnimation` (1664)
- `goToFrame` (1679)

### Зоны риска
- Сильно связано с DOM-ячейками (`.cell`) и индексами `cellIdx/frameIdx`.

## 8) Drawing system (главная новая подсистема v0.14)
### Назначение
Рисование поверх сетки, но с разными целями: background, template (общий слой), frame (пер-кадр). Onion skin, композитинг слоёв.

### Основные идеи модели данных
- `bgDrawing`: ImageData для фона вокруг кадров
- `templateDrawing`: ImageData для слоя поверх всех кадров
- `frameDrawings`: Map/obj `frameIdx -> ImageData` для конкретного кадра
- `drawTarget`: куда рисуем сейчас

### Функции
- `toggleDrawMode` (1794)
- `resizeDrawCanvas` (1807)
- `compositeAllLayers` (1831)
- `renderFrameDrawingsOnCanvas` (1844)
- `saveCurrentLayer` (1873)
- `getTargetCanvas` (1882)
- `getCanvasPoint` (1889)
- `getFrameAtPoint` (1907)
- `drawSmoothLine` (1935)
- `drawDot` (1960)
- `toggleOnionSkin` (2060)
- `setDrawColor` (2065)
- `setDrawTarget` (2076)

### Где чаще всего «ломается» поведение
- Перевод координат pointer -> canvas -> конкретная ячейка
- Совместимость с pan/zoom и пересчётом layout при изменениях grid
- Правильное сохранение слоя при смене target или viewMode

## 9) Экспорт: image/GIF/MP4
### Назначение
Экспорт статичных изображений и анимаций. В MP4 используется WebCodecs + mp4-muxer.

### Функции
- `loadScript` (2418)
- `renderMp4GridFrame` (2627)
- `renderMp4SingleFrame` (2702)
- `exportImage` (2757)

### Зоны риска
- Повторная загрузка `dataUrl` в `Image()` для набора кадров (память)
- Чётные размеры под H.264 и выбор конфигов
- Встраивание drawing layers в экспорт, если включён `exportDrawings`

## 10) Formatting utilities
- `formatTime` (2899)
- `formatDate` (2900)

## 11) Карта точек входа (event listeners)
Список стоит держать отдельным блоком (ниже будет расширяться):
- file input change
- drag/drop
- menu buttons
- viewMode toggle
- play/stop
- wheel/mouse/touch pan-zoom
- drawing palette (color, size, target, onion)
- export buttons

## 12) Стратегия изменений: как оценивать объём
1) Чётко фиксируется «что должно работать» как список сценариев.
2) На каждый сценарий отмечаются функции, которые в нём участвуют.
3) Правки делятся на:
   - точечные (локально в модуле)
   - сквозные (затрагивают state, render, input и export)

## 13) Журнал изменений к карте
Пока пусто. Дальше сюда удобно добавлять: дата, что поменялось, какие функции затронуты.

