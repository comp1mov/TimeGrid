const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict'),
  fs = require('node:fs');
const url = process.env.TEST_URL || 'http://127.0.0.1:5194/drawing-lab.html';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.timegridLab?.layout().length === 96);
  await page.evaluate(() => timegridLab.flush());
  const checks = [];
  const check = (name, details) => {
    checks.push({ name, details, passed: true });
    console.log('PASS ' + name);
  };
  const result = await page.evaluate(() => {
    const d = timegridLab.document();
    for (const [surface, erase, points, size] of [
      [
        'tpl',
        false,
        [
          [40, 250, 0.5],
          [980, 250, 0.5],
        ],
        80,
      ],
      [
        'tpl',
        true,
        [
          [512, 50, 0.5],
          [512, 500, 0.5],
        ],
        40,
      ],
      [
        'frame-0',
        false,
        [
          [40, 400, 0.5],
          [980, 400, 0.5],
        ],
        30,
      ],
    ])
      timegridLab.add([
        timegridLab.createStroke({
          id: d.newId(),
          surface,
          points,
          size,
          opacity: erase ? 1 : 0.45,
          erase,
          color: '#ff1133',
        }),
      ]);
    const a = document.createElement('canvas');
    a.width = 1024;
    a.height = 576;
    const ac = a.getContext('2d');
    timegridLab.cache().draw(ac, 'tpl', { x: 0, y: 0, w: 1024, h: 576 }, 1);
    const x = ac.getImageData(0, 0, 1024, 576).data;
    const alpha = (px, py) => x[(py * 1024 + px) * 4 + 3];
    return {
      seamAlphas: [254, 255, 256, 257, 767, 768, 769].map((px) =>
        alpha(px, 250),
      ),
      erased: [500, 511, 512, 513, 520].map((px) => alpha(px, 250)),
      outside: alpha(256, 180),
    };
  });
  assert.ok(result.seamAlphas.every((a) => a >= 113 && a <= 115));
  assert.ok(result.erased.every((a) => a === 0));
  assert.equal(result.outside, 0);
  check(
    'flat ink crosses tile seams with correct alpha; eraser leaves a transparent opening',
    result,
  );
  await page.selectOption('#view', 'single');
  await page.selectOption('#target', 'bg');
  const box = await page.locator('#canvas').boundingBox();
  const stroke = async () => {
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55, {
      steps: 30,
    });
    await page.mouse.up();
    await page.evaluate(() => timegridLab.flush());
  };
  await stroke();
  assert.ok(
    await page.evaluate(() =>
      timegridLab.document().strokes.some((s) => s.surface === 'bg-single'),
    ),
  );
  await page.selectOption('#view', 'grid');
  await stroke();
  assert.ok(
    await page.evaluate(() =>
      timegridLab.document().strokes.some((s) => s.surface === 'bg-grid'),
    ),
  );
  check(
    'BG Grid and Single remain separate; TPL and FRM share stable frame addresses',
  );
  await page.selectOption('#view', 'single');
  await page.selectOption('#target', 'frm');
  await page.click('#play');
  await stroke();
  await page.click('#play');
  const addresses = await page.evaluate(() => [
    ...new Set(
      timegridLab
        .document()
        .strokes.filter((s) => s.surface.startsWith('frame-'))
        .map((s) => s.surface),
    ),
  ]);
  assert.ok(addresses.length > 1);
  check(
    'drawing during playback assigns segments to displayed frame',
    addresses,
  );
  const input = await page.evaluate(() => timegridLab.stats().metrics);
  const summary = (v) => {
    const a = [...v].sort((a, b) => a - b);
    return {
      n: a.length,
      p50: a[Math.floor(a.length * 0.5)] ?? null,
      p95: a[Math.min(a.length - 1, Math.floor(a.length * 0.95))] ?? null,
      p99: a[Math.min(a.length - 1, Math.floor(a.length * 0.99))] ?? null,
      max: a.at(-1) ?? null,
    };
  };
  check('default renderer interactive timing', {
    inputMs: summary(input.inputMs),
    geometryMs: summary(input.geometryMs),
    renderMs: summary(input.renderMs),
    eventToRenderEndMs: summary(input.eventToRenderEndMs),
  });
  const cdps = await page.context().newCDPSession(page);
  const original = await page.evaluate(() => timegridLab.serialize());
  await cdps.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: box.x + box.width * 0.4, y: box.y + box.height * 0.5, id: 1 },
      { x: box.x + box.width * 0.6, y: box.y + box.height * 0.5, id: 2 },
    ],
  });
  await cdps.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: box.x + box.width * 0.3, y: box.y + box.height * 0.5, id: 1 },
      { x: box.x + box.width * 0.7, y: box.y + box.height * 0.5, id: 2 },
    ],
  });
  await cdps.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  assert.equal(await page.evaluate(() => timegridLab.serialize()), original);
  assert.notEqual(await page.textContent('#zoomLabel'), '100%');
  check('two-finger pinch cancels draft and preserves document');
  await page.click('#fit');
  await page.selectOption('#tool', 'pen');
  await page.selectOption('#target', 'frm');
  await page.evaluate(() => timegridLab.flush());
  const saved = await page.evaluate(() => timegridLab.serialize());
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5, {
    steps: 10,
  });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
  assert.equal(await page.evaluate(() => timegridLab.serialize()), saved);
  check('interrupted gesture does not commit or join later strokes');
  const downloadPromise = page.waitForEvent('download');
  await page.click('#png');
  const file = await downloadPromise;
  const out =
    process.env.DRAWING_OUTPUT ||
    'docs/drawing-evidence/2026-10-26-perfect-freehand-3';
  await file.saveAs(out + '/export-single.png');
  const png = fs.readFileSync(out + '/export-single.png');
  assert.equal(png.readUInt32BE(16), 2048);
  assert.equal(png.readUInt32BE(20), 1152);
  check('PNG export uses documented native output size');
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    out + '/extra-checks.json',
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        errors,
        notes:
          'Mouse and CDP synthetic touch; not physical device or pen-to-photon latency.',
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
