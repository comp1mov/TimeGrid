# Drawing Lab .6: evidence

27 октября 2026. Windows, Edge 156 headless. Физические телефон, touchscreen, Pencil/Wacom и trackpad не проверены.

- production/temporal:28 проверок timing/input/layers/Save/Open/reflow.
- production/extended:13 проверок stamped brushes, image input, Onion, wheel zoom и touch pinch.
- production/lab-quality:9 проверок формы, давления, стыков,960-точечного прохода всех96 frames и legacy schema 1.
- production/workspace:11 новых проверок .6, report.json, desktop/mobile screenshots, реальный файл exterior-bg.timegrid-drawing.json.
- compatibility/legacy-4.json: настоящий .4-file даёт прежний PNG hash ff5ebabcf7f853ebe8aebdc21211663282b9e3d92d936a793b45278811bc4c6c.
- live/results.json: сырые240rAFsamples,96 frames,size 80,scatter 150,dot 100,density 100. Render p95 Round 2.1 ms/softRound 0.8/Spray 1.2/softSpray 1.3. Размер окна1440×1000, canvas изменился вместе с меню. Не объявлять строгим сравнением .5/.6 или физической задержкой.
- npm test:50 passed, включая20736 timing comparisons с frozenstable28.34.
- public/: все 61 browser checks повторно прошли на public URL. deployment.json фиксирует HTTP 200 и совпадение SHA256 с локальной сборкой, неизменность .5, index.html 404 и доступность лицензий. Pages commit 786e1e2, source 930c6d0. Проверенные GitHub statuses пусты; branch-specific Vercel deployment отключён.

Старая геометрия BG .5 на границе проверена против опубликованного .5. Новый внешний BG не снимает crop со старых штрихов. Export bounds консервативны по геометрии красящих операций: ластик не уменьшает прежний внешний crop. Рисунок хранится в schema 5, старые reader версии его не понимают. FRM/TPL сохраняют frame-local geometry; BG остаётся composition-relative, при смене пропорций сетки масштабируется как в .5.
