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

- `https://timegri.vercel.app/`
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

## 2026-07-03 Seam Modes v28.14

Refined Seam Blend after testing showed that the first implementation could feel like a static frame floating over the animation.

- Added `Seam Mode`: `Chrono Only`, `Frame Soft`, `Frame Full`.
- Added `Seam Strength`, default `0.55`.
- `Chrono Only` crossfades Chronophoto ghost history only and is now the default.
- `Frame Soft` keeps the base-frame blend but caps opacity by strength.
- `Frame Full` preserves the v28.13 behavior for comparison.
- Preview and export now share current-stack opacity scaling so `Chrono Only` is a real ghost-stack crossfade, not just an extra overlay.

## 2026-07-04 Filename labels v28.15

Added filename labels to the existing Timecode overlay.

- New `File` toggle adds the source filename to the cell label.
- New `Tail chars` control shows the last N filename characters; `0` shows the full name.
- Image-sequence imports now store `sourceName` and `sourceIndex` per generated frame.
- Preview and export use the same `formatTimecode(...)` function, so labels stay WYSIWYG.

## 2026-07-04 Display name labels v28.16

Split filename labeling into two Timecode toggles.

- `File` remains the per-frame source filename.
- `Name` shows the editable top-bar metadata/export name.
- Editing the top-bar name refreshes visible timecode labels immediately.
- `Tail chars` applies to both `File` and `Name` labels.

## 2026-07-04 Typography and label overflow v28.17

Refined the default typography and made long frame labels more predictable.

- Added Google Fonts: `Inter` for the app UI and `JetBrains Mono` for timecode/file labels.
- Updated canvas-drawn labels to use the same font stacks as DOM preview.
- Timecode labels now keep a single-line layout and ellipsize when wider than the cell.
- Long file/name workflows still use `Tail chars` so the end of the filename remains available.

## 2026-07-04 Stacked timecode labels v28.18

Changed the timecode overlay from one long inline label into a vertical stack.

- Enabled fields render as separate lines inside one overlay box.
- `Top` stacks downward, `Center` centers the full stack, and `Bottom` keeps the stack bottom-anchored.
- Preview updates use DOM line spans, while export draws the same lines manually on canvas.
- Caption labels now use italic `JetBrains Mono` with heavier weight for a more styled look.

## 2026-07-04 Custom frame selection and slice layout v28.19

Added a manual `Custom Frames` mode to Frame Selection.

- Switching into `Custom Frames` seeds a textarea from the currently generated/selected frame numbers.
- Custom frame numbers are entered as 1-based UI values and converted to internal 0-based indices only for capture.
- The parser accepts comma, space, and newline separated values, then clamps them to the active Start/End frame range.
- Custom mode uses the normal generated `state.frames` pipeline, so preview and export keep the same downstream model.
- Image `Slice` now defaults preview columns to `cutCols`, preserving the sliced source layout instead of auto-fitting to another column count.
- Added `docs/BACKLOG.md` as the working inbox for future feature ideas before they move into implementation or history.

## 2026-07-04 Timecode font panel v28.19

Added a compact font settings panel to the Timecode menu.

- A `T` button now sits next to `Text` and `BG`.
- The panel offers mono italic, mono, sans, and serif italic presets.
- Regular/italic and weight controls update the live preview.
- Canvas export uses the same resolved font config as preview.

## 2026-07-04 Timecode placement and fill modes v28.20

Fixed a Timecode UI regression and added background fill modes.

- Changing `Align` or `Position` now updates only existing timecode overlay classes, avoiding grid re-render and auto-fit recentering.
- Added `BG Fill` with `Stack` and `Lines` modes.
- `Stack` draws one shared background box for the full label stack.
- `Lines` draws individual background boxes per enabled label line.
- Canvas export uses the same fill mode.
- Updated Timecode defaults to opacity `100%`, font size `32px`, box pad `4px`, margin `0px`.

## 2026-07-04 Timecode wrapping defaults v28.21

Adjusted the default Timecode look and made long text labels more resilient.

- `Lines` is now the default `BG Fill` mode.
- Default Timecode font size is now `15px`.
- Custom `TEXT`, display `NAME`, and source `FILE` lines are marked as wrappable in the DOM preview.
- Canvas export wraps those text-like labels using measured line breaks before drawing backgrounds and text.

## 2026-07-04 First-frame capture priming v28.22

Fixed the recent fresh-import issue where the first generated video frame could be black before the decoder was warm.

- Added `primeVideoForCapture()` before the first video capture pass in `generateFrames()`.
- Added shared capture readiness helpers for video ready state, decoded frame readiness, and safer seek completion.
- Removed the blind draw-on-timeout behavior from `captureFrame()`.
- Added limited blank-canvas retries for only the first generated frame, with a final acceptance path for videos that genuinely begin black.

## 2026-07-04 Capture speed and seam target hotfix v28.23

Fixed two regressions found while testing v28.22.

- Normal capture no longer waits for a slow decoded-frame callback on every frame; it uses the fast `seeked` + double-rAF path again.
- The stricter decoded-frame wait remains only in the one-time `primeVideoForCapture()` step.
- `Seam Blend` now resolves its target from the next cycle start for the current tick, so `Frame Soft` and `Frame Full` visibly blend toward the upcoming first frame.
- Chronophoto seam ghost indices now respect the frame count passed into the seam helper.

## 2026-07-04 Simplified Seam Blend v28.24

Reduced Chronophoto seam controls to a single understandable value.

- Removed `Seam Mode` and `Seam Strength` from the UI and active seam math.
- `Seam Frames` now directly means how many ending frames receive beginning-frame overlays.
- The mapping is reverse-to-seam: frame 1 of the next cycle lands on the last frame, frame 2 on the previous frame, and so on.
- Seam opacity is automatic and cascades stronger as playback approaches the loop seam.
