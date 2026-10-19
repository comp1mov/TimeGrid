# Диагностические материалы аудита

Это записи отдельных диагностических прогонов TimeGrid 28.33 / HEAD e2a95ea, а не автоматический test suite и не результаты для всех устройств. Выводы и ограничения изложены в [аудите](../../AUDIT_2026-09-24_RU.md).

## Файлы

- `profile.json`: импорт, playback, эффекты, canvas sizes и drawing. Условия: 24/96 samples, quality 0.5/0.125, target 14 fps.
- `followup.json`: дополнительные WebGL timings и проверка лишней обработки скрытых ячеек в single view.
- `checks.json`: реальный 72-frame MP4 export, начальный tick, Colorama offset, gap, encode queue; отдельные BG alpha и grid race checks.
- `chrono.json`: Chronophoto на 96 ячейках с depth 8/32 и quality 0.5/0.125.

Среда: Windows, отдельный headless Edge 153 через Playwright, AMD Radeon 890M / ANGLE D3D11, viewport 1440×1000, DPR 1. Локальный Vite на 127.0.0.1:5177. Для измерений тестовый browser route вставлял временные function wrappers в ответ `main.js`, не изменяя приложение на диске. Обёртки измеряли `performance.now()`; методы Canvas/WebGL и geometry также временно оборачивались в отдельном контексте.

Исходник для performance tests создавался FFmpeg:

```text
ffmpeg -f lavfi -i testsrc2=size=1920x1080:rate=24 -t 8 -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p source-1080p24.mp4
```

Checks использовали синтетический банк из 24 серых изображений 320×180 с declared source size 1920×1080. Это изолирует поведение export/layout от видео-декодирования. MP4 проверен ffprobe: H.264, 540×204, 14 fps, 72 кадра. Исполняемые диагностические скрипты, screenshots, видео и отдельная build-output сохранены во временной папке `C:/Users/gregt/AppData/Local/Temp/timegrid-audit-20260924`; это временные рабочие материалы, не часть приложения.

## Как не интерпретировать данные

- Обёртка асинхронной `captureFrame` измеряет только синхронный вход. Длительность импорта — `wallMs`, включая небольшое указанное в аудите ожидание после генерации.
- Drawing cases с пустым `stats` невалидны: начальная точка не попала в overlay. Они оставлены в сырых данных, но исключены из выводов. Использован успешный `96-q0.125-draw-cross-grid` из `profile.json`. Это mouse path, не измерение телефона/пера.
- `uiFps` — rAF cadence приложения. Скорость продвижения композиции оценивается отдельно по ticks/wallMs.
- Время вызовов WebGL может включать ожидание ранее отправленной GPU-работы; оно не является раздельной GPU-профилировкой. Не складывать вложенные function timings как независимые расходы.
- Расчёт canvas memory по width × height × 4 — оценка backing pixels, а не измеренный RSS процесса.
- В `checks.json` поле `stillColorama.expectedFilteredPixel` — неудачно названный результат прямого Canvas/SVG-filter probe. Он остался серым и не служит подтверждением соответствия Colorama preview/still. Различие still/video путей в отчёте обозначено как вывод чтения кода, без полноценного визуального воспроизведения.
- Проверка BG alpha изолирует compositor на canvas 10×10; grid race вызывает две штатные функции подряд без UI задержки. Эти checks подтверждают конкретные пути кода, но не частоту ошибок в обычной работе.
- Нулевой список `errors` означает отсутствие `pageerror` в проверенном сценарии; это не доказательство отсутствия всех дефектов приложения.
