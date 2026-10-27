const { chromium } = require(process.env.PLAYWRIGHT_MODULE),
  fs = require('fs'),
  assert = require('node:assert/strict'),
  crypto = require('crypto');
const json = fs.readFileSync(
  'docs/drawing-evidence/2026-10-26-perfect-freehand-4/public/brushes.timegrid-drawing.json',
  'utf8',
);
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true }),
    results = [];
  for (const url of [
    'https://comp1mov.github.io/TimeGrid/drawing/28.35.0-drawing.4/drawing-lab.html',
    process.env.TEST_URL || 'http://127.0.0.1:5317/drawing-lab.html',
  ]) {
    const p = await b.newPage();
    await p.goto(url);
    await p.waitForFunction(() => window.timegridLab);
    const raster = await p.evaluate((json) => {
      timegridLab.load(json);
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 576;
      const x = c.getContext('2d');
      timegridLab.cache().draw(x, 'frame-0', { x: 0, y: 0, w: 1024, h: 576 });
      return c.toDataURL();
    }, json);
    results.push({
      url,
      hash: crypto.createHash('sha256').update(raster).digest('hex'),
    });
    await p.close();
  }
  assert.equal(results[0].hash, results[1].hash);
  fs.mkdirSync(
    process.env.DRAWING_OUTPUT || 'docs/drawing-evidence/2026-10-27-drawing-6',
    { recursive: true },
  );
  fs.writeFileSync(
    (process.env.DRAWING_OUTPUT ||
      'docs/drawing-evidence/2026-10-27-drawing-6') + '/legacy-4.json',
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: b.version(),
        fixture: 'actual published .4 mixed brushes download',
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results));
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
