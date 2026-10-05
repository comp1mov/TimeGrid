// Verifies fresh defaults, full-resolution sampling and the real keyboard export.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const page=await browser.newPage({acceptDownloads:true});
  await page.route('**/src/js/main.js*',async route=>{
   const response=await route.fetch(),source=await response.text(),end=source.lastIndexOf('})();');
   await route.fulfill({response,body:source.slice(0,end)+'window.__qualityTest={generateFrames,setViewMode,getDeterministicVideoExportLayout};'+source.slice(end)});
  });
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5181',{waitUntil:'networkidle'});
  assert.equal(await page.locator('#qualitySelect').inputValue(),'1');
  assert.equal(await page.locator('#exportQuality').inputValue(),'max');
  const sampled=await page.evaluate(async()=>{
   const s=_fgState;
   const c=document.createElement('canvas');c.width=1600;c.height=900;
   const ctx=c.getContext('2d');ctx.fillStyle='#267ea0';ctx.fillRect(0,0,1600,900);
   const url=c.toDataURL();
   Object.assign(s,{isSingleImage:true,imageImportMode:'sequence',imageUrls:[url,url],imageUrl:url,
    imageFiles:[new File([''],'full.png'),new File([''],'full2.png')],videoFile:new File([''],'full.png'),
    videoWidth:1600,videoHeight:900,frameCount:2,exportLoops:1,exportShowMetadata:false,showTimecode:false});
   await __qualityTest.generateFrames();__qualityTest.setViewMode('single');
   const img=new Image();img.src=s.frames[0].dataUrl;await img.decode();
   return {quality:s.quality,exportQuality:s.exportQuality,width:img.naturalWidth,height:img.naturalHeight};
  });
  assert.deepEqual(sampled,{quality:1,exportQuality:'max',width:1600,height:900});
  const pending=page.waitForEvent('download');
  await page.locator('body').press('0');
  const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'timegrid-full-')),'full.mp4');
  await(await pending).saveAs(file);
  const dimensions=await page.evaluate(async b64=>{
   const video=document.createElement('video');
   await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(Error('Decode failed'));video.src='data:video/mp4;base64,'+b64;});
   return {width:video.videoWidth,height:video.videoHeight};
  },fs.readFileSync(file).toString('base64'));
  assert.deepEqual(dimensions,{width:1600,height:900});
  // Imported half-size frames remain half-size even if the import dropdown
  // is later changed without regeneration. Grid size is assembled from them.
  const layouts = await page.evaluate(() => {
   const s = _fgState; s.captureW = 800; s.captureH = 450; s.quality = 1;
   s.frames = [...s.frames, ...s.frames]; s.gridCols = 2;
   const result = {};
   for (const setting of ['max', 'half', 'quarter', 'eighth']) {
    s.exportQuality = setting;
    const single = __qualityTest.getDeterministicVideoExportLayout('single');
    const grid = __qualityTest.getDeterministicVideoExportLayout('grid', 2);
    result[setting] = { single: [single.canvasW, single.canvasH], grid: [grid.canvasW, grid.canvasH] };
   }
   s.exportQuality = 'max'; return result;
  });
  assert.deepEqual(layouts.max, {single:[800,450],grid:[1600,900]});
  assert.deepEqual(layouts.half.single,[400,224]);
  assert.deepEqual(layouts.quarter.single,[200,112]);
  assert.deepEqual(layouts.eighth.single,[100,56]);
  const reducedPending=page.waitForEvent('download');await page.locator('body').press('0');
  const reducedFile=path.join(path.dirname(file),'import-half.mp4');await(await reducedPending).saveAs(reducedFile);
  const reducedDimensions=await page.evaluate(async b64=>{
   const v=document.createElement('video');await new Promise((resolve,reject)=>{v.onloadedmetadata=resolve;v.onerror=reject;v.src='data:video/mp4;base64,'+b64;});
   return [v.videoWidth,v.videoHeight];
  },fs.readFileSync(reducedFile).toString('base64'));
  assert.deepEqual(reducedDimensions,[800,450]);
  // An unsupported Max export must never silently try a smaller size.
  await page.evaluate(()=>{window.__attempts=[];VideoEncoder.isConfigSupported=async config=>{__attempts.push([config.width,config.height]);return {supported:false,config};};});
  const dialogPromise=page.waitForEvent('dialog');
  await page.locator('body').press('0');
  const dialog=await dialogPromise;assert.match(dialog.message(),/800×450/);await dialog.dismiss();
  const attempts=await page.evaluate(()=>__attempts);
  assert.ok(attempts.length>0);assert.ok(attempts.every(([w,h])=>w===800&&h===450));
  console.log(JSON.stringify({sampled,dimensions,layouts,reducedDimensions,codecAttempts:attempts.length,file},null,2));
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
