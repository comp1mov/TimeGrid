const { chromium } = require(process.env.PLAYWRIGHT_MODULE),
  assert = require('node:assert/strict'),
  fs = require('fs');
const url = process.env.TEST_URL || 'http://127.0.0.1:5317/drawing-lab.html',
  out =
    process.env.DRAWING_OUTPUT ||
    'docs/drawing-evidence/2026-10-27-drawing-5/extended';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true }),
    p = await b.newPage({ viewport: { width: 1440, height: 1000 } }),
    errors = [],
    checks = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const check = (name, data) => {
    checks.push({ name, pass: true, data });
    console.log('PASS ' + name);
  };
  await p.goto(url);
  await p.waitForFunction(() => timegridLab.layout().length === 96);
  const set = (id, v) =>
    p.evaluate(
      ({ id, v }) => {
        const e = document.getElementById(id);
        if (e.type === 'checkbox') e.checked = v;
        else e.value = v;
        e.dispatchEvent(new Event('change'));
      },
      { id, v },
    );
  await set('view', 'single');
  await set('size', 80);
  await set('scatter', 100);
  await set('dotScale', 100);
  for (const type of ['round', 'spray'])
    for (const softness of [0, 70]) {
      if (type === 'round' && !softness) continue;
      for (const target of ['frm', 'tpl', 'bg']) {
        await p.evaluate(() => timegridLab.reset());
        await set('brushType', type);
        await set('softness', softness);
        await set('target', target);
        const result = await p.evaluate(
          async ({ type, target }) => {
            const c = document.getElementById('canvas'),
              b = c.getBoundingClientRect(),
              r = timegridLab.layout()[0];
            const event = (name, t) =>
              c.dispatchEvent(
                new PointerEvent(name, {
                  pointerId: 4,
                  pointerType: 'mouse',
                  button: 0,
                  buttons: name === 'pointerup' ? 0 : 1,
                  clientX: b.x + r.x + r.w * (0.2 + 0.6 * t),
                  clientY:
                    b.y + r.y + r.h * (0.5 + 0.12 * Math.sin(t * Math.PI * 2)),
                }),
              );
            event('pointerdown', 0);
            for (let i = 1; i <= 80; i++) {
              event('pointermove', i / 80);
              if (i % 4 === 0) await timegridLab.flush();
            }
            event('pointerup', 1);
            await timegridLab.flush();
            const surface =
              target === 'frm'
                ? 'frame-0'
                : target === 'tpl'
                  ? 'tpl'
                  : 'bg-single';
            const render = () => {
              const c = document.createElement('canvas');
              c.width = 1024;
              c.height = 576;
              timegridLab.cache().draw(c.getContext('2d'), surface, {
                x: 0,
                y: 0,
                w: 1024,
                h: 576,
              });
              return c.toDataURL();
            };
            const before = render(),
              json = timegridLab.serialize(),
              operations = timegridLab.stats().strokes;
            timegridLab.cache().clear();
            const rebuild = render();
            timegridLab.load(json);
            const open = render();
            document.getElementById('tool').value = 'erase';
            document.getElementById('tool').dispatchEvent(new Event('change'));
            event('pointerdown', 0);
            for (let i = 1; i <= 80; i++) event('pointermove', i / 80);
            event('pointerup', 1);
            await timegridLab.flush();
            const erase = render();
            timegridLab.document().undo();
            const undo = render();
            timegridLab.document().redo();
            const redo = render();
            document.getElementById('tool').value = 'pen';
            document.getElementById('tool').dispatchEvent(new Event('change'));
            return {
              sameRebuild: before === rebuild,
              sameOpen: before === open,
              erased: erase !== before,
              undo: undo === before,
              redo: redo === erase,
              operations,
            };
          },
          { type, target },
        );
        for (const k of ['sameRebuild', 'sameOpen', 'erased', 'undo', 'redo'])
          assert.equal(
            result[k],
            true,
            JSON.stringify({ type, softness, target, k, result }),
          );
        check(
          type +
            ' softness=' +
            softness +
            ' target=' +
            target +
            ' stream/cache/erase/save',
          result,
        );
      }
    }
  await p.evaluate(() => timegridLab.reset());
  await set('target', 'frm');
  await set('margin', 0);
  await p.evaluate(() => {
    const d = timegridLab.document();
    timegridLab.add([
      timegridLab.createStroke({
        id: d.newId(),
        surface: 'frame-1',
        points: [[350, 250, 0.5]],
        color: '#ffffff',
        size: 70,
      }),
      timegridLab.createStroke({
        id: d.newId(),
        surface: 'frame-95',
        points: [[700, 250, 0.5]],
        color: '#ff0000',
        size: 70,
      }),
    ]);
  });
  await set('onion', false);
  await p.evaluate(() => timegridLab.flush());
  const read = () =>
    p.evaluate(() => {
      const c = document.getElementById('canvas'),
        r = timegridLab.layout()[0],
        dpr = c.width / c.clientWidth,
        x = c.getContext('2d');
      return [350, 700].map((u) => [
        ...x.getImageData(
          Math.round((r.x + (r.w * u) / 1024) * dpr),
          Math.round((r.y + (r.h * 250) / 576) * dpr),
          1,
          1,
        ).data,
      ]);
    });
  const without = await read();
  await set('onion', true);
  await p.evaluate(() => timegridLab.flush());
  const onion = await read();
  assert.notDeepEqual(without[0], onion[0]);
  assert.deepEqual(without[1], onion[1]);
  check('onion displays neighbor 1, never wraps frame 95 onto frame 0', {
    without,
    onion,
  });
  // Real files through the input, with a known red/blue sequence.
  const image = await p.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 18;
    return ['#ff0000', '#0000ff'].map((color) => {
      const x = c.getContext('2d');
      x.fillStyle = color;
      x.fillRect(0, 0, 32, 18);
      return c.toDataURL().split(',')[1];
    });
  });
  const files = image.map((data, i) => ({
    name: 'frame' + i + '.png',
    mimeType: 'image/png',
    buffer: Buffer.from(data, 'base64'),
  }));
  await p.locator('#imageFiles').setInputFiles(files);
  await p.waitForFunction(() =>
    document.getElementById('status').textContent.includes('2 preview images'),
  );
  await set('onion', false);
  await p.evaluate(() => timegridLab.reset());
  const color = () =>
    p.evaluate(() => {
      const c = timegridLab.exportCanvas();
      return [
        ...c.getContext('2d').getImageData(c.width * 0.9, c.height * 0.8, 1, 1)
          .data,
      ];
    });
  assert.deepEqual(await color(), [255, 0, 0, 255]);
  await p.evaluate(() => timegridLab.advance(1));
  assert.deepEqual(await color(), [0, 0, 255, 255]);
  check('image sequence input and PNG follow current frame mapping');
  const initial = await p.evaluate(() => timegridLab.composition());
  await p.locator('#canvas').hover();
  await p.mouse.wheel(0, 80);
  await p.evaluate(() => timegridLab.flush());
  const moved = await p.evaluate(() => timegridLab.composition());
  assert.ok(moved.y < initial.y);
  await p.keyboard.down('Control');
  await p.mouse.wheel(0, -160);
  await p.keyboard.up('Control');
  await p.evaluate(() => timegridLab.flush());
  assert.ok((await p.evaluate(() => timegridLab.composition())).w > moved.w);
  check('wheel pans; Ctrl wheel zooms for trackpad/mouse event model');
  const phone = await b.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    }),
    m = await phone.newPage();
  m.on('pageerror', (e) => errors.push(e.message));
  await m.goto(url);
  await m.waitForFunction(() => timegridLab.layout().length === 96);
  await m.locator('#canvas').scrollIntoViewIfNeeded();
  await m.evaluate(() => timegridLab.flush());
  const cd = await phone.newCDPSession(m),
    r = await m.locator('#canvas').boundingBox();
  const contact = (id, x, y) => ({
    id,
    x: r.x + r.width * x,
    y: r.y + r.height * y,
    force: 0.5,
  });
  await cd.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [contact(1, 0.4, 0.4), contact(2, 0.6, 0.6)],
  });
  for (let i = 1; i <= 12; i++)
    await cd.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        contact(1, 0.4 - i * 0.01, 0.4 - i * 0.01),
        contact(2, 0.6 + i * 0.01, 0.6 + i * 0.01),
      ],
    });
  await cd.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  assert.equal(await m.evaluate(() => timegridLab.stats().strokes), 0);
  assert.notEqual(await m.locator('#zoomLabel').textContent(), '100%');
  assert.equal(
    await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await m.screenshot({ path: out + '/phone-pinch.png' });
  check(
    '390px mobile emulation: pinch zoom leaves no accidental ink and no horizontal overflow',
    { physicalDevice: false },
  );
  await phone.close();
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    out + '/checks.json',
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: b.version(),
        url,
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
