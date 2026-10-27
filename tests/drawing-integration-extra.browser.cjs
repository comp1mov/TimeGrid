const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict'),
  { spawn } = require('child_process');
(async () => {
  const root = process.cwd(),
    out = '.timegrid-bench/integration',
    server = spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        '--host',
        '127.0.0.1',
        '--port',
        '5192',
        '--strictPort',
      ],
      { windowsHide: true, stdio: 'pipe' },
    );
  let browser;
  const results = [];
  try {
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch('http://127.0.0.1:5192')).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({
        viewport: { width: 1280, height: 860 },
      }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.__metrics = { rects: 0, render: [] };
      const original = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function (...a) {
        __metrics.rects++;
        return original.apply(this, a);
      };
    });
    await page.route('**/src/js/main.js*', async (r) => {
      const res = await r.fetch(),
        s = await res.text(),
        i = s.lastIndexOf('})();');
      await r.fulfill({
        response: res,
        body:
          s.slice(0, i) +
          `\nconst originalComposite=compositeAllLayers;compositeAllLayers=()=>{const t=performance.now();originalComposite();__metrics.render.push(performance.now()-t);};window.__ink={engine:drawingEngine,render:compositeAllLayers,geometry:getDrawingGeometry,updateAllCells,setViewMode,setDrawTarget,exportFrame:drawExportDrawings};\n` +
          s.slice(i),
      });
    });
    await page.goto('http://127.0.0.1:5192', { waitUntil: 'networkidle' });
    const b64 = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 180;
      c.height = 320;
      c.getContext('2d').fillStyle = '#728378';
      c.getContext('2d').fillRect(0, 0, 180, 320);
      return c.toDataURL().split(',')[1];
    });
    await page
      .locator('#imageInput')
      .setInputFiles(
        Array.from({ length: 128 }, (_, i) => ({
          name: 'portrait-' + i + '.png',
          mimeType: 'image/png',
          buffer: Buffer.from(b64, 'base64'),
        })),
      );
    await page.waitForFunction(() => _fgState.frames.length === 128);
    await page.waitForTimeout(300);
    await page.locator('#qDraw').click();
    await page.keyboard.press('p');
    const r = await page.locator('.frame-item').nth(127).boundingBox();
    await page.mouse.move(r.x + r.width * 0.3, r.y + r.height * 0.8);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width * 0.7, r.y + r.height * 0.9, {
      steps: 10,
    });
    await page.mouse.up();
    const portrait = await page.evaluate(async () => {
      const e = __ink.engine,
        surface = e.frameSurface(127),
        c = document.createElement('canvas');
      c.width = 180;
      c.height = 320;
      __ink.exportFrame(c.getContext('2d'), 0, 0, 180, 320, 127);
      const before = c.toDataURL(),
        json = e.document.serialize();
      e.openText(json);
      c.getContext('2d').clearRect(0, 0, 180, 320);
      __ink.exportFrame(c.getContext('2d'), 0, 0, 180, 320, 127);
      const image = c.getContext('2d').getImageData(0, 230, 180, 90).data;
      return {
        count: e.document.geometry.count,
        width: e.document.geometry.width,
        height: e.document.geometry.height,
        surface,
        pixels: image.filter((v, i) => i % 4 === 3 && v > 0).length,
        roundtrip: before === c.toDataURL(),
      };
    });
    assert.ok(portrait.pixels > 0 && portrait.roundtrip);
    results.push({ portrait });
    console.log('PORTRAIT', portrait);
    // Generate an actual MP4 fixture through the tested exporter, then import as video.
    await page
      .locator('#videoInput')
      .setInputFiles(path.resolve(out, 'single.mp4'));
    await page.waitForFunction(
      () =>
        !_fgState.isSingleImage &&
        _fgState.frames.length > 0 &&
        _fgState.videoDuration > 0 &&
        !document
          .getElementById('loadingOverlay')
          .classList.contains('visible'),
    );
    await page.waitForTimeout(500);
    const video = await page.evaluate(() => ({
      n: _fgState.frames.length,
      width: _fgState.videoWidth,
      height: _fgState.videoHeight,
      duration: _fgState.videoDuration,
      bindings: __ink.engine.document.bindings.length,
    }));
    results.push({ video });
    console.log('VIDEO', video);
    // Return to a 96-frame loop via the original import controls for the performance run.
    await page
      .locator('#imageInput')
      .setInputFiles({
        name: 'benchmark.png',
        mimeType: 'image/png',
        buffer: Buffer.from(b64, 'base64'),
      });
    await page.waitForFunction(
      () => _fgState.isSingleImage && _fgState.frames.length === 24,
    );
    await page.evaluate(() => {
      const el = document.getElementById('frameCount');
      el.value = 96;
      el.dispatchEvent(new Event('change'));
      document.getElementById('generateBtn').click();
    });
    await page.waitForFunction(() => _fgState.frames.length === 96);
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      __ink.setViewMode('grid');
      __ink.setDrawTarget('frame');
      _fgState.drawOneFrame = false;
    });
    await page.waitForTimeout(100);
    const pts = await page.locator('.frame-item').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return [r.x + r.width * 0.5, r.y + r.height * 0.5];
      }),
    );
    await page.evaluate(() => {
      __metrics.rects = 0;
      __metrics.render = [];
    });
    await page.mouse.move(...pts[0]);
    await page.mouse.down();
    for (const p of pts.slice(1)) await page.mouse.move(...p, { steps: 2 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    const perf = await page.evaluate(() => {
      const a = __metrics.render.sort((a, b) => a - b);
      return {
        rectReads: __metrics.rects,
        renders: a.length,
        p50: a[Math.floor(a.length * 0.5)],
        p95: a[Math.floor(a.length * 0.95)],
        max: a.at(-1),
        cache: __ink.engine.cache.stats(),
        canvas: [drawCanvas.width, drawCanvas.height],
        strokeBytes: __ink.engine.document.serialize().length,
        touched: [
          ...new Set(
            __ink.engine.document.strokes
              .at(-1)
              .placements.map((p) => p.surface),
          ),
        ].length,
      };
    });
    results.push({ performance: perf });
    console.log('PERF', perf);
    // Real touch emulation context checks the phone CSS and pointer router, not hardware.
    for (const width of [390, 320]) {
      const phone = await browser.newPage({
        viewport: { width, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      });
      const phoneErrors = [];
      phone.on('pageerror', (e) => phoneErrors.push(e.message));
      await phone.goto('http://127.0.0.1:5192', { waitUntil: 'networkidle' });
      await phone
        .locator('#imageInput')
        .setInputFiles({
          name: 'phone.png',
          mimeType: 'image/png',
          buffer: Buffer.from(b64, 'base64'),
        });
      await phone.waitForTimeout(600);
      await phone.locator('#qDraw').tap();
      const box = await phone.locator('#drawPalette').boundingBox();
      assert.ok(box.height <= 160 && box.width <= width - 16);
      await phone.locator('#drawSave').tap();
      await phone.locator('#savePointMobileSave1').tap();
      await phone.waitForTimeout(150);
      assert.equal(
        await phone.locator('#savePointMobileLoad1').isEnabled(),
        true,
      );
      await phone.screenshot({ path: out + '/phone-' + width + '.png' });
      assert.deepEqual(phoneErrors, []);
      results.push({ phone: { viewport: width, ...box } });
      await phone.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      out + '/extra-results.json',
      JSON.stringify({ browser: browser.version(), results, errors }, null, 2),
    );
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
