# Drawing Lab 28.35.0-drawing.6

27 октября 2026. Ветка codex/drawing-engine. [Тестовая ссылка](https://comp1mov.github.io/TimeGrid/drawing/28.35.0-drawing.6/drawing-lab.html). [Проверки и сырые данные](drawing-evidence/2026-10-27-drawing-6/README.md). [Исходный аудит механики](DRAWING_BEHAVIOR_AUDIT_RU.md).

## Граница выпуска

Один прежний стенд, новый временной движок и coordinator ввода. Ordinary TimeGrid остаётся drawing.2, stable 28.34 и Cloud не обновлены. Сохраняются BG/TPL/FRM, Single/Grid как виды, принятая perfect-freehand Round и её Stabilizer/Edge smoothing. Настройки находятся в открытых группах Brush, Drawing, Grid & time, Files & export. На desktop справа, на mobile ниже холста. Spray-параметры показаны только для Spray. Шрифт остаётся Inter.

Реализованы stationary hold, настоящее изменение адресов в Grid, Long Stroke/Trail, 1F, Onion, Apply TPL, поля BG, порядок BG, перестройка колонок/gaps, scatter/dot size и временный image-sequence preview. Это ещё не перенос всех панелей и всего media workflow TimeGrid.

## Разделение ответственности

| Модуль | Ответственность |
| --- | --- |
| drawing-time.mjs | Чистый адаптер вычислений времени из 28.34. Direction, pattern, phases, loop/offset. 20 736 сравнений с замороженным исходным эталоном |
| drawing-gesture.mjs | Жест, его параметры, spatial mapping, переходы между occurrence, накопление и placements |
| brush-geometry.mjs | Fixed stamps, потоковый spatial resampling, persistent seed, pressure/speed, soft sprites |
| stroke-document.mjs | Immutable operations, placements, сериализация/валидация, история и изолированный TPL bake |
| stroke-cache.mjs | Sparse tiles, LOD, invalidation, дописывание новых операций в готовые tiles |
| drawing-lab.mjs | Pointer Events, часы playback, представление, настройки, файлы и PNG |

Stable пока не импортирует новый адаптер. Формулировка «общая модель» означает выделенное проверенное ядро для будущего подключения, а не уже выполненный перенос в main.

## Время и художественная механика

Удержание обычной FRM кисти получает событие смены отображаемого кадра независимо от pointermove. Новое отображаемое occurrence получает точку. Повторный repaint того же адреса не добавляет opacity. Возврат после другого кадра записывает новый след.

Grid использует тот же набор расчётов адресов, что 28.34. Single показывает первую ячейку исходного порядка; переход в Single не пересчитывает timing pattern как одноколоночный банк. Loop After N в Single игнорируется согласно существующему правилу. Random в этом fixture воспроизводится с seed 1; создание нового shuffle на каждом Play из старого UI намеренно не добавлено без сохраняемого seed-контрола.

Long Stroke при playback хранит сегменты траектории и переносит геометрию в последующие кадры через placements. Trail 0 переносит всю историю жеста. Положительный Trail оставляет переносимое окно по ticks, а не по числу input events. Уже нарисованные предыдущие кадры сохраняются. Release фиксирует результат, без старого повторного alpha bake. При паузе новые линии ведут себя как обычная кисть; при смене адреса разрывается соединение между локальными сегментами. Художественная приёмка этого поведения на авторском материале ещё нужна.

1F ограничивает footprint текущей ячейкой и разрывает линию при переходе. Следующий кадр доступен для рисования. При 1F off возможен выход на соседние ячейки композиции, не на случайного соседа bitmap atlas. Single остаётся видом.

Onion отображает FRM соседних индексов с opacity .35, без wrap 95→0. Это guide, PNG его не включает. При изменении соседнего рисунка invalidation затрагивает также соответствующий onion preview.

Новые BG strokes выходят за композицию с полями и gaps. overflow:true отличает их от старой геометрии, для которой сохраняется прежний crop. Ввод нового BG ограничен координатами ±32768; raster tiles создаются по необходимости. Grid и Single имеют отдельные BG. При reflow BG масштабируется относительно всей композиции; FRM/TPL сохраняют локальные координаты кадра. BG above рисуется один раз после кадров и рисунков.

## Ввод

| Источник | Реализованное правило | Что проверено |
| --- | --- | --- |
| Mouse | Capture, coalesced samples, обычная кисть/скорость, правый/средний drag pan, Shift направления 45° | Native Edge mouse и управляемые события |
| Trackpad | Browser pointer для клика/drag, wheel zoom, включая Ctrl/Command-wheel | Wheel protocol; физический trackpad отдельно не проверен |
| Touch | Один палец рисует; два пальца pan/zoom; Draw with finger можно отключить | Touch protocol на эмуляции 390×844 |
| Pen | Pressure приоритетнее speed, не обнулять конец при release, eraser button 5/buttons 32 | Synthetic PointerEvent, не физический стилус |
| Pen + touch | Pen получает владение, touch во время pen игнорируется; pen может прервать touch navigation | Управляемые смешанные события |
| Cancel/blur/resize | Сохраняется уже принятая часть жеста | Browser checks |
| Начало pinch | Короткий touch-кандидат до 90 ms и меньше 3 samples отменяется как возможный случайный контакт | Pinch fixture без лишней точки |

Это единый coordinator по pointerType, не аппаратная сертификация. Safari/iPad/Pencil, Windows touchscreen и Wacom с драйвером ещё не проверены. Tilt, azimuth, barrel-button shortcuts и жесты трёх пальцев не реализованы. Touch suppression не заменяет системный palm rejection. Исключения и лимиты должны проверяться отдельно на устройствах.

## Клавиатура

Назначения TimeGrid перенесены для функций стенда. Physical code сохраняет работу русской раскладки. В полях ввода действуют клавиши самого поля.

| Клавиши | Действие |
| --- | --- |
| Space / G / F | Play-Pause / Grid-Single / Fit |
| Q / W / E | BG / TPL / FRM |
| A / L / T | Brush off / Long Stroke / TPL visibility |
| Z или Ctrl/Cmd-Z | Undo; Shift добавляет Redo |
| C / Escape | Clear target с Undo / Brush off |
| [ ] / Shift+[ ] / Ctrl/Cmd+[ ] | Width / Soft edge / Opacity |
| ± | FPS; Shift шаг5, Ctrl/Cmd шаг5, Ctrl+Shift шаг10 |
| ←/→ / Shift+←/→ | Frame / Phases |
| ↑/↓ / Shift+↑/↓ / Ctrl/Cmd+↑/↓ | Pattern / Columns / Direction |
| Home / End | Tick1 / Tick96 |

D/P, palette/reference/slots и полный экспорт TimeGrid не подменены новыми действиями. Их UI отсутствует в Lab.

## Данные и совместимость

Формат timegrid-strokes, schema 5, engine perfect-freehand@1.2.3. Кадр 1024×576. Fixture содержит 96 самостоятельных frame-N адресов. Это стабильные адреса внутри данного банка, не полноценные UUID/relink/resampling media project.

- Hard Round сохраняет points с эффективным pressure и законченный quadratic-v1 outline. На Open контур не генерируется заново.
- Новые Spray/soft Round сохраняют небольшие immutable chunks stamps-v2. Один пользовательский жест может содержать сотни внутренних операций, но имеет один Undo.
- Стабилизатор stamps является причинным фильтром: новый input добавляет только новые dabs; прошлый след не пересчитывается. Значение Stabilizer сохранено, художественное ощущение stamp-кисти может отличаться от .4.
- Scatter150%, dot scale100%, density100% являются default .6. Dot scale был10% в .5, автор попросил заметнее. Density10…300% масштабирует число частиц. Seed фиксируется на начало жеста; новые частицы не генерируются заново при zoom/Save/Open.
- Geometry space и placements {surface,x,y,visit} независимы от CSS. Layout/gaps задают перевод координат. Перестройка не ресэмплирует рисунок.
- Apply TPL создаёт composite-v1: один сохранённый набор операций шаблона и до 96 placements. Его eraser применяется внутри изолированной группы, не к нижнему FRM. Группа растеризуется по запрошенным tiles. Один Undo восстанавливает оба слоя.
- Schema1/2/3/4 поддерживаются. Schema5 не открывается прежними версиями. stamps-v1 сохраняет прежний gradient renderer. Настоящий файл .4 дал одинаковый SHA-256 PNG на старом и новом renderer.
- В schema5 сохраняются layout/timing/view, 1F, Long/Trail, Onion/TPL visibility, BG order, Export BG и touch setting. Brush controls, zoom/pan и session Undo не являются настройками проекта в файле.
- JSON имеет стабильный порядок ключей. Open валидирует до замены документа. При неверном файле текущая работа остаётся.

## Рендер и память

Sparse Canvas2D tiles: 256 raster px, bleed 2 px, LOD 1/32…4, LRU 24 MiB. Пустые 96 кадров: 0 drawing tiles/bytes. Два display buffers учитываются отдельно, каждый ограничен примерно 4 млн px; это до примерно 32 MiB RGBA вместе, не память процесса.

Новые stamps дописываются в существующие кешированные tiles. Завершение продвигает draft в документ без повторного рисования уже накопленных полупрозрачных частиц. Rebuild/Open/Undo/Redo дают одинаковые PNG для новых stamp-кистей во всех трёх целях.

Мягкий dab использует повторно применяемый sprite 256×256. LRU до 16 sprites, максимум 4 MiB сверх tile cache. Новый renderer отличается от точного gradient .4, поэтому имеет отдельный version tag. Старые рисунки не переводятся на него.

Hard Round пока пересчитывает outline активного сегмента и его tiles. В .6 p95 2.1ms на240samples; исторический .5 был3.0ms, .4 1.9ms. Layout изменился, это не строгий A/B. Bounding placements нового жеста консервативны и могут включать пустые участки внутри bounding box. Дальнейшее уменьшение объёма пересчёта Round остаётся задачей; разрезать принятую линию на куски с заметными швами нельзя.

Undo: до 100 команд и оценки 16 MiB geometry, последняя команда сохраняется. Document guard 32 MiB, до 20 000 операций, 1 млн points, 30 000 input samples в жесте; stamps stream ограничен 120 000 частицами на сегмент, temporal placements до 2048 на операцию. На лимите ввода сохраняется накопленная валидная часть. При отказе транзакции storage текущий draft может не быть принят, ранее завершённые операции остаются. Это предохранители, не целевые размеры производительности. Parse/index/history пока синхронные.

## Изображения и экспорт

Preview image sequence принимает до 96 PNG/JPEG/WebP и до 64 MiB входных файлов, сортирует имена по номеру, повторяет их на 96 слотов. Каждый preview декодируется в 512×288; до 54 MiB RGBA для 96 изображений. Эти session previews не входят в Save strokes и не являются original/proxy media pipeline. При замене bitmap закрываются.

PNG использует текущие layout, tick, TPL visibility и BG order, без Onion. Export BG включает внешний рисунок: crop равен объединению исходной композиции и границ красящих BG-операций. Выключенный Export BG исключает слой и сохраняет базовый crop. Ластик не уменьшает консервативные bounds прежней красящей операции, поэтому пустое поле может сохраниться. Longest side 2048 или 4096, либо drawings only с alpha. Геометрия рисуется заново, с отдельным tile cache 4 MiB. Это доказывает масштабируемость рисунка; загруженные preview images остаются уменьшенными. Оригинальное видео, full media project, MP4/GIF, legacy raster migration, sampling deletion/relink в .6 не включены.

## Доказательства и следующий шаг

50 unit tests,61 browser checks (28temporal,13extended,9quality,11workspace) и один отдельный реальный .4 compatibility check. Точное совпадение timing с замороженными исходными функциями 28.34 в 20 736 случаях. Физических устройств в этом перечне нет. Методика и сырые данные доступны по ссылке в начале.

Следующий пользовательский шаг: проверить ощущение кисти и temporal workflow на настоящем touchscreen/пере. Следующий этап разработки: заливка внутри нарисованной замкнутой фигуры с отдельным Undo и воспроизводимым сохранением. Затем legacy migration и согласованный перенос в основной TimeGrid. Полный проект и proxy идут после этого, по общему плану.
