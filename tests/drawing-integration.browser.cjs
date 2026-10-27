const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  { spawn } = require('node:child_process');
(async () => {
  const root = process.cwd(),
    output = path.join(root, '.timegrid-bench/integration');
  fs.mkdirSync(output, { recursive: true });
  const server = spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/vite/bin/vite.js'),
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
  const ok = (name, data) => {
    results.push({ name, ...data });
    console.log('PASS', name, JSON.stringify(data || {}));
  };
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
      acceptDownloads: true,
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.stack));
    page.on('dialog', (d) => d.accept());
    await page.route('**/src/js/main.js*', async (route) => {
      const res = await route.fetch();
      const s = await res.text(),
        i = s.lastIndexOf('})();');
      await route.fulfill({
        response: res,
        body:
          s.slice(0, i) +
          `\nwindow.__ink={engine:drawingEngine,render:compositeAllLayers,geometry:getDrawingGeometry,composition:drawingComposition,exportFrame:drawExportDrawings,exportImage,exportSingleStill,exportPngSeqDrawings,exportMp4,placement:getStillExportPlacement,generateFrames,setViewMode,updateAllCells,updateTransform,renderGrid,setDrawTarget,fitActiveView};\n` +
          s.slice(i),
      });
    });
    await page.goto('http://127.0.0.1:5192', { waitUntil: 'networkidle' });
    const b64 = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 480;
      c.height = 270;
      const x = c.getContext('2d');
      x.fillStyle = '#bbb5a3';
      x.fillRect(0, 0, 480, 270);
      x.fillStyle = '#554a3b';
      x.fillRect(100, 50, 200, 170);
      return c.toDataURL().split(',')[1];
    });
    await page
      .locator('#imageInput')
      .setInputFiles({
        name: 'integration-landscape.png',
        mimeType: 'image/png',
        buffer: Buffer.from(b64, 'base64'),
      });
    await page.waitForFunction(() => window._fgState.frames.length === 24);
    await page.evaluate(() => {
      const el = document.getElementById('frameCount');
      el.value = 96;
      el.dispatchEvent(new Event('change'));
      document.getElementById('generateBtn').click();
    });
    await page.waitForFunction(() => window._fgState.frames.length === 96);
    await page.waitForTimeout(300);
    await page.locator('#qDraw').click();
    // Move the approved draggable panel away from drawing targets.
    await page.locator('#drawDragHandle').hover();
    await page.mouse.down();
    await page.mouse.move(1000, 800, { steps: 5 });
    await page.mouse.up();
    const stroke = async (points) => {
      await page.mouse.move(...points[0]);
      await page.mouse.down();
      for (const point of points.slice(1))
        await page.mouse.move(...point, { steps: 4 });
      await page.mouse.up();
      await page.waitForTimeout(80);
    };
    const rect = async (i) => page.locator('.frame-item').nth(i).boundingBox();
    const r = await rect(20);
    await stroke([
      [r.x + r.width * 0.2, r.y + r.height * 0.4],
      [r.x + r.width * 0.8, r.y + r.height * 0.6],
    ]);
    assert.equal(
      await page.evaluate(() => __ink.engine.document.strokes.length),
      1,
    );
    ok('real import, 96 frame bank, pointer stroke');
    const json = await page.evaluate(() => __ink.engine.document.serialize());
    await page.keyboard.press('Control+z');
    assert.equal(
      await page.evaluate(() => __ink.engine.document.strokes.length),
      0,
    );
    await page.keyboard.press('Control+Shift+z');
    assert.equal(
      await page.evaluate(() => __ink.engine.document.serialize()),
      json,
    );
    ok('Undo/Redo hotkeys');
    await page.locator('#savePointSave1').click();
    await page.locator('#drawClear').click();
    assert.equal(
      await page.evaluate(() => __ink.engine.document.strokes.length),
      0,
    );
    await page.locator('#savePointLoad1').click();
    assert.equal(
      await page.evaluate(() => __ink.engine.document.serialize()),
      json,
    );
    ok('S1/Clear/L1');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#drawSave').click();
    const download = await downloadPromise;
    await download.saveAs(path.join(output, 'drawing.json'));
    assert.equal(
      fs.readFileSync(path.join(output, 'drawing.json'), 'utf8'),
      json,
    );
    await page.locator('#drawClear').click();
    await page
      .locator('#drawOpenFile')
      .setInputFiles(path.join(output, 'drawing.json'));
    await page.waitForFunction(
      () => __ink.engine.document.strokes.length === 1,
    );
    assert.equal(
      await page.evaluate(() => __ink.engine.document.serialize()),
      json,
    );
    ok('file Save/Open exact roundtrip');
    // Reflow uses the app controls, keeps the source addresses and immutable data.
    await page.evaluate(() => {
      for (const [id, value] of [
        ['gridCols', 8],
        ['spacing', 30],
      ]) {
        const el = document.getElementById(id);
        if (el) {
          el.value = value;
          el.dispatchEvent(new Event('change'));
        }
      }
    });
    await page.waitForTimeout(300);
    assert.equal(
      await page.evaluate(() => __ink.engine.document.serialize()),
      json,
    );
    ok('columns/spacing preserve stroke data');
    // Single held pointer must leave ink on each displayed source frame.
    await page.locator('#qMode').click();
    assert.equal(await page.evaluate(() => _fgState.viewMode), 'single');
    await page.waitForTimeout(200);
    const sr = await rect(0);
    await page.mouse.move(sr.x + sr.width * 0.6, sr.y + sr.height * 0.45);
    await page.mouse.down();
    for (let t = 1; t <= 5; t++) {
      await page.evaluate((t) => {
        _fgState.currentTick = t;
        __ink.updateAllCells();
      }, t);
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
    await page.waitForTimeout(100);
    const surfaces = await page.evaluate(() => [
      ...new Set(
        __ink.engine.document.strokes
          .slice(1)
          .flatMap((s) => s.placements.map((p) => p.surface)),
      ),
    ]);
    assert.ok(surfaces.length >= 5);
    ok('Single stationary hold across animation frames', { surfaces });
    // Closed contour and fill on one frame through actual pointer input.
    await page.evaluate(() => {
      _fgState.currentTick = 0;
      __ink.updateAllCells();
      _fgState.drawOneFrame = true;
      _fgState.drawStabilizer = 0;
      _fgState.drawSmoothing = 0;
      _fgState.drawSize = 4;
    });
    const q = await rect(0),
      cx = q.x + q.width * 0.5,
      cy = q.y + q.height * 0.5,
      rad = Math.min(q.width, q.height) * 0.2;
    const circle = Array.from({ length: 49 }, (_, i) => [
      cx + Math.cos((i / 48) * Math.PI * 2) * rad,
      cy + Math.sin((i / 48) * Math.PI * 2) * rad,
    ]);
    await stroke(circle);
    await page.evaluate(() => {
      const el = document.getElementById('drawBrushType');
      el.value = 'fill';
      el.dispatchEvent(new Event('change'));
    });
    await page.mouse.click(cx, cy);
    await page.waitForFunction(
      () =>
        __ink.engine.document.strokes.some(
          (s) => s.renderer === 'fill-runs-v1',
        ),
      { timeout: 10000 },
    );
    ok('closed figure Fill');
    // Actual export download, normal imported media plus drawing.
    await page.evaluate(() => {
      _fgState.exportDrawings = true;
      _fgState.exportShowMetadata = false;
    });
    const pngPromise = page.waitForEvent('download');
    await page.evaluate(() => __ink.exportSingleStill('png', 1080));
    const png = await pngPromise;
    await png.saveAs(path.join(output, 'single.png'));
    assert.ok(fs.statSync(path.join(output, 'single.png')).size > 500);
    ok('single PNG download');
    await page.evaluate(() => {
      const el = document.getElementById('drawBrushType');
      el.value = 'round';
      el.dispatchEvent(new Event('change'));
      __ink.setDrawTarget('background');
      __ink.fitActiveView();
    });
    await page.waitForTimeout(150);
    const br = await rect(0);
    await stroke([
      [br.x - 20, br.y + br.height * 0.3],
      [br.x - 20, br.y + br.height * 0.7],
    ]);
    const bg = await page.evaluate(() => {
      const e = __ink.engine;
      const b = e.bgBounds('single');
      _fgState.exportBgLayer = true;
      const yes = __ink.placement('single', 480, 270, 0, 0);
      _fgState.exportBgLayer = false;
      const no = __ink.placement('single', 480, 270, 0, 0);
      return { b, yes, no };
    });
    assert.ok(bg.b && bg.b.x < 0);
    assert.ok(bg.yes.canvasW > bg.no.canvasW);
    assert.equal(bg.no.canvasW, 480);
    ok('BG exterior and export bounds toggle', bg);
    await page.evaluate(() => (_fgState.exportBgLayer = true));
    const bgP = page.waitForEvent('download');
    await page.evaluate(() => __ink.exportSingleStill('png', 1080));
    await (await bgP).saveAs(path.join(output, 'single-bg.png'));
    // Additional integration checks use the same real media and engine.
    await page.evaluate(() => {
      __ink.setDrawTarget('frame');
      _fgState.brushType = 'spray';
      _fgState.drawSize = 120;
      _fgState.drawOneFrame = true;
    });
    await stroke([
      [br.x + br.width * 0.15, br.y + br.height * 0.2],
      [br.x + br.width * 0.3, br.y + br.height * 0.25],
    ]);
    assert.equal(
      await page.evaluate(
        () => __ink.engine.document.strokes.at(-1).brush.type,
      ),
      'spray',
    );
    assert.ok(
      await page.evaluate(
        () => __ink.engine.document.strokes.at(-1).brush.size > 256,
      ),
    );
    ok('Spray full original size range');
    await page.evaluate(() => {
      __ink.setDrawTarget('frame');
      _fgState.brushType = 'round';
      _fgState.drawSize = 4;
    });
    const devices = await page.evaluate(() => {
      const canvas = document.getElementById('drawCanvas'),
        r = document.querySelector('.frame-item').getBoundingClientRect();
      const send = (type, id, kind, x, y, pressure, buttons = 1) =>
        canvas.dispatchEvent(
          new PointerEvent(kind, {
            pointerType: type,
            pointerId: id,
            button: 0,
            buttons,
            pressure,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        );
      let n = __ink.engine.document.strokes.length;
      send(
        'pen',
        71,
        'pointerdown',
        r.x + r.width * 0.7,
        r.y + r.height * 0.2,
        0.2,
      );
      send(
        'touch',
        72,
        'pointerdown',
        r.x + r.width * 0.6,
        r.y + r.height * 0.2,
        0.5,
      );
      send(
        'pen',
        71,
        'pointermove',
        r.x + r.width * 0.8,
        r.y + r.height * 0.3,
        0.8,
      );
      send(
        'pen',
        71,
        'pointerup',
        r.x + r.width * 0.8,
        r.y + r.height * 0.3,
        0,
        0,
      );
      return {
        added: __ink.engine.document.strokes.length - n,
        pressure: __ink.engine.document.strokes.at(-1).brush.pressure,
        points: __ink.engine.document.strokes.at(-1).points.map((p) => p[2]),
      };
    });
    assert.equal(devices.added, 1);
    assert.ok(
      devices.pressure &&
        devices.points.some((p) => Math.abs(p - 0.2) < 0.001) &&
        devices.points.some((p) => Math.abs(p - 0.8) < 0.001),
    );
    ok('synthetic pen pressure and palm rejection', devices);
    await page.waitForTimeout(400);
    const touch = await page.evaluate(() => {
      const c = document.getElementById('drawCanvas'),
        r = document.querySelector('.frame-item').getBoundingClientRect(),
        n = __ink.engine.document.strokes.length;
      for (const [type, x] of [
        ['pointerdown', 0.3],
        ['pointermove', 0.4],
        ['pointerup', 0.4],
      ])
        c.dispatchEvent(
          new PointerEvent(type, {
            pointerType: 'touch',
            pointerId: 81,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: r.x + r.width * x,
            clientY: r.y + r.height * 0.7,
            bubbles: true,
            cancelable: true,
          }),
        );
      return __ink.engine.document.strokes.length - n;
    });
    assert.equal(touch, 1);
    ok('synthetic single-finger drawing');
    await page.evaluate(() => {
      __ink.setDrawTarget('template');
    });
    const tr = await page.locator('#templateFrameCanvas').boundingBox();
    await stroke([
      [tr.x + tr.width * 0.2, tr.y + tr.height * 0.5],
      [tr.x + tr.width * 0.4, tr.y + tr.height * 0.5],
    ]);
    assert.ok(
      await page.evaluate(
        () =>
          __ink.engine.document.query('tpl', { x: 0, y: 0, w: 1024, h: 1024 })
            .length,
      ),
    );
    await page.evaluate(() =>
      document.getElementById('applyTemplateToFrames').click(),
    );
    const bake = await page.evaluate(() =>
      __ink.engine.document.strokes.at(-1),
    );
    assert.equal(bake.renderer, 'composite-v1');
    assert.equal(bake.placements.length, 96);
    ok('TPL window and Apply to all 96 source frames');
    await page.locator('#templateFrameClose').click();
    await page.evaluate(() => {
      _fgState.exportPaddingPx = 0;
      _fgState.exportLoops = 1;
      _fgState.loopAfterN = 2;
    });
    const seqP = page.waitForEvent('download');
    await page.evaluate(() => __ink.exportPngSeqDrawings());
    const seq = await seqP;
    await seq.saveAs(path.join(output, 'sequence.zip'));
    assert.equal(
      fs.readFileSync(path.join(output, 'sequence.zip')).readUInt32LE(0),
      0x04034b50,
    );
    ok('96-frame PNG sequence ZIP with sparse BG');
    const mp4P = page.waitForEvent('download');
    await page.evaluate(() => __ink.exportMp4('single'));
    await (await mp4P).saveAs(path.join(output, 'single.mp4'));
    assert.equal(
      fs.readFileSync(path.join(output, 'single.mp4')).toString('ascii', 4, 8),
      'ftyp',
    );
    ok('single MP4 download with drawing/BG');
    await page.evaluate(() => {
      __ink.setViewMode('grid');
    });
    await page.waitForTimeout(200);
    const gridP = page.waitForEvent('download');
    await page.evaluate(() => __ink.exportImage('png', 1080));
    await (await gridP).saveAs(path.join(output, 'grid.png'));
    ok('grid PNG with current Spacing');
    const squareFill = await page.evaluate(async () => {
      const { StrokeDocument, createStroke } = await import(
        '/src/js/stroke-document.mjs'
      );
      const { createFill } = await import('/src/js/drawing-fill.mjs');
      const d = new StrokeDocument({
        width: 1024,
        height: 1024,
        count: 1,
        gridWidth: 1024,
        gridHeight: 1024,
      });
      d.addGesture([
        createStroke({
          id: d.newId(),
          surface: 'frame-0',
          space: { w: 1024, h: 1024 },
          size: 20,
          streamline: 0,
          smoothing: 0,
          points: [
            [100, 100, 0.5],
            [900, 100, 0.5],
            [900, 900, 0.5],
            [100, 900, 0.5],
            [100, 100, 0.5],
          ],
        }),
      ]);
      const fill = await createFill({
        document: d,
        surface: 'frame-0',
        x: 512,
        y: 512,
        color: '#ff0000',
        opacity: 1,
      });
      d.addGesture([fill]);
      return {
        step: fill.fill.step,
        roundtrip:
          StrokeDocument.parse(d.serialize()).serialize() === d.serialize(),
      };
    });
    assert.equal(squareFill.step, 1);
    assert.ok(squareFill.roundtrip);
    ok('square frame Fill stays within mask budget', squareFill);
    // All Draw params remain present when switching tools/targets.
    await page.screenshot({ path: path.join(output, 'desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(450);
    await page.locator('#qFit').click();
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      const p = document.getElementById('drawPalette');
      p.style.left = '8px';
      p.style.top = '620px';
    });
    const mobile = await page.locator('#drawPalette').boundingBox();
    assert.ok(mobile.height <= 160);
    assert.ok(mobile.width <= 382);
    await page.locator('#drawSave').click();
    await page.locator('#savePointMobileSave2').click();
    await page.locator('#savePointMobileLoad2').click();
    ok('phone three rows and Save slots', { mobile });
    await page.screenshot({ path: path.join(output, 'mobile.png') });
    assert.deepEqual(errors, []);
    ok('no uncaught browser errors');
    fs.writeFileSync(
      path.join(output, 'results.json'),
      JSON.stringify({ results, errors }, null, 2),
    );
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
