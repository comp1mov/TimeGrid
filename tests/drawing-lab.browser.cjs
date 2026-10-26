const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const url =
  process.env.TEST_URL ||
  "http://127.0.0.1:5194/drawing-lab.html?verifyPixels=1";
const out =
  process.env.DRAWING_OUTPUT ||
  "docs/drawing-evidence/2026-10-26-perfect-freehand";
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.timegridLab?.layout().length === 96);
  const flush = () => page.evaluate(() => timegridLab.flush());
  await flush();
  const checks = [];
  const check = (name, details) => {
    checks.push({ name, passed: true, details });
    console.log("PASS " + name);
  };
  assert.equal(await page.evaluate(() => timegridLab.stats().cache.bytes), 0);
  check("empty 96 frames allocate zero cache tiles");
  const rects = await page.evaluate(() => {
    const b = document.querySelector("canvas").getBoundingClientRect();
    return timegridLab
      .layout()
      .map((r) => ({ ...r, x: r.x + b.x, y: r.y + b.y }));
  });
  const hash = () =>
    page.evaluate(() => {
      const c = document.querySelector("canvas");
      const data = c
        .getContext("2d")
        .getImageData(0, 0, c.width, c.height).data;
      let value = "";
      for (let i = 0; i < data.length; i += 16384)
        value += String.fromCharCode(...data.subarray(i, i + 16384));
      return btoa(value);
    });
  function pixelsEqual(a, b) {
    a = Buffer.from(a, "base64");
    b = Buffer.from(b, "base64");
    assert.equal(a.length, b.length);
    let max = 0;
    for (let i = 0; i < a.length; i++)
      max = Math.max(max, Math.abs(a[i] - b[i]));
    assert.ok(max <= 2, "Pixel mismatch: max channel delta " + max);
  }
  function pixelsDiffer(a, b) {
    a = Buffer.from(a, "base64");
    b = Buffer.from(b, "base64");
    assert.ok(a.some((v, i) => Math.abs(v - b[i]) > 2));
  }
  const empty = await hash(),
    r = rects[0],
    end = rects[7];
  const readsBefore = await page.evaluate(
    () => timegridLab.stats().metrics.rectReads,
  );
  await page.mouse.move(r.x + r.w * 0.15, r.y + r.h * 0.55);
  await page.mouse.down();
  await page.mouse.move(end.x + end.w * 0.8, end.y + end.h * 0.55, {
    steps: 120,
  });
  await page.mouse.up();
  await flush();
  const after = await page.evaluate(() => JSON.parse(timegridLab.serialize()));
  assert.equal(new Set(after.strokes.map((s) => s.surface)).size, 8);
  assert.equal(
    await page.evaluate(() => timegridLab.document().undoStack.length),
    1,
  );
  const painted = await hash();
  pixelsDiffer(painted, empty);
  const gestureRectReads =
    (await page.evaluate(() => timegridLab.stats().metrics.rectReads)) -
    readsBefore;
  await page.click("#undo");
  await flush();
  pixelsEqual(await hash(), empty);
  await page.click("#redo");
  await flush();
  pixelsEqual(await hash(), painted);
  check("cross-cell stroke, pixel (RGB tolerance 2) undo and redo", {
    surfaces: 8,
    geometryReads: gestureRectReads,
    moveSteps: 120,
  });
  await page.selectOption("#view", "single");
  await flush();
  await page.selectOption("#target", "tpl");
  await page.locator("#size").fill("70");
  await page.locator("#opacity").fill("35");
  const b = await page.locator("#canvas").boundingBox();
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.5, {
    steps: 30,
  });
  await page.mouse.up();
  await flush();
  const preErase = await hash();
  await page.selectOption("#tool", "erase");
  await page.locator("#opacity").fill("100");
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.65, {
    steps: 20,
  });
  await page.mouse.up();
  await flush();
  pixelsDiffer(await hash(), preErase);
  await page.click("#undo");
  await flush();
  pixelsEqual(await hash(), preErase);
  await page.click("#redo");
  await flush();
  check("partial eraser and opacity restore within RGB tolerance 2");
  const interactiveBeforeReload = await page.evaluate(() =>
    structuredClone(timegridLab.stats().metrics),
  );
  const data = await page.evaluate(() => timegridLab.serialize());
  const savedHash = await hash();
  const downloadPromise = page.waitForEvent("download");
  await page.click("#save");
  const download = await downloadPromise;
  const savedPath = path.join(out, "roundtrip.timegrid-drawing.json");
  await download.saveAs(savedPath);
  assert.equal(fs.readFileSync(savedPath, "utf8"), data);
  await page.reload();
  await page.waitForFunction(() => window.timegridLab);
  await page.setInputFiles("#file", savedPath);
  await page.waitForFunction(
    (n) => timegridLab.stats().strokes === n,
    JSON.parse(data).strokes.length,
  );
  await page.selectOption("#view", "single");
  await flush();
  pixelsEqual(await hash(), savedHash);
  assert.equal(await page.evaluate(() => timegridLab.serialize()), data);
  check(
    "real download, page destruction, open and pixel (RGB tolerance 2) roundtrip",
  );
  await page.setInputFiles("#file", {
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"wrong"}'),
  });
  await page.waitForFunction(() =>
    document.querySelector("#status").textContent.includes("Could not open"),
  );
  assert.equal(await page.evaluate(() => timegridLab.serialize()), data);
  check("bad file leaves current document intact");
  await page.click("#zoomIn");
  await page.click("#zoomIn");
  await page.click("#fit");
  await flush();
  assert.equal(await page.evaluate(() => timegridLab.serialize()), data);
  pixelsEqual(await hash(), savedHash);
  await page.click("#clear");
  await flush();
  await page.click("#undo");
  await flush();
  pixelsEqual(await hash(), savedHash);
  check("zoom and Clear/Undo preserve contours and pixels");
  await page.selectOption("#view", "grid");
  await page.click("#play");
  await page.waitForTimeout(350);
  await page.click("#play");
  assert.equal(await page.evaluate(() => timegridLab.serialize()), data);
  check("playback preserves drawings");
  await page.screenshot({ path: path.join(out, "desktop.png") });
  const cacheStress = await page.evaluate(() => {
    const c = timegridLab.cache();
    c.clear();
    c.budget = 300000;
    const old = timegridLab.serialize();
    for (let i = 0; i < 96; i++) {
      const d = timegridLab.document();
      timegridLab.add([
        timegridLab.createStroke({
          id: d.newId(),
          surface: "frame-" + i,
          points: [
            [20, 30, 0.5],
            [900, 500, 0.5],
          ],
          size: 70,
        }),
      ]);
    }
    const scratch = document.createElement("canvas");
    scratch.width = 1024;
    scratch.height = 576;
    const sc = scratch.getContext("2d");
    c.draw(sc, "frame-0", { x: 0, y: 0, w: 1024, h: 576 });
    const first = scratch.toDataURL();
    for (let i = 1; i < 96; i++)
      c.draw(sc, "frame-" + i, { x: 0, y: 0, w: 1024, h: 576 });
    sc.clearRect(0, 0, 1024, 576);
    c.draw(sc, "frame-0", { x: 0, y: 0, w: 1024, h: 576 });
    const exact = first === scratch.toDataURL(),
      stats = c.stats();
    timegridLab.load(old);
    scratch.width = 0;
    return { exact, stats };
  });
  assert.ok(cacheStress.exact);
  assert.ok(cacheStress.stats.evictions > 0);
  assert.ok(cacheStress.stats.bytes <= cacheStress.stats.budget);
  check("LRU eviction obeys budget and reconstructs exact tiles", cacheStress);
  const report = await page.evaluate(() => timegridLab.benchmark());
  report.interactiveRawBeforeReload = interactiveBeforeReload;
  report.checks = checks;
  report.browser = browser.version();
  report.deviceTesting =
    "Desktop automation and mobile emulation only. No physical phone or pen.";
  report.gpu = await page.evaluate(() => {
    const c = document.createElement("canvas"),
      gl = c.getContext("webgl");
    if (!gl) return null;
    const x = gl.getExtension("WEBGL_debug_renderer_info");
    return x
      ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
  });
  fs.writeFileSync(
    path.join(out, "benchmark.json"),
    JSON.stringify(report, null, 2),
  );
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const phone = await mobile.newPage();
  phone.on("pageerror", (e) => errors.push(e.message));
  await phone.goto(url.replace("?verifyPixels=1", ""));
  await phone.waitForFunction(() => window.timegridLab?.layout().length === 96);
  await phone.evaluate(() => timegridLab.flush());
  assert.equal(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await phone.selectOption("#view", "single");
  const mb = await phone.locator("#canvas").boundingBox();
  await phone.touchscreen.tap(mb.x + mb.width * 0.5, mb.y + mb.height * 0.5);
  await phone.evaluate(() => timegridLab.flush());
  assert.ok(await phone.evaluate(() => timegridLab.stats().strokes > 0));
  await phone.screenshot({
    path: path.join(out, "phone-emulation.png"),
    fullPage: true,
  });
  check("390px touch emulation draws, no horizontal overflow");
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(out, "checks.json"),
    JSON.stringify(
      { url, checks, errors, date: new Date().toISOString() },
      null,
      2,
    ),
  );
  await browser.close();
  console.log(
    JSON.stringify({
      checks: checks.length,
      benchmark: report.cases.map((c) => ({
        frames: c.frames,
        strokes: c.strokes,
        cache: c.cache.bytes,
        cold: c.coldRenderMs,
        warm: c.warmRenderMs.p95,
      })),
    }),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
