# Drawing Lab 28.35.0-drawing.4

26 октября 2026. Ветка `codex/drawing-engine`. [Текущий стенд](https://comp1mov.github.io/TimeGrid/drawing/28.35.0-drawing.4/drawing-lab.html). [Проверки](drawing-evidence/2026-10-26-perfect-freehand-4/README.md). [История .3](drawing-evidence/2026-10-26-perfect-freehand-3/README.md).

## Граница выпуска

Это продолжение одного Drawing Lab на 96 сгенерированных кадрах. Ordinary TimeGrid этой ветки остаётся drawing.2; stable 28.34 и Cloud не меняются. Grid/Single являются видами одного банка. Видеоматериал, legacy raster, полный ProjectDocument, 1F, layout/reorder, Long Stroke/Trail и Onion Skin ещё не интегрированы. Текущее переключение playback между frame-N не является готовым Long Stroke.

Автор принял базовую кисть/стабилизацию, Save/Open и Undo/Redo в .3. Для .4 согласованы fast-thick speed, Spray/soft edge и eraser. Принятие характера новых кистей остаётся за автором на его устройствах.

## Документ и геометрия

Format timegrid-strokes, schema 3, engine perfect-freehand@1.2.3. Кадр 1024 × 576, grid 8192 × 6912. Координаты не зависят от zoom, DPR и размеров preview.

- Жёсткий Round хранит исходные x/y/эффективное давление, fixed outline, параметры и renderer quadratic-v1. Путь следует quadratic midpoint примеру perfect-freehand. Уже сохранённый outline не генерируется заново.
- Spray и мягкий Round хранят points, brush type/softness/seed и fixed stamps [x,y,r], renderer stamps-v1. Outline пуст. После коммита геометрия заморожена.
- getStrokePoints даёт стабилизированную траекторию. Отпечатки распределяются по длине пути, с переносом остатка шага между сегментами. Новая seed выбирается один раз на жест. Рендер читает stamps, а не запускает random заново.
- Точность частиц 0.0001 logical px. Ошибка отдельного числа не более 0.00005, при максимальном raster LOD 4 это 0.0002 output px. JSON не хранит ненужные хвосты double. Validator проверяет эту точность, размер, радиусы и диапазоны.
- Один sheet-жест имеет одну геометрию и список placements {surface,x,y}. Переход границы не перезапускает кисть. FRM адресует frame-0…95; TPL размещает части общего жеста в общем tpl в фиксированном порядке. BG имеет отдельные bg-grid/bg-single.
- Кадры выбираются по отпечатку, включая радиус. Round использует flattened contour для hit test; Spray/soft Round проверяют circle/rect только в кандидатных ячейках. Бокс не означает, что заполнены все клетки внутри него.
- Spatial index документа адресует placements. Отдельный WeakMap stamp index с bucket 256 logical px выбирает частицы для области плитки в исходных координатах. Индекс и кеш не входят в файл.
- Bbox при Open пересчитывается по геометрии. Schema 1 сохраняет прежний linear-v1; schema 2 сохраняет старый quadratic-v1 и simulatePressure. Старый вид не меняется от новой speed-логики.

Frame-N пока адрес fixture. Устойчивые SampleOccurrence IDs и явное поведение reflow/reorder/deletion нужны до интеграции. Нельзя привязывать рисунок к другому кадру по случайно совпавшему номеру.

## Кисти и ввод

Width 2…180 frame px, slider и число. Масштаб UI показывает приблизительную экранную ширину hard Round без pressure. Spray footprint шире этой величины из-за scatter. Большая стабилизация даёт намеренное отставание.

| Контрол | Поведение |
| --- | --- |
| Round, Soft edge 0 | perfect-freehand outline, Edge smoothing управляет краем |
| Spray | Шаг 0.22 size, scatter 0.95 size, count clamp(round(size×1.6),10,90), радиусы примерно 0.055…0.1 size |
| Soft edge | Радиальный спад dabs; для Round шаг 0.16 size, для Spray смягчает частицы |
| Opacity | Round outline одна opacity на операцию; stamp-кисти накапливают opacity при перекрытии отпечатков. Spray paint дополнительно ×0.35 |
| Eraser | Выбранная форма/softness/opacity, destination-out только внутри выбранной поверхности. Spray erase без paint-множителя 0.35, как у старого инструмента |
| Stabilizer | Streamline траектории всех кистей. Edge smoothing не меняет частицы Spray или soft Round |
| Vary with speed | CSS-distance / timestamp delta, фильтр 35 ms, давление от 0.2 до 1, насыщение около 1.2 CSS px/ms. Быстро толще |
| Pen pressure | Реальное PointerEvent pressure приоритетно над speed для пера. Для mouse/touch давление либо постоянное, либо рассчитано из скорости |

Speed измеряется до перевода в frame coordinates, поэтому DPR/zoom не меняют реакцию при одинаковом движении руки. Повторная stationary release-точка не создаёт тонкий кончик. Само давление фиксируется в points; рендер не требует заново вычислять скорость.

Настройки фиксируются на pointerdown. Pointer capture и coalesced input сохраняются. Geometry reads не выполняются по каждому кадру/точке. Draft перестраивается по rAF; текущая реализация ещё перестраивает весь активный сегмент, это ограничение для длинных/плотных жестов. Resize, смена вида/инструмента, blur, pointercancel и pinch отменяют draft без коммита.

## Кеш, Undo и экспорт

Sparse Canvas2D tiles 256 raster px с bleed 2 px, LOD 1/32…4, LRU 24 MiB, Path2D cache до 1024 для contour-кисти. Stamp geometry рисуется только в пересекающихся плитках. Пустой банк из 96 кадров не выделяет drawing raster backing.

Соседние плитки получают непересекающиеся целые device-pixel области с общей трансформацией выборки. Исправление .3 для внутренних швов сохраняется. Два viewport buffers считаются отдельно; DPR до 2, примерно до 4 млн px каждый. RGBA bytes не равны памяти браузера: JS arrays, stamp index, Path2D и графический драйвер имеют дополнительную стоимость.

Undo одного жеста отменяет все его размещения, Clear обратим. История до 100 операций и оценки 16 MiB геометрии, последняя операция остаётся. History session-only. Для stamps учитываются x/y/r.

Лимиты: 30 000 точек на сегмент, 120 000 stamps на сегмент, 20 000 strokes, 1 млн points; документ может раньше достичь консервативной оценки 32 MiB. При превышении во время ввода текущий жест отменяется с сообщением, завершённые операции остаются. Open проверяет всё до замены документа. JSON parse и построение индексов пока синхронные.

Save/Open сохраняет рисунок, не полный медиапроект; автосохранения нет. Новые schema 3 требуют drawing.4+. PNG Grid 1536 × 1296, Single 2048 × 1152. Общий renderer заново рисует сохранённую геометрию с отдельным кешем 4 MiB. Это доказательство повторной растеризации рисунка, а не полного proxy → оригинальное видео workflow.

## Что даёт perfect-freehand, что остаётся нашим

[Официальный README](https://github.com/steveruizok/perfect-freehand): getStroke/getStrokePoints/getStrokeOutlinePoints, size/thinning/pressure, smoothing/streamline, easing, start/end cap и taper. Это генератор геометрии, не редактор. Заливка, Spray, UI, слои, Undo, память, файлы и распределение по кадрам реализуются TimeGrid.

Дополнительный кандидат для будущего исследования: сужение начала и конца штриха и настройка caps. Не включено в .4 и не заменяет согласованную очередь.

## Заливка, уточнение автора

Автор хочет заливать внутри нарисованной фигуры. Первая предлагаемая граница: замкнутая область активного drawing-слоя в текущем кадре, без анализа видео/изображения. Заливка должна быть отдельной отменяемой операцией и сохранять зафиксированный результат.

До реализации проверить: тонкий/полупрозрачный контур, антиалиасинг, маленькие разрывы, отверстия, самопересечения, края кадра, TPL, Undo и совпадение proxy/full-size. Для Spray и мягкого контура понятие закрытой границы требует явного порога; нельзя незаметно заливать весь кадр при утечке. Выбор хранения region contour с holes либо небольшой локальной маски требует отдельного прототипа. Большой пустой canvas на все кадры не нужен. Это план, кнопки заливки в .4 нет.

## Доказательства и следующий шаг

38 unit tests; 34 checks на production HTML, Edge headless Windows/Radeon 890M. Независимый raster reference для stamps, точное восстановление кеша, смешанный Save/Open и PNG, все прежние quality checks, synthetic timed mouse/pen, эмулированный телефон со Spray. Скриншоты кистей просмотрены; видимой внутренней сетки/разрывов в этих fixtures нет. Физический телефон/Pencil и авторская художественная приёмка .4 остаются открытыми.

Тяжёлый Spray 96/96, 595 968 частиц: cold 667.4 ms, Open 170.2 ms; кешированный redraw max 1.4 ms. Это известное ограничение, не готовая высокая производительность. Следующая оптимизация должна разделить incremental input и холодную растеризацию с проверкой одинакового результата; увеличение лимитов не решает причину.

После авторской проверки .4 следующий предлагаемый выпуск: stable frame IDs/layout/1F. Затем Long Stroke/Trail/Onion, заливка и разрешения/proxy-full-size. Перенос в обычный TimeGrid отдельно согласуется после сценариев стенда.

Lab имеет отдельные metadata/build/version/history. Публикуется только новый lab HTML и licenses; ordinary app и Vercel production не переиздаются. Старые immutable URLs остаются историей.
