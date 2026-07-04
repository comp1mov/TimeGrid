# TimeGrid — проектная документация

Обновлено: 2026-06-30  
Текущая версия приложения в коде: `TimeGrid v28.24`

## 1. Короткое описание

TimeGrid — экспериментальный браузерный инструмент для пространственного сэмплинга времени. Он берёт видео или изображения, извлекает/нарезает кадры, раскладывает их в сетку и превращает линейный таймлайн в рабочую поверхность: динамический контакт-лист, spatial montage, frame sampler, визуальный секвенсор.

Главная идея: видео перестаёт быть только линией во времени. Оно становится картой, по которой можно смотреть, рисовать, сравнивать, лупить, накладывать кадры, экспортировать сетки, single-frame версии, анимации и аудиовизуальные паттерны.

Проект пока в первую очередь является личным экспериментальным инструментом Гриши для видео-арта, анализа движения, таймлапсов, рисования по кадрам и перформативной работы с материалом. Публичная/упрощённая версия возможна позже как отдельная ветка или режим.

## 2. Концептуальное ядро

Ключевая формула проекта:

> TimeGrid = frame sampler + spatial time map + drawing/compositing surface + audiovisual sequencer.

Из заметок Notion и legacy-документов повторяются несколько устойчивых понятий:

- **Время как интерфейс** — длительность становится плоскостью, а не только последовательностью.
- **Динамический контакт-лист** — сетка кадров не статична; ячейки могут лупиться, сдвигаться по фазе и играть как паттерн.
- **Симультанное восприятие таймлайна** — зритель видит состояние видео целиком или фрагментами одновременно.
- **Темпоральный градиент** — изменения света, движения, камеры или формы становятся видимыми как пространственный переход.
- **Кинематический сэмплинг** — плотность выбора кадров определяет, останется ли сюжет читаемым или распадётся в орнамент.
- **Хронофотография** — последовательные фазы движения можно показывать как сеткой, так и наложением кадров.
- **Аудиовизуальный секвенсинг** — кадры и ячейки могут работать как шаги музыкального/визуального секвенсора.
- **Экология внимания** — инструмент предлагает альтернативу линейному видео, которое требует постоянного непрерывного просмотра.

## 3. Основные пользовательские сценарии

### 3.1 Видео → сетка кадров

Пользователь загружает видео, выбирает способ сэмплинга и получает сетку:

- фиксированное количество кадров;
- интервалы по секундам;
- интервалы по кадрам;
- scene sampling / выбор сцен;
- диапазон `startFrame` → `endFrame`;
- настройка количества колонок, размера ячейки, loop-поведения, pattern/direction.

Это базовый сценарий: сделать визуальный summary, contact sheet, storyboard, motion-study plate или материал для дальнейшего рисования/экспорта.

### 3.2 Изображение → loop/cut/grid

Приложение умеет работать не только с видео, но и с изображениями:

- single image import;
- loop mode;
- cut mode с `cutCols` / `cutRows`;
- нарезка изображения в кадры/ячейки.

Это важно для poster/sticker/sprite-sheet сценариев и для будущей публичной версии, где быстрый импорт картинки может быть проще, чем работа с видео.

### 3.3 Animation Preview

Сетка может проигрываться как анимация:

- `animFps`;
- `animDirection`;
- `animPattern`;
- random order / random starts;
- `cellSize`;
- `gridLoops`;
- `loopAfterN`;
- `loopOffset`;
- grid/single view.

Ключевой принцип: глобальный tick (`state.currentTick`) должен оставаться центральным источником времени для связанных эффектов. Не стоит создавать отдельные независимые таймеры для новых визуальных модулей, если эффект можно выразить через существующий tick.

### 3.4 Рисование поверх времени

В TimeGrid есть многослойная drawing-система:

1. **BG** — рисование по фону вокруг кадров.
2. **Video Frames** — сами кадры.
3. **TPL** — template layer, общий overlay для всех кадров.
4. **FRM** — per-frame drawing, индивидуальное рисование по кадрам.

Дополнительные механики:

- onion skin;
- long stroke;
- one-frame drawing;
- brush/eraser/spray;
- recent colors и video palette;
- save/load points для рисунков;
- reference frame overlay;
- export alpha drawings / stickerpack-сценарии.

Рисование — одна из самых ценных, но и самых хрупких подсистем. Любая правка в ней должна проверяться на grid view, single view, pan/zoom, iPad/touch и export.

### 3.5 Chronophoto

Chronophoto накладывает предыдущие кадры поверх текущего кадра. Это модуль для визуализации хвоста движения, фаз, походки, жеста, волны, накопленного движения.

Текущая модель:

- включается через `state.chronoEnabled`;
- строит стек ghost-кадров позади текущего кадра;
- `chronoDepth` задаёт количество ghost-слоёв;
- `chronoStride` задаёт шаг между ghost-кадрами;
- `chronoOpacity`, `chronoBlend`, `chronoCascade`, `chronoCascadeMirror`, `chronoCascadeConst` управляют внешним видом стека;
- preview и export должны использовать одинаковую логику выбора ghost-кадров и opacity;
- фактический слой сейчас рисуется поверх базового кадра, но ниже drawing/template/ref-композиции.

Важно: текущий `Clean Loop` не является полноценным crossfade loop. Он работает как `No Wrap Ghosts`: если ghost tick уходит в отрицательное время в начале цикла, ghost-слот становится `null` и не рисуется. Это предотвращает ситуацию, когда первый кадр получает ghost-кадры из конца прошлого цикла, но не убирает скачок между последним и первым базовым кадром.

Иными словами:

- `Clean Loop off`: Chronophoto честно заворачивает прошлое через конец клипа;
- `Clean Loop on`: Chronophoto обрезает ghost-историю в начале клипа;
- ни один из режимов пока не делает плавное появление первого кадра перед loop seam.

Для настоящего smooth loop нужен отдельный режим, условно `Seam Blend`. Он должен начинать подмешивать начало клипа в конце цикла за `N` кадров до шва. Хороший default для `N`: `chronoDepth * chronoStride`, то есть длина шва синхронизирована с глубиной Chronophoto.

Правило для будущих правок: preview и export нельзя разводить. Желательно постепенно вынести чистые функции вроде:

- `getChronoStack(baseIdx, tick, depth, frameCount, stride, cleanLoop, seamBlend)`;
- `getChronoAlpha(distance, opacity, cascade, seamProgress)`;
- `getSeamBlendEntries(tick, frameCount, seamLength, mode)`;
- общий расчёт frame transform rect.

См. также: `docs/CHRONOPHOTO.md`.

### 3.6 Frame Diff

Frame Diff сравнивает текущий кадр с plate/reference кадром через blend mode. Последняя задокументированная ветка развила его из статичного overlay в tick-driven систему.

Текущая модель:

- `frameDiffEnabled`;
- `frameDiffPlateIdx`;
- `frameDiffPlateMode`: `static`, `tick`, `loop`;
- `frameDiffPlateStep`;
- `frameDiffPlateLoopN`;
- `frameDiffPlateOffset`;
- `frameDiffBlend`;
- `frameDiffOpacity`.

Важное решение: Frame Diff не должен быть отдельным animation engine. Его plate-index должен вычисляться из глобального `state.currentTick`, а не из отдельного таймера.

Пользовательский смысл: Frame Diff сравнивает текущий кадр с plate, а plate может быть фиксированным, двигаться по tick, замедляться step’ом или лупиться внутри ограниченного окна кадров.

### 3.7 Color Correction и Colorama

Есть две связанные, но разные группы:

- **Color Correction**: brightness, contrast, saturation, hue, invert, all layers.
- **Colorama**: градиентная/палитровая перекраска, colors A/B/C, offset, blend, opacity, speed, cascade.

Это потенциальная зона для отдельной документации, потому что она пересекается с анализом цвета, генерацией палитры из видео и экспортом визуальных “полос”/палитр.

### 3.8 Audio Collision Sequencer

Audio Collision Seq — одна из самых интересных экспериментальных подсистем. Идея: кадры движутся по сетке, а playhead-ячейки срабатывают как триггеры. Когда кадр попадает в playhead cell, запускается назначенный sample.

Текущее поведение из заметок и кода:

- 4 sample slots;
- загрузка аудиофайла в слот;
- запись с микрофона в слот;
- grab аудио из видео по таймкоду;
- trim in/out для слотов;
- assign mode;
- playhead mode;
- click: assign;
- shift+click: velocity cycle;
- alt+click: clear;
- velocity steps `[0.25, 0.5, 0.75, 1]`;
- `frameMap` хранит slot/velocity/probability;
- preview chips показывают slot, velocity, probability.

Главный UX-вектор из заметок: не раздувать интерфейс. Сделать “play and fun” через генераторы/пресеты:

- `Auto setup`;
- `Reseed`;
- sparse / dense / texture / minimal presets;
- probability и pitch сначала можно прятать внутри генератора, а не делать ещё 20 ручек.

### 3.9 Export

Экспорт — критически важная часть проекта, потому что TimeGrid создаёт не только preview, а артефакты.

Текущие направления экспорта:

- JPEG grid;
- PNG grid;
- PNG/JPEG single;
- MP4 grid/single;
- WebM A/V;
- resampled video;
- PNG sequence for drawings;
- metadata/header options;
- background export;
- alpha drawings.

Главное правило: **WYSIWYG важнее скорости добавления фич.** Если preview и export расходятся, фича считается нестабильной.

## 4. Текущая структура проекта

Проект уже перенесён из старого single-file HTML в Vite-структуру, но логически всё ещё сохраняет большой монолитный основной модуль.

```text
TimeGrid/
├─ index.html                  # HTML-разметка приложения и меню
├─ src/
│  ├─ js/
│  │  ├─ main.js               # основной код приложения, state, рендер, экспорт, audio
│  │  └─ pageViewCounter.js    # клиентский счётчик просмотров
│  └─ styles/
│     └─ main.css              # стили приложения
├─ api/
│  └─ page-views.js            # Vercel serverless API для счётчика просмотров
├─ vite.config.js              # single-file build через vite-plugin-singlefile
├─ package.json
├─ dist/                       # build output, не хранится в git
├─ legacy/                     # архив старых файлов и документации, не хранится в git
└─ docs/
   └─ TIMEGRID_PROJECT.md      # этот документ
```

### 4.1 Команды

На Windows в PowerShell лучше использовать `npm.cmd`, потому что обычный `npm` может блокироваться ExecutionPolicy.

```powershell
npm.cmd run dev
npm.cmd run build
npm.cmd run preview
```

### 4.2 Сборка

Vite настроен через `vite-plugin-singlefile`, чтобы итоговый билд был близок к старой философии standalone-инструмента: один HTML-файл с инлайн-ассетами.

Важное наблюдение: сейчас сборка проходит, но Vite может показывать предупреждения про deprecated CJS API и `inlineDynamicImports`. Это не блокер, но хороший кандидат на будущую техническую уборку.

### 4.3 Деплой

Текущий практический путь тестирования на устройствах — Vercel.

- production URL: `https://timegri.vercel.app/`
- `main` можно держать как стабильную production-ветку;
- experimental branches можно использовать для preview deployments;
- GitHub Pages пока не является основным путём деплоя.

Для тестирования на iPad/iPhone/desktop удобнее всего открывать Vercel-ссылку. Для локальной разработки — `npm.cmd run dev`.

## 5. Архитектурная карта текущего приложения

### 5.1 Single source of truth

В `src/js/main.js` есть большой объект `state`, который хранит почти всю правду приложения:

- source/video/image;
- frames;
- grid settings;
- timecode;
- frame transform;
- color correction;
- colorama;
- chronophoto;
- frame diff;
- animation;
- drawing;
- reference frame;
- export;
- audio sequencer;
- save points;
- internal runtime fields.

Плюс: легко найти состояние.  
Минус: мутации разбросаны по коду, нет реактивности и гарантий, что после изменения состояния обновлены все нужные части UI/render/export.

### 5.2 Основные функции и зоны

Актуальные ориентиры в `src/js/main.js`:

| Зона | Примерные функции |
|---|---|
| File input / import | `handleFile`, image/video helpers |
| Frame generation | `generateFrames`, `calculateFrameTimes`, `captureFrame` |
| Grid render | `renderGrid`, `updateAllCells` |
| Animation | `startAnimation`, `generateCellOrder`, tick/update logic |
| Compositing | `compositeAllLayers`, drawing layer render helpers |
| Chronophoto | `drawChronophotoStack`, chrono UI/update helpers |
| Export | `exportImage`, `exportMp4`, WebM/AV helpers |
| Audio | `audioEnsureCtx`, `audioGrabVideoSlot`, `audioLoadSlot`, `audioTriggerSlot`, `audioSeqTick`, `audioInitUI` |
| Page counter | `initPageViewCounter`, `/api/page-views` |

### 5.3 UI sections

Текущие крупные секции интерфейса:

- Frame Selection;
- Frame Transform;
- Grid Layout;
- BG;
- Animation Preview;
- Timecode;
- Draw;
- Color Correction;
- Colorama;
- Chronophoto;
- Frame Diff;
- Audio Collision Seq;
- Export;
- About / Welcome / Drop Zone;
- Quick toolbar;
- Floating Draw Palette.

## 6. Технические риски и слабые места

Эти пункты повторяются в legacy-анализах и частично подтверждаются текущим кодом.

### 6.1 Монолит

`src/js/main.js` очень большой. Даже после переезда на Vite, приложение всё ещё архитектурно похоже на один большой IIFE/модуль.

Риск: любая новая фича легко цепляет state, render, export, drawing, audio и UI сразу.

Желательное направление: постепенное выделение чистых функций и модулей без большого “переписать всё”.

### 6.2 Preview/export divergence

Исторически много багов было связано с тем, что preview работает, а PNG/MP4/JPEG export — нет или выглядит иначе.

Правило: если эффект визуальный, у него должны быть проверены:

- preview grid;
- preview single, если применимо;
- PNG/JPEG export;
- MP4/WebM export, если эффект анимированный;
- слой drawings/ref/bg, если эффект влияет на compositing.

### 6.3 Производительность

Старый архитектурный анализ отмечал:

- полный rebuild DOM grid;
- `querySelectorAll` и `getBoundingClientRect()` в hot path;
- `updateAllCells()` по всем ячейкам на tick;
- дорогой `compositeAllLayers()`;
- большой memory pressure от canvas/ImageData/undo/frame sheet.

Высокоприоритетные идеи оптимизации:

1. Кэшировать геометрию grid/cells после `renderGrid()`.
2. Делать дифференциальное обновление только изменившихся ячеек.
3. Ограничить/перепридумать undo memory.
4. Уменьшить forced layout во время рисования.
5. Позже рассмотреть OffscreenCanvas/Web Worker, но не первым шагом.

### 6.4 Drawing/Undo/Onion Skin

Из `Dev Notes.txt`:

- undo нестабилен и может стирать слишком много;
- onion skin иногда остаётся после выключения;
- template brush preview и фактический размер могут расходиться;
- long stroke и порядок слоёв требуют аккуратной проверки;
- рисование у границ кадра и сохранение strokes до края — отдельная болевая зона.

Это один из первых кандидатов на отдельный bugfix-документ и тестовый чеклист.

### 6.5 Mobile/iPad/iPhone

Приложение уже работает на desktop Chrome, iPad, touch laptop и в каком-то виде на iPhone, но UI требует отдельного мышления.

Принципы для touch/mobile:

- нельзя полагаться на hover;
- нельзя делать alt/ctrl единственным способом выполнить критическое действие;
- wheel/mouse gestures не должны быть обязательными;
- меню на телефоне лучше мыслить как bottom sheet/блоки;
- для iPhone может быть нужна упрощённая версия: импорт, grid controls, preview/export, без тяжёлого drawing.

### 6.6 Audio export

Текущий WebM/AV и MediaRecorder-путь может зависеть от браузера. В заметках есть план перейти к более надёжной архитектуре:

1. общий `buildAudioNode(ctx, buffer, params)`;
2. `OfflineAudioContext` для точного финального аудиомикса;
3. `AudioEncoder` / WebCodecs;
4. интеграция audio chunks в `mp4-muxer`;
5. постепенный отказ от хрупкого MediaRecorder-кода.

Это R&D, не короткий фикс.

### 6.7 Chronophoto loop seam

Сильный скачок на границе `last -> first` не решается текущим `Clean Loop`. Причина: `Clean Loop` управляет только ghost-историей, а не базовым кадром.

Текущие риски:

- название `Clean Loop` может быть непонятным, потому что это скорее `No Wrap Ghosts`;
- preview/export используют несколько близких, но разных функций (`buildChronoGhostIndices`, `buildChronoGhostIndicesRaw`, `buildChronoGhostIndicesStill`);
- still export сейчас считает ghost-кадры напрямую от `frameIdx`, без полной direction/pattern модели;
- будущий smooth loop должен быть спроектирован как общая temporal/compositing функция, а не как отдельный DOM-only фикс.

Рекомендуемое направление:

1. Задокументировать текущий `Clean Loop` как clipping ghost history.
2. Добавить новый режим `Seam Blend`, не переиспользуя старый toggle.
3. Сначала реализовать чистый расчёт `seamProgress` и списка overlay-кадров.
4. Подключить одинаковый расчёт к preview, MP4/WebM export и PNG/JPEG export.
5. Только потом добавлять UI-ручки: `Off / Chrono only / Frame + Chrono`, `Length: Auto / N`.

## 7. Правила разработки для следующих итераций

### 7.1 Не верить старым строкам без сверки с текущим кодом

Legacy-документы полезны как память решений, но версии расходятся. Перед правкой всегда сверять:

- `index.html`;
- `src/js/main.js`;
- `src/styles/main.css`;
- актуальный state;
- актуальные UI id.

### 7.2 Любая фича должна иметь preview и export mental model

Перед реализацией стоит ответить:

- где это видно в preview?
- где это рисуется в export?
- работает ли в grid и single?
- влияет ли на drawing layers?
- зависит ли от tick?
- что происходит на iPad/touch?

### 7.3 Сначала чистая функция, потом UI

Для сложных temporal effects лучше сначала создать чистую функцию расчёта:

- какой frame index выбрать;
- какой opacity/alpha;
- какой порядок слоёв;
- какой rect/transform.

Потом подключать эту функцию к preview и export. Это снижает риск расхождения.

### 7.4 Не плодить параллельные движки времени

Если эффект можно выразить через `state.currentTick`, `animFps`, `direction`, `pattern`, `loopAfterN`, лучше использовать существующую систему.

Новые таймеры допустимы только если у подсистемы действительно независимая физика времени.

### 7.5 Ветки

Рекомендуемая модель:

- `main` — стабильная версия, деплоится на production Vercel URL;
- `codex/...` или `experiment/...` — рабочие ветки под отдельные эксперименты;
- крупные идеи не смешивать: например `experiment/mobile-ui`, `experiment/audio-offline-export`, `experiment/drawing-undo`.

Так можно иметь разные версии приложения и тестировать их через Vercel preview deployments.

## 8. Ближайшие направления работ

### 8.1 Документация

- [x] Собрать новую верхнеуровневую документацию.
- [x] Задокументировать фактическую модель Chronophoto/Clean Loop.
- [x] Начать историю разработки отдельным документом.
- [ ] Сделать короткий `README.md` для GitHub: что это, как запустить, где демо.
- [ ] Сделать отдельные docs по подсистемам:
  - `DRAWING.md`;
  - `EXPORT.md`;
  - `CHRONOPHOTO.md` — начат;
  - `FRAME_DIFF.md`;
  - `AUDIO_SEQ.md`;
  - `DEPLOYMENT.md`.

### 8.2 Техническая уборка

- [ ] Почистить/объяснить Vite build warnings.
- [ ] Решить, нужен ли bundled mp4-muxer в `index.html` или лучше централизовать загрузку/бандлинг.
- [ ] Начать выносить чистые helpers из `main.js`.
- [ ] Добавить минимальные smoke-test сценарии вручную или через простую browser-проверку.

### 8.3 UX и стабильность

- [ ] Drawing undo/onion/template brush bugs.
- [ ] Brush panel cleanup.
- [ ] Export guides в single mode.
- [ ] iPhone/mobile simplified UI.
- [ ] Hide title/version in metadata on mobile/iPad, если мешает.
- [ ] Упростить AudioSeq UI вокруг `Auto setup`.

### 8.4 Performance

- [ ] Geometry cache для grid cells.
- [ ] Differential `updateAllCells`.
- [ ] Memory budget для undo и frame sheet.
- [ ] Лимиты кадров/колонок пересмотреть аккуратно: 1000 кадров и 200 колонок возможны как UX-запрос, но требуют performance-проверки.

### 8.5 Creative/R&D

- [ ] Project save/restore: ZIP или embedded metadata.
- [ ] Read metadata from exported files and reconstruct project state.
- [ ] Color palette visualization under grid / per-frame color bars.
- [ ] Plot/Manovich-style image sorting and AI-assisted analysis.
- [ ] Optical flow / motion vectors.
- [ ] MIDI mapping.
- [ ] Built-in samples / simple synth.
- [ ] Audio FX: low-pass/high-pass, pitch, gates, arpeggio.
- [ ] Kuleshov-effect experiments in grid form.

## 9. Потенциальные версии продукта

### 9.1 Personal / Lab version

Полная экспериментальная версия для Гриши:

- все модули;
- быстрые эксперименты;
- нестандартный UI допустим;
- ветки под новые идеи;
- приоритет — творческая мощность.

### 9.2 Public / Open version

Упрощённая стабильная версия:

- видео/изображение → grid;
- понятный export;
- меньше ручек;
- мобильная дружелюбность;
- меньше экспериментального audio/drawing по умолчанию;
- документация и демо-сценарии.

### 9.3 Pro / Future version

Возможный будущий слой:

- проекты;
- полноценные drawing layers;
- MIDI;
- performance mode;
- optical flow;
- advanced audio;
- offline/project export;
- возможно Electron/standalone, если web-ресурсов станет мало.

## 10. Источники, из которых собран документ

Актуальные файлы проекта:

- `index.html`
- `src/js/main.js`
- `src/js/pageViewCounter.js`
- `src/styles/main.css`
- `api/page-views.js`
- `package.json`
- `vite.config.js`
- `docs/CHRONOPHOTO.md`
- `docs/DEVELOPMENT_HISTORY.md`

Заметки и legacy-документы:

- `FrameGrid 313a0c4a812c8080aea8cf392b536cc6.md` — Notion export: концепция, конференция, планы, философия, backlog.
- `legacy/doc/FRAMEGRID_HANDBOOK.md` — ранний developer handbook.
- `legacy/doc/framegrid_v_013.md` — карта модулей v0.14.
- `legacy/doc/FRAMEGRID_v023_46_Analysis.md` — архитектурный анализ, performance risks.
- `legacy/doc/chronophoto_module_handoff.md` — карта Chronophoto-модуля.
- `legacy/doc/FrameGrid_dev_chat.md` — история последних решений, особенно Frame Diff и AudioSeq.
- `legacy/doc/Dev Notes.txt` — сырой backlog багов/идей.

## 11. Открытые вопросы

- TimeGrid — финальное имя приложения, а FrameSampler — описание категории/механики?
- Нужен ли отдельный публичный landing/README уже сейчас или позже?
- Должна ли iPhone-версия быть отдельной веткой, отдельным режимом или responsive-слоем в одном приложении?
- Насколько важна offline/standalone сборка как продуктовая цель?
- Что важнее первым крупным циклом: drawing stability, mobile UI, audio fun, performance или documentation/README?
### 2026-07-03 Chronophoto Seam Blend

Chronophoto now has two separate loop-related controls:

- `Clean Loop`: clips wrapped ghost history at the beginning of the cycle.
- `Seam Blend`: crossfades the end of the cycle toward the first visible state of each cell.

`Seam Blend` uses `chronoSeamLength`, where `0` means Auto (`chronoDepth * chronoStride`). The target frame is resolved through `getFrameCellInfo(cellIdx, 0, ...)`, so grid pattern, Frame Target, Sequence Mode, direction, and cell offset remain part of the same temporal model. Preview and export both use the shared seam helpers in `src/js/main.js`.

### 2026-07-03 Chronophoto Seam Modes v28.14

`Seam Blend` now has testable modes:

- `Chrono Only`: crossfades the current Chronophoto ghost stack into the wrapped ghost stack without drawing the first base frame. This is the default because it avoids the static-frame freeze artifact.
- `Frame Soft`: also draws the first visible base frame, but caps it with `chronoSeamStrength`.
- `Frame Full`: preserves the first v28.13 behavior for comparison.

`Seam Strength` controls the maximum opacity for `Chrono Only` and `Frame Soft`; default is `0.55`. Preview, MP4 grid/single, PNG sequence, and still exports all use the same opacity helpers.

### 2026-07-04 Filename labels v28.15

Timecode overlay can now show the source filename per frame:

- `File` toggle adds the frame's `sourceName` to the overlay.
- Image-sequence imports store `sourceName` and `sourceIndex` in each generated frame.
- `Tail chars` controls truncation from the end of the filename; `0` means full filename, default is `24`.
- Preview and exports use the same `formatTimecode(...)` path.

### 2026-07-04 Display name labels v28.16

Timecode overlay now separates two naming concepts:

- `File`: per-frame source filename, useful for image sequences.
- `Name`: the display/export name from the editable metadata filename at the top of the app.

`Name` follows `state.filenameOverride` immediately after the user edits the metadata filename. If there is no override, it falls back to the same visible default used by the top metadata bar.

### 2026-07-04 Typography and label overflow v28.17

TimeGrid now uses Google Fonts for a cleaner default presentation:

- `Inter` is the app UI font.
- `JetBrains Mono` is the frame timecode/name/file label font.
- Canvas-drawn labels use the same font stacks as preview.
- Timecode labels stay on one line and ellipsize if the combined number/name label is wider than the cell.
- `Tail chars` remains the intentional control for keeping the useful end of long file/name labels visible.

### 2026-07-04 Stacked timecode labels v28.18

Timecode fields now stack vertically inside one overlay box instead of forming one long row:

- `Index`, `Sec`, `Frame`, `Text`, `Name`, and `File` each render as their own line when enabled.
- `Top` position grows downward from the top margin; `Bottom` remains bottom-anchored, so the stack grows upward.
- Preview and canvas export share the same line splitting and per-line ellipsis behavior.
- Frame labels use italic `JetBrains Mono` to give the overlay a more editorial caption feel while keeping digits readable.

### 2026-07-04 Timecode font panel v28.19

Timecode styling now has a compact font panel next to the `Text` and `BG` color controls:

- `T` opens the font settings panel inside the Timecode menu.
- Font presets include mono italic, mono, sans, and serif italic.
- Style and weight controls update preview immediately.
- Canvas export reads the same font family, style, and weight as the DOM preview.

### 2026-07-04 Timecode placement and fill modes v28.20

Timecode alignment now only changes the overlay text/box placement and does not rebuild or re-fit the grid.

- `Align` updates `.frame-timecode` classes live instead of calling `renderGrid()`.
- `BG Fill` in the font panel switches between one shared stack background and separate per-line backgrounds.
- Canvas export mirrors the selected fill mode.
- Timecode defaults are now opacity `100%`, font size `32px`, box pad `4px`, margin `0px`.

### 2026-07-04 Timecode wrapping defaults v28.21

Long text-like Timecode fields now wrap instead of hard-clipping immediately.

- `BG Fill` defaults to `Lines`.
- Default Timecode font size is now `15px`.
- Custom `TEXT`, display `NAME`, and source `FILE` labels are marked as wrappable in preview.
- Canvas export wraps the same text-like labels with measured line breaks.

### 2026-07-04 First-frame capture priming v28.22

Fresh video imports now wait for stronger decoded-frame readiness before the first generated grid capture.

- `generateFrames()` primes the current video source before the first capture pass.
- Capture seeking waits for `loadeddata`/`canplay`, `seeked`, and decoded frame readiness where available.
- The seek timeout fallback no longer draws blindly if the browser has not reached the target frame.
- The first captured frame can retry a likely blank/black canvas a limited number of times, then accepts the result so intentionally black starts still work.

### 2026-07-04 Capture speed and seam target hotfix v28.23

The first-frame protection is now limited to the video priming path instead of slowing every captured frame.

- Normal frame capture uses the fast `seeked` + double-rAF path again.
- Decoded-frame waiting remains available for the one-time priming step after fresh import.
- `Seam Blend` target frames now resolve from the next cycle start, not global tick `0`, so frame modes can visibly blend toward the upcoming first frame.

### 2026-07-04 Simplified Seam Blend v28.24

`Seam Blend` now has one visible control: `Seam Frames`.

- Removed `Seam Mode` and `Seam Strength` from the Chronophoto panel.
- `Seam Frames = 1` overlays the first frame of the next cycle on the last frame.
- Higher values cascade the beginning frames backward across the ending frames: first over last, second over previous, and so on.
- Opacity is automatic and ramps stronger toward the loop seam.
