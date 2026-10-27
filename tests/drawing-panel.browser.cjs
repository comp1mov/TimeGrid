const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const fs = require('fs'),
  assert = require('node:assert/strict');
const url =
  process.env.TEST_URL ||
  'file:///' +
    process.cwd().replaceAll('\\', '/') +
    '/.drawing-lab-build/drawing-lab.html';
const out =
  process.env.DRAWING_OUTPUT ||
  'docs/drawing-evidence/2026-10-27-drawing-7/production/panel';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const checks = [],
    errors = [];
  const check = (name, data) => {
    checks.push({ name, pass: true, data });
    console.log('PASS ' + name);
  };
  try {
    const p = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(url);
    await p.waitForFunction(() => window.timegridLab);
    await p.evaluate(() => document.fonts.ready);
    const value = (id) => p.locator('#' + id).inputValue();
    const flush = () => p.evaluate(() => timegridLab.flush());
    assert.equal(await p.locator('#settingsDrawer').isVisible(), false);
    for (const expected of ['tpl', 'bg', 'frm']) {
      await p.locator('#targetCycle').click();
      assert.equal(await value('target'), expected);
      assert.equal(
        await p.locator('#targetCycle').textContent(),
        expected.toUpperCase(),
      );
    }
    await p.keyboard.press('w');
    assert.equal(await p.locator('#targetCycle').textContent(), 'TPL');
    await p.keyboard.press('e');
    check(
      'single target button cycles FRM/TPL/BG and stays synchronized with hotkeys',
    );
    await p.locator('#sizeNumber').fill('120');
    await p.locator('#sizeNumber').press('Tab');
    await p.selectOption('#parameter', 'opacity');
    await p.locator('#opacity').fill('35');
    await p.selectOption('#parameter', 'softness');
    await p.locator('#softnessNumber').fill('20');
    await p.locator('#softnessNumber').press('Tab');
    await p.selectOption('#parameter', 'size');
    assert.equal(await value('size'), '120');
    assert.equal(await value('opacity'), '35');
    assert.equal(await value('softness'), '20');
    assert.equal(await p.locator('.parameter-control:visible').count(), 1);
    check('one parameter row keeps independent size, opacity and edge values');
    await p.locator('[data-color-slot="1"]').click();
    assert.equal(await value('color'), '#e6392e');
    await p.evaluate(() => {
      const el = document.getElementById('color');
      el.value = '#12ab34';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await p.locator('[data-color-slot="0"]').click();
    assert.equal(await value('color'), '#ffffff');
    await p.locator('[data-color-slot="1"]').click();
    assert.equal(await value('color'), '#12ab34');
    assert.equal(await p.locator('.color-swatch:visible').count(), 3);
    check(
      'three direct colors; editing selected color retains the other slots',
    );
    await p.selectOption('#view', 'single');
    await flush();
    const box = await p.locator('#canvas').boundingBox(),
      r = await p.evaluate(() => timegridLab.layout()[0]);
    await p.mouse.move(box.x + r.x + r.w * 0.25, box.y + r.y + r.h * 0.4);
    await p.mouse.down();
    await p.mouse.move(box.x + r.x + r.w * 0.7, box.y + r.y + r.h * 0.6, {
      steps: 20,
    });
    await p.mouse.up();
    await flush();
    const documentBefore = await p.evaluate(() => timegridLab.serialize());
    const strokes = JSON.parse(documentBefore).strokes;
    assert.ok(strokes.length > 0);
    assert.ok(
      strokes.every(
        (s) =>
          s.brush.color === '#12ab34' &&
          s.brush.size === 120 &&
          s.brush.opacity === 0.35 &&
          s.brush.softness === 0.2,
      ),
    );
    check(
      'visible controls produce corresponding color, size, opacity and softness in actual native stroke',
    );
    await p.locator('#eraserToggle').click();
    assert.equal(await value('tool'), 'erase');
    await p.locator('#eraserToggle').click();
    assert.equal(await value('tool'), 'pen');
    await p.locator('#drawEnabled').click();
    assert.equal(await p.locator('#brushOff').isChecked(), true);
    const count = await p.evaluate(() => timegridLab.stats().strokes);
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down();
    await p.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20);
    await p.mouse.up();
    assert.equal(await p.evaluate(() => timegridLab.stats().strokes), count);
    await p.locator('#drawEnabled').click();
    check('eraser toggle and Draw/Off route through existing input mechanics');
    await p.locator('label:has(#longStroke)').click();
    assert.equal(await p.locator('#longStroke').isChecked(), true);
    assert.match(await p.locator('#longLabel').textContent(), /8/);
    await p.locator('#settingsToggle').click();
    assert.equal(await p.locator('#trail').isVisible(), true);
    await p.locator('#trail').fill('3');
    await p.locator('#trail').press('Tab');
    await p.locator('#settingsClose').click();
    assert.match(await p.locator('#longLabel').textContent(), /3/);
    await p.locator('#settingsToggle').click();
    await p.locator('#streamline').focus();
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('#settingsDrawer').isVisible(), false);
    assert.equal(await p.locator('#brushOff').isChecked(), false);
    check(
      'Long is direct; Trail changes reflected in button; Escape closes menu without disabling drawing',
    );
    const downloadPromise = p.waitForEvent('download');
    await p.locator('#save').click();
    const download = await downloadPromise;
    const savePath = out + '/panel.timegrid-drawing.json';
    await download.saveAs(savePath);
    const saved = JSON.parse(fs.readFileSync(savePath, 'utf8'));
    assert.equal(saved.settings.longStroke, true);
    assert.equal(saved.settings.trail, 3);
    assert.deepEqual(saved.strokes, strokes);
    await p.locator('#clear').click();
    await flush();
    assert.equal(await p.evaluate(() => timegridLab.stats().strokes), 0);
    await p.locator('#undo').click();
    await flush();
    assert.deepEqual(
      JSON.parse(await p.evaluate(() => timegridLab.serialize())).strokes,
      strokes,
    );
    await p.locator('#redo').click();
    await flush();
    assert.equal(await p.evaluate(() => timegridLab.stats().strokes), 0);
    await p.locator('#settingsToggle').click();
    const picker = p.waitForEvent('filechooser');
    await p.locator('#open').click();
    await (await picker).setFiles(savePath);
    await p.waitForFunction(() => timegridLab.stats().strokes > 0);
    await p.locator('#settingsClose').click();
    assert.deepEqual(
      JSON.parse(await p.evaluate(() => timegridLab.serialize())).strokes,
      strokes,
    );
    assert.match(await p.locator('#longLabel').textContent(), /3/);
    check(
      'actual Save download, Clear, Undo/Redo and Open restore geometry and Long/Trail settings',
    );
    await p.screenshot({ path: out + '/desktop.png' });
    // Every pre-existing .6 drawing control still exists exactly once.
    const original = fs.readFileSync('drawing-lab.html', 'utf8');
    const ids = [...original.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of [
      'oneFrame',
      'onion',
      'templateVisible',
      'bake',
      'bgAbove',
      'touchDraw',
      'pressure',
      'velocity',
      'streamline',
      'smooth',
      'scatter',
      'dotScale',
      'density',
      'columns',
      'gap',
      'margin',
      'fps',
      'direction',
      'pattern',
      'loop',
      'loopOffset',
      'phases',
      'images',
      'exportSize',
      'exportBg',
      'transparent',
      'png',
    ])
      assert.equal(await p.locator('#' + id).count(), 1, id);
    check(
      'existing brush, temporal, input, grid and export controls remain available without duplicate state',
    );
    for (const [name, width, height] of [
      ['phone', 390, 844],
      ['small-phone', 320, 568],
      ['landscape', 844, 390],
    ]) {
      const m = await browser.newPage({
        viewport: { width, height },
        isMobile: true,
        hasTouch: true,
      });
      m.on('pageerror', (e) => errors.push(e.message));
      await m.goto(url);
      await m.waitForFunction(() => window.timegridLab);
      await m.evaluate(() => document.fonts.ready);
      await m.evaluate(() => timegridLab.flush());
      const geometry = await m.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        canvas: document
          .getElementById('canvas')
          .getBoundingClientRect()
          .toJSON(),
        panel: document
          .querySelector('.draw-palette')
          .getBoundingClientRect()
          .toJSON(),
      }));
      assert.equal(geometry.scroll, width);
      assert.ok(geometry.panel.right <= width);
      assert.ok(geometry.panel.bottom <= height);
      assert.ok(geometry.canvas.width > 250 && geometry.canvas.height > 250);
      for (const id of ['save', 'clear', 'drawEnabled', 'targetCycle']) {
        const b = await m.locator('#' + id).boundingBox();
        assert.ok(
          b &&
            b.x >= 0 &&
            b.y >= 0 &&
            b.x + b.width <= width &&
            b.y + b.height <= height,
          id,
        );
      }
      await m.locator('#targetCycle').tap();
      assert.equal(await m.locator('#target').inputValue(), 'tpl');
      await m.locator('label:has(#longStroke)').tap();
      assert.equal(await m.locator('#longStroke').isChecked(), true);
      await m.locator('[data-color-slot="2"]').tap();
      assert.equal(await m.locator('#color').inputValue(), '#111111');
      await m.screenshot({ path: out + '/' + name + '.png' });
      await m
        .locator('.draw-palette')
        .screenshot({ path: out + '/' + name + '-panel.png' });
      await m.locator('#settingsToggle').tap();
      await m.locator('#onion').check();
      await m.locator('#settingsClose').tap();
      assert.equal(await m.locator('#onion').isChecked(), true);
      check(
        name +
          ' no overflow, reachable actions and actual touch target/color/Long/menu controls',
        geometry,
      );
      await m.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      out + '/report.json',
      JSON.stringify(
        {
          date: new Date().toISOString(),
          version: await p.evaluate(() => timegridLab.version),
          url,
          browser: browser.version(),
          checks,
          errors,
          physicalDevices: false,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
