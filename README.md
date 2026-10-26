# TimeGrid

TimeGrid — экспериментальный браузерный инструмент для пространственного сэмплинга времени. Он берёт видео или изображения, извлекает кадры, раскладывает их в сетку и превращает линейный таймлайн в рабочую поверхность: динамический contact sheet, frame sampler, хронофотографию, поверхность для рисования и аудиовизуальный секвенсор.

Текущая версия приложения: `TimeGrid 28.35.0-drawing.2` (Drawing, экспериментальная локальная линия).

Ветка `codex/drawing-engine`, база — стабильная 28.34. Cloud разрабатывается отдельно в `codex/timegrid-cloud`. Стабильный checkout и production не обновлены.

План: [DEVELOPMENT_PLAN_RU.md](docs/DEVELOPMENT_PLAN_RU.md). Тестировать сейчас: [Drawing Lab 28.35.0-drawing.4](https://comp1mov.github.io/TimeGrid/drawing/28.35.0-drawing.4/drawing-lab.html). [Архитектура и ограничения](docs/DRAWING_PROTOTYPE_RU.md), [измерения](docs/drawing-evidence/2026-10-26-perfect-freehand-4/README.md). Это стенд на 96 тестовых кадрах; новый движок ещё не заменяет старое рисование в TimeGrid.

Версия стенда: `Drawing Lab 28.35.0-drawing.4`. Самостоятельная сборка: `npm run build:lab`. Метаданные в `drawing-lab.release.json`. Обычный `npm run build` собирает только прежний TimeGrid; package/lock/APP_VERSION/HTML обычного приложения остаются drawing.2 по прямому указанию автора. Лаборатория больше не публикует рядом копию основного приложения.

## Для чего

TimeGrid полезен, когда нужно увидеть видео не только как последовательность, но как карту:

- сделать сетку кадров из видео или изображения;
- увидеть темпоральный градиент в таймлапсе;
- разобрать движение человека, жест, волну или камеру;
- наложить предыдущие фазы движения через Chronophoto;
- рисовать поверх кадров и экспортировать рисунки или stickerpack;
- собрать анимационный grid, MP4/WebM, PNG/JPEG или PNG sequence;
- сильно пережимать видео для web/Notion/GIF-like preview, уменьшая кадры и разрешение;
- использовать кадры как шаги Audio Collision Sequencer.

Проект пока развивается как личный lab-инструмент Гриши Цветкова для видео-арта, анализа движения, рисования по кадрам и перформативной работы с материалом. Публичная версия может быть проще и аккуратнее, чем полная lab-версия.

## Демо

Production URL:

https://timegri.vercel.app/

## Быстрый старт

```powershell
npm.cmd install
npm.cmd run dev
```

Для production build:

```powershell
npm.cmd run build
npm.cmd run preview
```

На Windows лучше использовать `npm.cmd`, чтобы не упираться в PowerShell ExecutionPolicy.

## Структура

```text
TimeGrid/
├─ index.html
├─ src/
│  ├─ js/main.js
│  └─ styles/main.css
├─ api/page-views.js
├─ docs/
│  ├─ TIMEGRID_PROJECT.md
│  ├─ DEVELOPMENT_HISTORY.md
│  ├─ CHRONOPHOTO.md
│  └─ SCENARIOS.md
├─ package.json
└─ vite.config.js
```

Основной код приложения сейчас находится в `src/js/main.js`. Проект использует Vite и `vite-plugin-singlefile`, чтобы сохранять философию standalone-инструмента: итоговый build собирается как один HTML с инлайн-ассетами.

## Документация

- `docs/TIMEGRID_PROJECT.md` — верхнеуровневая карта проекта, архитектуры, рисков и направлений.
- `docs/SCENARIOS.md` — пользовательские сценарии, будущие туториалы и материал для сайта/Notion.
- `docs/TUTORIAL_01_GETTING_STARTED.md` — план первого обзорного видеоурока на 10-20 минут.
- `docs/CHRONOPHOTO.md` — фактическая модель Chronophoto и режимы Seam Blend.
- `docs/DEVELOPMENT_HISTORY.md` — важные решения, баги и повороты разработки.

## Рабочие принципы

- Preview и export не должны расходиться.
- Для temporal effects сначала нужна чистая модель расчёта, потом UI.
- Новые эффекты по возможности должны использовать общий `state.currentTick`.
- Drawing, canvas sizing, Chronophoto и export требуют проверки в grid, single, preview и export.
- Legacy-документы полезны как память решений, но перед правками нужно сверяться с текущим кодом.
