# Drawing Lab drawing.3: проверка 26 октября 2026

Версия `28.35.0-drawing.3`, ветка `codex/drawing-engine`. Это новый набор измерений. [Предыдущий drawing.2](../2026-10-26-perfect-freehand/README.md) не перезаписан.

Основной итог берётся из `production/`, собранный standalone HTML на localhost:5198. `dev/` содержит промежуточные проверки; ранний dev benchmark предшествует исправлению дробных стыков. Windows, Node 24, Edge 156.0.4314.42, Radeon 890M через ANGLE, viewport 1440 × 1000. Это обычный браузер в headless automation, не встроенный preview и не компьютер автора с 5090.

## Воспроизведение

```powershell
npm test
npm run build:lab
# Serve .drawing-lab-build with Vite preview config on port 5198.
$env:PLAYWRIGHT_MODULE='C:/Users/gregt/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:TEST_URL='http://127.0.0.1:5198/drawing-lab.html?verifyPixels=1'
$env:DRAWING_OUTPUT='docs/drawing-evidence/2026-10-26-perfect-freehand-3/production'
node tests/drawing-lab.browser.cjs
$env:TEST_URL='http://127.0.0.1:5198/drawing-lab.html'
node tests/drawing-lab-extra.browser.cjs
node tests/drawing-lab-quality.browser.cjs
```

Не запускать эту команду для старой версии с тем же output path. Новый выпуск получает новую папку. PLAYWRIGHT_MODULE можно заменить своей установленной Playwright.

## Результаты

- 31 unit test, включая shared geometry/placements, порядок TPL и миграцию schema 1.
- 9 основных checks: пустые кадры, Undo/Redo, alpha/eraser, настоящий download → уничтожение страницы → Open, плохой файл, zoom/Clear, playback, LRU, mobile layout.
- 7 дополнительных: швы/alpha, BG и адреса, playback drawing, timing, pinch, interruption, PNG.
- 9 quality checks: независимая SVG-reference, Single, измеренная ширина, параметры smooth/streamline, старый raster, дробные масштабы, единый 96-frame gesture, синтетическое перо, непрерывный touch.
- Все перечисленные проверки production прошли. Page errors: 0. Сырые JSON: [checks](production/checks.json), [extra](production/extra-checks.json), [quality](production/quality-checks.json), [benchmark](production/benchmark.json).

| Production fixture | Измерение |
| --- | --- |
| Пустой cache | 0 bytes |
| 96 кадров / 1000 отдельных штрихов, JSON | 4 553 777 bytes |
| Кеш этой сцены | 14 776 320 bytes, бюджет 25 165 824 |
| Cold rendering | 48.6 ms |
| Warm p95, 10 повторов | 0.4 ms |
| Undo document/index | 0.8 ms |
| Open | 34.0 ms |
| Один жест, 960 точек, 96 размещений | 1 geometry asset, 81 060 bytes, 4.1 ms geometry |
| Локальный контур 10 000 точек, 5 повторов | p50 6.3 ms, p95 11 ms |
| Интерактивный default renderer, 90 input samples | input p95 0.1 ms, geometry p95 0.2 ms, render p95 1.1 ms, event-to-render-end p95 1.2 ms, max 16.4 ms |

Это JavaScript submission timings. Нет измерения полного FPS, pen-to-photon, GPU completion, VRAM, process RSS или загрузки медиа. Cold 48.6 ms хуже прежних 36.5 ms в drawing.2; форма/renderer изменились, нагрузка и шум прогона тоже влияют. Ускорение cold path не заявляется, он остаётся задачей оптимизации. Warm p95 0.4 ms не означает 2500 FPS.

## Форма и пиксели

Независимый full SVG-path reference сравнивается с раскладкой того же штриха по frame tiles при масштабе 0.25. Для curve/diagonal/corner нет случая reference alpha >200 при output alpha <32. Средняя абсолютная alpha-разница на ink: 0.054 / 0.428 / 0.355 из 255. Максимальные edge-разницы 57 / 67 / 38, доля ink pixels с delta >8 ниже 2%. Это фиксированный допуск на различную raster subdivision/AA полного и плиточного paths. Test сначала показал 1.53% против слишком узкого 1.5%; после осмотра изображений добавлены отдельные проверки внутренних швов, а предел для edge comparison установлен 2%. Тест не маскирует потерю внутренней области: missingInk обязан быть 0.

Тест дробных стыков проверяет горизонтальный полупрозрачный штрих по всей внутренней длине при DPR 1, 1.25, 2 и scale 0.13, 0.77, 1.248, 2.63. Все внутренние alpha равны 115; провалов на границах плиток нет. Скриншот Single тоже осмотрен. Именно прежний дефект был виден как тонкая внутренняя сетка.

Legacy comparison использует прежнюю tiled lineTo rasterization, а не full-canvas path с другим AA. Старые точки/outline сохраняются точно. Save/Open geometry JSON совпадает строго, основной pixel roundtrip допускает RGB delta 2; LRU eviction восстанавливает tile output точно.

## Визуальная проверка

- [Непрерывная кривая через сетку](production/continuous-grid.png).
- [Один кадр](production/continuous-single.png).
- [Измеренная ширина, Single без внутренней сетки](production/width-single.png).
- [Полноценный touch в мобильной эмуляции](production/touch-single-emulation.png).
- [Phone layout](production/phone-emulation.png).

Эмуляция 390 × 844, DPR 3 с cap renderer 2. Синтетический pen через CDP проверяет передачу давления и отпускание. Физические телефон, перо, iOS Safari, Android Chrome не проверены. Авторская художественная приёмка ожидается.

## Незакрытые ограничения

Cold rebuild, синхронный Open/JSON, перерасчёт всего активного длинного контура, стоимость dense history в dirty tiles. Нет интеграции реального видео/старого raster/всех кистей/ProjectDocument. Undo-history не переносится через файл. Ощущение кисти на физическом телефоне и стилусе нельзя вывести из этих цифр.

## Публичная проверка

GitHub Pages commit 5f5a3f3. [HTTP, hash и licenses](publication.json). [9 quality checks на публичной ссылке](public-quality-checks.json). Проверена версия drawing.3, нормализованный SHA-256 совпал с собранным HTML; обычный index.html по новому пути отсутствует. Это отдельный deployment, повтор теста не выдаётся за ещё одну физическую платформу.
