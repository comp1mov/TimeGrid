const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const fs = require('fs');
const out =
  process.env.DRAWING_OUTPUT ||
  'docs/drawing-evidence/2026-10-27-drawing-5/live';
fs.mkdirSync(out, { recursive: true });
const pct = (a, p) =>
  [...a].sort((a, b) => a - b)[
    Math.min(a.length - 1, Math.floor(a.length * p))
  ] || 0;
const summarize = (a) => ({
  n: a.length,
  p50: pct(a, 0.5),
  p95: pct(a, 0.95),
  max: Math.max(0, ...a),
  firstThirdP95: pct(a.slice(0, Math.ceil(a.length / 3)), 0.95),
  lastThirdP95: pct(a.slice(-Math.ceil(a.length / 3)), 0.95),
});
(async () => {
  const samples = Number(process.env.SAMPLES) || 240;
  const browser = await chromium.launch({ channel: 'msedge', headless: true }),
    results = [];
  for (const config of process.env.LONG
    ? [
        { type: 'round', softness: 0 },
        { type: 'spray', softness: 70 },
      ]
    : [
        { type: 'round', softness: 0 },
        { type: 'round', softness: 70 },
        { type: 'spray', softness: 0 },
        { type: 'spray', softness: 70 },
      ]) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(
      process.env.TEST_URL || 'http://127.0.0.1:5196/drawing-lab.html',
    );
    await page.waitForFunction(
      () => window.timegridLab?.layout().length === 96,
    );
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#sizeNumber').fill('80');
    config.version = await page.evaluate(() => timegridLab.version);
    {
      await page.selectOption('#brushType', config.type);
      if (await page.locator('#parameter').count())
        await page.selectOption('#parameter', 'softness');
      await page.locator('#softness').fill(String(config.softness));
    }
    await page.evaluate(
      (params) => {
        for (const [id, value] of [
          ['margin', '0'],
          ['scatter', String(params.scatter)],
          ['dotScale', String(params.dots)],
          ['density', String(params.density)],
        ]) {
          const e = document.getElementById(id);
          if (!e) continue;
          e.value = value;
          e.dispatchEvent(new Event('change'));
        }
      },
      {
        scatter: Number(process.env.SCATTER) || 150,
        dots: Number(process.env.DOT_SCALE) || 100,
        density: Number(process.env.DENSITY) || 100,
      },
    );
    await page.uncheck('#velocity');
    await page.evaluate(() => timegridLab.flush());
    const r = await page.evaluate(() => {
      const m = timegridLab.stats().metrics;
      for (const k of [
        'inputMs',
        'geometryMs',
        'renderMs',
        'eventToRenderEndMs',
      ])
        m[k] = [];
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
    await page.mouse.move(r.x + r.w * 0.08, r.y + r.h * 0.5);
    await page.mouse.down();
    const frames = await page.evaluate(
      async ({ r, samples }) => {
        const c = document.querySelector('#canvas'),
          durations = [];
        let last = performance.now();
        for (let i = 1; i <= samples; i++) {
          await new Promise(requestAnimationFrame);
          let now = performance.now();
          durations.push(now - last);
          last = now;
          const t = i / samples;
          c.dispatchEvent(
            new PointerEvent('pointermove', {
              bubbles: true,
              pointerId: 1,
              pointerType: 'mouse',
              buttons: 1,
              pressure: 0.5,
              clientX: r.x + r.w * (0.08 + 0.84 * t),
              clientY: r.y + r.h * (0.5 + 0.12 * Math.sin(t * Math.PI * 2)),
            }),
          );
        }
        await timegridLab.flush();
        return durations;
      },
      { r, samples },
    );
    const live = await page.evaluate(() => ({
      metrics: timegridLab.stats().metrics,
      cache: timegridLab.stats().cache,
      status: document.querySelector('#status').textContent,
    }));
    await page.mouse.move(r.x + r.w * 0.92, r.y + r.h * 0.5);
    const t = Date.now();
    await page.mouse.up();
    await page.evaluate(() => timegridLab.flush());
    const end = await page.evaluate(() => ({
      strokes: timegridLab.document().strokes.map((s) => ({
        points: s.points.length,
        stamps: s.stamps?.length || 0,
        placements: s.placements.length,
      })),
      status: document.querySelector('#status').textContent,
    }));
    const report = {
      config,
      samples,
      brushSettings: {
        scatter: Number(process.env.SCATTER) || 150,
        dotScale: Number(process.env.DOT_SCALE) || 100,
        density: Number(process.env.DENSITY) || 100,
      },
      url: page.url(),
      live: Object.fromEntries(
        ['inputMs', 'geometryMs', 'renderMs', 'eventToRenderEndMs'].map((k) => [
          k,
          summarize(live.metrics[k]),
        ]),
      ),
      callbackIntervals: summarize(frames),
      releaseAndFlushWallMs: Date.now() - t,
      cache: live.cache,
      end,
      errors,
      raw: { metrics: live.metrics, callbackIntervals: frames },
    };
    results.push(report);
    fs.writeFileSync(
      out + '/results.json',
      JSON.stringify(
        {
          date: new Date().toISOString(),
          browser: browser.version(),
          method:
            'Standard Edge headless desktop, native down/up with synthetic pointermove on each rAF. Configurable rAF samples, same logical sheet path and size 80. Callback intervals and JS durations, not physical input or GPU presentation latency.',
          results,
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        config,
        samples,
        render: report.live.renderMs,
        releaseAndFlushWallMs: report.releaseAndFlushWallMs,
        operations: end.strokes.length,
        stamps: end.strokes.reduce((n, s) => n + s.stamps, 0),
        status: end.status,
        errors,
      }),
    );
    await page.close();
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
