# Chronophoto module handoff

Исходный файл: `framegrid_v025_49_patched.html`

Важно:
- имя файла: `framegrid_v025_49_patched.html`
- внутренний banner/title файла: `FRAMEGRID v0.25.48`
- ниже собраны все найденные в patched-файле прямые вхождения и все кодовые зоны, которые реально участвуют в работе Chronophoto
- отдельного CSS-класса `.frame-chrono` в файле нет, стиль задаётся inline в JS

## 1. Полная карта модуля

| Зона | Линии | Что это |
|---|---:|---|
| UI section | 1714-1758 | меню Chronophoto: enable, blend, depth, opacity, cascade |
| State | 2249-2253 | поля состояния |
| Grid rebuild hook | 4144 | после перестройки grid вызывается `updateAllCells()` |
| Bindings | 5092-5152 | все UI handlers |
| Preview render | 5250-5295 | DOM-рендер наложений |
| Cell update hook | 5520 | вызов Chronophoto при обновлении ячейки |
| Export render | 10158-10204 | canvas/export-рендер наложений |
| Export call site | 10264 | вызов export-рендера из `drawFrameCell()` |

## 2. Поведение модуля, без интерпретаций

1. Chronophoto работает только если `state.chronoEnabled === true` и в `state.frames` есть кадры.
2. Для каждой базовой ячейки берутся **предыдущие** кадры, а не следующие. Цикл всегда такой: `for (let offset = -depth; offset < 0; offset++)`.
3. Индексы кадров всегда заворачиваются по modulo: `((nIdx % n) + n) % n`. Это значит, что в начале последовательности хвост не обрывается, а замыкается на конец массива кадров.
4. В preview Chronophoto создаёт дополнительные `<img class="frame-chrono">` внутри `.frame-media-xform`.
5. Эти overlay-изображения вставляются **после** `img.frame-main-img`, то есть Chronophoto рисуется поверх базового кадра в том же контейнере.
6. В export Chronophoto рисуется отдельной функцией `drawChronophotoStack()` внутри `drawFrameCell()`.
7. Preview и export используют одну и ту же общую идею: тот же диапазон offsets, тот же modulo loop, тот же blend mode, тот же cascade formula, те же трансформации `frameImgScale / frameImgOffX / frameImgOffY / frameImgRot`.
8. Изменение любого control в UI вызывает `updateChronoUI()`, а она вызывает `updateAllCells()` и `requestComposite()`. То есть любой change пересобирает preview целиком и запрашивает redraw composite.

## 3. Найденные несоответствия

1. `chronoDepth`
   - HTML input: `max="15"`
   - JS clamp: `Math.min(30, ...)`
   - кнопка `+`: тоже разрешает рост до 30

2. `chronoOpacity`
   - range slider: `min="0.05"`
   - number input: `min="0.05"`
   - JS clamp в `chronoOpacityNum.oninput`: `Math.max(0.01, Math.min(1.0, v))`

3. У `.frame-chrono` нет CSS rule в stylesheet. Все параметры задаются inline.

## 4. Рекомендуемое безопасное решение для рефактора

Ниже не новая фича, а безопасная схема, чтобы разработчик не развёл preview и export в разные стороны.

1. Вынести общую чистую функцию вида `getChronoStack(baseIdx, depth, frameCount)`.
2. Вынести общую функцию `getChronoAlpha(dist, alphaBase, cascade)`.
3. Вынести общую функцию `getFrameTransformRect(...)` или переиспользовать уже существующую математику `drawFrameCell()` без дублирования.
4. Синхронизировать ограничения UI и JS:
   - либо depth max = 15 везде
   - либо depth max = 30 везде
   - либо opacity min = 0.05 везде
   - либо opacity min = 0.01 везде
5. Явно зафиксировать порядок слоёв: `chrono below main` или `chrono above main`. Сейчас фактическое поведение - above main.

## 5. Полный код Chronophoto

### UI block [1714-1758]

```html
      <!-- CHRONOPHOTO -->
      <div class="menu-section collapsed" id="chronophotoSection">
        <div class="menu-section-title">Chronophoto</div>
        <div class="menu-section-content">
          <div class="menu-row">
            <span class="menu-label">Enable</span>
            <div class="menu-toggle-switch" id="toggleChronophoto"></div>
          </div>
          <div class="menu-row">
            <span class="menu-label">Blend Mode</span>
            <select class="menu-select" id="chronoBlend">
              <option value="source-over">Normal</option>
              <option value="screen">Screen</option>
              <option value="overlay">Overlay</option>
              <option value="multiply">Multiply</option>
              <option value="lighten">Lighten</option>
              <option value="darken">Darken</option>
              <option value="color-dodge">Color Dodge</option>
              <option value="color-burn">Color Burn</option>
              <option value="difference">Difference</option>
              <option value="exclusion">Exclusion</option>
              <option value="hard-light">Hard Light</option>
              <option value="soft-light">Soft Light</option>
            </select>
          </div>
          <div class="menu-row">
            <span class="menu-label">Frame Depth</span>
            <div class="menu-input-group">
              <button class="menu-input-btn" id="chronoDepthMinus">−</button>
              <input type="number" class="menu-input menu-input-narrow" id="chronoDepth" value="3" min="1" max="15">
              <button class="menu-input-btn" id="chronoDepthPlus">+</button>
            </div>
          </div>
          <div class="menu-row">
            <span class="menu-label">Layer Opacity</span>
            <div class="menu-slider-row">
              <input type="range" class="menu-slider" id="chronoOpacity" min="0.05" max="1.0" step="0.05" value="0.4">
              <input type="number" class="menu-slider-input" id="chronoOpacityNum" min="0.05" max="1.0" step="0.05" value="0.40" inputmode="decimal">
            </div>
          </div>
          <div class="menu-row">
            <span class="menu-label" title="Cascade makes older frames more transparent">Cascade Fade</span>
            <div class="menu-toggle-switch" id="toggleChronoCascade"></div>
          </div>
        </div>
```

### State [2248-2254]

```js
  const state = {
    chronoEnabled: false,
    chronoBlend: 'screen',
    chronoDepth: 3,
    chronoOpacity: 0.4,
    chronoCascade: false,
    videoFile: null, filenameOverride: '', drawCanvasDpr: 1, videoUrl: null, videoDuration: 0,
```

### Main image creation order [4114-4123]

```html
      wrap.className = 'frame-image-wrap';

      const xform = document.createElement('div');
      xform.className = 'frame-media-xform';

      const img = document.createElement('img');
      img.className = 'frame-main-img';
      img.src = frame.dataUrl;
      xform.appendChild(img);

```

### Grid rebuild hook [4140-4146]

```html


    updateTimecodeVisibility();

    // Ensure chrono is applied to new grid
    updateAllCells();

```

### Bindings [5092-5153]

```js
  // Chronophoto bindings
  const toggleChronophoto = $('toggleChronophoto');
  const chronoBlend = $('chronoBlend');
  const chronoDepth = $('chronoDepth');
  const chronoDepthMinus = $('chronoDepthMinus');
  const chronoDepthPlus = $('chronoDepthPlus');
  const chronoOpacity = $('chronoOpacity');
  const chronoOpacityNum = $('chronoOpacityNum');

  const toggleChronoCascade = $('toggleChronoCascade');

  const updateChronoUI = () => {
    updateAllCells();
    requestComposite();
  };

  if (toggleChronoCascade) {
    toggleChronoCascade.onclick = () => {
      state.chronoCascade = !state.chronoCascade;
      toggleChronoCascade.classList.toggle('active', state.chronoCascade);
      updateChronoUI();
    };
  }

  if (toggleChronophoto) {
    toggleChronophoto.onclick = () => {
      state.chronoEnabled = !state.chronoEnabled;
      toggleChronophoto.classList.toggle('active', state.chronoEnabled);
      updateChronoUI();
    };
  }
  if (chronoBlend) {
    chronoBlend.onchange = () => {
      state.chronoBlend = chronoBlend.value;
      updateChronoUI();
    };
  }
  if (chronoDepth) {
    chronoDepth.onchange = () => {
      state.chronoDepth = Math.max(1, Math.min(30, parseInt(chronoDepth.value) || 1));
      chronoDepth.value = state.chronoDepth;
      updateChronoUI();
    };
  }
  if (chronoDepthMinus) chronoDepthMinus.onclick = () => { if (state.chronoDepth > 1) { state.chronoDepth--; chronoDepth.value = state.chronoDepth; updateChronoUI(); } };
  if (chronoDepthPlus) chronoDepthPlus.onclick = () => { if (state.chronoDepth < 30) { state.chronoDepth++; chronoDepth.value = state.chronoDepth; updateChronoUI(); } };

  if (chronoOpacity) {
    chronoOpacity.oninput = () => {
      state.chronoOpacity = parseFloat(chronoOpacity.value) || 0.4;
      if (chronoOpacityNum) chronoOpacityNum.value = state.chronoOpacity.toFixed(2);
      updateChronoUI();
    };
  }
  if (chronoOpacityNum) {
    chronoOpacityNum.oninput = () => {
      const v = parseFloat(chronoOpacityNum.value);
      state.chronoOpacity = isNaN(v) ? 0.4 : Math.max(0.01, Math.min(1.0, v));
      chronoOpacityNum.value = state.chronoOpacity.toFixed(2);
      if (chronoOpacity) chronoOpacity.value = String(state.chronoOpacity);
      updateChronoUI();
    };
```

### Preview renderer [5250-5296]

```js
  // Chronophoto DOM update
  function updateChronoForItem(item, baseIdx) {
    const xform = item.querySelector('.frame-media-xform');
    if (!xform) return;

    // Clear existing chrono images
    const existing = xform.querySelectorAll('.frame-chrono');
    existing.forEach(el => el.remove());

    if (!state.chronoEnabled || !state.frames.length) return;

    const depth = state.chronoDepth || 1;
    const blendMode = state.chronoBlend || 'screen';
    const alphaBase = state.chronoOpacity || 0.4;
    const n = state.frames.length;

    // We only want to look FORWARD in time for the chronological trail!
    // But maybe we want an option? Let's just make it look forward (i.e. older frames trail behind, or future frames show ahead).
    // Actually, chronophotography usually shows the PAST trail of where the object was.
    // So we should take frames from `baseIdx - depth` to `baseIdx - 1`.

    // For difference/exclusion mode, drawing multiple transparent layers over each other gets muddy quickly.

    for (let offset = -depth; offset < 0; offset++) {
      let nIdx = baseIdx + offset;

      // Loop if needed? Or just cap it? We can wrap around (loop) using modulo so the trail never cuts off at the start of video.
      nIdx = ((nIdx % n) + n) % n;

      const frame = state.frames[nIdx];
      if (frame) {
        const dist = Math.abs(offset);
        const img = document.createElement('img');
        img.className = 'frame-chrono';
        img.src = frame.dataUrl;
        img.style.position = 'absolute';
        img.style.inset = '0';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.style.pointerEvents = 'none';
        img.style.zIndex = '1';
        img.style.mixBlendMode = blendMode;
        img.style.opacity = state.chronoCascade ? (alphaBase * (1.0 / dist)).toFixed(3) : alphaBase.toFixed(3);
        xform.appendChild(img);
      }
    }
```

### Cell update hook [5516-5521]

```js

      const mainImg = item.querySelector('.frame-main-img');
      if (mainImg) mainImg.src = frame.dataUrl;
      updateOnionForItem(item, frameIdx);
      updateChronoForItem(item, frameIdx);

```

### Export renderer [10158-10205]

```js
  // Renders a stack of Chronophoto overlays for a specific base frame
  function drawChronophotoStack(ctx, baseIdx, x, y, w, h) {
    if (!state.chronoEnabled || !state.frames.length) return;
    const depth = state.chronoDepth || 1;
    const blendMode = state.chronoBlend || 'screen';
    const alphaBase = state.chronoOpacity || 0.4;
    const n = state.frames.length;

    ctx.save();
    ctx.globalCompositeOperation = blendMode;

    for (let offset = -depth; offset < 0; offset++) {
      let nIdx = baseIdx + offset;
      nIdx = ((nIdx % n) + n) % n; // Loop

      const frame = state.frames[nIdx];
      if (!frame) continue;
      const src = getFrameDataUrl(frame);
      if (src) {
         const img = frame.img || (frame.img = new Image());
         if (img.src !== src) img.src = src;
         if (img.naturalWidth) {
           const dist = Math.abs(offset);
           ctx.globalAlpha = state.chronoCascade ? (alphaBase * (1.0 / dist)) : alphaBase;

           const s = Number(state.frameImgScale) || 1;
           const ox = (Number(state.frameImgOffX) || 0) * 0.01 * w;
           const oy = (Number(state.frameImgOffY) || 0) * 0.01 * h;
           const srcW = img.videoWidth || img.naturalWidth || img.width || 1;
           const srcH = img.videoHeight || img.naturalHeight || img.height || 1;
           const contain = Math.min(w / Math.max(1,srcW), h / Math.max(1,srcH));
           const dw = srcW * contain * s;
           const dh = srcH * contain * s;
           const dx = x + (w - dw) / 2 + ox;
           const dy = y + (h - dh) / 2 + oy;

           ctx.save();
           ctx.beginPath();
           ctx.rect(x, y, w, h);
           ctx.clip();
           ctx.translate(dx + dw/2, dy + dh/2);
           ctx.rotate((Number(state.frameImgRot) || 0) * Math.PI / 180);
           ctx.drawImage(img, -dw/2, -dh/2, dw, dh);
           ctx.restore();
         }
      }
    }

```

### Export call site [10260-10265]

```js

    ctx.imageSmoothingEnabled = _smPrev;
    ctx.restore();

    if (baseIdx !== undefined) drawChronophotoStack(ctx, baseIdx, x, y, w, h);
  }
```

## 6. Полный список прямых вхождений `chrono*` в patched-файле

```text
1714:      <!-- CHRONOPHOTO -->
1715:      <div class="menu-section collapsed" id="chronophotoSection">
1716:        <div class="menu-section-title">Chronophoto</div>
1720:            <div class="menu-toggle-switch" id="toggleChronophoto"></div>
1724:            <select class="menu-select" id="chronoBlend">
1742:              <button class="menu-input-btn" id="chronoDepthMinus">−</button>
1743:              <input type="number" class="menu-input menu-input-narrow" id="chronoDepth" value="3" min="1" max="15">
1744:              <button class="menu-input-btn" id="chronoDepthPlus">+</button>
1750:              <input type="range" class="menu-slider" id="chronoOpacity" min="0.05" max="1.0" step="0.05" value="0.4">
1751:              <input type="number" class="menu-slider-input" id="chronoOpacityNum" min="0.05" max="1.0" step="0.05" value="0.40" inputmode="decimal">
1756:            <div class="menu-toggle-switch" id="toggleChronoCascade"></div>
2249:    chronoEnabled: false,
2250:    chronoBlend: 'screen',
2251:    chronoDepth: 3,
2252:    chronoOpacity: 0.4,
2253:    chronoCascade: false,
4144:    // Ensure chrono is applied to new grid
5092:  // Chronophoto bindings
5093:  const toggleChronophoto = $('toggleChronophoto');
5094:  const chronoBlend = $('chronoBlend');
5095:  const chronoDepth = $('chronoDepth');
5096:  const chronoDepthMinus = $('chronoDepthMinus');
5097:  const chronoDepthPlus = $('chronoDepthPlus');
5098:  const chronoOpacity = $('chronoOpacity');
5099:  const chronoOpacityNum = $('chronoOpacityNum');
5101:  const toggleChronoCascade = $('toggleChronoCascade');
5103:  const updateChronoUI = () => {
5108:  if (toggleChronoCascade) {
5109:    toggleChronoCascade.onclick = () => {
5110:      state.chronoCascade = !state.chronoCascade;
5111:      toggleChronoCascade.classList.toggle('active', state.chronoCascade);
5112:      updateChronoUI();
5116:  if (toggleChronophoto) {
5117:    toggleChronophoto.onclick = () => {
5118:      state.chronoEnabled = !state.chronoEnabled;
5119:      toggleChronophoto.classList.toggle('active', state.chronoEnabled);
5120:      updateChronoUI();
5123:  if (chronoBlend) {
5124:    chronoBlend.onchange = () => {
5125:      state.chronoBlend = chronoBlend.value;
5126:      updateChronoUI();
5129:  if (chronoDepth) {
5130:    chronoDepth.onchange = () => {
5131:      state.chronoDepth = Math.max(1, Math.min(30, parseInt(chronoDepth.value) || 1));
5132:      chronoDepth.value = state.chronoDepth;
5133:      updateChronoUI();
5136:  if (chronoDepthMinus) chronoDepthMinus.onclick = () => { if (state.chronoDepth > 1) { state.chronoDepth--; chronoDepth.value = state.chronoDepth; updateChronoUI(); } };
5137:  if (chronoDepthPlus) chronoDepthPlus.onclick = () => { if (state.chronoDepth < 30) { state.chronoDepth++; chronoDepth.value = state.chronoDepth; updateChronoUI(); } };
5139:  if (chronoOpacity) {
5140:    chronoOpacity.oninput = () => {
5141:      state.chronoOpacity = parseFloat(chronoOpacity.value) || 0.4;
5142:      if (chronoOpacityNum) chronoOpacityNum.value = state.chronoOpacity.toFixed(2);
5143:      updateChronoUI();
5146:  if (chronoOpacityNum) {
5147:    chronoOpacityNum.oninput = () => {
5148:      const v = parseFloat(chronoOpacityNum.value);
5149:      state.chronoOpacity = isNaN(v) ? 0.4 : Math.max(0.01, Math.min(1.0, v));
5150:      chronoOpacityNum.value = state.chronoOpacity.toFixed(2);
5151:      if (chronoOpacity) chronoOpacity.value = String(state.chronoOpacity);
5152:      updateChronoUI();
5250:  // Chronophoto DOM update
5251:  function updateChronoForItem(item, baseIdx) {
5255:    // Clear existing chrono images
5256:    const existing = xform.querySelectorAll('.frame-chrono');
5259:    if (!state.chronoEnabled || !state.frames.length) return;
5261:    const depth = state.chronoDepth || 1;
5262:    const blendMode = state.chronoBlend || 'screen';
5263:    const alphaBase = state.chronoOpacity || 0.4;
5283:        img.className = 'frame-chrono';
5293:        img.style.opacity = state.chronoCascade ? (alphaBase * (1.0 / dist)).toFixed(3) : alphaBase.toFixed(3);
5520:      updateChronoForItem(item, frameIdx);
10158:  // Renders a stack of Chronophoto overlays for a specific base frame
10159:  function drawChronophotoStack(ctx, baseIdx, x, y, w, h) {
10160:    if (!state.chronoEnabled || !state.frames.length) return;
10161:    const depth = state.chronoDepth || 1;
10162:    const blendMode = state.chronoBlend || 'screen';
10163:    const alphaBase = state.chronoOpacity || 0.4;
10181:           ctx.globalAlpha = state.chronoCascade ? (alphaBase * (1.0 / dist)) : alphaBase;
10264:    if (baseIdx !== undefined) drawChronophotoStack(ctx, baseIdx, x, y, w, h);
```

## 7. Вывод

Chronophoto в текущем patched-файле уже является отдельным модулем с 5 рабочими слоями:

- UI section
- state
- bindings
- preview renderer
- export renderer

Для точного исправления или расширения модуля нужно менять все эти слои синхронно. Самая опасная точка сейчас - расхождение между preview и export после будущих правок, а также несогласованные limits в HTML и JS.