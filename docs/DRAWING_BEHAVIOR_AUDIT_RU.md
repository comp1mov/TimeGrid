# Аудит механики рисования TimeGrid 28.34 и Drawing Lab .4

26 октября 2026. Редакция 1. Исследование и предложение следующей итерации, без функциональных изменений и публикации. Ветка результатов: codex/drawing-engine.

## Вывод для решения

Стенд .4 проверяет геометрию кисти, новый документ и кеш, но не воспроизводит весь drawing workflow TimeGrid. Утрата удержания кисти на смене кадров является ошибкой переноса. Автор не должен повторно описывать существующие механики или искать все регрессии вручную.

Рекомендуемая модель: временной drawing-движок TimeGrid, общий для настоящего приложения и тестового стенда; внутри него perfect-freehand для жёсткой линии, отдельные операции отпечатков/стирания/заливки и ограниченный растровый кеш. Это инженерная рекомендация по результатам кода и проб, не уже реализованная архитектура. Замена библиотеки целиком не исправляет потерянные события смены кадров.

Single и Grid остаются видами одной работы. Нельзя автоматически останавливать playback при рисовании, требовать отдельный редактор для каждого кадра или заменять временную кисть обычным canvas editor.

## База и границы доказательств

- Эталон: [stable main.js](D:/Antigravity/TimeGrid/src/js/main.js), 28.34, main 3dfd4f0390a1bacdcfdb039c4eef0066a8900e05. SHA-256 файла: 6636e424f18390523557d17c811d858e78b9b6d7ef5ef1d510ed939819caabfa, совпадает с индексом аудита 26 октября.
- Сравнение: [drawing-lab.mjs](../src/js/drawing-lab.mjs), lab 28.35.0-drawing.4. Обычный app в drawing-ветке имеет отдельную версию drawing.2 и не используется как исходный эталон.
- Прочитаны: состояние/контролы, playback и адресация видимых кадров, все три input adapter, TPL-window, кисти, undo/clear/slots, пересоздание canvas, композиция, drawing export helpers, соседние touch/keyboard paths, документация HELP/SCENARIOS/аудит/планы.
- [Воспроизводимый probe и raw results](drawing-evidence/2026-10-26-behavior-audit/README.md). 20 записей, из них 19 диагностических сценариев и одна подготовка native-прогона. Это не заявление «20 функций прошли».
- Edge 156.0.4314.42, Windows, viewport 1440×1000, DPR 1, 96 подготовленных кадров 160×90. Native mouse и настоящий rAF playback проверены отдельно от синтетических событий и управляемых ticks.
- Реальный телефон, Safari, Pencil, настоящее pressure, multitouch, декодирование видео, MP4/GIF и полный медиапроект этим новым прогоном не проверены.
- Метки ниже: RUN = воспроизведено в этом probe; CODE = установлен путь в исходнике; OLD = ранее сохранённые измерения; GAP = отсутствует/не соответствует в lab. CODE не означает успешно проверенный физический ввод.

## 1. Художественный контракт

Кисть в TimeGrid одновременно работает в пространстве и во времени.

Обычный FRM при playback ставит след в кадре, который сейчас находится под кистью. Даже без движения руки новый кадр должен получить точку. Движение руки распределяет позиции/короткие отрезки между кадрами. Это способ исполнять анимацию в реальном времени.

Long Stroke решает другую задачу: последующие кадры получают накопленную траекторию. Trail ограничивает временное окно этой траектории. Уже записанные рисунки сохраняются после отпускания. Нельзя подменять это удалением старых кадров рисунка или обычным движением курсора по sheet.

Grid позволяет физически провести линию через разные кадры. Single показывает один из тех же кадров. Пространственная граница ячейки и смена кадра во времени являются разными событиями. 1F ограничивает отпечаток границей текущей ячейки; это не закрепление одного frame ID на весь жест.

BG относится к композиции и её полям, TPL является общим повторяемым рисунком, FRM следует конкретному кадру банка. Эти отношения важнее выбора графической библиотеки.

## 2. Карта существующих функций и расхождений

| Область | Исходное поведение и адрес в main.js | Состояние .4 / обязательство |
| --- | --- | --- |
| Вход в Draw | toggleDrawMode, 7400: включение выбирает FRM, показывает палитру, разрешает ввод; playback не останавливается | Отдельный lab всегда работает как drawing surface. Не заменяет весь вход/выход TimeGrid |
| Single / Grid | setViewMode, 3579: виды одного банка, кадры не становятся отдельными проектами | Базовое переключение есть; фиксированные 8×12 не проверяют реальную перестройку |
| Кадр под ячейкой | updateAllCells, 6396: getFrameCellInfo вычисляет frameIdx, затем обновляется dataset | GAP: в Grid lab id=i, playback двигает выделение. Это не анимация кадра внутри каждой ячейки TimeGrid |
| Удержание обычной кисти | 6494: frame target, isDrawing, lastPointerPos, !LongStroke; новый hit.frameIdx получает drawDot | RUN/GAP: lab.tick не передаёт удерживаемую точку в запись |
| Неподвижная кисть | holdStampLastFrame исключает повтор того же отображаемого кадра подряд | RUN: одинаковый tick не повышает alpha; возврат к кадру после другого кадра наносит новый след |
| Движение при playback | Активный frame ID и lastSheet меняются при tick; линии продолжаются локально | RUN: позиции меняются между кадрами; .4 проверял только часть этого сценария |
| Long Stroke | path в UV, break markers при смене кадров, перенос накопленного пути | RUN mouse; GAP в lab; pointer pen/touch имеет старое расхождение |
| Trail | 8786–9166: окно в ticks; snapshots и bake при release | RUN: Trail=2 сохраняет рисунки после release; 0 сохраняет всё накопление. Не обещать исчезновение старых рисунков |
| 1F | _drawOneTile, 8355: clip по текущему tile; при переходе можно рисовать уже в следующем | RUN mouse; pen adapter не применяет clip. В lab переключателя нет |
| Grid stroke / gaps | getFrameAtPoint, 8033: nearest-gap snap; mouse resampling до 260 шагов | CODE/RUN edge: нужны явная геометрия и тесты границ, не физическое соседство atlas tiles |
| BG | getActiveBgCanvas, 7036; getDrawCanvasLayoutSize, 7099: композиция и поля; разные grid/single surfaces | RUN gap и независимость видов. GAP: lab BG ограничен gridRect |
| Порядок BG | compositeAllLayers, 7812; bgLayerAboveDrawings и underlay | CODE/GAP: lab имеет один фиксированный порядок |
| TPL | tplCanvas, ensureTplCanvasSized, 7621; один оригинал повторяется на кадрах | Базовое повторение есть; настоящая TPL-window и её управление не перенесены |
| Окно TPL | bindTemplateFrameDrawing, 10613; перенос/resize/закрытие отдельного окна | CODE: окно остаётся открытым при выборе FRM, пока его явно не закрыть. Не заменять его новым обязательным режимом |
| Видимость TPL | showTemplateDrawing, 10087 и renderTemplateOnFramesOnCanvas, 7924 | CODE/RUN: preview flag не учитывается drawExportDrawings. Это несовпадение, не образец для слепого копирования |
| APLY TMPL | 10418: bake TPL во все FRM, очистить TPL, одна отмена | RUN: 96 кадров, Undo вернул TPL и пустые FRM. GAP в lab |
| FRM | renderFrameDrawingsOnCanvas, 7951: tile выбирается по frameIdx, а не cellIdx | CODE: настоящий runtime mapping нужен lab. frame-N в фиксированном fixture не решает reorder/resampling |
| Round | drawSmoothLine/drawDot, 8214/8369; твёрдый круг и мягкий stamp | .3/.4 линия и стабилизация приняты автором. Не откатывать это качество при восстановлении времени |
| Spray | Отдельные drawDot и drawSmoothLine; scatter=1.5, dotScale=0.1 | GAP: .4 использует 1/1, не сохранил настройки. Точка Spray и отрезок имеют разные плотность/распределение в original |
| Softness | getSoftCircleStamp, 8173; legacy softness применяется к Round | .4 soft Spray является расширением, не сохранением старого поведения |
| Другие кисти | pencil/calligraphy есть в drawSmoothLine/drawDot | CODE: в index.html публичные кнопки только Round/Spray. Не выдавать скрытые ветви за поддержанные UI-инструменты |
| Толщина/opacity | Size 1…120 CSS px при scale=1; opacity 5…100%; frame size пересчитывается в tile pixels | Различать CSS ширину, ширину документа и export. .4 новые контролы сохраняются, соответствие размеров надо проверить |
| Ластик | destination-out активной поверхности; выбранная форма; legacy alpha=1 | .4 умеет opacity eraser. Это осознанное расширение; отдельные проверки всех целей и времени |
| Pressure/speed | В original нет чтения реального pressure для формы кисти | .4 добавляет pressure и fast-thick speed. Сохранять эффективное давление и не менять его от скорости playback |
| Shift-линия | constrainToLine, 8533; mouse path использует ограничение | CODE/GAP: проверить и сохранить, не объявлять универсальным для всех устройств |
| Brush Off / palette | A: lock, P: palette; draggable панель, размер preview drag | CODE: mouse main handler не проверяет brushLocked, pointer/TPL проверяют. Нужен регрессионный тест; нельзя копировать отсутствие guard |
| Палитры / picker | Recent colors, whole-video и current-frame palette, eyedropper paths | CODE: current-frame palette подключён к UI; eyedropper-кнопка скрыта. .4 содержит только часть цветовых инструментов |
| Onion | updateOnionForItem, 6213: FRM prev/next, alpha .35, без wrap, только в Draw/FRM | RUN: соседние слои есть, frame 95 не попадает в onion frame 0. GAP в lab |
| Reference | load/transform/follow/blend/above-drawings; отдельный export flag | CODE/GAP: это соседний слой композиции, не слой рисования. Сохранить порядок и shared render recipe при переносе |
| Undo | max 8; BG/TPL snapshots, FRM затронутые tiles | RUN: обычный temporal gesture отменяется целиком. Старые border/Clear дефекты ниже |
| Redo | В inspected stable drawing отсутствует парная история redo | .3/.4 новая возможность, принятие автора сохранить |
| Clear | Очищает выбранную цель: весь FRM, TPL или активный BG view | RUN: FRM Clear Undo сломан в stable. В lab обратимость уже предусмотрена |
| S1/L1…S3/L3 | 16035: session-memory slots, FRM PNG blob, BG/TPL ImageData | RUN/CODE: это не файлы проектов; пустой TPL при load не очищается. GAP совместимости со старыми данными |
| Перестройка колонок | ensureFrameSheet, 7742: перенос по frameIdx, при новых размерах drawImage ресэмплирует | RUN 8→6: одинаковые per-frame hash в малом fixture. Другие размеры не дают гарантии без потерь |
| Proxy / размер | tile зависит от capture/quality/лимитов. BG/TPL тоже пересоздаются с масштабированием | CODE/OLD: это не истинный proxy/full-resolution pipeline. Новый документ должен сохранять оригинал |
| Новая выборка | generateFrames очищает рисунки, подтверждено общим аудитом 28.34 | OLD: несовпавшие привязки хранить для восстановления, не повторять потерю |
| Export | drawExportDrawings, 11776: TPL+FRM; drawExportBgLayer, 11748: отдельный BG; alpha split в export path | CODE/RUN helper: .4 только fixture PNG, не parity всех PNG/GIF/MP4/sequences |
| Input lifecycle | mouse up/blur commit; mouse leave разрыв; pointer cancel/leave завершение; touch fallback отдельный | CODE: lab cancel/blur/pinch отбрасывает draft. Нужно явное общее правило сохранности, не скрытая смена поведения |
| Touch navigation | canvasArea touchstart/move, 3130+: 2 fingers nav; 3-finger size ветки | CODE: ранний >=2/nav path может перехватить 3 fingers; физически не проверено |
| Сохранение документа | Stable хранит drawing как raster; Lab schema 3 хранит geometry/placements | Lab Save/Open уже полезен; полное legacy/project восстановление ещё отсутствует |
| Fill | В inspected original нет bucket, perfect-freehand его тоже не предоставляет | Новое требование автора: внутри нарисованной фигуры. Не потерянная старинная функция |

## 3. Воспроизведённые результаты и дефекты

### Смена кадра без pointermove

Управляемые ticks 0…5 дали 6 одинаковых следов в stable. Mouse и synthetic pen в обычном FRM совпали. Undo удалил все 6 за одно действие. При движении x центра следа менялся между кадрами.

Native mouse, настоящий playback 8 fps, удержание около 760 ms:
- Stable: следы в frames 0…6, 7 кадров.
- Lab .4: frame-0 и frame-5, 2 сегмента, промежуточные frames 1…4 пустые.
- Номера на границе release зависят от времени rAF. Вывод касается пропущенных промежуточных кадров, не равенства длительности до миллисекунды.
- Причина в lab tick: activeFrame меняется, но feed вызывается только pointerdown/move/up. В stable stamp выполняется после обновления frameIdx в updateAllCells.

В lab-extra тесте строка «drawing during playback assigns segments to displayed frame» проверяла только addresses.length > 1 при движении. Она не проверяла stationary hold, точное множество кадров, Grid playback mapping или Long Stroke. Прежний зелёный тест не доказывает полноценную temporal compatibility.

### 1F и Undo на краю

Воспроизводимый click у правого края frame 0, size 30:
- Mouse, 1F off: frame 0 и соседний frame 1; Undo оставляет frame 1.
- Mouse, 1F on: только frame 0; Undo очищает.
- Synthetic pen, 1F on: frame 0 и frame 1; Undo оставляет frame 1.
- Это новый probe текущей 28.34, а не пересказ замера 28.33.

За пределами края нужен осмысленный spatial routing. При новой архитектуре нельзя считать произвольного соседа в bitmap atlas художественно правильным соседним кадром. Режим 1F off сохраняет возможность следа на соседях композиции; конкретный bbox каждой операции должен попадать и в Undo.

### Long Stroke и Trail

Mouse Trail=0: число закрашенных pixels в последовательных кадрах 244, 372, 500, 628, 756. Это накопление.
Mouse Trail=2: 244, 372, 308, 308, 308. Окно ограничивает переносимую историю; прошлые кадры не очищаются.
Synthetic pen при тех же настройках: 244, 52, 52, 52, 52; longStrokePath пуст. Он ставит отдельные точки при движении, но не переносит накопление.
После release и ещё пяти ticks рисунки сохранялись. Trail=2 повторно композитит alpha при bake, поэтому before/after release не byte-identical, хотя покрытие совпало. Эту особенность нужно сравнить с художественным намерением, а не механически воспроизвести.

Дополнительный CODE-дефект: UI updateTrailFrames допускает 0…50, но onchange использует parseInt(value) || 8; ввод 0 заменяется на 8. HTML max=100 не совпадает с runtime clamp=50. Probe выставлял 0 напрямую в state, это проверка движка, не успешности UI выбора 0.

### Сохранность и композиция

- Reflow 8→6 сохранил per-frame hashes на неизменном размере tile.
- FRM Clear очистил всё; Undo не восстановил. В drawClear передаётся объект {fullSheet:true} туда, где ожидается имя target, поэтому нужный snapshot не создаётся.
- APLY TMPL создал рисунки на 96 кадрах; Undo восстановил исходный TPL и пустые FRM.
- Загрузка слота, сохранённого с пустым TPL, не удалила последующий TPL рисунок. loadPoint восстанавливает только присутствующий BG/TPL, но не очищает отсутствующий.
- showTemplateDrawing=false скрывает preview TPL, но helper drawExportDrawings всё равно экспортирует его. Это установленное несовпадение; полные форматы видео не запускались.
- BG допускает рисунок в gap, и BG Grid/Single независимы. Наружные поля подтверждены geometry/code, отдельный native тест поля ещё нужен.
- Onion применяет два соседних кадра без wrap. Совпадающие пиксели двух слоёв alpha .35 композитятся, поэтому итоговый alpha не равен .35.
- CODE-кандидат: при bgLayerAboveDrawings=true BG рисуется в compositeAllLayers дважды. Полупрозрачность и паритет export нужно проверить отдельным fixture.
- В этом probe не было pageerror. Отсутствие исключения не означает правильного рисунка.

## 4. Рекомендуемая модель движка

### События и время

Один input coordinator для mouse/touch/pen приводит события к point/time/pressure/buttons. Второй источник событий приходит из существующего playback/scrub TimeGrid: изменение отображаемого occurrence в конкретной ячейке. Рисование не должно зависеть только от pointermove.

DrawingGesture содержит один ID операции Undo, настройки кисти на начало жеста, удерживаемую позицию, текущую цель, историю samples и список временных назначений. FrameTransition содержит tick, cellId, occurrenceId, local coordinates и transforms.

Обычный FRM ставит dot на новое отображаемое occurrence, даже если позиция не менялась. Повторный repaint того же frame без смены адреса не добавляет opacity. Возврат к тому же occurrence после другого кадра является новой записью. Порядок событий фиксируется, чтобы pointermove и frame tick не создавали двойные случайные stamps.

Long Stroke хранит траекторию один раз и назначения prefix/window для разных frames. Trail ссылается на диапазон времени, не на приблизительные «N×10 points». После завершения зафиксированная геометрия/вариант остаётся воспроизводимым. Точный alpha при многократных наложениях проверяется против художественного эталона.

Playback clock, номер исходного кадра, индекс банка и occurrence ID различаются. Не подменять настоящее расписание (direction, pattern, loop, offset) циклом ++activeFrame % 96. Начальный corrected lab должен подключаться к тому же вычислению кадра, которое затем будет использовано в TimeGrid.

### Документ и размещение

Минимальная структура:
- Document: schema, engine/renderer version, surfaces, ordered operations, assets.
- Surfaces: BG Grid и BG Single с размерами композиции; TPL с логическим размером кадра; FRM по устойчивому occurrenceId.
- Operation: gestureId, brush snapshot, geometry/asset reference, placements, ordered paint/erase/fill, affected bounds.
- Temporal placement: occurrenceId, transform, clip, диапазон траектории/времени и порядок композита.
- History: атомарные обратимые изменения документа с бюджетом байтов, включая все соседние placement и TPL→FRM bake.
- Legacy raster: небольшие tiles/image assets с исходными размерами и привязками; не «векторизовать» старый PNG с потерями.

TPL и повторяемый long path не копируются 96 раз. При изменении колонок меняется размещение, а не исходная геометрия. При смене preview resolution оригинал не пересэмплируется. Новая выборка требует соответствия occurrence; orphan drawings сохраняются.

Штрихи как данные дают независимость от resolution и точную историю, но не гарантируют скорость. Полный пересчёт длинного пути на каждое событие может быть медленнее готового bitmap.

### Геометрия и raster

[perfect-freehand](https://github.com/steveruizok/perfect-freehand) предоставляет outline, pressure, smoothing/streamline и cap/taper. Его разумно оставить генератором hard Round. Он не владеет временем, BG/TPL/FRM, Undo или проектом.

Для Spray/soft Round нужны последовательности неизменяемых отпечатков: geometry фиксируется, seed/algorithm version сохраняются. Один и тот же saved результат не меняется от длины очередного события, zoom или экспорта.

Fill является отдельной операцией: область внутри нарисованной фигуры активного слоя, с holes, bounding box и фиксированным результатом. Контур региона либо локальная маска выбираются после теста тонких/мягких границ. Не обещать универсальную векторную заливку soft Spray и не определять region заново по низкому proxy.

Raster cache хранит только занятые tiles. Нужны отдельные бюджеты для active gesture, committed drawing, geometry indexes, undo и export. Export может рисовать tiles последовательно. Прогресс/отмена для тяжёлой заливки и холодного восстановления не должны блокировать ввод.

Live preview должен дополнять новые stamps и обновлять затронутую область. Для hard PF stroke надо исследовать bounded tail с проверкой совпадения; нельзя просто нарезать stroke на куски с заметными швами или обещать готовый incremental API. Старые .3/.4 outlines/stamps остаются неизменными при открытии.

Предыдущие измерения .4: live render p95 hard Round 1.9 ms, Spray 47.3 ms, soft Spray 123.3 ms. Это другой, уже сохранённый workload, не новый benchmark этого аудита. Цель оптимизации сначала в live draft path. GPU/WebGL/Rust не устраняют потерянные frame events.

### Другие библиотеки

[Klecks](https://github.com/bitbof/klecks) имеет полноценные кисти, слои и paint bucket. Это источник кандидатов для отдельных paint-инструментов или отдельного optional editor, если автор позже захочет такой workflow. В текущем аудите он не интегрирован и не измерен на TimeGrid.

Рекомендация оставить PF внутри общей модели является выводом о совместимости с авторской временной механикой, а не доказательством, что PF самый быстрый из всех редакторов. Выбор GPU renderer или заимствование flood-fill можно сделать позже по отдельному профилю, не меняя document/time contract.

## 5. Состав исправленного стенда, до реализации

Это предложение следующего согласуемого выпуска drawing.5, не новая опубликованная версия.

1. Сохранить текущий lab, хорошие настройки/стабилизацию, Save/Open и Undo/Redo. Не создавать четвёртый независимый продукт и не менять production.
2. Общая адресация времени с TimeGrid. Single и Grid должны показывать настоящее frame mapping. Playback, pause, scrub, направления и переходы проверяются как один контракт.
3. Восстановить обычное удержание, Long Stroke/Trail, 1F и Onion. Доступные контролы называются так же; никаких новых пользовательских «режимов точек» для уже существующей функции.
4. Вернуть BG поля/порядок и параметры Spray. Устранить live Spray lag в том же сценарии, не менять ранее сохранённые particles.
5. Проверить TPL live/bake, erase, clear, Undo/Redo для временного жеста и соседних областей. Учитывать существующее TPL окно при последующем переносе.
6. Поддержать изменение колонок/gaps и сохранение адресов. Добавить небольшой реальный image sequence fixture, чтобы тест не ограничивался цветными плитками.
7. Новый version/log, production build и отдельная неизменяемая Pages ссылка только после прохождения автоматической матрицы. Ссылка внутри lab и карта сборок указывают одну текущую версию.

Это один логический этап совместимости. Внутри него сначала делается coordinator/time-routing, потом paint/render; не выпускать каждую недостающую старую кнопку как отдельное не связанное приложение.

Заливка новой фигуры идёт после этого этапа. Полный медиапроект и proxy→original export следуют после проверки нового документа и migration. Эти задачи остаются в плане, но не объявляются готовыми вслед за hold-stamp fix.

## 6. Автоматическая приёмка до авторского теста

| ID | Проверка | Требуемый результат |
| --- | --- | --- |
| T01 | Single, pointerdown, 6 frame transitions без movement | Все посещённые frames имеют след, один Undo убирает всё |
| T02 | Движение, tick между событиями, быстрый проход | Нет пропусков, соединения в чужом кадре или двойного alpha от одного события |
| T03 | Grid playback с разными offsets/direction/pattern | Stroke следует отображаемому occurrence; индекс ячейки не становится ID рисунка |
| T04 | Pause/resume, шаг назад/вперёд, loop/revisit | Явный стабильный порядок и отсутствие скрытого сброса/дублирования gesture |
| T05 | Long Stroke, Trail=0 и N, mouse/touch/pen | Накопление или временное окно; release сохраняет; один Undo/Redo |
| T06 | 1F on/off, широкая кисть, края и углы, gaps | Изоляция текущей ячейки при on; ожидаемые соседи при off, корректный Undo |
| T07 | BG поля/просветы, Grid/Single, порядок | Правильная композиция и независимость BG surfaces |
| T08 | TPL repeat, visibility, APLY TMPL, Undo | Один общий оригинал; bake обратим; preview/export semantics согласованы |
| T09 | Round, Spray scatter/dotScale, softness, erase, opacity | Стабильный характер; saved .3/.4 не меняются; state настройки не протекают в старые strokes |
| T10 | Onion prev/next на границах банка | .35, no-wrap, overlay не записывается в рисунок/финальный export |
| T11 | 96 frames, columns/gaps/zoom/DPR/aspect change | Логический рисунок и occurrence сохраняются; отдельная проверка aspect mapping |
| T12 | Save, закрыть, Open, cache rebuild, Undo/Redo, Clear | Проверены структура и пиксели; старая raster fixture мигрирует без потери |
| T13 | Длинный live gesture 5/20/60 s, разные кисти | p50/p95/max input+geometry+render и RAF; стоимость по мере роста, память и cancel отдельно |
| T14 | Preview vs transparent PNG / затем media export | Тот же document recipe, слои/alpha/erasure совпадают; scaling проверен отдельно |
| T15 | blur/cancel/lost capture/pinch/resize/инструмент во время gesture | Нет потери уже принятой работы, хвостов и навсегда зажатой кисти |

Физический телефон и pen остаются отдельной приёмкой после browser automation. От автора нужен тест ощущения инструмента, не повторная реконструкция механики. До этого исполнитель обязан поймать адресацию, Undo, пропуски и очевидную задержку сам.

## 7. Что сейчас изменено

Добавлены этот аудит, raw browser evidence, диагностический сценарий и обновление плана/истории. App source, зависимости, версии приложений и публичные deployment этим проходом не изменены. Текущий публичный lab остаётся drawing.4. Реализация исправленного стенда следует после согласования перечисленного состава, как ранее потребовал автор.


## 8. Интеграция в обычный TimeGrid: согласованный план 27 октября 2026

Статус: работа начата, выпуска интегрированного приложения ещё нет. Источник карты: ordinary app drawing.2 и Lab drawing.8, HEAD 18be376. Старые разделы 1–7 описывают прежний аудит, их измерения не являются тестами новой интеграции. Текущий межлинейный план находится в D:/Antigravity/TimeGrid/docs/DEVELOPMENT_PLAN_RU.md.

Автор утвердил порядок: согласовать панель в настоящем интерфейсе → карта всех подключений → рабочая цепочка реальный материал / рисунок / playback / save / export → удалить заменённый старый код. Stable и Cloud не меняются. Новых режимов импорта, видов материала, пресетов сетки или часов воспроизведения не добавлять. Grid и Single остаются видами одной работы. Новое рисование читает существующие значения Spacing, aspect, frame identity, pattern, direction, loop, phases.

### 8.1. Решения автора и размещение

- Desktop: принята показанная четырёхстрочная перетаскиваемая панель. Шрифт, accent и оформление настоящего TimeGrid. Не переносить визуальную оболочку Lab.
- Phone: первый макет высотой192px отклонён как слишком большой. Приняты три строки; Save раскрывает сохранение файла и пары S1/L1–S3/L3. Свободное перетаскивание сохраняется и на телефоне. Отдельный постоянный ряд слотов остаётся только desktop.
- Строка1: Round/Spray/Fill, ластик, одна циклическая FRM/TPL/BG, три быстрых цвета и picker выбранного цвета.
- Строка2: одна ручка с выбором Size/Opacity/Edge. Значения независимы; смена выбранного параметра не изменяет кисть.
- Строка3: Undo, Redo, 1F, Long, Save, Clear, Draw/Off. Desktop строка4: три визуально разделённые пары S/L.
- Боковой Draw: полные Recent и Video palettes, обновление палитры всего видео и текущего кадра; подробные Size/Opacity/Edge, Stabilizer/Smoothing, Pressure/Speed, Draw with finger; Spray Spread/Dot/Density; Trail, Onion, Show TPL, Apply TPL, BG above frames, Brush Panel, Open drawing.
- Все параметры Draw постоянно доступны при открытом разделе. Выбор Round/Spray/Fill или FRM/TPL/BG не скрывает параметры и не сбрасывает их. Общая оптимизация остальных разделов меню отложена по словам автора.
- Spray Dot default50% явно выбран автором. Spread150%, density100%. Не подменять default10% старого приложения значением100% стенда.
- BG above frames defaultON уже есть в ordinary app и сохраняется. Export BG остаётся отдельным существующим флагом.
- Size сохраняет смысл CSS pixels при масштабе1 (default4), а не значение32 logicalpx из Lab. Opacity100%, Edge0%; новые Stabilizer/Smoothing50%, pressureON, speedOFF являются настройками принятой кисти Lab. Сохранённые strokes используют собственные параметры.
- Автор не нуждается в миграции старых растровых рисунков. Читатели выпущенных файлов Lab сохраняются. Save drawing не выдаётся за полный медиапроект.

Локальные макеты и фактические размеры: [evidence](drawing-evidence/2026-10-27-integration-panel/README.md). Первый mobile screenshot сохранён как отклонённый вариант, не как утверждённая реализация.

### 8.2. Карта подключений

Номера строк относятся к проверенному main.js drawing.2 на18be376. Имена служат ориентиром после правок. Будущее назначение описывает работу, а не заявляет её выполненной.

| Зона / текущая точка | Существующее поведение | Подключение нового документа / приёмка |
| --- | --- | --- |
| state drawing, main.js169+ | BG/TPL/FRM raster, кисть и видимость | Один StrokeDocument; настройки приложения остаются источником команд; не хранить raster atlas рядом |
| handleFile727, handleVideoFile740, handleImageFiles803 | Текущие video/image/loop/Slice import | Сохранить интерфейс и обработку материала, добавить только привязки рисунков к результату банка |
| generateFrames1278 | Сразу hardClearAllDrawingsAndUndo; новая выборка | Устранить безусловную потерю рисунка. Новый банк не должен случайно получить старой frame-index рисунок. Совпавшие исходные адреса восстанавливаются; несовпавшие данные не удаляются автоматически |
| getExportScaledGap267, applySpacing | Spacing в preview CSSpx, export пропорционален frameW/previewCellW | Одна геометрия текущих ячеек для input/preview/export; не копировать Lab Gap1024px или отдельный Margins в UI |
| setViewMode3582, renderGrid, updateGridColsOnly6743 | Grid/Single/колонки и тот же банк | Менять transform/layout, не пересэмплировать strokes; BG Grid и Single независимы |
| getDrawingGeometry7082, getFrameAtPoint8043 | Кеш геометрии, dataset.frameIdx читается при hit | Получать текущие rects и реальные frame addresses; не читать DOM96раз на каждую точку |
| updateAllCells6401/6485 | Обновление dataset.frameIdx, stationary hold, Long | После настоящего frame transition передать layout/tick в DrawingGesture; старый hold/Long удалить после замены |
| canvasArea nav3055+ | Wheel/pan/touch навигация | Сохранить app navigation, исключить double input; mouse, touch и pen через один drawing coordinator; pinch не рисует |
| drawCanvas8375–9570 | Три разных mouse/touch/pen ветки | Удалить дублирующие handlers; pointer capture/coalesced points/pressure, cancel/blur сохраняют принятую часть |
| drawPalette7383/7407 | Drag mouse/touch | Сохранить drag на обоих устройствах, ограничить доступность панели границами viewport; input/select не запускают drag |
| toggleDrawMode7443, setDrawTarget9951 | D; Q/W/E; FRM при включении; TPL окно | Те же команды, одна кнопка target; Draw mode не останавливает playback |
| brushLocked7432, qDraw9960+, togglePalette14375 | A отдельно от D; P скрывает только панель | Один command path для кнопок и клавиш, блокировка работает для всех pointer types |
| setDrawSize6979 / opacity / softness | CSS size1…120, opacity5…100, edge0…100 | Перевод в logical coordinates один раз при начале gesture; сохранять параметры stroke; UI зеркала синхронны |
| setDrawColor9580; palettes9653/9679/9739/9931 | Recent circles, Video squares, two palette generators | Переместить существующие действия в Draw, сохранить X/ShiftX/V/ShiftV; quick3 и picker являются представлением цвета |
| Round/Spray/eraser | Старые stamp paths внутри main | PF hard Round; принятые deterministic stamps-v2 для Spray/soft; eraser удаляет только выбранную поверхность |
| Fill | Нет в ordinary app; createFill вLab.8 | Вызвать принятый flood fill документа на выбранной поверхности, сохранить fixed runs, cancellation/revision guard |
| 1F / drawOneFrameBtn | Изоляция кисти текущим кадром | Clip реальной ячейки, не atlas-соседа; мышь/перо/touch одинаково; 1Foff сохраняет след на соседях через gap |
| Long / Trail | Несколько legacy paths/snapshots | DrawingGesture transition/carry; обычное удержание ставит точку на каждом кадре; Trail0=накопление, положительный=окно; один Undo |
| updateOnionForItem6213 | Два соседних FRM .35, без wrap | Cache.draw соседних logical surfaces; preview only, не сохранять и не экспортировать Onion |
| compositeAllLayers7850+ | BG/ref/TPL/FRM/ref, BGabove рисуется дважды | Единый порядок и один BG pass; committed+draft tiles, transient viewport canvas; рисунок виден при DrawOFF |
| TPL window7600–7718,10500–10633 | Отдельное свободное live окно | Тот же TPL document и stroke coordinator, общий Undo; сохранить drag/resize/close/follow окна |
| Apply TPL10366 | Raster copy во все frames, затем ClearTPL | makeComposite с isolated children, shared geometry/placements; Undo возвращает TPL и прежние FRM |
| Show TPL10034 | Previewhide, export сейчас игнорирует | Один visibility flag preview/export; исправить известное несовпадение, не вводить новый режим |
| Reference10152+/drawExportRefFrame12416 | Изображение/transform/opacity/order/export | Сохранить вне stroke document; корректное размещение до/после drawing, followFrameTransform |
| Clear10320+, Undo10400+ | Targetclear; FRMundo сломан;8raster snapshots | StrokeDocument target transaction, Undo/Redo; ClearFRM всех привязанных кадров, TPL один, BG текущего вида |
| savePoint/loadPoint15984/16009 | PNG atlas и BG/TPL snapshots; slots session | Immutable document snapshots с бюджетом, пустые слои тоже восстанавливаются; load обратим; один набор3слотов для обеих панелей |
| Save/Open | LabJSON, в ordinary такого файла нет | Скачать/прочитать stroke document и метаданные привязки; валидация до замены; плохой файл не разрушает текущую работу |
| resizeDrawCanvas7505, ensureFrameSheet7786 | Пересоздание/масштабирование raster | Только resize viewport cache; удалить atlas, ImageData snapshots, raster resample originals |
| resetMemoryBtn16108 | Clear + rebuild/revoke; отдельное явное подтверждение | Явный reset по-прежнему очищает через единый command; не путать его с автоматической перестройкой |
| drawExportDrawings11724 | TPL+FRM atlas per frame | Рендер документа в целевой размер, не растягивать preview-cache в full export |
| drawExportBgLayer11695 | ФлагBG, отдельные Grid/Single crops | Signed BG bounds, union с композицией при ExportBGon; OFF возвращает исходную область |
| renderMp4GridFrame11513, renderMp4SingleFrame12466 | Grid/Single frames для video pipeline | Те же media/effects/audio/time inputs; shared drawing render, BG crop/frame placement на каждом tick |
| exportImage13481 / exportSingleStill13884 | PNG/JPEG, metadata, guides, padding, background | Общий drawing recipe, сохранить scale/header/padding и flag semantics; actual downloaded pixel comparison |
| exportPngSeqDrawings12743; calls12920/12932 | Отдельный PNG sequence/alpha слой | Каждый frame по адресу, proper TPLvisibility; PNG alpha и erase сохраняются |
| export flags10638–10731 | Draw, BG, alpha, guides, metadata отдельны | Не объединять флаги и не менять UI экспорта. Backgroundpattern не равен нарисованному BG |

### 8.3. Хоткеи и конфликты

Карта main.js14440+: D draw mode; A brush lock; P palette; Q/W/E BG/TPL/FRM; Z иCtrl/CmdZ Undo; новый ShiftZ/CtrlShiftZ Redo; C clear; L Long; T TPLvisibility. X recent cycle, ShiftX current/previous; V video palette, ShiftV generate palette current frame. [ ] size±4; Shift[ ] edge±5%; Ctrl/Cmd[ ] opacity±10%.

Не перехватывать остальные функции: Space playback, G Grid/Single, F Fit, M menu, N sections, B timecode frames,1–4 viewpresets, Alt+digit save preset,0 MP4,9 JPEG, arrows frame/pattern/columns/phases/direction, ±FPS, Home/End. В старом tooltip Eraser(3) ошибка:3 уже занят preset. Не назначать3ластику иBкисти. Escape закрывает popup, затем сохраняет поведение выхода из Draw. Русская раскладка через event.code. В текстовом/числовом поле Undo иклавиши редактирования принадлежат полю; Space после кнопки не должен случайно активировать её вместе с playback (связано с TG-B018, его общий фикс отдельно).

### 8.4. Ограничения ядра, которые необходимо убрать до включения

1. Lab фиксирует96frames/1024×576 в surfaceSize, validSurface, parser, renderInstances, DrawingGesture, cache, Fill и makeComposite. Ordinary поддерживает произвольный aspect и count, inputcount до3000, плюсcountPlus до10000. Это несогласованность старых контролов, не повод менять их лимиты при переносе рисования. Нельзя просто заменить regex96 на10000, оставив старую геометрию.
2. Document geometry должна быть явной и сохраняемой; существующие Lab-файлы получают прежнюю геометрию при чтении. Изменение zoom/DPR/preview quality меняет transform/cache, а не исходные points/stamps/fill.
3. Instance memo и spatial index должны учитывать геометрию поверхности; случайное изменение глобального FRAME_H ломает открытые документы и snapshots.
4. Stable frame identity не равен номеру ячейки, экспортному tick или индексу нового банка. Нельзя переносить fixture clock ++frame%96. При смене выборки несовпавшие strokes не рисовать на случайном новом кадре и не терять.
5. Наружный BG: signed sparse tiles, расширение export crop; нужен общий layout расчёт для grid/single/stills/video, включая padding и metadata. Ограничения encoder size/even dimensions сохраняются и должны быть видимыми, не молча отрезать BG.
6. Full project/proxy source decoding не входят в эту интеграцию. Независимый от preview документ рисунка подготавливает workflow, но не делает весь media pipeline full-resolution автоматически.

### 8.5. Порядок выполнения и критерии удаления legacy

A. Зафиксировать утверждённую панель и карту. Desktop принят. Phone3строки со слотами черезSave принят. Общая переработка меню отложена.
B. Обобщить геометрию и сохранение ядра; проверить landscape/portrait/square, количество>96, старыеLabreaders и отсутствие пустого atlas. Затем единый adapter к реальной геометрии/времени приложения.
C. Подключить real import → Round/erase/Fill → hold/Long/playback → Undo/slots/Save/Open → PNG/sequence/video. Перевести TPLwindow/Onion/Reference/order и exportflags. Подключить меню и хоткеи к тем же командам.
D. Удалить заменённые handlers, old brush renderers, atlas allocation, snapshots, stale state/пустые compatibility ветви. Проверить отсутствие внешних consumers каждого удалённого имени. Два постоянно действующих движка недопустимы.
E. Один законченный ordinary drawing prerelease со своей версией/логом и отдельной Pagesссылкой. Lab.8 иstable не перезаписывать. Не публиковать частично подключённое приложение как завершённую интеграцию.

Художественная приёмка: тот же низкий FPS/ритм, точка при stationary hold на каждом кадре, непрерывный характер жеста через сетку,1F клип только по выбору автора, мягкость и случайные particles не меняются при reflow/Save/Open, Long накапливает или обрезает временное окно, BG позволяет жест за краями. Замеры latency отдельно от оценки характера штриха.

Техническая приёмка: реальные fileinputs video/sequence/Slice и прямоугольные/вертикальные источники;96и>96frames; Grid/Single иSpacing0/12/большой; mouse/pen/touch browser events; pointercancel/pinch/focus; одинUndo/Redo; все targetclear/slots/Save/Open; TPL/Onion/Reference; PNG/JPEG/sequence/MP4 с flags иmetadata; положительный иотрицательный внешнийBGcrop; бюджет tiles/history, длинныйlivegesture. Физические phone/Pencil/Wacom остаются отдельной проверкой. Старые результаты.8 не переименовывать в результаты integration.

## 9. Результат интеграции 28.35.0-drawing.9

Все перечисленные в8.2 потребители используют единый adapter src/js/timegrid-drawing.mjs; панель src/js/timegrid-drawing-panel.mjs. Старый atlas и его input/history удалены. Геометрия/адреса schema7 хранятся отдельно от viewport, per-stroke coordinateFrame позволяет менять формат без перезаписи оригинала. Банк привязан к метаданным источников; несовпавшие кадры сохраняются в документе и не показываются на новых. Это не полныйproject, см. ограничения.

Desktop4строки, phone3строки152px; слоты черезSave наphone. Подробные параметры всегдаDraw. Общая оптимизацияменю не выполнена и не подменяет эту интеграцию. [Полная проверка, художественная приёмка и ограничения](drawing-evidence/2026-10-27-drawing-9/README.md). [Открыть .9](https://comp1mov.github.io/TimeGrid/drawing/28.35.0-drawing.9/index.html).
