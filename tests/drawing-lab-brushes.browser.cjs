const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const url = process.env.TEST_URL || 'http://127.0.0.1:5197/drawing-lab.html';
const out =
  process.env.DRAWING_OUTPUT ||
  'docs/drawing-evidence/2026-10-26-perfect-freehand-4/dev';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [],
    checks = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const check = (name, details) => {
    checks.push({ name, passed: true, details });
    console.log('PASS ' + name);
  };
  await page.goto(url);
  await page.waitForFunction(() => window.timegridLab?.layout().length === 96);
  await page.evaluate(() => document.fonts.ready);
  const flush = () => page.evaluate(() => timegridLab.flush());
  await page.selectOption('#view', 'single');
  await page.locator('#sizeNumber').fill('80');
  const draw = async (y = 0.5) => {
    const r = await page.evaluate(() => {
      const b = document.querySelector('#canvas').getBoundingClientRect(),
        r = timegridLab.layout()[0];
      return { x: b.x + r.x, y: b.y + r.y, w: r.w, h: r.h };
    });
    await page.mouse.move(r.x + r.w * 0.15, r.y + r.h * y);
    await page.mouse.down();
    for (let i = 1; i <= 35; i++)
      await page.mouse.move(
        r.x + r.w * (0.15 + (0.7 * i) / 35),
        r.y + r.h * (y + 0.08 * Math.sin((i / 35) * Math.PI * 2)),
      );
    await page.mouse.up();
    await flush();
  };
  for (const target of ['frm', 'tpl', 'bg']) {
    await page.evaluate(() => timegridLab.reset());
    await page.selectOption('#target', target);
    await page.selectOption('#tool', 'pen');
    await page.selectOption('#brushType', 'spray');
    await page.locator('#softness').fill('0');
    await draw();
    const before = await page.evaluate(() => timegridLab.serialize());
    assert.equal(JSON.parse(before).strokes[0].brush.type, 'spray');
    assert.ok(JSON.parse(before).strokes[0].stamps.length > 100);
    await page.selectOption('#tool', 'erase');
    await page.selectOption('#brushType', 'round');
    await page.locator('#softness').fill('60');
    await draw();
    const erased = await page.evaluate(() => timegridLab.serialize());
    const s = JSON.parse(erased).strokes;
    assert.equal(s[1].brush.erase, true);
    assert.equal(s[1].surface, s[0].surface);
    await page.click('#undo');
    assert.equal(await page.evaluate(() => timegridLab.serialize()), before);
    await page.click('#redo');
    assert.equal(await page.evaluate(() => timegridLab.serialize()), erased);
    check('UI Spray + soft eraser + Undo/Redo on ' + target, {
      stamps: s[0].stamps.length,
    });
  }
  // Pixel-level verification of actual tiles against independently painted saved dabs.
  const pixels = await page.evaluate(() => {
    function canvas(w = 1024, h = 576) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }
    function read(c) {
      return c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    }
    function compare(a, b) {
      let diff = 0,
        max = 0,
        ink = 0,
        missing = 0;
      for (let i = 3; i < a.length; i += 4) {
        const d = Math.abs(a[i] - b[i]);
        diff += d;
        max = Math.max(max, d);
        if (a[i] || b[i]) ink++;
        if (a[i] > 32 && b[i] === 0) missing++;
      }
      return { meanAlpha: diff / (a.length / 4), max, missing, ink };
    }
    const results = [];
    for (const type of ['spray', 'round'])
      for (const softness of [0, 0.65]) {
        if (type === 'round' && !softness) continue;
        timegridLab.reset();
        const d = timegridLab.document();
        const stroke = timegridLab.createStroke({
          id: d.newId(),
          surface: 'frame-0',
          type,
          softness,
          size: 70,
          opacity: 0.55,
          seed: 22,
          points: Array.from({ length: 35 }, (_, i) => [
            100 + i * 24,
            288 + 100 * Math.sin(i * 0.3),
            0.5,
          ]),
        });
        d.addGesture([stroke]);
        const reference = canvas(),
          rc = reference.getContext('2d', { willReadFrequently: true });
        rc.globalAlpha = 0.55 * (type === 'spray' ? 0.35 : 1);
        for (const [x, y, r] of stroke.stamps) {
          if (softness) {
            const g = rc.createRadialGradient(
              x,
              y,
              r * (1 - softness),
              x,
              y,
              r,
            );
            g.addColorStop(0, stroke.brush.color);
            g.addColorStop(1, stroke.brush.color + '00');
            rc.fillStyle = g;
          } else rc.fillStyle = stroke.brush.color;
          rc.beginPath();
          rc.arc(x, y, r, 0, Math.PI * 2);
          rc.fill();
        }
        const actual = canvas(),
          ac = actual.getContext('2d', { willReadFrequently: true });
        const render = () => {
          ac.clearRect(0, 0, 1024, 576);
          timegridLab
            .cache()
            .draw(ac, 'frame-0', { x: 0, y: 0, w: 1024, h: 576 }, 1);
        };
        render();
        const original = read(actual),
          parity = compare(read(reference), original);
        const json = timegridLab.serialize();
        timegridLab.load(json);
        render();
        const reload = compare(original, read(actual));
        timegridLab.cache().clear();
        render();
        const rebuild = compare(original, read(actual));
        const erase = timegridLab.createStroke({
          id: timegridLab.document().newId(),
          surface: 'frame-0',
          size: 160,
          erase: true,
          points: [
            [512, 0, 0.5],
            [512, 576, 0.5],
          ],
          streamline: 0,
        });
        timegridLab.add([erase]);
        render();
        const erased = read(actual);
        let remaining = 0;
        for (let y = 0; y < 576; y++)
          remaining += erased[(y * 1024 + 512) * 4 + 3];
        // Same eraser in another surface must not punch through this surface.
        timegridLab.document().undo();
        timegridLab.add([
          timegridLab.createStroke({
            id: timegridLab.document().newId(),
            surface: 'tpl',
            size: 160,
            erase: true,
            points: [
              [512, 0, 0.5],
              [512, 576, 0.5],
            ],
          }),
        ]);
        render();
        const otherLayer = compare(original, read(actual));
        results.push({
          type,
          softness,
          particles: stroke.stamps.length,
          parity,
          reload,
          rebuild,
          remaining,
          otherLayer,
        });
      }
    return results;
  });
  for (const p of pixels) {
    assert.ok(p.parity.meanAlpha < 0.3, JSON.stringify(p));
    assert.equal(p.parity.missing, 0);
    assert.equal(p.reload.max, 0);
    assert.equal(p.rebuild.max, 0);
    assert.equal(p.remaining, 0);
    assert.equal(p.otherLayer.max, 0);
  }
  check(
    'saved stamps match independent raster, rebuild exactly, erase locally and respect layers',
    pixels,
  );
  // Timed browser protocol input: same path, different speed, no arbitrary sleeps.
  await page.evaluate(() => timegridLab.reset());
  await page.selectOption('#target', 'frm');
  await page.selectOption('#tool', 'pen');
  await page.selectOption('#brushType', 'round');
  await page.locator('#softness').fill('0');
  await page.check('#velocity');
  const r = await page.evaluate(() => {
    const b = document.querySelector('#canvas').getBoundingClientRect(),
      r = timegridLab.layout()[0];
    return { x: b.x + r.x, y: b.y + r.y, w: r.w, h: r.h };
  });
  const cdp = await page.context().newCDPSession(page);
  async function timedStroke(dt, y, pen = false) {
    let stamp = Date.now() / 1000;
    const send = (type, i) =>
      cdp.send('Input.dispatchMouseEvent', {
        type,
        x: r.x + r.w * (0.15 + (0.7 * i) / 40),
        y: r.y + r.h * y,
        button: 'left',
        buttons: type === 'mouseReleased' ? 0 : 1,
        clickCount: 1,
        pointerType: pen ? 'pen' : 'mouse',
        force: pen ? 0.3 : 0.5,
        timestamp: stamp + (i * dt) / 1000,
      });
    await send('mousePressed', 0);
    for (let i = 1; i <= 40; i++) await send('mouseMoved', i);
    await send('mouseReleased', 40);
    await flush();
  }
  await timedStroke(100, 0.28);
  await timedStroke(5, 0.52);
  await timedStroke(5, 0.76, true);
  const speed = await page.evaluate(() =>
    timegridLab.document().strokes.map((s) => ({
      pressure: s.points.at(-1)[2],
      height: s.box.h,
      simulate: s.brush.simulatePressure,
    })),
  );
  assert.ok(speed[1].pressure > speed[0].pressure * 2, JSON.stringify(speed));
  assert.ok(speed[1].height > speed[0].height * 1.5);
  assert.ok(Math.abs(speed[2].pressure - 0.3) < 0.001);
  assert.equal(speed[2].simulate, false);
  await page.screenshot({
    path: path.join(out, 'speed-pressure.png'),
    fullPage: true,
  });
  check(
    'timed mouse fast-thick; physical pressure channel wins when both toggles are on',
    speed,
  );
  // Rich fixture, actual Save download and Open into a fresh browser page.
  await page.uncheck('#velocity');
  await page.evaluate(() => timegridLab.reset());
  await page.selectOption('#brushType', 'spray');
  await draw(0.3);
  await page.locator('#softness').fill('75');
  await draw(0.55);
  await page.selectOption('#brushType', 'round');
  await draw(0.8);
  await page.screenshot({
    path: path.join(out, 'brushes-single.png'),
    fullPage: true,
  });
  const saved = await page.evaluate(() => ({
    json: timegridLab.serialize(),
    png: timegridLab.exportCanvas().toDataURL(),
  }));
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#save'),
  ]);
  const file = path.join(out, 'brushes.timegrid-drawing.json');
  await download.saveAs(file);
  assert.equal(fs.readFileSync(file, 'utf8'), saved.json);
  const fresh = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  fresh.on('pageerror', (e) => errors.push(e.message));
  await fresh.goto(url);
  await fresh.waitForFunction(() => window.timegridLab);
  await fresh.selectOption('#view', 'single');
  await fresh.locator('#file').setInputFiles(path.resolve(file));
  await fresh.waitForFunction(() => timegridLab.stats().strokes === 3);
  const restored = await fresh.evaluate(() => ({
    json: timegridLab.serialize(),
    png: timegridLab.exportCanvas().toDataURL(),
  }));
  assert.equal(restored.json, saved.json);
  assert.equal(restored.png, saved.png);
  check(
    'actual Save/Open in fresh page preserves complete mixed-brush geometry and PNG',
  );
  // Cold and warm paths on 96 frames; measurements are browser JS submission, not GPU latency.
  const stress = await page.evaluate(async () => {
    const results = [];
    for (const type of ['spray', 'round']) {
      timegridLab.reset();
      const d = timegridLab.document(),
        geometry = performance.now();
      for (let i = 0; i < 96; i++)
        d.addGesture([
          timegridLab.createStroke({
            id: d.newId(),
            surface: 'frame-' + i,
            type,
            softness: type === 'round' ? 0.7 : 0,
            size: 40,
            seed: i,
            points: [
              [100, 140, 0.5],
              [500, 288, 0.5],
              [900, 430, 0.5],
            ],
          }),
        ]);
      const geometryMs = performance.now() - geometry;
      const c = document.createElement('canvas');
      c.width = 1536;
      c.height = 1296;
      const ctx = c.getContext('2d');
      const render = () => {
        ctx.clearRect(0, 0, 1536, 1296);
        for (let i = 0; i < 96; i++)
          timegridLab
            .cache()
            .draw(
              ctx,
              'frame-' + i,
              { x: (i % 8) * 192, y: Math.floor(i / 8) * 108, w: 192, h: 108 },
              1,
            );
      };
      const coldStart = performance.now();
      render();
      const coldMs = performance.now() - coldStart;
      const warm = [];
      for (let i = 0; i < 10; i++) {
        const t = performance.now();
        render();
        warm.push(performance.now() - t);
      }
      const json = timegridLab.serialize(),
        t = performance.now();
      timegridLab.load(json);
      const openMs = performance.now() - t;
      results.push({
        type,
        frames: 96,
        strokes: 96,
        particles: d.strokes.reduce((n, s) => n + s.stamps.length, 0),
        geometryMs,
        coldMs,
        warmMs: Math.max(...warm),
        openMs,
        fileBytes: new Blob([json]).size,
      });
    }
    return results;
  });
  check('96-frame Spray and soft brush resource measurements', stress);

  // Bound a single excessive input gesture and verify that the canvas recovers.
  await page.selectOption('#view', 'grid');
  await page.selectOption('#brushType', 'spray');
  await page.locator('#softness').fill('0');
  await page.locator('#sizeNumber').fill('40');
  await page.evaluate(() => timegridLab.reset());
  await flush();
  const excessive = await page.evaluate(() => {
    const b = document.querySelector('#canvas').getBoundingClientRect(),
      a = timegridLab.layout()[0],
      z = timegridLab.layout()[95];
    return {
      x: b.x + a.x,
      y: b.y + a.y,
      w: z.x + z.w - a.x,
      h: z.y + z.h - a.y,
    };
  });
  await page.mouse.move(
    excessive.x + excessive.w * 0.1,
    excessive.y + excessive.h * 0.1,
  );
  await page.mouse.down();
  await page.evaluate((r) => {
    const c = document.querySelector('#canvas');
    for (let i = 0; i < 120; i++)
      c.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          pointerId: 1,
          pointerType: 'mouse',
          buttons: 1,
          clientX: r.x + r.w * (i % 2 ? 0.9 : 0.1),
          clientY: r.y + r.h * (0.1 + (0.8 * (i % 12)) / 11),
        }),
      );
  }, excessive);
  await flush();
  await page.mouse.up();
  await flush();
  assert.equal(await page.evaluate(() => timegridLab.stats().strokes), 0);
  assert.match(await page.locator('#status').textContent(), /limit reached/i);
  await page.selectOption('#view', 'single');
  await draw();
  assert.equal(await page.evaluate(() => timegridLab.stats().strokes), 1);
  check(
    'excessive Spray gesture cancels atomically, reports limit, and next stroke works',
  );

  const phoneContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const phone = await phoneContext.newPage();
  phone.on('pageerror', (e) => errors.push(e.message));
  await phone.goto(url);
  await phone.waitForFunction(() => window.timegridLab?.layout().length === 96);
  await phone.selectOption('#brushType', 'spray');
  await phone.locator('#softness').fill('50');
  await phone.locator('#sizeNumber').fill('120');
  await phone.locator('#canvas').scrollIntoViewIfNeeded();
  await phone.evaluate(() => timegridLab.flush());
  const tr = await phone.evaluate(() => {
    const b = document.querySelector('#canvas').getBoundingClientRect(),
      a = timegridLab.layout()[0],
      z = timegridLab.layout()[95];
    return {
      x: b.x + a.x,
      y: b.y + a.y,
      w: z.x + z.w - a.x,
      h: z.y + z.h - a.y,
    };
  });
  const touch = await phone.context().newCDPSession(phone);
  const sendTouch = (type, t) =>
    touch.send('Input.dispatchTouchEvent', {
      type,
      touchPoints:
        type === 'touchEnd'
          ? []
          : [
              {
                id: 1,
                x: tr.x + tr.w * (0.1 + t * 0.8),
                y: tr.y + tr.h * (0.1 + t * 0.8),
                force: 0.5,
              },
            ],
    });
  await sendTouch('touchStart', 0);
  for (let i = 1; i <= 40; i++) await sendTouch('touchMove', i / 40);
  await sendTouch('touchEnd', 1);
  await phone.evaluate(() => timegridLab.flush());
  const phoneJSON = await phone.evaluate(() => timegridLab.serialize()),
    ps = JSON.parse(phoneJSON).strokes;
  assert.equal(ps.length, 1);
  assert.ok(ps[0].placements.length > 12);
  await phone.selectOption('#view', 'single');
  const visibleFrame =
    Number(
      ps[0].placements[Math.floor(ps[0].placements.length / 2)].surface.slice(
        6,
      ),
    ) + 1;
  await phone.locator('#frame').fill(String(visibleFrame));
  await phone.locator('#frame').dispatchEvent('change');
  await phone.click('#undo');
  await phone.click('#redo');
  assert.equal(await phone.evaluate(() => timegridLab.serialize()), phoneJSON);
  assert.equal(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await phone.locator('#canvas').scrollIntoViewIfNeeded();
  await phone.evaluate(() => timegridLab.flush());
  assert.ok(await phone.evaluate(() => timegridLab.stats().cache.tiles > 0));
  await phone.screenshot({
    path: path.join(out, 'spray-phone-emulation.png'),
    fullPage: true,
  });
  check(
    '390px emulated touch: soft Spray crosses cells, Single, Undo/Redo, no horizontal overflow',
    {
      stamps: ps[0].stamps.length,
      placements: ps[0].placements.length,
      physicalDevice: false,
    },
  );

  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(out, 'brush-checks.json'),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        url,
        checks,
        errors,
        notes:
          'Headless Edge. CDP input is synthetic, not physical phone or pen.',
      },
      null,
      2,
    ),
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
