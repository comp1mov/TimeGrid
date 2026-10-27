const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const fs = require('fs'),
  assert = require('node:assert/strict'),
  crypto = require('crypto');
const out =
  process.env.DRAWING_OUTPUT ||
  'docs/drawing-evidence/2026-10-27-drawing-8/production/fill';
const url =
  process.env.TEST_URL ||
  'file:///' +
    process.cwd().replaceAll('\\', '/') +
    '/.drawing-lab-build/drawing-lab.html';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const checks = [],
    errors = [];
  const check = (name, data) => {
    checks.push({ name, pass: true, data });
    console.log('PASS ' + name);
  };
  const p = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  p.on('pageerror', (e) => errors.push(e.message));
  const set = (id, value) =>
    p.evaluate(
      ({ id, value }) => {
        const e = document.getElementById(id);
        e.type === 'checkbox' ? (e.checked = value) : (e.value = value);
        e.dispatchEvent(new Event('change'));
      },
      { id, value },
    );
  const choose = async (id, text) => {
    await p.locator('#' + id + '-trigger').click();
    await p.getByRole('option', { name: text, exact: true }).click();
  };
  const flush = () => p.evaluate(() => timegridLab.flush());
  const shapes = async (surface, rects, erase = false) =>
    p.evaluate(
      ({ surface, rects, erase }) => {
        const doc = timegridLab.document();
        for (const [x, y, w, h, open = false] of rects) {
          const pairs = [
            [
              [x, y],
              [x + w, y],
            ],
            [
              [x + w, y],
              [x + w, y + h],
            ],
            [
              [x + w, y + h],
              [x, y + h],
            ],
          ];
          if (!open)
            pairs.push([
              [x, y + h],
              [x, y],
            ]);
          doc.addGesture(
            pairs.map((points) =>
              timegridLab.createStroke({
                id: doc.newId(),
                surface,
                points: points.map((p) => [...p, 0.5]),
                size: 18,
                color: '#ffffff',
                smoothing: 0,
                streamline: 0,
                erase,
                overflow: surface.startsWith('bg-'),
              }),
            ),
          );
        }
      },
      { surface, rects, erase },
    );
  const clickLocal = async (x, y, bg = false) => {
    const pt = await p.evaluate(
      ({ x, y, bg }) => {
        const r = bg ? timegridLab.composition() : timegridLab.layout()[0];
        const c = document.getElementById('canvas').getBoundingClientRect();
        const grid = bg && document.getElementById('view').value === 'grid';
        return {
          x: c.x + r.x + (x / (grid ? 8192 : 1024)) * r.w,
          y: c.y + r.y + (y / (grid ? 6912 : 576)) * r.h,
        };
      },
      { x, y, bg },
    );
    await p.mouse.click(pt.x, pt.y);
    await p.waitForFunction(() => !timegridLab.fillBusy());
    await flush();
  };
  const fills = () =>
    p.evaluate(() => timegridLab.document().strokes.filter((s) => s.fill));
  const inside = (s, x, y) => {
    const f = s.fill,
      c = Math.floor((x - f.x) / f.step),
      r = Math.floor((y - f.y) / f.step);
    return f.runs.some(([y, x, n]) => y === r && c >= x && c < x + n);
  };
  const png = async () =>
    p.evaluate(() => {
      const c = timegridLab.exportCanvas();
      const out = c.toDataURL();
      c.width = 0;
      return out;
    });
  const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
  try {
    await p.goto(url);
    await p.waitForFunction(() => window.timegridLab);
    await p.evaluate(() => document.fonts.ready);
    assert.match(await p.title(), /drawing\.8/);
    await choose('view', 'Single');
    await p.locator('#brushType-trigger').click();
    await p.screenshot({ path: out + '/dark-menu.png' });
    const dark = await p
      .locator('.select-popup')
      .evaluate((e) => getComputedStyle(e).backgroundColor);
    assert.equal(dark, 'rgb(21, 21, 21)');
    await p.getByRole('option', { name: 'Fill', exact: true }).click();
    assert.equal(await p.locator('#tool').inputValue(), 'fill');
    await p.locator('[data-color-slot="1"]').click();
    await set('transparent', true);
    check('Fill is available through the real dark dropdown');
    await shapes('frame-0', [[200, 100, 600, 380]]);
    await clickLocal(500, 280);
    let list = await fills();
    assert.equal(list.length, 1);
    assert.ok(inside(list[0], 500, 280));
    assert.ok(!inside(list[0], 100, 280));
    const initial = await png();
    const pixels = await p.evaluate(() => {
      const c = timegridLab.exportCanvas();
      const ctx = c.getContext('2d');
      const data = [
        ...ctx.getImageData(
          Math.floor(c.width / 2),
          Math.floor(c.height / 2),
          1,
          1,
        ).data,
      ];
      c.width = 0;
      return data;
    });
    assert.deepEqual(pixels, [230, 57, 46, 255]);
    await p.screenshot({ path: out + '/filled.png' });
    check(
      'four separate strokes enclose a filled red interior; outside remains empty',
      { runs: list[0].fill.runs.length, pixels },
    );
    await p.locator('#undo').click();
    assert.equal((await fills()).length, 0);
    await p.locator('#redo').click();
    assert.equal(hash(await png()), hash(initial));
    await p.evaluate(() => timegridLab.cache().clear());
    assert.equal(hash(await png()), hash(initial));
    check('one fill is one Undo/Redo; cache rebuild preserves exact PNG');
    const downloadPromise = p.waitForEvent('download');
    await p.locator('#save').click();
    const download = await downloadPromise;
    await download.saveAs(out + '/filled.json');
    const saved = JSON.parse(fs.readFileSync(out + '/filled.json', 'utf8'));
    assert.equal(saved.schema, 6);
    await p.locator('#clear').click();
    await p.locator('#file').setInputFiles(out + '/filled.json');
    await p.waitForFunction(() =>
      timegridLab.document().strokes.some((s) => s.fill),
    );
    await flush();
    assert.equal(hash(await png()), hash(initial));
    check(
      'actual Save download and Open retain fill geometry and exact exported pixels',
    );
    for (const size of ['2048', '4096']) {
      await set('exportSize', size);
      const a = await png();
      await p.evaluate(() => timegridLab.load(timegridLab.serialize()));
      assert.equal(hash(await png()), hash(a));
    }
    check('2K/4K exports stay identical after document roundtrip');
    await set('exportSize', '2048');
    for (let i = 1; i <= 3; i++) {
      await p.locator('#savePointSave' + i).click();
      assert.equal(await p.locator('#savePointLoad' + i).isEnabled(), true);
    }
    await p.locator('#clear').click();
    assert.equal((await fills()).length, 0);
    await p.locator('#savePointLoad2').click();
    assert.equal(hash(await png()), hash(initial));
    await p.locator('#undo').click();
    assert.equal((await fills()).length, 0);
    await p.locator('#redo').click();
    assert.equal(hash(await png()), hash(initial));
    check('S1/S2/S3 keep drawing data; L2 restores it with atomic Undo/Redo');
    const before = await p.evaluate(() => timegridLab.serialize());
    await choose('view', 'Grid');
    await set('columns', 12);
    await flush();
    assert.deepEqual(
      JSON.parse(await p.evaluate(() => timegridLab.serialize())).strokes,
      JSON.parse(before).strokes,
    );
    await choose('view', 'Single');
    await flush();
    assert.equal(hash(await png()), hash(initial));
    check('96-frame grid reflow and Single preserve frame fill identity');
    await p.evaluate(() => timegridLab.reset());
    await shapes('frame-0', [[200, 100, 600, 380, true]]);
    await clickLocal(500, 280);
    assert.equal((await fills()).length, 0);
    assert.match(await p.locator('#status').textContent(), /outline is open/);
    check('open contours do not flood the frame');
    await p.evaluate(() => timegridLab.reset());
    await shapes('frame-0', [[200, 100, 600, 380]]);
    await p.evaluate(() => {
      const d = timegridLab.document();
      d.addGesture([
        timegridLab.createStroke({
          id: d.newId(),
          surface: 'frame-0',
          points: [
            [180, 280, 0.5],
            [220, 280, 0.5],
          ],
          size: 50,
          erase: true,
          streamline: 0,
        }),
      ]);
    });
    await clickLocal(500, 280);
    assert.equal((await fills()).length, 0);
    check('erased gap opens the boundary and prevents fill');
    await p.evaluate(() => timegridLab.reset());
    await shapes('frame-0', [[-100, 100, 900, 380]]);
    await clickLocal(500, 280);
    assert.equal((await fills()).length, 0);
    check('frame border is not an artificial closing line');
    await p.evaluate(() => timegridLab.reset());
    await p.evaluate(() => {
      const d = timegridLab.document();
      d.addGesture([
        timegridLab.createStroke({
          id: d.newId(),
          surface: 'frame-0',
          points: [
            [200, 100, 0.5],
            [800, 100, 0.5],
            [800, 480, 0.5],
            [200, 480, 0.5],
            [200, 100, 0.5],
          ],
          size: 40,
          softness: 0.7,
          streamline: 0,
        }),
      ]);
    });
    await clickLocal(500, 280);
    assert.equal((await fills()).length, 1);
    check('continuous soft Round boundary encloses a fill');
    await p.evaluate(() => timegridLab.reset());
    await p.evaluate(() => {
      const d = timegridLab.document();
      d.addGesture([
        timegridLab.createStroke({
          id: d.newId(),
          surface: 'frame-0',
          points: [
            [200, 100, 0.5],
            [800, 100, 0.5],
            [800, 480, 0.5],
            [200, 480, 0.5],
            [200, 100, 0.5],
          ],
          type: 'spray',
          size: 8,
          scatter: 3,
          dotScale: 0.05,
          seed: 23,
          streamline: 0,
        }),
      ]);
    });
    await clickLocal(500, 280);
    assert.equal((await fills()).length, 0);
    check('sparse Spray dots are not treated as a closed boundary');
    // An edited document invalidates a pending fill before it can commit.
    await p.evaluate(() => timegridLab.reset());
    await shapes('frame-0', [[20, 20, 984, 536]]);
    const cancellation = await p.evaluate(async () => {
      const r = timegridLab.layout()[0],
        c = document.getElementById('canvas').getBoundingClientRect(),
        canvas = document.getElementById('canvas');
      const opts = {
        pointerId: 71,
        pointerType: 'mouse',
        clientX: c.x + r.x + r.w / 2,
        clientY: c.y + r.y + r.h / 2,
        button: 0,
        buttons: 1,
        bubbles: true,
      };
      canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
      canvas.dispatchEvent(
        new PointerEvent('pointerup', { ...opts, buttons: 0 }),
      );
      document.getElementById('clear').click();
      await new Promise((r) => setTimeout(r, 150));
      return timegridLab.document().strokes.length;
    });
    assert.equal(cancellation, 0);
    check('Clear cancels pending fill without resurrecting deleted work');
    await p.evaluate(() => timegridLab.reset());
    await shapes('frame-0', [
      [100, 70, 800, 430],
      [350, 180, 250, 200],
    ]);
    await clickLocal(700, 280);
    list = await fills();
    assert.equal(list.length, 1);
    assert.ok(inside(list[0], 700, 280));
    assert.ok(!inside(list[0], 450, 280));
    check('closed inner contour retains a hole');
    await p.evaluate(() => timegridLab.reset());
    await set('target', 'tpl');
    await shapes('tpl', [[200, 100, 600, 380]]);
    await clickLocal(500, 280);
    assert.equal((await fills())[0].surface, 'tpl');
    const templatePng = await png();
    await p.evaluate(() => document.getElementById('bake').click());
    const bakedPng = await png();
    const diff = await p.evaluate(
      async ({ before, after }) => {
        const load = async (src) => {
          const i = new Image();
          i.src = src;
          await i.decode();
          const c = document.createElement('canvas');
          c.width = i.width;
          c.height = i.height;
          const ctx = c.getContext('2d');
          ctx.drawImage(i, 0, 0);
          const d = ctx.getImageData(0, 0, c.width, c.height).data;
          c.width = 0;
          return d;
        };
        const a = await load(before),
          b = await load(after);
        let sum = 0,
          n = 0,
          max = 0;
        for (let i = 0; i < a.length; i++) {
          const d = Math.abs(a[i] - b[i]);
          sum += d;
          if (d) n++;
          max = Math.max(max, d);
        }
        return { mean: sum / a.length, changed: n, max };
      },
      { before: templatePng, after: bakedPng },
    );
    assert.ok(diff.mean < 1, JSON.stringify(diff));
    await p.evaluate(() => timegridLab.load(timegridLab.serialize()));
    assert.equal(hash(await png()), hash(bakedPng));
    check(
      'TPL fill repeats; Apply TPL has bounded resampling differences; baked Save/Open is exact',
      diff,
    );
    await p.evaluate(() => timegridLab.reset());
    await set('target', 'bg');
    await shapes('bg-single', [[300, -100, 400, 80]]);
    await p.locator('#zoomOut').click();
    await flush();
    await clickLocal(500, -60, true);
    list = await fills();
    assert.equal(list.length, 1);
    assert.equal(list[0].overflow, true);
    assert.ok(inside(list[0], 500, -60));
    const bgPng = await png();
    await p.evaluate(() => timegridLab.load(timegridLab.serialize()));
    assert.equal(hash(await png()), hash(bgPng));
    check('BG fill works outside composition and survives export/Open');
    // Mutated input is rejected before replacing the live document, including nested fills.
    const validation = await p.evaluate(() => {
      const source = timegridLab.serialize(),
        raw = JSON.parse(source),
        s = raw.strokes.find((s) => s.fill),
        cases = [];
      for (const mutation of [
        (s) => (s.fill.runs[0][2] = -1),
        (s) => s.fill.runs.push([...s.fill.runs[0]]),
        (s) => (s.fill.width = 9999999),
        (s) => (s.fill.step = 0),
        (s) => (s.outline[0][0] += 1),
      ]) {
        const data = JSON.parse(source);
        mutation(data.strokes.find((s) => s.fill));
        try {
          timegridLab.load(JSON.stringify(data));
          cases.push(false);
        } catch {
          cases.push(timegridLab.serialize() === source);
        }
      }
      return cases;
    });
    assert.deepEqual(validation, [true, true, true, true, true]);
    check('malformed fill payloads are rejected atomically');
    await p.screenshot({ path: out + '/bg-filled.png' });
    for (const width of [390, 320]) {
      const phone = await browser.newPage({
        viewport: { width, height: 844 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 2,
      });
      phone.on('pageerror', (e) => errors.push(e.message));
      await phone.goto(url);
      await phone.waitForFunction(() => window.timegridLab);
      await phone.locator('#view-trigger').tap();
      await phone.getByRole('option', { name: 'Single', exact: true }).tap();
      await phone.evaluate(() => {
        const d = timegridLab.document();
        d.addGesture([
          timegridLab.createStroke({
            id: d.newId(),
            surface: 'frame-0',
            points: [
              [200, 100, 0.5],
              [800, 100, 0.5],
              [800, 480, 0.5],
              [200, 480, 0.5],
              [200, 100, 0.5],
            ],
            size: 20,
            streamline: 0,
            smoothing: 0,
          }),
        ]);
      });
      await phone.locator('#brushType-trigger').tap();
      await phone.getByRole('option', { name: 'Fill', exact: true }).tap();
      const pt = await phone.evaluate(() => {
        const r = timegridLab.layout()[0],
          c = document.getElementById('canvas').getBoundingClientRect();
        return { x: c.x + r.x + r.w / 2, y: c.y + r.y + r.h / 2 };
      });
      const cd = await phone.context().newCDPSession(phone);
      await cd.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { id: 1, x: pt.x, y: pt.y, force: 0.5 },
          { id: 2, x: pt.x + 20, y: pt.y + 20, force: 0.5 },
        ],
      });
      await cd.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      assert.equal(
        await phone.evaluate(
          () => timegridLab.document().strokes.filter((s) => s.fill).length,
        ),
        0,
      );
      await phone.touchscreen.tap(pt.x, pt.y);
      await phone.waitForFunction(() => !timegridLab.fillBusy());
      assert.equal(
        await phone.evaluate(
          () => timegridLab.document().strokes.filter((s) => s.fill).length,
        ),
        1,
      );
      await phone.locator('label:has(#oneFrame)').tap();
      assert.equal(await phone.locator('#oneFrame').isChecked(), true);
      for (const id of [
        'savePointSave1',
        'savePointLoad1',
        'savePointSave2',
        'savePointLoad2',
        'savePointSave3',
        'savePointLoad3',
      ])
        assert.ok(await phone.locator('#' + id).isVisible());
      assert.equal(
        await phone.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await phone.screenshot({ path: out + '/phone-' + width + '.png' });
      await phone.close();
    }
    check(
      'touch taps fill on 390/320px layouts; 1F and six slot buttons remain accessible (emulation)',
    );
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      out + '/results.json',
      JSON.stringify({ url, checks, errors }, null, 2),
    );
  } catch (e) {
    await p.screenshot({ path: out + '/failure.png' });
    fs.writeFileSync(
      out + '/failure.json',
      JSON.stringify({ checks, errors, error: e.stack }, null, 2),
    );
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
