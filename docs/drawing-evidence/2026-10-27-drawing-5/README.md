# Drawing Lab .5: проверка 27 октября 2026

Среда: Windows, обычный Microsoft Edge headless 156.0.4314.42. Desktop 1440×1000, мобильная эмуляция 390×844/DPR 3. Встроенный preview Codex не используется как эталон. Физические touchscreen, iPad/Pencil, Wacom и trackpad не проверены.

Авторитетные итоги сборки:
- all-unit.txt: npm test, 47/47, включая 9 новых temporal/document cases и 20 736 сравнений timing.
- production/browser-checks.json: 28 проверок temporal/input/layer/storage/PNG.
- production/checks.json: 13 проверок stream raster, erase, onion, images, wheel, touch pinch.
- production/quality-checks.json: 9 regression checks, независимый SVG reference, 12 LOD/DPR комбинаций, 960-point/96-cell stroke, телефонный touch.
- legacy-4.json: реальный .4 файл mixed brushes, точное совпадение PNG hash на старой публичной .4 и локальной .5.
- production/*.png: просмотренные screenshot fixtures. PNG file размер не является оценкой памяти.
- live/results.json и long-live/results.json: сырые метрики, параметры и input sequence. Предварительные dev outputs в корне папки не заменяют production/ и all-unit.txt.

## Live input

Native mouse down/up, synthetic pointermove раз в requestAnimationFrame. Четыре кисти, size 80, одинаковый путь через сетку 96 кадров; 240 samples. Margin 0, scatter/dot scale 100%/100% для сопоставления .4. Завершённые частицы слегка отличаются из-за причинного фильтра: .4 Spray 39 870, .5 39 690. Это не pixel-identical A/B старой и новой кисти. Входная траектория и нагрузка близки; методика не измеряет pen-to-photon.

| Кисть | .4 render p95, ms | .5 render p95, ms |
| --- | ---: | ---: |
| Round, hard | 1.9 | 3.0 |
| Round, soft 70 | 4.1 | 0.9 |
| Spray | 47.3 | 1.4 |
| Spray, soft 70 | 123.3 | 1.5 |

Старые числа из отдельного 26 October live-input review, не переименованные новые результаты. Round немного ухудшился, весь движок не объявляется ускоренным. Sprite approximation и новый input filter относятся только к stamps-v2. Spray default .5 150%/10% не использован для этих сравнительных цифр.

Длинный проход: 1200 rAF samples, около 20 секунд на жест, тот же полный путь. Round render p95 3.5 ms, последние треть p95 3.7; soft Spray 1.2 ms и последние треть 1.2. Round 1 operation, soft Spray 442 chunks/39 780 particles, одна пользовательская Undo-команда. Release+два rAF wall time 39/89 ms соответственно, включая wait/IPC; это не чистый commit CPU. Tile cache 1.22/0.69 MiB; не RSS. Нет pageerror или отказа ввода на этих траекториях.

## Проверка семантики

Stationary hold native mouse около 760 ms при 8 fps заполняет последовательные кадры, Undo один. Синтетические mouse/touch/pen получают шесть переходов без movement. 1F footprint клиппируется для всех трёх типов, без 1F захватывает соседний кадр; Undo очищает оба. Long Trail 0 даёт 1/2/3/4/5 сегментов в кадрах, Trail 2 даёт 1/2/2/2/2. Старый alpha rebake при release не копируется.

TPL bake проверен над зелёным FRM: красное кольцо шаблона остаётся красным, hole после eraser остаётся зелёным, не прозрачным. Реальный Save download, reload, Open восстанавливают JSON и настройки. Изображения введены настоящим file input; красный/синий fixture правильно следует playback и PNG.

Onion показывает frame 1 при current 0, frame 95 не заворачивается; PNG одинаков при включённом/выключенном Onion. Pen cancel/blur сохраняют stroke, аппаратный eraser распознаётся по двум вариантам buttons, pen забирает ввод у touch navigation.

Single/Grid проверены дополнительно для восьми patterns: временной порядок Single берётся из исходного grid, а не из геометрии его единственного видимого кадра. Тесты ядра охватывают directions, phases, offsets, ограниченный loop, границы 95/96/194. Источник эталона: tests/fixtures/timegrid-28.34-timing.cjs с SHA-256 исходного stable main.js.

## Команды

npm test
npm run build:lab

Для браузерных сценариев задать PLAYWRIGHT_MODULE, TEST_URL на собранный HTML и DRAWING_OUTPUT:
node tests/drawing-temporal.browser.cjs
node tests/drawing-extended.browser.cjs
node tests/drawing-lab-quality.browser.cjs
node tests/drawing-legacy4.browser.cjs

Live: node tests/drawing-live-performance.cjs. Для длинного прохода SAMPLES=1200 и LONG=1, отдельный DRAWING_OUTPUT. Не запускать CPU benchmarks одновременно.

## Непокрытое

Реальные устройства/драйверы, Safari и Pencil; длительные часы рисования; input limit recovery на каждом сочетании; весь source-media proxy/full export; old raster migration; полноценный project reopen с оригиналами. Автоматические проверки не заменяют авторскую оценку характера кисти. Fill отсутствует и следует отдельным этапом.

## Публикация

Source b16cb74, Pages059f3de. Public .5 HTTP200, нормализованный SHA совпадает с локальным HTML; старый .4 также совпадает со своим неизменным артефактом. Новый ordinary index404. deployment.json содержит hashes/statuses. Все50 browser checks повторены на публичном URL, результаты в public/. GitHub commit status не содержит Vercel checks; branch-specific deploymentEnabled=false сохранён. Vercel production не запускался.
