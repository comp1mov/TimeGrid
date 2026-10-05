const {chromium,devices}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const cases=[
   {name:'Desktop',options:{},quality:1},
   {name:'Touch desktop',options:{hasTouch:true},quality:1},
   {name:'iPhone',options:devices['iPhone 13'],quality:0.5},
   {name:'Android',options:devices['Pixel 7'],quality:0.5},
   {name:'iPadOS desktop identity',options:{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',hasTouch:true},ipad:true,quality:0.5}
  ];
  for(const test of cases){
   const context=await browser.newContext(test.options);
   if(test.ipad)await context.addInitScript(()=>{Object.defineProperty(navigator,'platform',{get:()=> 'MacIntel'});Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});});
   const page=await context.newPage();
   await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5181',{waitUntil:'networkidle'});
   assert.equal(await page.locator('#qualitySelect').inputValue(),String(test.quality),test.name);
   assert.equal(await page.evaluate(()=>_fgState.quality),test.quality,test.name);
   assert.equal(await page.locator('#exportQuality').inputValue(),'max');
   // A manual choice is not reset by layout changes.
   const menu=page.locator('#menuToggleBtn');
   await (await menu.isVisible() ? menu : page.locator('#qMenu')).click();
   await page.locator('#qualitySelect').selectOption('0.25');
   await page.setViewportSize({width:900,height:700});
   assert.equal(await page.evaluate(()=>_fgState.quality),0.25);
   console.log(test.name+': '+test.quality+'; manual choice preserved');
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
