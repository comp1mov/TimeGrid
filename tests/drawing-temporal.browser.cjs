const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const fs = require('fs'),
  assert = require('node:assert/strict');
const url = process.env.TEST_URL || 'http://127.0.0.1:5197/drawing-lab.html',
  out =
    process.env.DRAWING_OUTPUT || 'docs/drawing-evidence/2026-10-27-drawing-5';
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true }),
    p = await b.newPage({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    }),
    errors = [],
    checks = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const check = (name, data) => {
    checks.push({ name, data, pass: true });
    console.log('PASS ' + name);
  };
  const fresh = async () => {
    await p.goto(url);
    await p.waitForFunction(() => timegridLab.layout().length === 96);
    await p.evaluate(() => timegridLab.flush());
  };
  const set = async (id, value) =>
    p.evaluate(
      ({ id, value }) => {
        const e = document.getElementById(id);
        if (e.type === 'checkbox') e.checked = value;
        else e.value = value;
        e.dispatchEvent(new Event('change'));
      },
      { id, value },
    );
  const flush = () => p.evaluate(() => timegridLab.flush());
  const dispatch = async (type, options = {}) =>
    p.evaluate(
      ({ type, options }) => {
        const c = document.getElementById('canvas'),
          b = c.getBoundingClientRect(),
          r = timegridLab.layout()[options.cell || 0];
        const x = options.x ?? 0.4,
          y = options.y ?? 0.4;
        c.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerId: options.id || 11,
            pointerType: options.kind || 'pen',
            button: options.button || 0,
            buttons: type === 'pointerup' ? 0 : options.buttons || 1,
            pressure: options.pressure ?? 0.6,
            clientX: b.x + r.x + r.w * x,
            clientY: b.y + r.y + r.h * y,
          }),
        );
      },
      { type, options },
    );
  await fresh();
  const empty = await p.evaluate(() => timegridLab.stats());
  assert.equal(empty.cache.bytes, 0);
  check('empty 96 frames allocate zero drawing tiles', empty.cache);
  await set('view', 'single');
  await p.click('#play');
  await flush();
  const rect = await p.evaluate(() => {
    const b = document.getElementById('canvas').getBoundingClientRect(),
      r = timegridLab.layout()[0];
    return { x: b.x + r.x + r.w * 0.4, y: b.y + r.y + r.h * 0.5 };
  });
  await p.mouse.move(rect.x, rect.y);
  await p.mouse.down();
  await p.waitForTimeout(760);
  await p.mouse.up();
  await p.click('#play');
  await flush();
  const held = await p.evaluate(() => ({
    ids: [
      ...new Set(
        timegridLab
          .document()
          .strokes.flatMap((s) => s.placements.map((p) => p.surface)),
      ),
    ],
    undo: timegridLab.document().undoStack.length,
  }));
  assert.ok(held.ids.length >= 6, JSON.stringify(held));
  assert.equal(held.undo, 1);
  await p.click('#undo');
  assert.equal(await p.evaluate(() => timegridLab.stats().strokes), 0);
  await p.click('#redo');
  check(
    'native mouse stationary hold at 8 fps stamps each frame and one undo',
    held,
  );
  for (const kind of ['mouse', 'touch', 'pen']) {
    await fresh();
    await set('view', 'single');
    await dispatch('pointerdown', { kind });
    for (let i = 1; i < 6; i++)
      await p.evaluate((i) => timegridLab.advance(i), i);
    await dispatch('pointerup', { kind });
    await flush();
    assert.equal(
      await p.evaluate(
        () =>
          new Set(
            timegridLab
              .document()
              .strokes.flatMap((s) => s.placements.map((p) => p.surface)),
          ).size,
      ),
      6,
    );
    check('synthetic ' + kind + ' stationary timing', 6);
  }
  for (const kind of ['mouse', 'touch', 'pen'])
    for (const oneFrame of [false, true]) {
      await fresh();
      await set('oneFrame', oneFrame);
      await set('size', '100');
      await dispatch('pointerdown', { kind, x: 0.99, y: 0.5 });
      await dispatch('pointerup', { kind, x: 0.99, y: 0.5 });
      await flush();
      const ids = await p.evaluate(() => [
        ...new Set(
          timegridLab
            .document()
            .strokes.flatMap((s) => s.placements.map((p) => p.surface)),
        ),
      ]);
      assert.equal(ids.length, oneFrame ? 1 : 2, JSON.stringify(ids));
      await p.click('#undo');
      assert.equal(await p.evaluate(() => timegridLab.stats().strokes), 0);
      check(kind + ' edge 1F=' + oneFrame + ' and undo', ids);
    }
  for (const trail of [0, 2]) {
    await fresh();
    await set('view', 'single');
    await set('longStroke', true);
    await set('trail', trail);
    await set('fps', 1);
    await p.evaluate(() => document.getElementById('play').click());
    await dispatch('pointerdown', { x: 0.15 });
    for (let i = 0; i < 5; i++) {
      if (i) await p.evaluate((i) => timegridLab.advance(i), i);
      await dispatch('pointermove', { x: 0.2 + i * 0.12 });
    }
    await dispatch('pointerup', { x: 0.68 });
    await flush();
    const counts = await p.evaluate(() =>
      Array.from(
        { length: 5 },
        (_, i) =>
          timegridLab
            .document()
            .strokes.filter((s) =>
              s.placements.some((p) => p.surface === 'frame-' + i),
            ).length,
      ),
    );
    assert.equal(counts[4], trail === 0 ? 5 : 2, JSON.stringify(counts));
    check('Long Stroke Trail ' + trail, counts);
  }
  await fresh();
  await set('view', 'single');
  await dispatch('pointerdown', { pressure: 0.1, x: 0.2 });
  await dispatch('pointermove', { pressure: 0.9, x: 0.8 });
  await dispatch('pointercancel');
  await flush();
  const pressure = await p.evaluate(() =>
    timegridLab.document().strokes[0].points.map((p) => p[2]),
  );
  assert.ok(
    pressure.some((x) => Math.abs(x - 0.1) < 1e-6) &&
      pressure.some((x) => Math.abs(x - 0.9) < 1e-6),
  );
  check('pen pressure retained, pointercancel commits', pressure);
  await dispatch('pointerdown', { id: 12, x: 0.3 });
  await dispatch('pointermove', { id: 12, x: 0.7 });
  await p.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(
    await p.evaluate(() => timegridLab.document().undoStack.length),
    2,
  );
  check('blur commits without losing stroke');
  await dispatch('pointerdown', { id: 13, button: 5, buttons: 32 });
  await dispatch('pointerup', { id: 13, button: 5 });
  assert.equal(
    await p.evaluate(() => timegridLab.document().strokes.at(-1).brush.erase),
    true,
  );
  check('pen hardware eraser maps to erase');
  await fresh();
  await set('touchDraw', false);
  await dispatch('pointerdown', { kind: 'touch' });
  await dispatch('pointermove', { kind: 'touch', x: 0.6 });
  await dispatch('pointerup', { kind: 'touch' });
  assert.equal(await p.evaluate(() => timegridLab.stats().strokes), 0);
  check('finger drawing disabled navigates without marks');
  await fresh();
  await dispatch('pointerdown', { kind: 'pen' });
  await dispatch('pointerdown', { kind: 'touch', id: 21 });
  await dispatch('pointermove', { kind: 'pen', x: 0.8 });
  await dispatch('pointerup', { kind: 'pen' });
  assert.equal(
    await p.evaluate(() => timegridLab.document().undoStack.length),
    1,
  );
  check('pen owns gesture, concurrent palm touch ignored');
  await fresh();
  await set('touchDraw', false);
  await dispatch('pointerdown', { kind: 'touch', id: 21 });
  await dispatch('pointerdown', { kind: 'touch', id: 22, x: 0.6 });
  await dispatch('pointerdown', { kind: 'pen', id: 23 });
  await dispatch('pointermove', { kind: 'pen', id: 23, x: 0.7 });
  await dispatch('pointerup', { kind: 'pen', id: 23 });
  assert.equal(
    await p.evaluate(() => timegridLab.document().undoStack.length),
    1,
  );
  check('pen takes ownership from active two-finger navigation');
  await dispatch('pointerdown', { kind: 'pen', id: 24, buttons: 32 });
  await dispatch('pointerup', { kind: 'pen', id: 24 });
  assert.equal(
    await p.evaluate(() => timegridLab.document().strokes.at(-1).brush.erase),
    true,
  );
  check('pen eraser buttons bit without button 5');
  await fresh();
  await set('target', 'bg');
  await set('margin', '512');
  await p.evaluate(() => {
    const c = document.getElementById('canvas'),
      b = c.getBoundingClientRect(),
      r = timegridLab.composition();
    for (const type of ['pointerdown', 'pointerup'])
      c.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 3,
          pointerType: 'mouse',
          buttons: 1,
          button: 0,
          clientX: b.x + r.x + 3,
          clientY: b.y + r.y + r.h * 0.5,
        }),
      );
  });
  await flush();
  assert.equal(
    await p.evaluate(() => timegridLab.document().strokes[0].surface),
    'bg-grid',
  );
  check('BG paints outside frame grid in composition margin');
  await fresh();
  await p.evaluate(() => {
    const d = timegridLab.document(),
      s = (surface, color, size, erase = false) =>
        timegridLab.createStroke({
          id: d.newId(),
          surface,
          color,
          size,
          erase,
          points: [[400, 280, 0.5]],
          pressure: false,
        });
    timegridLab.add([
      s('frame-0', '#00ff00', 180),
      s('tpl', '#ff0000', 120),
      s('tpl', '#ff0000', 50, true),
    ]);
  });
  await p.evaluate(() => document.getElementById('bake').click());
  await flush();
  const pixels = await p.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 576;
    timegridLab
      .cache()
      .draw(c.getContext('2d'), 'frame-0', { x: 0, y: 0, w: 1024, h: 576 });
    const x = c.getContext('2d');
    return {
      hole: [...x.getImageData(400, 280, 1, 1).data],
      ring: [...x.getImageData(440, 280, 1, 1).data],
      strokes: timegridLab.document().strokes.length,
      children: timegridLab.document().strokes.at(-1).children.length,
    };
  });
  assert.deepEqual(pixels.hole, [0, 255, 0, 255]);
  assert.deepEqual(pixels.ring, [255, 0, 0, 255]);
  check('Apply TPL isolates erasers from underlying FRM', pixels);
  const compositeSaved = await p.evaluate(() => timegridLab.serialize());
  await p.click('#undo');
  await p.click('#redo');
  assert.equal(await p.evaluate(() => timegridLab.serialize()), compositeSaved);
  await p.evaluate((s) => timegridLab.load(s), compositeSaved);
  await flush();
  check('composite save/open/undo/redo');
  await set('columns', 6);
  await set('gap', 40);
  await set('direction', 'backward');
  await set('pattern', 'snake');
  await p.evaluate(() => timegridLab.advance(7));
  assert.equal(await p.evaluate(() => timegridLab.serialize()), compositeSaved);
  check('grid reflow and playback do not rewrite drawings');
  await set('view', 'single');
  await set('transparent', true);
  await set('onion', false);
  const pngOff = await p.evaluate(() => timegridLab.exportCanvas().toDataURL());
  await set('onion', true);
  assert.equal(
    await p.evaluate(() => timegridLab.exportCanvas().toDataURL()),
    pngOff,
  );
  check('onion excluded from export');
  const downloadPromise = p.waitForEvent('download');
  await p.click('#save');
  const download = await downloadPromise;
  await download.saveAs(out + '/roundtrip.json');
  const expected = fs.readFileSync(out + '/roundtrip.json', 'utf8');
  await fresh();
  await p.locator('#file').setInputFiles(out + '/roundtrip.json');
  await p.waitForFunction(() =>
    document.getElementById('status').textContent.includes('Opened'),
  );
  await flush();
  assert.equal(await p.evaluate(() => timegridLab.serialize()), expected);
  assert.equal(await p.locator('#columns').inputValue(), '6');
  assert.equal(await p.locator('#direction').inputValue(), 'backward');
  check('actual download/reload/open restores drawing and settings');
  await set('exportSize', '4096');
  const dimensions = await p.evaluate(() => {
    const c = timegridLab.exportCanvas();
    return [c.width, c.height];
  });
  assert.equal(Math.max(...dimensions), 4096);
  check('4096px rerender from geometry', dimensions);
  await p.screenshot({ path: out + '/single.png' });

  const viewMapping=[];
  await set('loop',0);await set('columns',8);
  for(const pattern of ['sequential','snake','vertical','vertical-snake','checkerboard','center','spiral','random']){
    await set('view','grid');await set('pattern',pattern);await p.evaluate(()=>timegridLab.advance(7));
    const grid=await p.evaluate(()=>timegridLab.layout()[0].id);
    await set('view','single');const single=await p.evaluate(()=>timegridLab.layout()[0].id);
    assert.equal(single,grid,pattern);viewMapping.push({pattern,grid,single});
  }
  check('Single keeps original grid timing order for all eight patterns',viewMapping);
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    out + '/browser-checks.json',
    JSON.stringify(
      {
        date: new Date().toISOString(),
        url,
        browser: b.version(),
        checks,
        errors,
        physicalDevice: false,
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
