const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const fs = require('fs'),
  assert = require('node:assert/strict'),
  crypto = require('crypto');
const url =
  process.env.TEST_URL ||
  'file:///C:/Users/gregt/.codex/worktrees/timegrid-drawing/TimeGrid/.drawing-lab-build/drawing-lab.html';
const out =
  process.env.DRAWING_OUTPUT ||
  'docs/drawing-evidence/2026-10-27-drawing-6/production/workspace';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const errors = [],
    checks = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const check = (name, data) => {
    checks.push({ name, data, pass: true });
    console.log('PASS ' + name);
  };
  const fresh = async () => {
    await p.goto(url);
    await p.waitForFunction(() => window.timegridLab);
    await p.evaluate(() => timegridLab.flush());
  };
  const set = (id, value) =>
    p.evaluate(
      ({ id, value }) => {
        const el = document.getElementById(id);
        if (el.type === 'checkbox') el.checked = value;
        else el.value = value;
        el.dispatchEvent(new Event('change'));
      },
      { id, value },
    );
  const get = (id) => p.locator('#' + id).inputValue();
  const focus = () => p.evaluate(() => document.activeElement.blur());
  const key = async (k) => {
    await focus();
    await p.keyboard.press(k);
    await p.evaluate(() => timegridLab.flush());
  };
  const shot = async (name) =>
    p.screenshot({ path: out + '/' + name + '.png', fullPage: true });
  await fresh();
  await key('g');
  assert.equal(await get('view'), 'single');
  await key('g');
  assert.equal(await get('view'), 'grid');
  await p.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyQ', key: 'й', bubbles: true }),
    ),
  );
  assert.equal(await get('target'), 'bg');
  await key('w');
  assert.equal(await get('target'), 'tpl');
  await key('e');
  assert.equal(await get('target'), 'frm');
  await key('Space');
  assert.match(await p.locator('#play').textContent(), /Pause/);
  await key('Space');
  assert.match(await p.locator('#play').textContent(), /Play/);
  await key('l');
  assert.equal(await p.locator('#longStroke').isChecked(), true);
  await key('t');
  assert.equal(await p.locator('#templateVisible').isChecked(), false);
  await key('a');
  assert.equal(await p.locator('#brushOff').isChecked(), true);
  await key('a');
  assert.equal(await p.locator('#brushOff').isChecked(), false);
  await key('BracketRight');
  assert.equal(await get('size'), '36');
  await key('Shift+BracketRight');
  assert.equal(await get('softness'), '5');
  await key('Control+BracketLeft');
  assert.equal(await get('opacity'), '90');
  await key('Equal');
  assert.equal(await get('fps'), '9');
  await key('Shift+ArrowUp');
  assert.equal(await get('columns'), '9');
  await key('Shift+ArrowDown');
  assert.equal(await get('columns'), '8');
  await key('ArrowRight');
  assert.equal(await get('frame'), '2');
  await key('ArrowLeft');
  assert.equal(await get('frame'), '1');
  await key('ArrowDown');
  assert.equal(await get('pattern'), 'snake');
  await key('Control+ArrowDown');
  assert.equal(await get('direction'), 'backward');
  await key('End');
  assert.equal(await get('frame'), '96');
  await key('Home');
  assert.equal(await get('frame'), '1');
  check(
    'TimeGrid physical shortcuts, including Russian key value, toggle play/view/targets/brush/time/columns',
  );
  await p.locator('#settingsToggle').click();
  await p.locator('#columns').focus();
  await p.keyboard.press('ArrowUp');
  assert.equal(await get('columns'), '9');
  assert.equal(await get('pattern'), 'snake');
  await p.keyboard.press('Control+BracketLeft');
  assert.equal(await get('opacity'), '90');
  await focus();
  await p.locator('#settingsClose').click();
  check(
    'number input retains arrows and modified keys without triggering canvas actions',
  );
  await fresh();
  const c = await p.locator('#canvas').boundingBox(),
    r = await p.evaluate(() => timegridLab.composition()),
    mx = c.x + c.width * 0.3,
    my = c.y + c.height * 0.4;
  const q = [(mx - c.x - r.x) / r.w, (my - c.y - r.y) / r.h];
  await p.mouse.move(mx, my);
  await p.mouse.wheel(0, -100);
  await p.evaluate(() => timegridLab.flush());
  const z = await p.evaluate(() => timegridLab.composition());
  assert.ok(z.w > r.w);
  const anchorError = [
    Math.abs(mx - c.x - z.x - q[0] * z.w),
    Math.abs(my - c.y - z.y - q[1] * z.h),
  ];
  assert.ok(
    Math.max(...anchorError) < 1,
    JSON.stringify({ q, z, r, anchorError }),
  );
  await p.mouse.down({ button: 'right' });
  await p.mouse.move(mx + 37, my + 23);
  await p.mouse.up({ button: 'right' });
  await p.evaluate(() => timegridLab.flush());
  const moved = await p.evaluate(() => timegridLab.composition());
  assert.ok(Math.abs(moved.x - z.x - 37) < 0.01);
  assert.ok(Math.abs(moved.y - z.y - 23) < 0.01);
  await key('f');
  assert.equal(await p.locator('#zoomLabel').textContent(), '100%');
  check('wheel anchors zoom at cursor, right drag pans, F resets fit');

  for (const view of ['grid', 'single'])
    for (const type of ['round', 'spray']) {
      await fresh();
      await set('view', view);
      await set('target', 'bg');
      await set('brushType', type);
      await set('size', 180);
      await set('streamline', 0);
      await set('transparent', true);
      await p.locator('#zoomOut').click();
      await p.evaluate(() => timegridLab.flush());
      const dims = await p.evaluate(() => ({
        c: document.getElementById('canvas').getBoundingClientRect().toJSON(),
        r: timegridLab.composition(),
      }));
      const { c, r } = dims;
      // Left/right and top/bottom exterior marks all stay within the viewport.
      const points = [
        [r.x - 22, r.y + r.h * 0.35],
        [r.x + r.w + 22, r.y + r.h * 0.65],
        [r.x + r.w * 0.35, r.y - 22],
        [r.x + r.w * 0.65, r.y + r.h + 22],
      ];
      for (const [x, y] of points) {
        assert.ok(x > 0 && y > 0 && x < c.width && y < c.height);
        await p.mouse.move(c.x + x, c.y + y);
        await p.mouse.down();
        await p.mouse.move(c.x + x + 3, c.y + y + 3, { steps: 4 });
        await p.mouse.up();
      }
      await p.evaluate(() => timegridLab.flush());
      const snapshot = await p.evaluate(() => {
        const raster = () => {
          const c = timegridLab.exportCanvas(),
            x = c.getContext('2d'),
            a = x.getImageData(0, 0, c.width, c.height).data;
          let ink = 0;
          for (let i = 3; i < a.length; i += 4) if (a[i]) ink++;
          return { w: c.width, h: c.height, ink, png: c.toDataURL() };
        };
        return {
          data: timegridLab.serialize(),
          crop: timegridLab.exportBounds(),
          base: timegridLab.composition(),
          cache: timegridLab.stats().cache,
          raster: raster(),
        };
      });
      assert.ok(
        snapshot.crop.x < snapshot.base.x && snapshot.crop.y < snapshot.base.y,
      );
      assert.ok(
        snapshot.crop.x + snapshot.crop.w > snapshot.base.x + snapshot.base.w &&
          snapshot.crop.y + snapshot.crop.h > snapshot.base.y + snapshot.base.h,
      );
      assert.ok(snapshot.raster.ink > 20);
      assert.ok(snapshot.cache.bytes <= 24 * 1024 * 1024);
      await p.evaluate(() => {
        timegridLab.document().undo();
        timegridLab.document().redo();
        timegridLab.cache().clear();
      });
      assert.equal(
        await p.evaluate(() => timegridLab.exportCanvas().toDataURL()),
        snapshot.raster.png,
      );
      await p.evaluate((text) => timegridLab.load(text), snapshot.data);
      assert.equal(
        await p.evaluate(() => timegridLab.exportCanvas().toDataURL()),
        snapshot.raster.png,
      );
      await set('tool', 'erase');
      await p.mouse.move(c.x + points[0][0], c.y + points[0][1]);
      await p.mouse.down();
      await p.mouse.move(c.x + points[0][0] + 8, c.y + points[0][1] + 8);
      await p.mouse.up();
      assert.notEqual(
        await p.evaluate(() => timegridLab.exportCanvas().toDataURL()),
        snapshot.raster.png,
      );
      await key('Control+KeyZ');
      assert.equal(
        await p.evaluate(() => timegridLab.exportCanvas().toDataURL()),
        snapshot.raster.png,
      );
      await set('exportBg', false);
      const off = await p.evaluate(() => {
        const c = timegridLab.exportCanvas(),
          a = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        return {
          crop: timegridLab.exportBounds(),
          ink: a.some((v, i) => i % 4 === 3 && v > 0),
        };
      });
      assert.deepEqual(off.crop, snapshot.base);
      assert.equal(off.ink, false);
      await set('exportBg', true);
      assert.equal(
        await p.evaluate(() => timegridLab.exportCanvas().toDataURL()),
        snapshot.raster.png,
      );
      check(
        view +
          ' ' +
          type +
          ' exterior BG on all four sides, erase/undo/rebuild/open, include/exclude export',
        {
          crop: snapshot.crop,
          base: snapshot.base,
          ink: snapshot.raster.ink,
          cacheBytes: snapshot.cache.bytes,
        },
      );
    }
  await fresh();
  await set('target', 'bg');
  await set('brushType', 'spray');
  await set('size', 100);
  assert.equal(await get('dotScale'), '100');
  await p.locator('#settingsToggle').click();
  assert.equal(await p.locator('#sprayControls').isVisible(), true);
  await p.locator('#settingsClose').click();
  const densityCounts = [];
  for (const density of [10, 100, 300]) {
    await p.evaluate(() => timegridLab.reset());
    await set('density', density);
    const r = await p.evaluate(() => {
      const c = document.getElementById('canvas').getBoundingClientRect();
      return { x: c.x + c.width / 2, y: c.y + c.height / 2 };
    });
    await p.mouse.click(r.x, r.y);
    densityCounts.push(
      await p.evaluate(() =>
        timegridLab
          .document()
          .strokes.reduce((n, s) => n + (s.stamps?.length || 0), 0),
      ),
    );
  }
  assert.deepEqual(densityCounts, [9, 90, 270]);
  await set('brushType', 'round');
  assert.equal(await p.locator('#sprayControls').isVisible(), false);
  check(
    'Spray default dots100%, density changes particle count, controls only appear for Spray',
    densityCounts,
  );
  await shot('desktop');
  const mobile = await b.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await mobile.goto(url);
  await mobile.waitForFunction(() => window.timegridLab);
  const mobileSize = await mobile.evaluate(() => ({
    body: document.documentElement.scrollWidth,
    viewport: innerWidth,
    stage: document.getElementById('stage').getBoundingClientRect().toJSON(),
    settings: document
      .querySelector('.draw-palette')
      .getBoundingClientRect()
      .toJSON(),
  }));
  assert.ok(mobileSize.body <= mobileSize.viewport);
  assert.ok(
    mobileSize.settings.y > mobileSize.stage.y + mobileSize.stage.height,
  );
  await mobile.screenshot({ path: out + '/mobile.png', fullPage: true });
  check(
    '390px layout keeps compact palette below canvas, without horizontal overflow',
    mobileSize,
  );

  const old = await b.newPage();
  await old.goto(
    'https://comp1mov.github.io/TimeGrid/drawing/28.35.0-drawing.5/drawing-lab.html',
  );
  await old.waitForFunction(() => window.timegridLab);
  const legacy = await old.evaluate(() => {
    const s = timegridLab.createStroke({
      id: 's1',
      surface: 'bg-single',
      points: [
        [0, 0, 0.5],
        [1024, 576, 0.5],
      ],
      size: 180,
    });
    timegridLab.add([s]);
    const c = document.createElement('canvas');
    c.width = 1224;
    c.height = 776;
    timegridLab
      .cache()
      .draw(
        c.getContext('2d'),
        'bg-single',
        { x: 100, y: 100, w: 1024, h: 576 },
        1,
        { x: 0, y: 0, w: 1224, h: 776 },
      );
    return { json: timegridLab.serialize(), png: c.toDataURL() };
  });
  await old.close();
  await fresh();
  await set('view', 'single');
  await set('transparent', true);
  await p.evaluate((text) => timegridLab.load(text), legacy.json);
  const reference = await p.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1224;
    c.height = 776;
    timegridLab
      .cache()
      .draw(
        c.getContext('2d'),
        'bg-single',
        { x: 100, y: 100, w: 1024, h: 576 },
        1,
        { x: 0, y: 0, w: 1224, h: 776 },
      );
    return c.toDataURL();
  });
  assert.equal(reference, legacy.png);
  const mixed = await p.evaluate(() => {
    timegridLab.add([
      timegridLab.createStroke({
        id: timegridLab.document().newId(),
        surface: 'bg-single',
        points: [
          [-85, 288, 0.5],
          [-65, 288, 0.5],
        ],
        size: 20,
        overflow: true,
      }),
    ]);
    const c = document.createElement('canvas');
    c.width = 1224;
    c.height = 776;
    timegridLab
      .cache()
      .draw(
        c.getContext('2d'),
        'bg-single',
        { x: 100, y: 100, w: 1024, h: 576 },
        1,
        { x: 0, y: 0, w: 1224, h: 776 },
      );
    const x = c.getContext('2d');
    return {
      legacyOutside: x.getImageData(90, 110, 1, 1).data[3],
      newOutside: x.getImageData(25, 388, 1, 1).data[3],
    };
  });
  assert.equal(mixed.legacyOutside, 0);
  assert.ok(mixed.newOutside > 200);
  check(
    'actual .5 BG edge raster stays identical; mixed legacy/new BG clips only old geometry',
    {
      legacyPngSHA256: crypto
        .createHash('sha256')
        .update(reference)
        .digest('hex'),
      mixed,
    },
  );
  await set('exportBg', false);
  const downloadPromise = p.waitForEvent('download');
  await p.locator('#save').click();
  const download = await downloadPromise;
  await download.saveAs(out + '/exterior-bg.timegrid-drawing.json');
  const saved = JSON.parse(
    fs.readFileSync(out + '/exterior-bg.timegrid-drawing.json', 'utf8'),
  );
  assert.equal(saved.schema, 6);
  assert.equal(saved.settings.exportBg, false);
  assert.ok(saved.strokes.some((s) => s.overflow));
  await fresh();
  await p
    .locator('#file')
    .setInputFiles(out + '/exterior-bg.timegrid-drawing.json');
  await p.waitForFunction(() => timegridLab.stats().strokes === 2);
  assert.equal(await p.locator('#exportBg').isChecked(), false);
  assert.equal(await get('view'), 'single');
  await set('exportBg', true);
  assert.ok(
    await p.evaluate(
      () => timegridLab.exportBounds().x < timegridLab.composition().x,
    ),
  );
  check(
    'real Save/download/reload/Open preserves exterior BG and export exclusion choice',
  );

  assert.deepEqual(errors, []);
  fs.writeFileSync(
    out + '/report.json',
    JSON.stringify(
      {
        date: new Date().toISOString(),
        url,
        browser: b.version(),
        checks,
        errors,
        physicalDevices: false,
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
