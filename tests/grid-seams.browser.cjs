// Pixel regressions for the real grid renderers and browser preview.
// Run against Vite: PLAYWRIGHT_MODULE can point to an installed Playwright package.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'timegrid-seams-'));
const exposed = ['renderMp4GridFrame', 'getDeterministicVideoExportLayout', 'generateCellOrder',
  'renderGrid', 'updateTransform', 'drawFrameCell', 'drawFrameImageOverlay', 'drawFrameDiffSource',
  'drawChronophotoStack', 'exportImage', 'applyFrameTargetAspect'];
(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, acceptDownloads: true, deviceScaleFactor: Number(process.env.DEVICE_SCALE) || 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/src/js/main.js*', async route => {
      const response = await route.fetch();
      const source = await response.text();
      const end = source.lastIndexOf('})();');
      assert.ok(end > 0);
      await route.fulfill({ response, body: source.slice(0, end) +
        `window.__seams = {${exposed.join(',')}};` + source.slice(end) });
    });
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5180', { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      const s = window._fgState;
      Object.assign(s, { videoWidth: 608, videoHeight: 1080, captureW: 304, captureH: 540,
        frames: [], gridCols: 8, spacing: 0, frameTarget: 1, frameTargetAspect: 'auto',
        frameImgScale: 1, frameImgScaleX: 1, frameImgScaleY: 1, frameImgOpacity: 1,
        frameImgOffX: 0, frameImgOffY: 0, frameImgRot: 0,
        exportShowMetadata: false, showTimecode: false, chronoEnabled: false,
        exportQuality: 'hd', frameBgColor: '#000000', frameBgOpacity: 1 });
      const canvas = document.createElement('canvas'); canvas.width = 304; canvas.height = 540;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#cccccc'; ctx.fillRect(0, 0, 304, 540);
      const img = new Image(); img.src = canvas.toDataURL(); await img.decode();
      s.frames = Array.from({ length: 24 }, (_, i) => ({ dataUrl: img.src, img, frameNumber: i, time: i / 24 }));
      window.__pixelStats = canvas => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let min = 255, max = 0;
        for (let i = 0; i < pixels.length; i += 4) { min = Math.min(min, pixels[i]); max = Math.max(max, pixels[i]); }
        return { min, max };
      };
      document.getElementById('dropZone').classList.add('hidden');
      __seams.applyFrameTargetAspect(); __seams.renderGrid();
    });
    const renders = await page.evaluate(() => {
      const s = _fgState, results = [];
      for (const dims of [[608, 1080], [609, 1081]]) {
        [s.videoWidth, s.videoHeight] = dims;
        for (const quality of ['low', 'medium', 'hd', 'high', 'max']) {
          s.exportQuality = quality;
          const pack = __seams.getDeterministicVideoExportLayout('grid', 3);
          const c = document.createElement('canvas'); c.width = pack.canvasW; c.height = pack.canvasH;
          __seams.renderMp4GridFrame(c.getContext('2d'), c.width, c.height, s.frames.map(f => f.img), 0,
            __seams.generateCellOrder(24, 8), 3, s.videoWidth / s.videoHeight, 0, 0, 0, pack.layout);
          results.push({ dims, quality, w: c.width, h: c.height, ...__pixelStats(c) });
        }
      }
      Object.assign(s, { videoWidth: 608, videoHeight: 1080, exportQuality: 'hd' });
      return results;
    });
    for (const result of renders) assert.deepEqual([result.min, result.max], [204, 204], JSON.stringify(result));

    const layers = await page.evaluate(async () => {
      const s = _fgState, img = s.frames[0].img, results = [];
      for (const fn of ['drawFrameCell', 'drawFrameImageOverlay', 'drawFrameDiffSource']) {
        const c = document.createElement('canvas'); c.width = 135; c.height = 239;
        __seams[fn](c.getContext('2d'), img, 0, 0, c.width, c.height);
        results.push({ fn, ...__pixelStats(c) });
      }
      s.chronoEnabled = true; s.chronoBlend = 'exposure'; s.chronoDepth = 5; s.chronoOpacity = 1;
      const c = document.createElement('canvas'); c.width = 135; c.height = 239;
      __seams.drawFrameCell(c.getContext('2d'), img, 0, 0, 135, 239);
      __seams.drawChronophotoStack(c.getContext('2d'), [1, 2, 3, 4, 5], 0, 0, 135, 239, { currentFrameIdx: 0 });
      results.push({ fn: 'exposure', ...__pixelStats(c) });
      s.chronoEnabled = false;
      // Explicit square target must retain letterboxing.
      s.frameTargetAspect = '1:1';
      const square = document.createElement('canvas'); square.width = square.height = 200;
      __seams.drawFrameCell(square.getContext('2d'), img, 0, 0, 200, 200);
      results.push({ fn: 'square', ...__pixelStats(square) });
      s.frameTargetAspect = 'auto';
      // A native-size single frame, including its one-pixel border, survives reimport unchanged.
      const source = document.createElement('canvas'); source.width = 304; source.height = 540;
      const ctx = source.getContext('2d'); ctx.fillStyle = '#08c'; ctx.fillRect(0, 0, 304, 540);
      ctx.fillStyle = '#f80'; ctx.fillRect(1, 1, 302, 538);
      let current = source;
      for (let pass = 0; pass < 2; pass++) {
        const next = document.createElement('canvas'); next.width = 304; next.height = 540;
        __seams.drawFrameCell(next.getContext('2d'), current, 0, 0, 304, 540);
        const decoded = new Image(); decoded.src = next.toDataURL(); await decoded.decode(); current = decoded;
      }
      ctx.drawImage(current, 0, 0);
      results.push({ fn: 'border', edge: [...ctx.getImageData(0, 0, 1, 1).data], center: [...ctx.getImageData(1, 1, 1, 1).data] });
      return results;
    });
    for (const layer of layers.slice(0, 4)) assert.deepEqual([layer.min, layer.max], [204, 204], layer.fn);
    assert.deepEqual([layers[4].min, layers[4].max], [0, 204]);
    assert.deepEqual(layers[5].edge, [0, 136, 204, 255]);
    assert.deepEqual(layers[5].center, [255, 136, 0, 255]);

    // Export through the actual still-download path, not just a drawing helper.
    const downloadPromise = page.waitForEvent('download');
    await page.evaluate(() => { _fgState.exportFormat = 'png'; return __seams.exportImage(); });
    const download = await downloadPromise;
    const file = path.join(output, download.suggestedFilename()); await download.saveAs(file);
    const still = await page.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0); return { w: c.width, h: c.height, ...__pixelStats(c) };
    }, fs.readFileSync(file).toString('base64'));
    assert.deepEqual([still.min, still.max], [204, 204], JSON.stringify(still));

    const preview = [];
    for (const zoom of [1, 1.373, 5.6978]) {
      await page.evaluate(zoom => {
        const s = _fgState; s.scale = zoom; s.panX = 0.3; s.panY = 0.3;
        __seams.updateTransform();
        const wrap = document.querySelector('.frame-image-wrap').getBoundingClientRect();
        s.panX += 500 - wrap.right; s.panY += 500 - wrap.bottom;
        __seams.updateTransform();
      }, zoom);
      const shot = await page.screenshot({ clip: { x: 480, y: 480, width: 40, height: 40 } });
      const stats = await page.evaluate(async b64 => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0); return __pixelStats(c);
      }, shot.toString('base64'));
      preview.push({ zoom, ...stats });
      fs.writeFileSync(path.join(output, 'preview-'+zoom+'.png'), shot);
      assert.deepEqual([stats.min, stats.max], [204, 204], JSON.stringify(preview));
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ renders, layers, still, preview, output }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
