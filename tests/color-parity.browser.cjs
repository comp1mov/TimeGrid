const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'timegrid-color-parity-'));
const hooks=['renderGrid','updateAllCells','setViewMode','fitActiveView','renderMp4SingleFrame','renderMp4GridFrame','getDeterministicVideoExportLayout','generateCellOrder','updateColoramaSVG','exportSingleStill','exportMp4'];
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1280,height:900},acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/js/main.js*',async route=>{const response=await route.fetch();const s=await response.text(),i=s.lastIndexOf('})();');await route.fulfill({response,body:s.slice(0,i)+`window.__parity={${hooks.join(',')}};`+s.slice(i)});});
 await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5180',{waitUntil:'networkidle'});
 await page.evaluate(async()=>{
  const s=_fgState;Object.assign(s,{videoWidth:320,videoHeight:180,captureW:320,captureH:180,isSingleImage:true,videoFile:new File([''],'color-parity.png'),frames:[],gridCols:2,frameCount:6,frameTarget:1,spacing:0,previewCellW:320,showTimecode:false,exportShowMetadata:false,exportQuality:'max',exportLoops:1,animFps:14,currentTick:0,frameImgScale:1,frameImgScaleX:1,frameImgScaleY:1,chronoEnabled:true,chronoBlend:'darken',chronoDepth:49,chronoOpacity:1,chronoCascade:false,chronoCleanLoop:false,chronoSeamBlend:false,frameDiffEnabled:true,frameDiffPlateIdx:0,frameDiffPlateMode:'tick',frameDiffPlateStep:3,frameDiffPlateLoopN:1,frameDiffPlateOffset:0,frameDiffOutputMode:'inverted-difference',frameDiffBlend:'inverted-difference',frameDiffOpacity:1});
  Object.assign(s.colorama,{enabled:true,colorA:'#0a0a2e',colorB:'#ff4400',colorC:'#ffee00',blend:'screen',opacity:1,offset:0,cascade:false,speed:0});
  for(let i=0;i<6;i++){const c=document.createElement('canvas');c.width=320;c.height=180;const ctx=c.getContext('2d');for(let j=0;j<4;j++){ctx.fillStyle=`rgb(${30+i*25+j*10},${160-i*20+j*10},${45+i*12+j*15})`;ctx.fillRect(j*80,0,80,180);}const img=new Image();img.src=c.toDataURL();await img.decode();s.frames.push({img,dataUrl:img.src,time:i/14,frameNumber:i});}
  document.getElementById('dropZone').classList.add('hidden');__parity.renderGrid();__parity.setViewMode('single');__parity.updateAllCells();__parity.fitActiveView();
  window.__samples=canvas=>{const ctx=canvas.getContext('2d');return [40,120,200,280].map(x=>[...ctx.getImageData(x,90,1,1).data].slice(0,3));};
 });
 const results=[];
 for(const scenario of ['combined','colorama-only','effects-no-colorama','combined-cc']){
  const rendered=await page.evaluate(async scenario=>{const s=_fgState;s.chronoEnabled=s.frameDiffEnabled=scenario!=='colorama-only';s.colorama.enabled=scenario!=='effects-no-colorama';s.cc.enabled=scenario==='combined-cc';if(s.cc.enabled){s.cc.brightness=1.15;s.cc.contrast=1.2;}s.currentTick=0;__parity.updateAllCells();await Promise.all([...document.querySelectorAll('.frame-item img')].map(im=>im.decode().catch(()=>{})));const pack=__parity.getDeterministicVideoExportLayout('single');const c=document.createElement('canvas');c.width=pack.canvasW;c.height=pack.canvasH;__parity.renderMp4SingleFrame(c.getContext('2d'),c.width,c.height,s.frames.map(f=>f.img),0,0,0,0,pack.layout,false,0);return{pixels:__samples(c),data:c.toDataURL()};},scenario);
  fs.writeFileSync(path.join(out,scenario+'-video-frame.png'),Buffer.from(rendered.data.split(',')[1],'base64'));
  const imgBox=await page.locator('.frame-image-wrap').first().boundingBox();
  const shot=await page.screenshot({clip:imgBox});fs.writeFileSync(path.join(out,scenario+'-preview.png'),shot);
  const preview=await page.evaluate(async b64=>{const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();const c=document.createElement('canvas');c.width=320;c.height=180;c.getContext('2d').drawImage(img,0,0,320,180);return __samples(c);},shot.toString('base64'));
  const pending=page.waitForEvent('download');await page.evaluate(()=>__parity.exportSingleStill('png',Infinity));const download=await pending;const file=path.join(out,scenario+'-still.png');await download.saveAs(file);
  const still=await page.evaluate(async b64=>{const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();const c=document.createElement('canvas');c.width=320;c.height=180;c.getContext('2d').drawImage(img,0,0,320,180);return __samples(c);},fs.readFileSync(file).toString('base64'));
  const diff=(a,b)=>Math.max(...a.flat().map((n,i)=>Math.abs(n-b.flat()[i])));
  results.push({scenario,video:rendered.pixels,preview,still,previewError:diff(rendered.pixels,preview),stillError:diff(rendered.pixels,still)});
 }

 const diff=(a,b)=>Math.max(...a.flat().map((n,i)=>Math.abs(n-b.flat()[i])));
 await page.evaluate(()=>{Object.assign(_fgState,{chronoEnabled:true,frameDiffEnabled:true,currentTick:0});_fgState.cc.enabled=false;_fgState.colorama.enabled=true;__parity.updateAllCells();});
 const jpegPending=page.waitForEvent('download');await page.evaluate(()=>__parity.exportSingleStill('jpeg',Infinity));const jpegFile=path.join(out,'combined.jpg');await(await jpegPending).saveAs(jpegFile);
 const jpeg=await page.evaluate(async b64=>{const im=new Image();im.src='data:image/jpeg;base64,'+b64;await im.decode();const c=document.createElement('canvas');c.width=320;c.height=180;c.getContext('2d').drawImage(im,0,0);return __samples(c);},fs.readFileSync(jpegFile).toString('base64'));
 assert.ok(diff(jpeg,results[0].preview)<=5,'JPEG color mismatch');
 const mp4Pending=page.waitForEvent('download');await page.evaluate(()=>__parity.exportMp4('single'));const mp4File=path.join(out,'combined.mp4');await(await mp4Pending).saveAs(mp4File);
 const decoded=await page.evaluate(async b64=>{const v=document.createElement('video');v.muted=true;await new Promise((resolve,reject)=>{v.onloadeddata=resolve;v.onerror=()=>reject(Error('MP4 decode failed'));v.src='data:video/mp4;base64,'+b64;v.load();});const frames=[];for(const tick of [0,2,4]){await new Promise(resolve=>{v.onseeked=resolve;v.currentTime=(tick+0.1)/14;});const c=document.createElement('canvas');c.width=320;c.height=180;c.getContext('2d').drawImage(v,0,0);const decoded=__samples(c);const pack=__parity.getDeterministicVideoExportLayout('single');__parity.renderMp4SingleFrame(c.getContext('2d'),320,180,_fgState.frames.map(f=>f.img),tick,0,0,0,pack.layout,false,tick);frames.push({tick,decoded,expected:__samples(c)});}return frames;},fs.readFileSync(mp4File).toString('base64'));
 for(const frame of decoded) assert.ok(diff(frame.decoded,frame.expected)<=8,JSON.stringify(frame));
 const grid=[];
 for(const cascade of [false,true]){
  const pixels=await page.evaluate(async cascade=>{const s=_fgState;s.colorama.cascade=cascade;s.currentTick=2;__parity.setViewMode('grid');__parity.updateAllCells();__parity.fitActiveView();await Promise.all([...document.querySelectorAll('.frame-item img')].map(im=>im.decode().catch(()=>{})));const pack=__parity.getDeterministicVideoExportLayout('grid',3);const c=document.createElement('canvas');c.width=pack.canvasW;c.height=pack.canvasH;__parity.renderMp4GridFrame(c.getContext('2d'),c.width,c.height,s.frames.map(f=>f.img),2,__parity.generateCellOrder(6,2),3,320/180,0,0,0,pack.layout);return [0,1].map(cell=>{const temp=document.createElement('canvas');temp.width=320;temp.height=180;temp.getContext('2d').drawImage(c,-cell*320,0);return __samples(temp);});},cascade);
  for(const cell of [0,1]){const box=await page.locator('.frame-image-wrap').nth(cell).boundingBox();const shot=await page.screenshot({clip:box});const preview=await page.evaluate(async b64=>{const im=new Image();im.src='data:image/png;base64,'+b64;await im.decode();const c=document.createElement('canvas');c.width=320;c.height=180;c.getContext('2d').drawImage(im,0,0,320,180);return __samples(c);},shot.toString('base64'));grid.push({cascade,cell,error:diff(pixels[cell],preview)});assert.ok(diff(pixels[cell],preview)<=2,JSON.stringify(grid));}
 }
 console.log(JSON.stringify({out,results,decoded,grid,errors},null,2));
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
 if(!process.env.RECORD_BASELINE){for(const r of results){assert.ok(r.previewError<=2,JSON.stringify(r));assert.ok(r.stillError<=1,JSON.stringify(r));}assert.deepEqual(errors,[]);}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
