# Evidence: Drawing 28.35.0-drawing.2

26 октября 2026. Ветка codex/drawing-engine. [Публичный стенд](https://comp1mov.github.io/TimeGrid/drawing/28.35.0-drawing.2/drawing-lab.html). [Архитектура и ограничения](../../DRAWING_PROTOTYPE_RU.md).

## Файлы

- production/benchmark.json: основной benchmark готового HTML.
- production/checks.json: 9 browser checks готового HTML.
- production/desktop.png, production/phone-emulation.png: просмотр desktop и touch emulation.
- production/roundtrip.timegrid-drawing.json: синтетический рисунок из Save/Open проверки.
- extra-checks.json: 7 дополнительных сценариев штатного renderer.
- export-single.png: 2048 × 1152 PNG из экспортного теста.
- legacy-regression.json: проверка прежнего drawing engine этой сборки.
- benchmark.json, checks.json и изображения в корне: проверка через Vite dev server. Основные числа для отчёта берутся из production/.
- publication-check.json: проверка доступности и работы публичной сборки, добавляется после публикации.

## Воспроизведение

В Drawing worktree:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview -- --host 127.0.0.1 --port 5196 --strictPort
```

В другом терминале, с установленным Playwright и Edge:

```powershell
$env:PLAYWRIGHT_MODULE='C:/Users/gregt/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:TEST_URL='http://127.0.0.1:5196/drawing-lab.html?verifyPixels=1'
$env:DRAWING_OUTPUT='.timegrid-bench/new-run'
node tests/drawing-lab.browser.cjs
```

Extra checks используют Vite dev URL 5194. Для отдельного прогона старого engine задать TEST_PORT=5195 и DRAWING_OUTPUT как путь JSON-файла, затем выполнить tests/drawing-engine.browser.cjs. Старые evidence не перезаписывать.

## Метод и пределы

96 сгенерированных кадров, без video decoding, audio и temporal effects. Benchmark создаёт отдельный документ, 100 или 1000 штрихов по 24 точки, распределяя их по 1/12/96 кадрам. Вывод рисуется в тестовый canvas 1536 × 1296. Cold render один, warm render десять. Long-stroke geometry: по пять повторов 1000 и 10000 точек. Короткая выборка не является оценкой worst-case или доверительного интервала.

После создания документа проверяется точное равенство сериализации после Open. Undo timing включает операцию документа/индекса, без следующего render. Cache stats снимаются до Undo invalidation.

Canvas readback способен менять raster backend и округление alpha. Pixel checks используют явный verifyPixels и допуск до 2 уровней RGB. JSON проверяется строго. Вытесненная плитка восстанавливается byte-identical через PNG. Швы отдельно проверяются по alpha плоского штриха на границах плиток: 115, а в отверстии eraser 0. Export строится тем же tile renderer, в выходном разрешении.

Timing в extra-checks взят без verifyPixels. Event-to-render-end заканчивается вызовами Canvas в JS. Он не включает подтверждённый compositor presentation и не измеряет время до свечения пикселя. Размер RGBA backing, размер JSON и JS heap различаются. Process RSS и GPU memory не измерялись.

## Основные результаты production

| Кадров | Штрихов | JSON, bytes | Кеш, bytes | Cold, ms | Warm p95, ms | Undo, ms | Open, ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 100 | 443594 | 153920 | 3.5 | 0.1 | 0.1 | 2.9 |
| 1 | 1000 | 4435512 | 153920 | 28.2 | 0.1 | 0.8 | 33.8 |
| 12 | 100 | 443610 | 1847040 | 4.0 | 0.1 | 0.1 | 3.2 |
| 12 | 1000 | 4435678 | 1847040 | 29.7 | 0.1 | 1.0 | 26.5 |
| 96 | 100 | 443680 | 14776320 | 24.4 | 0.7 | 0.2 | 3.2 |
| 96 | 1000 | 4436402 | 14776320 | 36.5 | 0.4 | 0.5 | 29.9 |

Пустой кеш: 0 bytes во всех случаях. Два viewport buffers существуют отдельно. Path2D и объекты документа в таблицу RGBA не включены.

Long-stroke geometry p95: 1000 точек 0.4 ms; 10000 точек 10.1 ms. Это построение одного контура, без обещания такого же времени полного активного жеста на телефоне.

Extra interactive run: 90 mouse-move samples, input p95 0.2 ms, geometry p95 0.2 ms, render p95 1.2 ms; event-to-render-end p95 1.2 ms, p99 15.9 ms. Браузерная автоматизация задаёт свой ритм событий. Cross-cell тест: 120 move steps через 8 ячеек, одно чтение DOM rect за жест. Это другой fixture, чем старый engine benchmark, прямой ratio 1552→1 не заявляется.

Старый engine: 4 сценария 24/96 кадров × .125/.5 плюс расширенная матрица прошли прежние pixel references. У quality .5, 96 кадров, FRM до рисунка 0 bytes, после рисунка прежний atlas 192122880 bytes. Это отдельный renderer и другая геометрия fixture, не честная оценка коэффициента ускорения нового штриха.

## Итог проверки

Техническая пригодность модели для следующего прототипа подтверждена: данные/Undo/Save/Open, отсутствие пустого atlas, ограничение и восстановление кеша. Бюджет 16.7 ms не гарантируется для cold replay и плотных поверхностей. Полная интеграция в TimeGrid не выполнена. Физические телефон и перо не тестировались. Художественное принятие остаётся за автором.
