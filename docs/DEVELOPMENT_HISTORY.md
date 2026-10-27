# Development History

Обновлено: 2026-10-27

Этот файл фиксирует не весь chat log, а важные архитектурные решения, баги и смысловые повороты, чтобы не терять контекст проекта.

## 2026-10-27: Drawing Lab 28.35.0-drawing.5

Ветка codex/drawing-engine. Согласованный этап совместимости того же стенда после полного аудита .4. Автор отдельно потребовал учитывать mouse, trackpad, desktop touchscreen, iPad/Pencil и Wacom. [Архитектура и ограничения](DRAWING_PROTOTYPE_RU.md), [сырые проверки](drawing-evidence/2026-10-27-drawing-5/README.md). Ordinary app остаётся drawing.2 по отдельной версификации Lab; stable 28.34 и Cloud не менялись.

Изменения:
- Выделен drawing-time из вычислений 28.34, сохранены direction/pattern/phases/loop/offset и Single loop rule. Grid действительно меняет отображаемые frames. Single использует порядок исходной сетки; дополнительная проверка поймала ошибочное использование одной колонки для temporal mapping, исправлено до публикации.
- Новый DrawingGesture принимает pointer samples и frame transitions. Обычное удержание ставит точку на каждом новом отображаемом frame даже без движения. Long Stroke переносит immutable геометрию с Trail window, release сохраняет результат; один жест остаётся одной Undo-командой.
- 1F клиппирует текущую ячейку для всех типов ввода; без него разрешён footprint на соседях композиции. Onion prev/next .35 без wrap, preview only. FRM следует frame identity при layout/timing changes.
- Единый Pointer Events coordinator, coalesced input, pressure, hardware eraser button 5/buttons32, mouse/trackpad wheel pan и Ctrl-wheel zoom, touch one-finger draw/two-finger navigation, pen ownership, Draw with finger toggle. Blur/cancel сохраняют принятую часть. 90 ms/<3 samples touch-кандидат отменяется при начале pinch. Реальные устройства остаются отдельной проверкой.
- BG теперь покрывает поля и gaps, с отдельными Grid/Single surfaces и BG above. TPL visibility согласована между preview/PNG. Apply TPL хранит изолированную группу операций один раз с 96 placements; eraser шаблона не стирает нижний FRM. Clear выбранного слоя и bake обратимы.
- Потоковые stamps-v2: causal stabilizer, persistent seed/spatial spacing, новые chunks дописываются в tiles. Soft sprites переиспользуются, лимит 4 MiB. Tile cache остаётся 24 MiB. Scatter/dot size восстановлены с default 150%/10%; hard Round perfect-freehand и его smoothing сохранены.
- Schema 4 сохраняет geometry/placements/custom coordinate space/visits, isolated composite и layout/timing settings. Canonical JSON, валидация до замены, старые 1/2/3 читаются прежними renderer. Пустые 96 frames имеют 0 drawing tiles.
- Columns/gaps/margins, 96-slot preview image sequence через file input, PNG 2048/4096 по текущей композиции, drawings-only alpha. Preview images намеренно session-only 512×288 и не входят в Save strokes. Это не полный медиапроект.
- Новые проверки включены в npm test. Ordinary package/lock version .2 сохранены; package script дополнен temporal tests. Lab metadata/HTML/APP_VERSION/README согласованы на .5.

Результаты: 47 unit tests; 28 temporal/input browser checks, 13 extended checks, 9 quality regressions и 1 actual .4-file compatibility check. 20 736 timing comparisons с frozen stable functions. Native mouse hold, synthetic mouse/touch/pen, mobile touch/pinch 390×844, real Save/download/reload/Open, actual file input sequence, TPL eraser isolation, legacy raster appearance, 12 fractional scale/DPR, 96-cell stroke. Физических устройств нет. Build:lab и обе проверки версий прошли. Просмотрены screenshots. Main main.js SHA256 остаётся 6636e424f18390523557d17c811d858e78b9b6d7ef5ef1d510ed939819caabfa.

Edge 156.0.4314.42 headless, 240 rAF input samples, size80, 96frames, scatter/dots100/100: p95 render hard Round 3.0ms, soft Round0.9, Spray1.4, soft Spray1.5. Старые .4:1.9/4.1/47.3/123.3ms. Round немного медленнее, общий speedup не заявлен. Фильтр частиц изменён, 39 690 против39 870 stamps. На1200 samples около20s Round p95 3.5ms, soft Spray1.2ms; release+flush wall39/89ms. Это JS timings, не hardware input latency/RSS. Новые defaults150/10 не использованы для сравнительных цифр.

Ограничения: настоящий Safari/iPad/Wacom/touchscreen не проверены; hard Round всё ещё пересчитывается по сегменту; долгие documents/cold raster нуждаются в дальнейшем profiling; media bank/relink/migration/полный proxy pipeline и Fill ещё не входят. Полный набор прежних palette/slots/reference UI не перенесён. Художественное ощущение новой stamp-стабилизации и временной кисти принимает автор.

Следующий шаг: одна новая Pages ссылка, проверка реальных устройств и авторского движения; затем заливка замкнутой нарисованной фигуры, legacy migration и отдельное согласование переноса в TimeGrid. Публичные старые version folders не заменяются.

Публикация проверена: source commit b16cb74, Pages commit 059f3de. Новый URL HTTP 200, SHA-256 нормализованного HTML 288082b662c2cc73fcf0a189ce7c62ef8804bdae445e5d4d3ccc4acab629f007 совпал со сборкой. Публичные 28 temporal + 13 extended + 9 quality checks прошли повторно. Старый .4 HTML сохранил SHA, обычного index.html в новой папке нет (404). Vercel deploymentEnabled=false остаётся для drawing-engine/gh-pages; production deployment не запускался. Главная карта обновлена до плана 4.10. Проверки публикации: deployment.json и public/ в evidence.

## 2026-10-26: Полный разбор механики рисования и план 4.8

Документационная итерация. Автор указал на потерю stationary hold в Single и потребовал изучить существующий модуль целиком, не придумывать заново его поведение. [Подробный аудит](DRAWING_BEHAVIOR_AUDIT_RU.md) содержит карту функций/документов, источники, художественный контракт, отличия Lab .4, выбранную модель и точный состав предлагаемого drawing.5.

На неизменной 28.34 проведены контролируемые browser probes и отдельный native mouse+rAF сценарий. Edge 156.0.4314.42: около 760 ms удержания, stable 7 кадров, lab 2. В 20 raw records (19 сценариев + setup) также воспроизведены pen/1F и Long Stroke расхождения, residue border Undo, FRM Clear Undo, пустой TPL slot load, hidden TPL export; проверены Onion no-wrap, TPL bake+Undo, reflow 8→6, отдельные BG surfaces. Это не физический телефон и не полная сертификация экспорта. Старые benchmark цифры не переименованы.

План 4.7 архивирован. 4.8 ставит целостную совместимость drawing/playback раньше новых инструментов. perfect-freehand остаётся предложенным генератором линии внутри временного гибридного документа; сам по себе он не отвечает за смену кадров. Следующий функциональный выпуск после согласования конкретного состава. App source/dependencies/version и deployment не изменены.

Проверки документационной итерации: диагностический probe завершён с тремя подтверждающими assertions, pageerror=0; node --check, git diff --check, independent lab version check и npm run build:lab прошли. Stable main.js SHA не изменился. Новая функциональная версия не объявлена.

## 2026-10-26: Отзыв о live lag, BG и характере Spray; план 4.7

Документационное исследование после .4, без изменения app version, исходников приложения и deployment. Автор сообщил о задержке кистей и несовпадении BG/Spray с существующим TimeGrid. Повторён живой ввод в .3/.4 на одинаковой траектории: hard Round .4 render p95 1.9 ms, soft Round 4.1 ms, Spray 47.3 ms, soft Spray 123.3 ms. На длинном Spray стоимость растёт; готовый кешированный benchmark этого не покрывал. Raw evidence и методика: [live-input review](drawing-evidence/2026-10-26-live-input-review/README.md).

Найдены два упущения .4: BG ограничен gridRect и не поддерживает поля вокруг кадров; Spray потерял существующие scatter/dotScale и отличается от stable default 1.5/0.1. Предыдущее описание сохранения характера Spray было слишком широким; уже сохранённые stamps .4 при исправлении нельзя менять. Роль perfect-freehand уточнена как генератор линии. Klecks имеет bucket/brushes, но его 96-frame скорость и адаптация к TimeGrid не доказаны.

Очередь пересмотрена: сначала live-stroke performance и корректные BG/Spray, затем fill/прочие сценарии. Автор хочет заливку замкнутой нарисованной фигуры. Предложена общая модель документа с разными видами геометрии и ограниченными raster tiles; новая реализация ещё не согласована. Единый план 4.7, текущая публичная версия всё ещё .4.

## 2026-10-26: Drawing Lab 28.35.0-drawing.4

Ветка `codex/drawing-engine`. [Текущий стенд](https://comp1mov.github.io/TimeGrid/drawing/28.35.0-drawing.4/drawing-lab.html). Автор согласовал отдельную итерацию: инверсия Vary with speed, Spray/softness и проверка ластика. Ordinary app этой ветки остаётся drawing.2; stable 28.34 и Cloud не менялись. Сначала объяснён объём, затем получено «да, начинаем и продолжаем».

Реализация:
- Vary with speed теперь измеряет CSS-distance / PointerEvent timeStamp с фильтром 35 ms, быстрый ввод толще. Используются coalesced timestamps. Эффективное давление записывается в точки, повторный рендер не зависит от скорости воспроизведения. Включённый Pen pressure имеет приоритет для пера. Настоящее перо здесь не проверялось.
- Round с жёстким краем сохраняет прежний perfect-freehand outline. Spray и soft Round используют стабилизированную getStrokePoints траекторию и пространственно расставленные отпечатки. Spray сохраняет узнаваемую прежнюю структуру: радиус рассеивания 0.95 size, шаг 0.22 size, 10…90 частиц на шаг, размер частицы около 0.1 size и alpha 0.35. Ранее случайность зависела от событий мыши; теперь seed и фиксированная геометрия.
- Soft edge задаёт радиальный спад каждого отпечатка. Полупрозрачность накапливается при наложении, как у stamp-кисти. Edge smoothing относится к жёсткому Round, Stabilizer ко всем трём вариантам. Ластик использует выбранную форму и destination-out на выбранном BG/TPL/FRM. Нижние слои не стираются.
- Schema 3: тип/softness/seed и stamps [x,y,r] либо прежний outline. Частицы фиксируются с шагом 0.0001 логического пикселя, без сохранения пустых bitmap. Сохранение всех float-хвостов переполняло бюджет в 96-frame stress; после фиксации точности тот же Spray сохраняется в 15 929 695 bytes. Файл ограничен 32 MiB; preflight для stamps 40 bytes/частицу консервативен при проверяемой точности и диапазонах.
- Поиск отпечатков для плитки использует отдельный spatial index 256 логических px, размещения в кадрах определяются по реальному следу. Частицы не копируются на каждый кадр. Кеш 24 MiB сохраняет прежнюю схему sparse tiles/LOD/bleed.
- Undo/history учитывает геометрию частиц. Старые schema 1/2 открываются без пересчёта контуров. Лимит 120 000 stamps на один сегмент обрабатывается при rAF и pointerup: текущий жест отменяется целиком, завершённые рисунки остаются; следующий жест работает.
- Perfect-freehand не предоставляет flood fill, слои, Undo или готовую Spray. Автор уточнил заливку: внутри нарисованной фигуры. Записан будущий отдельный шаг: замкнутая область активного слоя в текущем кадре. Видео/изображение не являются границей первой версии. Заливка в .4 не реализована. Также библиотека позволяет taper/caps/easing, кандидат следующего эксперимента после основной очереди, без автоматического добавления новых режимов.

Проверки: 38 unit tests; 34 browser checks на standalone production HTML: 9 основных + 7 дополнительных + 9 качества + 9 новых brush checks. Реальный download/закрытие страницы/Open в свежей странице сохраняет JSON и PNG byte-identical для смешанного рисунка. Независимый Canvas reference сверяет saved stamps с плитками; перестроенный кеш и Open дают точный alpha. Проверены mouse fast-thick, synthetic pen priority, BG/TPL/FRM, erase/Undo, превышение лимита/восстановление, старые contours, 12 дробных scale/DPR. Эмулированный soft Spray touch пересёк 20 ячеек одним жестом (29 250 частиц), Single/Undo/Redo корректны, overflow нет. Физические телефон/перо не проверены.

Production measurements, Edge 156.0.4314.42 headless, Radeon 890M, Windows: Round 96/1000 JSON 4 590 777 B, cache 14 776 320 B, cold 41.9 ms, warm p95 0.3 ms, Undo 0.7 ms, Open 24.1 ms. Spray 96 strokes/96 frames: 595 968 частиц, JSON 15 929 695 B, cold 667.4 ms, warm max 1.4 ms, Open 170.2 ms. Soft Round 96/96: 12 768 dabs, 333 982 B, cold 64.6 ms, warm max 0.2 ms. Это JS submission и RGBA backing, не полный FPS, RSS или pen-to-photon. Cold Spray остаётся существенной проблемой; быстродействие не объявляется законченным.

[Сырые данные и методика](drawing-evidence/2026-10-26-perfect-freehand-4/README.md). Старые .3 evidence не изменены. GitHub Pages commit 8d06223 опубликовал новую папку с lab HTML и лицензиями, без ordinary index (404). HTTP 200 и нормализованный SHA-256 совпали с локальной сборкой. На публичном URL повторно прошли 9 quality + 9 brush checks. Vercel после Pages push показывает прежний production main 3dfd4f0 и не добавил preview для gh-pages; production не публиковался. Единый план 4.6. Следом авторская проверка этих кистей, затем согласование frame IDs/layout/1F; Long Stroke/Trail/Onion, заливка замкнутых фигур и proxy/full-size остаются явно в очереди.

## 2026-10-26: Авторский тест drawing.3 и очередь расширения стенда

Документационная запись, без нового выпуска приложения или стенда. Автор подтвердил: рисование заметно лучше, настройки стабилизации нравятся, Save/Open и Undo/Redo работают корректно. Устройство и браузер в отзыве не указаны; отзыв не переименовывается в проверку физического телефона или пера.

Запрошено:
- Vary with speed должен давать более толстый след при быстром движении и более тонкий при медленном. Нынешняя реакция обратная. Исправление касается новых жестов; уже сохранённые контуры должны остаться прежними. Давление пера независимо от этой инверсии.
- До переноса проверить другой тип кисти и ластик. В текущем UI TimeGrid доступны Round и Spray, softness; pencil/calligraphy найдены как ветви кода, это не основание добавлять новые публичные инструменты без решения автора.
- Long Stroke должен накапливать рисунок по ходу анимации от кадра к кадру. Нужны существующие Trail/фиксация результата, пауза, loop, Undo и Save/Open. Нынешний lab playback, который только адресует новые сегменты очередным кадрам, не закрывает этот сценарий.
- Изоляция и рисование на одном кадре. Существующий 1F ограничивает кисть текущей ячейкой и разрывает соединение при переходе, но не является блокировкой на единственном выбранном кадре. Автор уточнил: изоляция означает нынешний 1F. Включено: след ограничен текущим кадром и его радиус не задевает соседний на границе. Выключено: пересечение границы следом допускается для эффектов. Отдельная блокировка выбранного кадра не добавляется. Single остаётся видом, не новым режимом документа.
- Перестройка сетки, Onion Skin, разные разрешения и proxy → full-size export должны быть проверены в лаборатории до переноса.

Предложенная последовательность, реализация ещё не начата:
1. Следующий lab-only выпуск drawing.4: инверсия speed response, существующая Spray/soft edge и проверка ластика. Зафиксированные следы/частицы, воспроизводимый seed или сохранённые stamps; не новая случайная фактура при каждом zoom/export. Общие Undo/Save/слои.
2. Устойчивая адресация кадров и перестройка layout, 1F по подтверждённой существующей логике. FRM следует за кадром, TPL общий, BG имеет собственные координаты. Перестановка и изменение колонок отличаются от новой выборки/удаления кадров. Несовпавшие рисунки нельзя молча привязать к другому кадру или потерять.
3. Long Stroke с временными данными, накоплением и Trail, затем Onion Skin на этом же документе. Ввод кисти не ограничивается художественным FPS. Уже зафиксированный вид предыдущих кадров не должен меняться при добавлении новых точек. Один жест отменяется целиком.
4. Проверка разрешений и proxy/full-size: одни данные и трансформации рисунка, разные производные кеши. Рендер рисунка заново в полном разрешении. Исходное видео для финала нужно получать из оригинала по сохранённому рецепту; текущий lab export этого ещё не доказывает. Старые raster drawings не получают новые детали от увеличения.

Сначала доводим эти сценарии в одном Drawing Lab, с последовательными версиями/журналом и одной текущей тестовой ссылкой. Перенос в существующий TimeGrid после приёмки. Сначала объяснение конкретной реализации, затем согласование автора. Текущий релиз остаётся 28.35.0-drawing.3, ссылка и исходники приложения не изменены. Единый план обновлён до 4.5.


## 2026-10-26: Drawing Lab 28.35.0-drawing.3

Ветка `codex/drawing-engine`. [Текущая ссылка](https://comp1mov.github.io/TimeGrid/drawing/28.35.0-drawing.3/drawing-lab.html). Выпуск только стенда по прямому указанию автора. Обычный TimeGrid этой ветки остаётся drawing.2, стабильный production 28.34. Cloud не участвовал.

Автор сообщил о ломаной линии, непонятных настройках толщины/плавности, сетке в Single, другом шрифте и смешении ссылок/версий. Предыдущий пакет проверял сохранение и ресурсы, но не достаточно проверял художественное качество и дробные стыки. Перед изменениями согласован конкретный этап исправления стенда; основной движок не интегрировался.

Изменения:
- Grid-жест строит один контур perfect-freehand в стабильных sheet-координатах. Общая геометрия + размещения в FRM/TPL заменяют отдельный перезапуск кисти в каждой ячейке. Spatial index адресует instances. Один жест остаётся одной Undo-транзакцией.
- Квадратичный путь по примеру библиотеки; независимые Edge smoothing и Stabilizer, числовая Width и slider с подсказкой единиц. Для мыши постоянная ширина, optional speed simulation; реальное давление пера отделено. Последнее давление сохраняется при release.
- Найден и исправлен второй дефект: внутренние швы плиток при дробном масштабе выглядели как сетка в Single. Соседним плиткам назначаются целые device-pixel области с выборкой из bleed по общей трансформации. Добавлены 12 комбинаций масштаба/DPR с контролем alpha.
- Schema 2 хранит контур, renderer, параметры и размещения. Schema 1 открывается с сохранением прежнего linear outline, без регенерации. Новые файлы требуют drawing.3 или новее. Невидимый жест не создаёт пустую операцию, лимит обрабатывается также при pointerup.
- Возвращён Inter, шрифт включён локально с OFL. Из шапки убрана ссылка на копию обычного приложения.
- Версия лаборатории отделена: drawing-lab.release.json, lab HTML/APP_VERSION, README и history. Root package/lock/ordinary HTML/APP_VERSION не повышаются для стенда. build:lab выдаёт только lab HTML и лицензии; обычный build больше не добавляет лабораторию.
- GitHub Pages commit `5f5a3f3` публикует только новую папку lab, старые версии не меняет. В новой папке нет index.html обычного TimeGrid. Vercel Git previews отключены branch-specific для gh-pages и codex/drawing-engine. Main/production настройки не менялись. Старое письмо Vercel было ошибкой vite build в статической ветке gh-pages без Vite, не отказом production.

Проверка: 31 unit test; 25 browser checks (9 основных, 7 дополнительных, 9 quality) на standalone production HTML. Повторно 9 quality checks на публичной ссылке. Обычный Edge 156.0.4314.42 headless, Windows/Radeon 890M. HTTP 200, SHA-256 опубликованного нормализованного HTML совпал с локальной сборкой. Ссылка на обычный index в новой папке возвращает 404. Старые .2 артефакты не перезаписаны. Diff ordinary index/main/drawing/package-lock пуст. Подробности и сырые данные: [evidence](drawing-evidence/2026-10-26-perfect-freehand-3/README.md).

Форма: кривая, редкий диагональный ввод и угловой проход сопоставлены с независимым SVG reference. Внутренних пропусков нет; различия сглаженных краёв и допуски записаны, byte-identical reference не заявляется. Измерены Width 12/96 px. Legacy lineTo raster проверен отдельно. Touch-эмуляция 390 × 844 пересекает 20 ячеек и проходит Single/Undo/Redo; synthetic pen проверяет pressure. Это не физические телефон/перо, не Safari/Android и не RTX 5090.

Production 96/1000: JSON 4 553 777 bytes, кеш 14 776 320 bytes, cold 48.6 ms, warm p95 0.4 ms, Undo 0.8 ms, Open 34 ms. Один жест на все 96 кадров: 960 точек, одна геометрия, 96 размещений, JSON 81 060 bytes, geometry 4.1 ms. Cold хуже старого 36.5 ms; ускорение этого пути не заявляется. Это JS submission и RGBA backing, не FPS/RSS/VRAM/pen-to-photon.

Остаётся: авторская проверка характера кисти на компьютере и физическом телефоне, cold-path/длинные жесты, синхронный Open, реальные кадры/стабильные occurrence IDs, legacy raster, остальные кисти, полный проект. Next: исправить отзыв в стенде; после принятия кисти согласовать интеграцию в существующий интерфейс TimeGrid. Единый план 4.4. Основное приложение ради этой итерации не выпускалось.

## 2026-10-26: TimeGrid 28.35.0-drawing.2

Ветка `codex/drawing-engine`. Первый perfect-freehand 1.2.3 прототип опубликован отдельно: [Drawing Lab](https://comp1mov.github.io/TimeGrid/drawing/28.35.0-drawing.2/drawing-lab.html). GitHub Pages использует ветку gh-pages и версионную папку. Stable 28.34 и Vercel production не обновлены. Cloud не участвовал.

Что сделано:

- Документ хранит logical points/pressure, параметры, фиксированный контур, порядок и адрес BG/TPL/FRM. Zoom и Open не пересчитывают старую форму.
- Pointer stream, пересечение отрезков с ячейками, coalesced samples, rAF preview. Cross-cell жест является одним Undo. Есть partial eraser, Redo, Clear/Undo, pinch/pan, обработка прерываний.
- Sparse tiles 256 px с полями, LOD, spatial index, LRU 24 MiB. Пустые кадры не выделяют backing. Два viewport buffers учитываются отдельно. PNG строит выходные плитки по исходному контуру через тот же renderer.
- Save/Open рисунка в JSON, schema/engine/geometry validation, защита текущего документа при ошибке. История до 100 действий с бюджетом оценки 16 MiB, session-only. Файл ограничен 32 MiB с консервативным preflight.
- 96 сгенерированных кадров, Grid/Single, отдельные BG Grid/Single, общий TPL и FRM по адресам кадров; live drawing по показанному кадру. Это отдельный стенд внутри Drawing-сборки. Старый UI/engine не заменён.
- Зависимость закреплена, MIT notice включён, build выпускает основной index.html и drawing-lab.html. Все версии обновлены согласованно.
- Добавлены подробная [архитектура/художественная проверка](DRAWING_PROTOTYPE_RU.md) и [сырые измерения](drawing-evidence/2026-10-26-perfect-freehand/README.md).

Проверка: 26 unit tests, 9 основных browser checks на dev и production HTML, 7 дополнительных checks, прежний drawing-engine regression с 4 основными и расширенными сценариями, release check и production build прошли. Touch viewport 390 × 844 прошёл эмуляцию, физический телефон и перо не тестировались. Pixel roundtrip использует явный допуск RGB 2 для браузерного raster/readback; JSON совпадает строго, восстановление вытесненного кеша byte-identical. Исправлен ранний render до layout; static fixture buffer устраняет зависимость фонового сглаживания от частичного redraw. Vite watcher исключает browser evidence downloads, чтобы Windows file lock не завершал dev server.

Замеры production: Windows, Edge 156.0.4314.42, Radeon 890M, 1440 × 1000. 96 кадров/1000 штрихов: файл 4 436 402 bytes, кеш 14 776 320 bytes, cold 36.5 ms, warm p95 0.4 ms, Undo document/index 0.5 ms, Open 29.9 ms. Пустой cache 0 bytes. Это JS submission, не FPS/VRAM/RSS/pen-to-photon. Cold превышает 16.7 ms. Старые результаты 28.34/Drawing.1 не переименованы в новый benchmark.

Ограничения: старые raster assets, старые типы кистей/long stroke/trail/bake, реальный video sampling и все эффекты не подключены к новому документу. Нет полного ProjectDocument, autosave, восстановленной Undo-history после Open или проверки Safari/Android/Pencil. Активный длинный сегмент пересчитывается целиком; заполненная dirty tile переигрывает свою историю, Undo перестраивает индекс, Open синхронный. Следующая итерация после авторского/физического теста: устранить выявленные проблемы, затем адаптер реальных кадров и старого raster. Подробный план сохранён в основном checkout, редакция 4.3.


## 2026-10-26: Ссылка на единый план

Документационная запись, ветка codex/drawing-engine. Версия 28.35.0-drawing.1 и код приложения не изменены. Локальная копия плана отмечена как историческая; действующий общий план находится в D:/Antigravity/TimeGrid/docs/DEVELOPMENT_PLAN_RU.md, редакция 3. Карта ссылок находится в D:/Antigravity/TimeGrid/START_HERE.md. План задаёт один путь до Founders Edition, сначала рисунки и сохранение проекта; Cloud исключён из ближайшей очереди.

Проверка: целевые документы существуют; изменены только указатель плана и эта запись. Новый build этой линии и новые измерения не выполнялись. Результаты прошлых проверок остаются привязаны к прежней итерации.

## 2026-10-19: TimeGrid 28.35.0-drawing.1

Отдельная локальная линия `codex/drawing-engine`, worktree `C:/Users/gregt/.codex/worktrees/timegrid-drawing/TimeGrid`, от стабильного `main` / `3dfd4f0` (28.34). Cloud-код и зависимости не переносились. Стабильный checkout и production не обновлялись.

- Геометрия screen → drawing canvas → cell подготовлена один раз и используется всеми промежуточными точками, а также TPL/FRM/reference-композицией. Регулярная сетка сужает поиск по строке/колонке; нестандартная использует сохранённые rect. Дробные границы и snap проверяются по точным исходным rect.
- Кэш сбрасывается при transform, grid rebuild, смене вида, resize, scroll, изменениях DOM/style и к следующему animation frame. `frameIdx` читается из текущего элемента: анимация не получает устаревший ID из геометрического кэша.
- Пустой FRM имеет размер 0 × 0. Импорт/построение сетки, открытие Draw, просмотр onion и экспорт пустого слоя не выделяют большой sheet. Paint/bake/restore явно создают backing; Clear и загрузка пустого слота освобождают его. Нажатие вне ячеек также оставляет FRM пустым.
- Сохранён порядок растровой инициализации при первой записи: тест выявил разные края кисти и более дорогую композицию при простом переходе с 0 × 0 на рабочий размер. Маленький прозрачный seed/remap создаётся только при первом рисовании; пиксельные эталоны проверяют совместимость с 28.34.
- Рисование в TPL-панели теперь запрашивает композицию через существующий rAF scheduler. Все точки продолжают рисоваться; mouse/touch/pen-адаптеры и параметры кистей сохранены.
- Версия обновлена в package/lock, HTML, APP_VERSION и README. `pretest`/`prebuild` проверяют согласованность версии и наличие записи в журнале.

Проверка: 17 unit-тестов, production build, drawing pixel-parity (4 сценария + расширенная матрица), существующие grid-seams и export-quality browser-тесты прошли. Загрузка PNG fixture из 28.34 сохранила пиксели. Сырые результаты — [drawing evidence](drawing-evidence/2026-10-19/README.md). Повторяемый проход: 96 ячеек, 27 463 → 1 552 чтения rect; пустой FRM при quality 0.5: 192 122 880 → 0 байт RGBA. Это не измерение общего RSS, телефона или FPS. Сентябрьские 36 857 относятся к другому проходу, их нельзя использовать как прямой baseline этой версии.

Ограничения: после первого штриха остаётся полный sheet; sparse tiles, стабильные sample-occurrence IDs, общий input stream и бюджет undo — следующие итерации. В исходной 28.34 найден остаток пикселей у границ после Undo cross-cell stroke; эта версия сохраняет его в эталоне, исправление ещё не выполнено. Телефон/Pencil физически не проверены. Унаследованные npm audit warnings (7 high, 1 moderate) относятся к зависимостям; принудительный breaking upgrade в этой итерации не выполнялся.

## 2026-10-19: Разделение Local 28.34 и Cloud 28.35.0-cloud.1

Организационная итерация, без нового релиза Local. Код `index.html`, `src/js/main.js`, `package.json`, `package-lock.json` и `vite.config.js` в основной папке восстановлен до `main` / `3dfd4f0`. Стабильное приложение остаётся **TimeGrid 28.34**.

- Эксперимент с локальным fast path, cache/bake и Cloud backend перенесён в отдельный worktree `C:/Users/gregt/.codex/worktrees/timegrid-cloud/TimeGrid`, ветка `codex/timegrid-cloud`.
- Исправлена организация работы: эксперимент больше не должен появляться под номером стабильной версии. Для Cloud введена версия `28.35.0-cloud.1`; её реализация и проверки описаны в журнале Cloud-папки.
- Перед восстановлением сохранены копии и SHA-256 manifest в `.timegrid-bench/separation-20261019`. Аудит, его evidence, HELP, пользовательский BACKLOG и `public/` не удалены и не переписаны.
- `AGENTS.md` закрепляет обязательные версии и журнал для каждой функциональной итерации. README исправлен с устаревшего 28.33 на фактическую стабильную 28.34.
- Добавлен [план развития](DEVELOPMENT_PLAN_RU.md), редакция 1. Drawing input/storage выделены в ранние самостоятельные этапы с сохранением BG/TPL/FRM. Desktop mouse-замеры аудита не считаются проверкой телефона.

Разделение не является внедрением нового drawing engine или облачным развёртыванием. Production не обновлялся.

Проверка Local после восстановления: 14 вычислительных тестов и production build прошли; `git diff HEAD` по пяти файлам приложения и сборки не показывает изменений. SHA-256 исходных audit/evidence, HELP и BACKLOG совпали с сохранённым manifest.

## 2026-10-05: TimeGrid 28.34

Версия отправлена в `main`: [b2de157](https://github.com/comp1mov/TimeGrid/commit/b2de157). Production deployment отдельно не проверялся.

### Разрешение импорта и экспорта

- На телефонах и планшетах импорт по умолчанию — `/2`, на компьютерах — `Full`. iPadOS с идентификацией Mac распознаётся как планшет; сенсорный Windows-ноутбук остаётся компьютером.
- Меню импорта сохраняет варианты `Full /2 /4…`. Ручной выбор не сбрасывается при изменении размера окна.
- В экспорте — `Export Resolution`: по умолчанию `Same as Import`, варианты уменьшения `/2`, `/4`, `/8`.
- Размер экспорта берётся из размеров уже извлечённых кадров (`captureW/captureH`). Изменение меню импорта без регенерации не меняет этот размер; уменьшенные кадры не растягиваются до разрешения исходного видео.
- Для Grid размер складывается из ячеек: четыре кадра 800×450 в сетке 2×2 без отступов дают 1600×900.
- При неподдерживаемом размере MP4 сообщает об ограничении кодека вместо скрытого уменьшения. Нечётные размеры округляются для требований кодека.
- Для восстановления детализации нужно повторное извлечение из исходника. Текущий `Regenerate Grid` очищает рисунки.

### Цвет и стыки сетки

- Удалён лишний проход Colorama в видео: он рисовал исходный кадр поверх результата Chronophoto и Frame Diff, перекрывая шлейф и инверсию. Теперь Colorama применяется к исходным слоям до их смешивания; основной слой still-экспорта тоже получает фильтр. Учтены фильтры отдельных ячеек Grid при Cascade.
- Исправлены округление границ и лишнее однопиксельное перекрытие ячеек в экспорте. При исходном соотношении сторон кадр заполняет ячейку без повторного вписывания, создававшего тёмные полосы.
- В preview убрана тёмная обводка, стыки выравниваются по экранным пикселям, при нейтральной трансформации отключён лишний слой трансформации браузера.
- Scale по умолчанию — 1 вместо 1.02: изображение не обрезается ради маскировки швов.

### Chronophoto

- Добавлен экспериментальный `Exposure`: нормализованное взвешенное усреднение текущего кадра и копий, управление через `Exposure Mix`. Это художественное усреднение в цветовом пространстве браузера, не физическая экспозиция в linear light. Подробности — [CHRONOPHOTO_EXPOSURE.md](CHRONOPHOTO_EXPOSURE.md).
- Предыдущий коммит [5cd926e](https://github.com/comp1mov/TimeGrid/commit/5cd926e) добавил анимацию глубины: сворачиваемая таблица ключей по номеру кадра одного лупа, процент глубины, добавление/удаление ключей, Smooth/Linear/Step. Ячейки Grid используют собственный отображаемый кадр. Таблица растёт вниз без отдельного внутреннего скролла.

### Проверки

Сборка и 14 вычислительных тестов прошли. Браузерные проверки покрывают Chronophoto/Exposure, стыки сетки, цвета preview/still/MP4, разрешение реального экспорта клавишей `0` и defaults устройств. В проверенных точках декодированного MP4 отклонение цвета — 1–2 значения RGB из 255.

Мобильные defaults проверены в эмуляции iPhone, Android и iPadOS, не на физических устройствах. Пользовательский исходный ролик не входил в автоматические проверки цвета.

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

## 2026-07-04 Static Seam Preview v28.25

Fixed a confusing Seam Blend debugging gap where the blend was visible during playback but not reliably visible in static preview.

- Seam detection now uses the displayed `frameIdx` for each cell.
- Static grid cells that show ending frames receive the same beginning-frame overlays as playback/export.
- Grid rebuilds now run one post-build visual sync for Chronophoto, Seam Blend, Frame Diff, color correction, Colorama, and onion overlays.
- MP4, still, and PNG sequence export paths pass their displayed frame index into the seam helper to keep preview/export aligned.

## 2026-07-07 View presets v28.26

Added fast viewport presets for recording and repeated inspection.

- `1-4` recall view presets.
- `Alt+1-4` saves the current view into a session-only preset slot.
- Default preset 1 is normal contain fit.
- Default preset 2 is cover/fill fit with a small overscan hotfix so edges leave the screen cleanly.
- Default presets 3 and 4 zoom into the grid for close and medium inspection.
- Brush hotkeys moved away from `1-4` so view presets can use the easier number keys.

## 2026-07-07 Landing copy and footer polish

Updated the public landing page copy and footer language.

- Removed the old `vibecode` wording.
- Kept the public page focused on TimeGrid as a free, independently developed tool.
- Polished footer spacing so the support/development line reads more cleanly.

## 2026-07-07 Mobile quick panel v28.27

Made the phone portrait layout more usable without creating a separate mobile app shell.

- The quick toolbar becomes a vertical rail on the left for mobile/coarse pointer portrait layouts.
- The side menu opens beside that rail, keeping the quick controls reachable.
- Top metadata is compressed on mobile and can collapse while scrolling to help iOS Safari hide its browser chrome.
- `Fit` uses the shared visible-viewport helper and accounts for the mobile rail.
- Added `Panel Opacity` in TimeGrid Info for tuning transparent menu overlays while seeing the image underneath.
- Fixed the Vite build config by moving `inlineDynamicImports` under `rollupOptions.output`.

## 2026-07-07 Mobile blur cleanup v28.28

Removed an over-strong blur that had been introduced with the mobile menu pass.

- Removed blur from the side menu, quick toolbar buttons, and mobile sticky menu header.
- Left the draw palette and small busy overlay blur untouched because they are separate surfaces.
- Production v28.28 was verified after deployment with no runtime errors reported by Vercel.

## 2026-07-07 Mobile quick actions v28.29

Released after v28.28.

- Added a mobile-only `N` quick button above the menu button.
- The button calls the existing `toggleAllSections()` command, giving phone users access to collapse/expand even when the menu header is clipped.
- Quick Fit now supports a repeated-click gesture: first click/tap performs contain fit, second fast click/tap performs cover/fill fit.
- The implementation reuses existing `fitActiveView({ mode: 'cover' })` instead of adding a separate fit algorithm.

## 2026-07-07 Mobile fit and panel controls v28.29 follow-up

Polished the same mobile control pass without bumping the visible app version.

- Panel opacity now defaults to `50%`.
- The same panel opacity value drives the side menu, quick buttons, sticky mobile menu header, and draw palette.
- On mobile, the second quick Fit tap uses cover/fill and allows the image to scale underneath the left quick rail; the first tap still fits to the visible area beside the rail.
- The phone draw palette now has a compact responsive layout so it does not spill across the viewport.
- The mobile landing screen is left-aligned inside the usable area beside the quick rail.
- The side-menu header collapse button now shows `N`, matching the mobile quick collapse button and the existing keyboard shortcut.
