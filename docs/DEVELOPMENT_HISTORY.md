# Development History

Обновлено: 2026-06-30

Этот файл фиксирует не весь chat log, а важные архитектурные решения, баги и смысловые повороты, чтобы не терять контекст проекта.

## До TimeGrid

Проект начинался как FrameGrid / FrameSampler: инструмент для нарезки видео на сетку кадров, contact sheets, motion studies и visual sampling.

Ключевые ранние идеи:

- видео как пространственная карта времени;
- кадры как материал для анализа движения;
- сетка как динамический playback surface;
- возможность рисовать поверх времени;
- экспорт как часть творческого процесса, а не только preview.

## Переименование и Vite

Проект был переименован в TimeGrid. Vite-сборка использует `vite-plugin-singlefile`, чтобы сохранить философию standalone-инструмента: один HTML с inline assets после build.

Production тестируется через Vercel:

- `https://time-grid-sand.vercel.app/`
- `main` считается production-веткой;
- экспериментальные ветки можно использовать для preview deployments.

## Июнь 2026: последние важные изменения

### Frame Target preview/export

Был найден баг: при импортированных 60 кадрах и `Frame Target = 6` preview показывал фазово распределённые кадры, а export рендерил первые последовательные кадры.

Решение:

- вынесена общая логика расчёта кадра ячейки;
- preview и export должны опираться на один temporal model;
- sequential `1,2,3...` ожидается только при `Sequence Mode`.

### Chronophoto runtime bug

После правки frame sampling Chronophoto поймал `ReferenceError: dir is not defined`.

Причина:

- `updateAllCells()` всё ещё использовал `dir`, но переменная была убрана при рефакторинге.

Решение:

- восстановлен `const dir = state.animDirection;`.

Урок:

- temporal effects часто завязаны на direction/pattern даже если UI-фича кажется независимой.

### Frame Target и HIDE presets

Добавлены маленькие preset strips рядом с:

- `Frame Target`: `1 / 4 / 6 / 8 / 12`;
- `HIDE`: `8 / 16 / 32 / 64`.

Цель:

- убрать долгие клики по `+/-`;
- дать быстрый переход к типичным значениям;
- не дублировать controls внизу интерфейса.

### Timecode defaults

Изменены дефолты:

- frame number выключен по умолчанию;
- если включить timecode/frame label, default position — center/center.

### Audio Collision Seq collapsed

`Audio Collision Seq` теперь стартует свернутым, чтобы не занимать внимание в базовом сценарии.

### Draw canvas white screen / resize growth

Был найден баг: при рисовании и переключении `GRID / 1` внутренний `drawCanvas` мог расти в два раза или больше, пока страница не становилась белой.

Причина:

- `resizeDrawCanvas()` считал размер через `canvasInner.scrollWidth/scrollHeight`;
- сам `drawCanvas` лежит внутри `canvasInner`;
- большой intrinsic canvas-size начинал раздувать scroll size контейнера;
- следующий resize считал уже раздутый размер.

Решение:

- draw overlay теперь меряется от стабильной layout-геометрии;
- CSS-size canvas отделён от bitmap-size;
- добавлен memory/area guard;
- oversized old canvas snapshots не копируются.

Урок:

- canvas overlay не должен участвовать в измерении контейнера, размер которого он сам получает.

### Hotkeys

Обновлены хоткеи:

- `↑ / ↓` — cycle Pattern;
- `Ctrl/Cmd + ↑ / ↓` — cycle Direction.

About/hotkey help обновлён под фактическое поведение.

### Welcome text

Строка `Vibecoded by` заменена на более нейтральную:

- `Developed by Grisha Tsvetkov`.

## Chronophoto / loop seam audit

Проверено фактическое поведение `Clean Loop`.

Вывод:

- текущий Clean Loop не является smooth crossfade;
- он только обрезает ghost-историю, когда ghost tick уходит до начала цикла;
- сильный jump между последним и первым базовым кадром остаётся.

Следующий возможный R&D:

- отдельный режим `Seam Blend`;
- `Length: Auto`, где auto = `chronoDepth * chronoStride`;
- режимы `Chrono only` и `Frame + Chrono`;
- общий чистый расчёт для preview и export.

См. `docs/CHRONOPHOTO.md`.

## Текущие рабочие правила

- Не разводить preview и export.
- Для temporal effects сначала проектировать чистую функцию.
- Не менять drawing/canvas sizing без проверки grid/single/pan/zoom/draw mode.
- Не добавлять новый UI control, пока не понятно, где он работает в export.
- Оставлять странные или временные решения задокументированными, чтобы они не становились “магией”.
## 2026-07-03 Seam Blend implementation

Implemented the first production version of Chronophoto loop smoothing.

- Added `Seam Blend` toggle and `Seam Frames` control in the Chronophoto panel.
- `Seam Frames = 0` means Auto, computed as `chronoDepth * chronoStride`.
- Added shared seam helpers in `src/js/main.js` so preview and export use the same tick/cell model.
- Preview renders `.frame-seam-blend` plus `.frame-seam-chrono` layers.
- MP4 grid/single, PNG/JPEG still, and PNG sequence export now draw the seam target.
- `Clean Loop` remains a ghost-history clipping mode and is intentionally separate from Seam Blend.
