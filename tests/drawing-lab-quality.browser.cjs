const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { getStroke } = require('perfect-freehand');
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
  const curve = Array.from({ length: 350 }, (_, i) => [
    160 + (7800 * i) / 349,
    3400 + Math.sin((i / 349) * Math.PI * 4) * 2750,
    0.5,
  ]);
  const seam = await page.evaluate((points) => {
    const create = () => {
      const c = document.createElement('canvas');
      c.width = 2048;
      c.height = 1728;
      return c;
    };
    const reference = create(),
      assembled = create(),
      rc = reference.getContext('2d', { willReadFrequently: true }),
      ac = assembled.getContext('2d', { willReadFrequently: true });
    const cases = [
        points,
        [
          [20, 30, 0.5],
          [8170, 6880, 0.5],
        ],
        [
          [930, 530, 0.5],
          [1030, 579, 0.5],
          [1140, 650, 0.5],
        ],
      ],
      results = [];
    function svg(p) {
      let a = p[0],
        b = p[1],
        c = p[2],
        s =
          'M' +
          a[0] +
          ',' +
          a[1] +
          ' Q' +
          b[0] +
          ',' +
          b[1] +
          ' ' +
          (b[0] + c[0]) / 2 +
          ',' +
          (b[1] + c[1]) / 2 +
          ' T';
      for (let i = 2; i < p.length - 1; i++)
        s +=
          (p[i][0] + p[i + 1][0]) / 2 + ',' + (p[i][1] + p[i + 1][1]) / 2 + ' ';
      return s + 'Z';
    }
    for (const input of cases) {
      timegridLab.reset();
      const s = timegridLab.createStroke({
        id: 's1',
        surface: 'sheet',
        points: input,
        size: 150,
        streamline: 0.5,
        smoothing: 0.5,
        color: '#ff7799',
      });
      timegridLab.add([s]);
      rc.setTransform(1, 0, 0, 1, 0, 0);
      rc.clearRect(0, 0, 2048, 1728);
      ac.clearRect(0, 0, 2048, 1728);
      rc.setTransform(0.25, 0, 0, 0.25, 0, 0);
      rc.fillStyle = s.brush.color;
      rc.fill(new Path2D(svg(s.outline)));
      for (let i = 0; i < 96; i++)
        timegridLab
          .cache()
          .draw(
            ac,
            'frame-' + i,
            { x: (i % 8) * 256, y: Math.floor(i / 8) * 144, w: 256, h: 144 },
            1,
          );
      const a = rc.getImageData(0, 0, 2048, 1728).data,
        b = ac.getImageData(0, 0, 2048, 1728).data;
      let sum = 0,
        max = 0,
        bad = 0,
        missing = 0,
        ink = 0;
      for (let i = 3; i < a.length; i += 4) {
        let delta = Math.abs(a[i] - b[i]);
        sum += delta;
        max = Math.max(max, delta);
        if (delta > 8) bad++;
        if (a[i] > 200 && b[i] < 32) missing++;
        if (a[i] || b[i]) ink++;
      }
      results.push({
        placements: s.placements.length,
        maxAlphaDelta: max,
        meanAlphaDeltaOnInk: sum / ink,
        pixelsOver8: bad,
        missingInk: missing,
        ink,
      });
    }
    timegridLab.reset();
    timegridLab.add([
      timegridLab.createStroke({
        id: 's1',
        surface: 'sheet',
        points,
        size: 150,
        color: '#ff7799',
      }),
    ]);
    return {
      results,
      reference: reference.toDataURL(),
      assembled: assembled.toDataURL(),
    };
  }, curve);
  for (const key of ['reference', 'assembled'])
    fs.writeFileSync(
      path.join(out, key + '.png'),
      Buffer.from(seam[key].split(',')[1], 'base64'),
    );
  console.log(JSON.stringify(seam.results));
  for (const s of seam.results) {
    assert.equal(s.missingInk, 0);
    assert.ok(s.meanAlphaDeltaOnInk < 1, JSON.stringify(s));
    assert.ok(s.pixelsOver8 / s.ink < 0.02, JSON.stringify(s));
  }
  check(
    'assembled frames match an independent official SVG-path reference, including sparse diagonal and corner',
    seam.results,
  );
  await flush();
  await page.screenshot({ path: path.join(out, 'continuous-grid.png') });
  const saved = await page.evaluate(() => timegridLab.serialize());
  await page.selectOption('#view', 'single');
  await flush();
  assert.equal(await page.evaluate(() => timegridLab.layout().length), 1);
  assert.equal(await page.evaluate(() => timegridLab.layout()[0].id), 0);
  assert.equal(await page.evaluate(() => timegridLab.serialize()), saved);
  await page.screenshot({ path: path.join(out, 'continuous-single.png') });
  check(
    'Grid to Single keeps one correctly sized active frame and unchanged drawing',
  );

  async function draw(points) {
    const r = await page.evaluate(() => {
      const b = document.querySelector('#canvas').getBoundingClientRect(),
        r = timegridLab.layout()[0];
      return { ...r, x: r.x + b.x, y: r.y + b.y };
    });
    await page.mouse.move(
      r.x + (points[0][0] * r.w) / 1024,
      r.y + (points[0][1] * r.h) / 576,
    );
    await page.mouse.down();
    for (const p of points.slice(1))
      await page.mouse.move(
        r.x + (p[0] * r.w) / 1024,
        r.y + (p[1] * r.h) / 576,
      );
    await page.mouse.up();
    await flush();
    return page.evaluate(() =>
      JSON.parse(timegridLab.serialize()).strokes.at(-1),
    );
  }
  await page.evaluate(() => timegridLab.reset());
  await page.locator('#sizeNumber').fill('12');
  const narrow = await draw([
    [150, 150],
    [400, 150],
    [750, 150],
  ]);
  assert.equal(narrow.brush.size, 12);
  assert.equal(narrow.brush.pressure, false);
  await page.locator('#size').fill('96');
  const wide = await draw([
    [150, 280],
    [400, 280],
    [750, 280],
  ]);
  assert.equal(wide.brush.size, 96);
  assert.equal(await page.inputValue('#sizeNumber'), '96');
  const thickness = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 576;
    const x = c.getContext('2d', { willReadFrequently: true });
    timegridLab.cache().draw(x, 'frame-0', { x: 0, y: 0, w: 1024, h: 576 }, 1);
    const d = x.getImageData(400, 0, 1, 576).data;
    return [150, 280].map((center) => {
      let n = 0;
      for (let y = center - 60; y < center + 60; y++)
        if (d[y * 4 + 3] > 127) n++;
      return n;
    });
  });
  assert.ok(Math.abs(thickness[0] - 12) <= 2);
  assert.ok(Math.abs(thickness[1] - 96) <= 2);
  check(
    'numeric and slider width produce measured 12px and 96px strokes',
    thickness,
  );
  await page.screenshot({ path: path.join(out, 'width-single.png') });
  const zig = Array.from({ length: 50 }, (_, i) => [
    100 + i * 16,
    400 + (i % 2 ? 20 : -20),
  ]);
  await page.locator('#sizeNumber').fill('16');
  await page.locator('#settingsToggle').click();
  await page.locator('#streamline').fill('90');
  await page.locator('#smooth').fill('20');
  await page.locator('#settingsClose').click();
  const stabilized = await draw(zig);
  assert.equal(stabilized.brush.streamline, 0.9);
  assert.equal(stabilized.brush.smoothing, 0.2);
  assert.deepEqual(
    stabilized.outline,
    getStroke(stabilized.points, {
      size: 16,
      thinning: 0,
      streamline: 0.9,
      smoothing: 0.2,
      simulatePressure: false,
      last: true,
    }),
  );
  const noStabilizer = getStroke(stabilized.points, {
    size: 16,
    thinning: 0,
    streamline: 0,
    smoothing: 0.2,
    simulatePressure: false,
    last: true,
  });
  assert.notDeepEqual(stabilized.outline, noStabilizer);
  await page.locator('#settingsToggle').click();
  await page.locator('#smooth').fill('100');
  await page.locator('#settingsClose').click();
  const smooth = await draw(zig);
  assert.equal(smooth.brush.smoothing, 1);
  assert.deepEqual(
    smooth.outline,
    getStroke(smooth.points, {
      size: 16,
      thinning: 0,
      streamline: 0.9,
      smoothing: 1,
      simulatePressure: false,
      last: true,
    }),
  );
  check(
    'separate stabilization and edge smoothing reach the library without per-cell resets',
  );

  const legacy = JSON.parse(saved);
  legacy.schema = 1;
  // Use a real schema-1-compatible local geometry, then compare its old lineTo raster.
  legacy.strokes = [structuredClone(narrow)];
  legacy.strokes[0].surface = 'frame-0';
  delete legacy.strokes[0].space;
  delete legacy.strokes[0].placements;
  delete legacy.strokes[0].renderer;
  delete legacy.strokes[0].brush.streamline;
  delete legacy.strokes[0].brush.simulatePressure;
  const legacyPixels = await page.evaluate((raw) => {
    timegridLab.load(JSON.stringify(raw));
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 576;
    const x = c.getContext('2d', { willReadFrequently: true });
    timegridLab.cache().draw(x, 'frame-0', { x: 0, y: 0, w: 1024, h: 576 });
    const cached = x.getImageData(0, 0, 1024, 576).data;
    x.clearRect(0, 0, 1024, 576);
    const s = raw.strokes[0];
    for (let ty = 0; ty < 3; ty++)
      for (let tx = 0; tx < 4; tx++) {
        const t = document.createElement('canvas'),
          w = 256,
          h = Math.min(256, 576 - ty * 256);
        t.width = w + 4;
        t.height = h + 4;
        const tc = t.getContext('2d', { willReadFrequently: true });
        tc.setTransform(1, 0, 0, 1, 2 - tx * 256, 2 - ty * 256);
        tc.beginPath();
        tc.moveTo(...s.outline[0]);
        for (const p of s.outline.slice(1)) tc.lineTo(...p);
        tc.closePath();
        tc.fillStyle = s.brush.color;
        tc.fill();
        x.drawImage(t, 2, 2, w, h, tx * 256, ty * 256, w, h);
      }
    const direct = x.getImageData(0, 0, 1024, 576).data;
    let max = 0;
    for (let i = 3; i < direct.length; i += 4)
      max = Math.max(max, Math.abs(direct[i] - cached[i]));
    return { max, renderer: timegridLab.document().strokes[0].renderer };
  }, legacy);
  assert.equal(legacyPixels.renderer, 'linear-v1');
  assert.ok(legacyPixels.max <= 2);
  check(
    'schema-1 drawings retain original linear tiled raster appearance',
    legacyPixels,
  );
  const fractional = await page.evaluate(() => {
    const results = [];
    for (const ratio of [1, 1.25, 2])
      for (const scale of [0.13, 0.77, 1.248, 2.63]) {
        timegridLab.reset();
        timegridLab.add([
          timegridLab.createStroke({
            id: 's1',
            surface: 'frame-0',
            points: [
              [40, 288, 0.5],
              [980, 288, 0.5],
            ],
            size: 160,
            opacity: 0.45,
          }),
        ]);
        const c = document.createElement('canvas');
        c.width = Math.ceil(1024 * scale * ratio + 8);
        c.height = Math.ceil(576 * scale * ratio + 8);
        const x = c.getContext('2d', { willReadFrequently: true });
        x.scale(ratio, ratio);
        timegridLab
          .cache()
          .draw(
            x,
            'frame-0',
            { x: 1.3, y: 2.7, w: 1024 * scale, h: 576 * scale },
            ratio,
          );
        const y = Math.round((2.7 + 288 * scale) * ratio),
          left = Math.ceil((1.3 + 130 * scale) * ratio),
          right = Math.floor((1.3 + 900 * scale) * ratio);
        const data = x.getImageData(left, y, right - left, 1).data;
        let min = 255,
          max = 0;
        for (let i = 3; i < data.length; i += 4) {
          min = Math.min(min, data[i]);
          max = Math.max(max, data[i]);
        }
        results.push({ ratio, scale, min, max });
      }
    return results;
  });
  for (const f of fractional) {
    assert.ok(f.min >= 113 && f.max <= 115, JSON.stringify(f));
  }
  check(
    'no tile-grid alpha dips across 12 fractional scale and DPR combinations',
    fractional,
  );

  const all96 = await page.evaluate(() => {
    const points = [];
    for (let row = 0; row < 12; row++)
      for (let c = 0; c < 80; c++)
        points.push([100 + (row % 2 ? 79 - c : c) * 100, row * 576 + 288, 0.5]);
    const t = performance.now(),
      s = timegridLab.createStroke({
        id: 's1',
        surface: 'sheet',
        points,
        size: 100,
      }),
      geometryMs = performance.now() - t;
    timegridLab.reset();
    timegridLab.add([s]);
    const text = timegridLab.serialize();
    return {
      strokes: timegridLab.document().strokes.length,
      placements: s.placements.length,
      points: s.points.length,
      bytes: new Blob([text]).size,
      geometryMs,
    };
  });
  assert.equal(all96.strokes, 1);
  assert.equal(all96.placements, 96);
  check(
    'one 960-point gesture addresses all 96 frames with one geometry asset',
    all96,
  );

  // Real browser input protocol, synthetic pen. It cannot replace hardware testing.
  await page.evaluate(() => timegridLab.reset());
  await page.locator('#settingsToggle').click();
  await page.locator('#streamline').fill('50');
  await page.locator('#settingsClose').click();
  await page.locator('#sizeNumber').fill('60');
  const penRect = await page.evaluate(() => {
    const b = document.querySelector('#canvas').getBoundingClientRect(),
      r = timegridLab.layout()[0];
    return { x: b.x + r.x, y: b.y + r.y, w: r.w, h: r.h };
  });
  const cdp = await page.context().newCDPSession(page);
  const penEvent = (type, t, pressure) =>
    cdp.send('Input.dispatchMouseEvent', {
      type,
      x: penRect.x + penRect.w * (0.15 + t * 0.6),
      y: penRect.y + penRect.h * 0.5,
      button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1,
      pointerType: 'pen',
      force: pressure,
    });
  await penEvent('mousePressed', 0, 0.2);
  for (let i = 1; i <= 40; i++)
    await penEvent('mouseMoved', i / 40, 0.2 + i / 50);
  await penEvent('mouseReleased', 1, 0);
  await flush();
  const pen = await page.evaluate(() =>
    JSON.parse(timegridLab.serialize()).strokes.at(-1),
  );
  assert.equal(pen.brush.pressure, true);
  assert.ok(
    pen.points.some((p) => p[2] < 0.3) && pen.points.some((p) => p[2] > 0.8),
  );
  assert.ok(pen.points.at(-1)[2] > 0.8);
  check(
    'synthetic pen preserves pressure and does not append a zero-pressure release tip',
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
  await phone.locator('#sizeNumber').fill('120');
  await phone.locator('#canvas').scrollIntoViewIfNeeded();
  await phone.evaluate(() => timegridLab.flush());
  const touchRect = await phone.evaluate(() => {
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
  const dispatch = (type, t) =>
    touch.send('Input.dispatchTouchEvent', {
      type,
      touchPoints:
        type === 'touchEnd'
          ? []
          : [
              {
                id: 1,
                x: touchRect.x + touchRect.w * (0.1 + 0.8 * t),
                y: touchRect.y + touchRect.h * (0.1 + 0.8 * t),
                force: 0.5,
              },
            ],
    });
  await dispatch('touchStart', 0);
  for (let i = 1; i <= 50; i++) await dispatch('touchMove', i / 50);
  await dispatch('touchEnd', 1);
  await phone.evaluate(() => timegridLab.flush());
  const phoneData = await phone.evaluate(() => timegridLab.serialize()),
    phoneStroke = JSON.parse(phoneData).strokes;
  assert.equal(phoneStroke.length, 1);
  assert.ok(phoneStroke[0].placements.length > 12);
  await phone.selectOption('#view', 'single');
  await phone.evaluate(() => timegridLab.flush());
  assert.equal(await phone.evaluate(() => timegridLab.layout().length), 1);
  assert.equal(await phone.evaluate(() => timegridLab.serialize()), phoneData);
  await phone.click('#undo');
  await phone.evaluate(() => timegridLab.flush());
  assert.equal(await phone.evaluate(() => timegridLab.stats().strokes), 0);
  await phone.click('#redo');
  await phone.evaluate(() => timegridLab.flush());
  assert.equal(await phone.evaluate(() => timegridLab.serialize()), phoneData);
  await phone.locator('#canvas').scrollIntoViewIfNeeded();
  await phone.screenshot({
    path: path.join(out, 'touch-single-emulation.png'),
    fullPage: true,
  });
  check(
    '390px emulated phone: continuous touch crosses cells, Single view, Undo/Redo preserve data',
    { placements: phoneStroke[0].placements.length, physicalDevice: false },
  );
  await phoneContext.close();
  assert.ok(await page.evaluate(() => document.fonts.check('14px Inter')));
  assert.equal(await page.locator('header a').count(), 0);
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(out, 'quality-checks.json'),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        url,
        browser: browser.version(),
        checks,
        errors,
        physicalPhone: false,
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
