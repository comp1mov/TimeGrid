# FRAMEGRID diff report

Пакет сравнения для трёх HTML-сборок:

- `framegrid_v025_20.html`
- `framegrid_v025_26.html`
- `framegrid_v025_49_patched.html`

Формат отчёта сделан под быстрое считывание. Полные raw patches вынесены в отдельные `.patch` файлы.

## 1. Входные файлы

| version | file | size_kb | lines | sha |
| --- | --- | --- | --- | --- |
| v0.25.20 | framegrid_v025_20.html | 490.0 | 12870 | e7e5eda4da50e7a9 |
| v0.25.26 | framegrid_v025_26.html | 492.9 | 12941 | b3101ffb9a3a5617 |
| v0.25.49 patched | framegrid_v025_49_patched.html | 507.3 | 13315 | 75476724695ecbff |

## 2. Общая матрица изменений

| pair | hunks | adds | dels | net | focus |
| --- | --- | --- | --- | --- | --- |
| v0.25.20 -> v0.25.26 | 16 | 98 | 27 | 71 | head_html:2, css:1, body_html:9, js:4 |
| v0.25.26 -> v0.25.49 patched | 49 | 414 | 40 | 374 | head_html:2, css:3, body_html:6, js:38 |
| v0.25.20 -> v0.25.49 patched | 58 | 506 | 61 | 445 | head_html:2, css:4, body_html:13, js:39 |

## 3. Executive summary

### v0.25.20 -> v0.25.26

- Главный сдвиг в экспортном UI. Старые блоки `Grid / Single / Sequence` заменены на консолидированный режим `Target View + Export Format + Time-Sync Audio`.
- В `Frame Transform` упрощена разметка числовых полей. Убраны внешние обёртки `menu-slider-numwrap` и юниты в DOM.
- Добавлен отдельный контроль `Opacity` для frame image.
- Добавлен CSS-класс `.menu-btn.active-toggle` для активного выбора режима экспорта.
- JS-логика существующих export-кнопок сохранена через скрытые legacy buttons. Поведение переадресовано через новый слой-контроллер.

### v0.25.26 -> v0.25.49 patched

- Главный сдвиг в геометрии grid. `spacing` теперь поддерживает отрицательные значения, а layout компенсируется через `padding` у `.frames-grid` и `margin` у `.frame-item`.
- В metadata bar простой fps-лейбл заменён на интерактивный `- / value / +` контрол.
- В Grid добавлен новый параметр `Visible`, завязанный на новое state-поле `cellReveal`.
- Добавлен новый модуль `Chronophoto` в UI, state и export/render pipeline.
- Функции рендера и экспорта получили новый путь наложения chronophoto поверх base frame.
- Для `menu-input-btn` добавлены mobile/touch safeguards, плюс внизу файла введён hold-to-repeat и `Ctrl/Cmd`-multiply для плюс/минус кнопок.
- Изменены дефолты: `spacing 2 -> 0`, `frameImgScale 1 -> 1.01`, slider spacing `min 0 -> -5`.

## 4. Детальный diff: v0.25.20 -> v0.25.26

### 4.1 Ключевые изменения

1. **Export UI consolidation**
   - строки нового файла: `2015-2047`
   - удалён старый стек кнопок `JPEG/PNG/MP4` по секциям `Grid`, `Single`, `Sequence`
   - добавлены `exportTargetMode`, `expJpegBtn`, `expPngBtn`, `expMp4Btn`, `expSeqBtn`, `expSyncAudioBtn`

2. **Legacy compatibility layer**
   - строки нового файла: `2035-2045`
   - старые id-кнопки сохранены скрытыми, чтобы не переписывать весь export backend

3. **Frame Transform controls simplified**
   - строки нового файла: `1396`, `1403`, `1410`, `1415`, `1417`
   - упрощены numeric inputs для Off X / Off Y / Rotation / Opacity

4. **Frame image opacity wiring**
   - строки нового файла: `4796-4818`
   - добавлены `frameImgOpacitySlider` и `frameImgOpacityNum`, оба вызывают `applyFrameImgTransform()` и `requestComposite()`

5. **Новый CSS active state для export toggle**
   - строки нового файла: `452-454`

### 4.2 Добавленные DOM ids

`expJpegBtn`, `expMp4Btn`, `expPngBtn`, `expSeqBtn`, `expSyncAudioBtn`, `exportTargetMode`

### 4.3 Полная карта hunk-изменений

| old | new | + | - | scope |
| --- | --- | --- | --- | --- |
| 4-4 | 4-4 | 1 | 1 |  |
| 13-13 | 13-13 | 1 | 1 |  |
| 451 | 452-454 | 3 | 0 | Quick Toolbar |
| 1104-1104 | 1107-1107 | 1 | 1 | AudioSeq sample recording |
| 1393-1393 | 1396-1396 | 1 | 1 | FRAME TRANSFORM — separate collapsible section |
| 1400-1400 | 1403-1403 | 1 | 1 | FRAME TRANSFORM — separate collapsible section |
| 1407-1407 | 1410-1410 | 1 | 1 | FRAME TRANSFORM — separate collapsible section |
| 1412-1412 | 1415-1415 | 1 | 1 | FRAME TRANSFORM — separate collapsible section |
| 1414-1414 | 1417-1417 | 1 | 1 | FRAME TRANSFORM — separate collapsible section |
| 1686-1686 | 1689-1689 | 1 | 1 | FRAME TRANSFORM — separate collapsible section |
| 2012-2025 | 2015-2047 | 33 | 14 | FRAME TRANSFORM — separate collapsible section |
| 2061-2061 | 2083-2083 | 1 | 1 | Hidden legacy buttons to keep logic intact |
| 2139-2139 | 2161-2161 | 1 | 1 | Single source of truth |
| 4773 | 4796-4818 | 23 | 0 | Target aspect changes the cell geometry: resize FRM sheet tiles so FRM drawing is not stretched. |
| 4918-4918 | 4963-4989 | 27 | 1 | updatePlayButton |
| 5648-5648 | 5719-5719 | 1 | 1 | DRAW UNDO v0.25.26 STEP3 (stable) |

## 5. Детальный diff: v0.25.26 -> v0.25.49 patched

### 5.1 Ключевые изменения по слоям

#### CSS / layout

- `154-159`: новая модель grid spacing
  - `.frames-grid { gap: max(0px, var(--grid-gap, 0px)); padding: calc(min(0px, var(--grid-gap, 0px)) * -0.5); }`
  - `.frame-item { margin: min(0px, calc(var(--grid-gap, 0px) / 2)); }`
- `382`: `menu-input-btn` получает `user-select: none`, `-webkit-user-select: none`, `-webkit-touch-callout: none`

#### Metadata bar

- `1120-1124`: `metaAnimFps` удалён
- вместо него добавлен inline fps-control: `metaFpsMinus`, `metaAnimFpsText`, hidden input, `metaFpsPlus`

#### Grid controls

- `1467-1474`: добавлен `Visible`
- `1489-1490`: spacing slider теперь `min=-5`, `default=0px`
- state получает `cellReveal: 0`

#### Chronophoto

- `1713-1760`: новый раздел `Chronophoto`
- добавлены ids: `chronoBlend`, `chronoDepth`, `chronoDepthMinus`, `chronoDepthPlus`, `chronoOpacity`, `chronoOpacityNum`, `chronophotoSection`, `metaAnimFpsText`, `metaFpsMinus`, `metaFpsPlus`, `revealLabel`, `revealMinus`, `revealPlus`, `toggleChronoCascade`, `toggleChronophoto`
- state получает поля: `cellReveal`, `chronoBlend`, `chronoCascade`, `chronoDepth`, `chronoEnabled`, `chronoOpacity`

#### Render / export pipeline

- `updateAllCells()` теперь вызывает `updateChronoForItem()` и `applyReveal()`
- `renderGrid()` вызывает `updateAllCells()` после сборки grid
- `drawFrameCell()` принимает `baseIdx` и вызывает `drawChronophotoStack()`
- `exportImage()`, `exportSingleStill()`, `renderMp4GridFrame()`, `renderMp4SingleFrame()`, `exportPngSeqDrawings()` теперь передают frame index в `drawFrameCell()`

#### Input behavior

- `5167-5185`: делегирование кликов для fps-кнопок в metadata bar
- `13243-13312`: hold-to-repeat и `Ctrl/Cmd`-multiply для `.menu-input-btn`
- в hotkeys добавлены поправки на typing-context / blur behavior / keyboard-layout safe handling

### 5.2 Изменённые функции

| function | old | new | + | - |
| --- | --- | --- | --- | --- |
| compositeAllLayers | 6365-6409 | 6616-6661 | 1 | 0 |
| drawFrameCell | 9904-9957 | 10209-10265 | 4 | 1 |
| exportImage | 10998-11203 | 11306-11512 | 2 | 1 |
| exportPngSeqDrawings | 10242-10563 | 10550-10871 | 2 | 2 |
| exportSingleStill | 11304-11444 | 11613-11754 | 2 | 1 |
| renderGrid | 3975-4048 | 4073-4149 | 3 | 0 |
| renderMp4GridFrame | 9610-9678 | 9863-9931 | 1 | 1 |
| renderMp4SingleFrame | 10007-10044 | 10315-10352 | 1 | 1 |
| updateAllCells | 5237-5350 | 5486-5601 | 2 | 0 |
| updateMetaAnimFps | 2472-2476 | 2540-2546 | 5 | 3 |

### 5.3 Новые функции

| function | new |
| --- | --- |
| applyReveal | 2659-2671 |
| drawChronophotoStack | 10159-10207 |
| updateChronoForItem | 5251-5297 |
| updateRevealUI | 2655-2657 |

### 5.4 Изменения state / defaults

| key | v0.25.26 | v0.25.49 patched |
| --- | --- | --- |
| spacing | `2` | `0` |
| frameImgScale | `1` | `1.01` |
| cellReveal | отсутствует | `0` |
| chronoEnabled | отсутствует | `false` |
| chronoBlend | отсутствует | `'screen'` |
| chronoDepth | отсутствует | `3` |
| chronoOpacity | отсутствует | `0.4` |
| chronoCascade | отсутствует | `false` |

### 5.5 IDs removed

`metaAnimFps`

### 5.6 Замеченные риски по diff

- В export-контуре появились дублирующие строки `if (img.src !== src) img.src = src;` в ветках still export. Функционально риск небольшой, но это шум в коде и повод для зачистки.
- Дефолт `frameImgScale = 1.01` меняет baseline визуально. Для точного совпадения preview/export это место критично.
- Перевод spacing в диапазон `-5..20` затрагивает и preview, и export. Старый код, если где-то считает layout через положительный `gap`, может расходиться с новой геометрией.

### 5.7 Полная карта hunk-изменений

| old | new | + | - | scope |
| --- | --- | --- | --- | --- |
| 4-4 | 4-4 | 1 | 1 |  |
| 13-13 | 13-13 | 1 | 1 |  |
| 154-154 | 154-154 | 1 | 1 | GRID |
| 159-159 | 159-159 | 1 | 1 | GRID |
| 381 | 382-382 | 1 | 0 | Submenu inside Display |
| 1107-1107 | 1108-1108 | 1 | 1 | AudioSeq sample recording |
| 1119-1119 | 1120-1125 | 6 | 1 | AudioSeq sample recording |
| 1460 | 1467-1474 | 8 | 0 | FRAME TRANSFORM — separate collapsible section |
| 1475-1476 | 1489-1490 | 2 | 2 | FRAME TRANSFORM — separate collapsible section |
| 1698 | 1713-1760 | 48 | 0 | FRAME TRANSFORM — separate collapsible section |
| 2083-2083 | 2145-2145 | 1 | 1 | Hidden legacy buttons to keep logic intact |
| 2161-2161 | 2223-2223 | 1 | 1 | Single source of truth |
| 2186 | 2249-2253 | 5 | 0 | Prevent double-tap zoom |
| 2212-2212 | 2279-2280 | 2 | 1 | Timecode format options |
| 2216-2216 | 2284-2284 | 1 | 1 | Frame image transform inside each cell (preview + export) |
| 2473-2475 | 2541-2545 | 5 | 3 | updateMetaAnimFps |
| 2581 | 2652-2679 | 28 | 0 | Column +/- buttons |
| 4044 | 4143-4145 | 3 | 0 | Onion skin overlay (drawings only) |
| 4925-4925 | 5026-5026 | 1 | 1 | updateLoopPhasesUI |
| 4989 | 5091-5155 | 65 | 0 | Consolidated Export UI Logic |
| 4999-4999 | 5165-5198 | 34 | 1 | Animation controls |
| 5050-5050 | 5249-5299 | 51 | 1 | FIX v0.16: updateAllCells uses state.currentTick, updates BOTH img elements |
| 5270 | 5520-5520 | 1 | 0 | baseOffset |
| 5278 | 5529-5529 | 1 | 0 | baseOffset |
| 5719-5719 | 5970-5970 | 1 | 1 | DRAW UNDO v0.25.48 STEP3 (stable) |
| 6392 | 6644-6644 | 1 | 0 | Per-frame drawings (should follow the frame as it animates) |
| 6501 | 6754-6754 | 1 | 0 | Draw template as a per-frame overlay (scaled to the cell) |
| 9654-9654 | 9907-9907 | 1 | 1 | baseOffset |
| 9904-9904 | 10157-10209 | 53 | 1 | c |
| 9954 | 10260-10260 | 1 | 0 | Match UI behavior: object-fit contain, then apply Scale + Offset. |
| 9956 | 10263-10264 | 2 | 0 | Match UI behavior: object-fit contain, then apply Scale + Offset. |
| 10032-10032 | 10340-10340 | 1 | 1 | frameHLogical |
| 10354-10354 | 10662-10662 | 1 | 1 | Fallback in case 'seeked' never fires (iOS edge cases). |
| 10361-10361 | 10669-10669 | 1 | 1 | Always export the base frame. Drawings are optional overlay. |
| 11128 | 11437-11437 | 1 | 0 | Base video frame (or blank) |
| 11134-11134 | 11443-11443 | 1 | 1 | Base video frame (or blank) |
| 11392 | 11702-11702 | 1 | 0 | Video frame |
| 11398-11398 | 11708-11708 | 1 | 1 | Video frame |
| 11717-11717 | 12026 | 0 | 1 | dir |
| 11718 | 12028-12028 | 1 | 0 | dir |
| 11747-11748 | 12057-12057 | 1 | 2 | idx |
| 11753-11754 | 12062-12062 | 1 | 2 | idx |
| 11889-11890 | 12197-12197 | 1 | 2 | Shift+] = increase edge softness |
| 11892-11892 | 12198 | 0 | 1 | Shift+] = increase edge softness |
| 11895-11896 | 12201-12201 | 1 | 2 | idx |
| 11905-11906 | 12210-12210 | 1 | 2 | idx |
| 11908-11908 | 12211 | 0 | 1 | idx |
| 11911-11911 | 12214-12215 | 2 | 1 | idx |
| 12938 | 13243-13312 | 70 | 0 | Update just the perf rows, keep it lightweight. |

## 6. Net diff: v0.25.20 -> v0.25.49 patched

### 6.1 Что добавилось на уровне интерфейса

- Новый export selector layer
- Новый metadata fps-control
- Новый grid control `Visible`
- Полный модуль `Chronophoto`
- Hold-to-repeat для plus/minus

### 6.2 Что добавилось на уровне кода

- Новые функции: `applyReveal`, `drawChronophotoStack`, `updateChronoForItem`, `updateRevealUI`
- Изменённые функции рендера/экспорта: `updateMetaAnimFps`, `updateAllCells`, `renderGrid`, `drawFrameCell`, `exportImage`, `exportSingleStill`, `renderMp4GridFrame`, `renderMp4SingleFrame`, `compositeAllLayers`, `exportPngSeqDrawings`

### 6.3 Полные raw patches

- `framegrid_v02520_to_v02526.patch`
- `framegrid_v02526_to_v02549.patch`
- `framegrid_v02520_to_v02549.patch`

## 7. Заключение

По diff видно две отдельные волны изменений:

1. `v0.25.20 -> v0.25.26`
   - UI-реорганизация экспорта
   - минимальные правки в controls

2. `v0.25.26 -> v0.25.49 patched`
   - новый layout math для grid
   - новый слой visibility control
   - полноценная chronophoto-подсистема
   - глубокий заход в render/export/input behavior

Для следующего шага логично делать уже отдельный technical review по зонам `grid math`, `export metadata`, `single/grid parity`, `chronophoto render path`.