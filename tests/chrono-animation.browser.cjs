// Run against Vite with Playwright available locally or via PLAYWRIGHT_MODULE.
// Test hooks are injected into the browser response, never into the app on disk.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'timegrid-chrono-'));
const expose = ['renderGrid', 'updateAllCells', 'setViewMode', 'fitActiveView', 'getFrameCellInfo', 'exportMp4', 'exportSingleStill', 'exportImage', 'buildChronoGhostIndices', 'drawChronophotoStack', 'drawFrameCell'];
const injection = `
window.__chronoTest = { ${expose.join(',')} };
window.__chronoDraws = [];
const originalChronoDraw = drawChronophotoStack;
drawChronophotoStack = function(ctx, indices, x, y, w, h, opts = {}) {
  const record = {frame: opts.currentFrameIdx, alphas: []};
  const draw = ctx.drawImage;
  ctx.drawImage = function(...args) { record.alphas.push(this.globalAlpha); return draw.apply(this, args); };
  try { return originalChronoDraw(ctx, indices, x, y, w, h, opts); }
  finally { ctx.drawImage = draw; window.__chronoDraws.push(record); }
};
`;

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.dismiss());
    await page.route('**/src/js/main.js*', async route => {
      const response = await route.fetch();
      const source = await response.text();
      const end = source.lastIndexOf('})();');
      assert.ok(end > 0);
      await route.fulfill({ response, body: source.slice(0, end) + injection + source.slice(end) });
    });
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5180', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__chronoTest);
    assert.equal(await page.locator('vite-error-overlay').count(), 0);
    assert.ok((await page.locator('body').innerText()).includes('TimeGrid'));
    assert.equal(await page.locator('#toggleChronoAnimation').isDisabled(), true);
    await page.screenshot({ path: path.join(output, 'initial.png') });

    await page.evaluate(async () => {
      const s = window._fgState;
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 180;
      const ctx = canvas.getContext('2d');
      s.frames = [];
      for (let i = 0; i < 24; i++) {
        ctx.fillStyle = '#eeeeee'; ctx.fillRect(0, 0, 320, 180);
        ctx.fillStyle = '#156b59'; ctx.fillRect(10 + i * 10, 40, 25, 100);
        const dataUrl = canvas.toDataURL();
        const img = new Image(); img.src = dataUrl; await img.decode();
        s.frames.push({ dataUrl, img, time: i / 24, frameNumber: i, sourceName: 'chrono-test.png' });
      }
      Object.assign(s, { isSingleImage: true, videoWidth: 320, videoHeight: 180, captureW: 320, captureH: 180,
        videoFile: new File([''], 'chrono-test.png'), frameCount: 24, gridCols: 6, frameTarget: 0,
        chronoEnabled: false, chronoDepth: 5, chronoOpacity: 1, animFps: 12, currentTick: 0,
        exportLoops: 2, exportQuality: 'low', exportShowMetadata: false, showTimecode: false });
      document.getElementById('dropZone').classList.add('hidden');
      __chronoTest.renderGrid();
      __chronoTest.setViewMode('single');
      __chronoTest.fitActiveView();
    });
    await page.locator('#menuToggleBtn').click();
    await page.getByText('CHRONOPHOTO', { exact: true }).click();
    await page.locator('#toggleChronophoto').click();
    await page.locator('#chronoDepth').fill('20');
    await page.locator('#chronoDepth').press('Tab');
    await page.locator('#toggleChronoAnimation').click();
    assert.deepEqual(await page.evaluate(() => _fgState.chronoAnimation.keys), [
      { frame: 1, percent: 0 }, { frame: 12, percent: 100 }, { frame: 24, percent: 0 }
    ]);
    assert.equal(await page.locator('#chronoAnimationBody').isVisible(), true);
    const layers = () => page.locator('.frame-item').first().locator('.frame-chrono').count();
    assert.equal(await layers(), 0);
    await page.getByRole('button', { name: 'Go to frame 12', exact: true }).click();
    assert.equal(await layers(), 20);
    await page.locator('#chronoAnimationDisclosure').click();
    assert.equal(await page.locator('#chronoAnimationBody').isVisible(), false);
    assert.equal(await page.evaluate(() => _fgState.chronoAnimation.enabled), true);
    await page.locator('#chronoAnimationDisclosure').click();
    await page.locator('#chronoAnimationAdd').click();
    assert.equal(await page.locator('.chrono-key-row').count(), 3);
    await page.evaluate(() => { _fgState.currentTick = 6; __chronoTest.updateAllCells(); });
    const beforeAdd = await page.locator('.frame-item').first().locator('.frame-chrono').evaluateAll(nodes => nodes.map(n => n.style.opacity));
    await page.locator('#chronoAnimationAdd').click();
    assert.equal(await page.locator('.chrono-key-row').count(), 4);
    assert.deepEqual(await page.locator('.frame-item').first().locator('.frame-chrono').evaluateAll(nodes => nodes.map(n => n.style.opacity)), beforeAdd);
    await page.locator('[data-frame="7"] [data-field="frame"]').fill('12');
    await page.locator('[data-frame="7"] [data-field="frame"]').press('Tab');
    assert.equal(await page.locator('.chrono-key-row').count(), 4);
    assert.ok((await page.locator('#chronoAnimationStatus').innerText()).includes('already'));
    await page.getByRole('button', { name: 'Delete key at frame 7', exact: true }).click();
    await page.locator('#chronoAnimationInterpolation').selectOption('linear');
    await page.getByRole('button', { name: 'Go to frame 12', exact: true }).click();
    await page.screenshot({ path: path.join(output, 'single-keys.png') });

    // Every cell uses its own displayed frame, including reverse and subsequent loops.
    const gridChecks = await page.evaluate(() => {
      __chronoTest.setViewMode('grid');
      const results = [];
      for (const direction of ['forward', 'backward', 'pingpong']) {
        _fgState.animDirection = direction;
        for (const tick of [0, 6, 24, 35]) {
          _fgState.currentTick = tick; __chronoTest.updateAllCells();
          const items = [...document.querySelectorAll('.frame-item')];
          results.push(...items.map((item, i) => {
            const f = __chronoTest.getFrameCellInfo(i, tick).frameIdx;
            const depth = 20 * (f <= 11 ? f / 11 : (23 - f) / 12);
            const actual = [...item.querySelectorAll('.frame-chrono')].reduce((a, img) => a + Number(img.style.opacity), 0);
            return { f, depth, actual, direction, tick };
          }));
        }
      }
      _fgState.animDirection = 'forward'; _fgState.currentTick = 6; __chronoTest.updateAllCells();
      return results;
    });
    for (const check of gridChecks) assert.ok(Math.abs(check.depth - check.actual) < 0.002, JSON.stringify(check));
    await page.screenshot({ path: path.join(output, 'grid-keys.png') });

    // Real MP4 exports exercise both renderers, independent of the preview tick.
    const exports = {};
    for (const mode of ['single', 'grid']) {
      await page.evaluate(() => { window.__chronoDraws = []; });
      const downloadPromise = page.waitForEvent('download');
      await page.evaluate(mode => __chronoTest.exportMp4(mode), mode);
      const download = await downloadPromise;
      const file = path.join(output, `${mode}.mp4`);
      await download.saveAs(file);
      assert.ok(fs.statSync(file).size > 1000);
      const draws = await page.evaluate(() => window.__chronoDraws);
      assert.ok(draws.length >= 48);
      for (const draw of draws) {
        assert.ok(Number.isInteger(draw.frame));
        const expected = 20 * (draw.frame <= 11 ? draw.frame / 11 : (23 - draw.frame) / 12);
        assert.ok(Math.abs(draw.alphas.reduce((a, b) => a + b, 0) - expected) < 1e-5, JSON.stringify(draw));
      }
      exports[mode] = { bytes: fs.statSync(file).size, stacks: draws.length };
    }
    // Still export follows the current frame, too.
    await page.evaluate(() => { _fgState.currentTick = 6; __chronoTest.updateAllCells(); window.__chronoDraws = []; });
    const stillPromise = page.waitForEvent('download');
    await page.evaluate(() => __chronoTest.exportSingleStill('png'));
    await (await stillPromise).saveAs(path.join(output, 'single.png'));
    assert.equal((await page.evaluate(() => window.__chronoDraws))[0].frame, 6);

    // Fractional layers have identical alpha in DOM and canvas, with both
    // cascade shapes and clean-loop clipping enabled or disabled.
    const alphaChecks = await page.evaluate(() => {
      const s = _fgState, results = [];
      for (const mirror of [false, true]) for (const clean of [false, true]) {
        s.chronoCascade = true; s.chronoCascadeMirror = mirror; s.chronoCleanLoop = clean;
        s.currentTick = 6; __chronoTest.updateAllCells();
        const info = __chronoTest.getFrameCellInfo(0, 6);
        const dom = [...document.querySelector('.frame-item').querySelectorAll('.frame-chrono')]
          .filter(img => img.style.display !== 'none').map(img => Number(img.style.opacity));
        const ghosts = __chronoTest.buildChronoGhostIndices(6, info.baseOffset, s.frames.length, s.animDirection, s.animDirShuffle);
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
        const ctx = canvas.getContext('2d'), alphas = [];
        const draw = ctx.drawImage;
        ctx.drawImage = function(...args) { alphas.push(this.globalAlpha); return draw.apply(this, args); };
        __chronoTest.drawChronophotoStack(ctx, ghosts, 0, 0, 320, 180, { currentFrameIdx: info.frameIdx });
        results.push({ dom, alphas, mirror, clean });
      }
      s.chronoCascade = false; s.chronoCascadeMirror = false; s.chronoCleanLoop = false;
      __chronoTest.updateAllCells();
      return results;
    });
    for (const check of alphaChecks) {
      assert.equal(check.dom.length, check.alphas.length);
      check.dom.forEach((alpha, i) => assert.ok(Math.abs(alpha - check.alphas[i]) <= 0.00051));
    }

    // Resampling a shorter clip must not silently delete authored keys.
    const preserved = await page.evaluate(() => {
      const s = _fgState, frames = s.frames, before = JSON.stringify(s.chronoAnimation.keys);
      s.frames = frames.slice(0, 8); __chronoTest.renderGrid();
      const after = JSON.stringify(s.chronoAnimation.keys);
      s.frames = frames; __chronoTest.renderGrid(); __chronoTest.updateAllCells();
      return { before, after };
    });
    assert.equal(preserved.before, preserved.after);

    const saved = await page.evaluate(() => JSON.stringify(_fgState.chronoAnimation.keys));
    await page.locator('#toggleChronoAnimation').click();
    await page.locator('#toggleChronoAnimation').click();
    assert.equal(await page.evaluate(() => JSON.stringify(_fgState.chronoAnimation.keys)), saved);
    while (await page.locator('.chrono-key-row').count()) {
      await page.locator('.chrono-key-row button').last().click();
    }
    await page.locator('#toggleChronoAnimation').click();
    await page.locator('#toggleChronoAnimation').click();
    assert.equal(await page.locator('.chrono-key-row').count(), 0);
    assert.equal(await layers(), 20);
    await page.locator('#chronoAnimationAdd').click();
    assert.equal(await page.locator('.chrono-key-row').count(), 1);
    assert.equal(await page.evaluate(() => _fgState.chronoAnimation.keys[0].percent), 100);

    // Exposure reuses the same UI and preserves static background brightness.
    await page.locator('#chronoBlend').selectOption('exposure');
    assert.equal(await page.locator('#chronoOpacityLabel').innerText(), 'Exposure Mix');
    await page.locator('#chronoOpacityNum').fill('0');
    await page.locator('#chronoOpacityNum').press('Tab');
    assert.equal(await page.evaluate(() => _fgState.chronoOpacity), 0);
    const zeroAlphas = await page.locator('.frame-item').first().locator('.frame-chrono').evaluateAll(nodes => nodes.map(n => Number(n.style.opacity)));
    assert.ok(zeroAlphas.every(alpha => alpha === 0));
    await page.locator('#chronoOpacityNum').fill('1');
    await page.locator('#chronoOpacityNum').press('Tab');

    const exposurePixels = await page.evaluate(async () => {
      const s = _fgState, results = [];
      const saved = { frames: s.frames, depth: s.chronoDepth, animation: s.chronoAnimation, cascade: s.chronoCascade, mirror: s.chronoCascadeMirror };
      const makeFrame = async (value) => {
        const c = document.createElement('canvas'); c.width = 320; c.height = 180;
        const ctx = c.getContext('2d'); ctx.fillStyle = `rgb(${value},${value},${value})`; ctx.fillRect(0, 0, 320, 180);
        const dataUrl = c.toDataURL(), img = new Image(); img.src = dataUrl; await img.decode();
        return { dataUrl, img, time: 0, frameNumber: 0 };
      };
      s.chronoAnimation = { enabled: false, keys: [] };
      const flat = await makeFrame(128);
      s.frames = [flat];
      for (const depth of [1, 5, 20, 100]) {
        s.chronoDepth = depth;
        const c = document.createElement('canvas'); c.width = 320; c.height = 180;
        const ctx = c.getContext('2d'); ctx.drawImage(flat.img, 0, 0);
        __chronoTest.drawChronophotoStack(ctx, Array(depth).fill(0), 0, 0, 320, 180, { currentFrameIdx: 0 });
        results.push({ depth, pixel: [...ctx.getImageData(160, 90, 1, 1).data] });
      }
      s.frames = await Promise.all([200, 20, 80, 100].map(makeFrame));
      s.chronoDepth = 3;
      const c = document.createElement('canvas'); c.width = 320; c.height = 180;
      const ctx = c.getContext('2d'); ctx.drawImage(s.frames[0].img, 0, 0);
      __chronoTest.drawChronophotoStack(ctx, [1, 2, 3], 0, 0, 320, 180, { currentFrameIdx: 0 });
      results.push({ expected: 100, pixel: [...ctx.getImageData(160, 90, 1, 1).data] });
      Object.assign(s, { frames: saved.frames, chronoDepth: saved.depth, chronoAnimation: saved.animation, chronoCascade: saved.cascade, chronoCascadeMirror: saved.mirror });
      __chronoTest.setViewMode('single'); __chronoTest.updateAllCells(); __chronoTest.fitActiveView();
      await Promise.all([...document.querySelectorAll('.frame-item img')].map(img => img.decode().catch(() => {})));
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      return results;
    });
    for (const sample of exposurePixels) {
      for (const channel of sample.pixel.slice(0, 3)) assert.ok(Math.abs(channel - (sample.expected ?? 128)) <= 2, JSON.stringify(sample));
    }
    assert.ok((await page.locator('.frame-item').first().locator('.frame-chrono').evaluateAll(nodes => nodes.map(n => n.style.mixBlendMode))).every(mode => mode === 'normal'));
    await page.screenshot({ path: path.join(output, 'exposure.png') });
    const exposureDownload = page.waitForEvent('download');
    await page.evaluate(() => __chronoTest.exportMp4('single'));
    const exposurePath = path.join(output, 'exposure.mp4');
    await (await exposureDownload).saveAs(exposurePath);
    assert.ok(fs.statSync(exposurePath).size > 1000);

    assert.deepEqual(errors, []);
    const result = { passed: true, gridChecks: gridChecks.length, alphaChecks: alphaChecks.length, exposurePixels, exports, errors, output };
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
