// Drawing behavior audit. Source is instrumented only in the browser response.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const stable=process.env.STABLE_ROOT||'D:/Antigravity/TimeGrid';
const out=__dirname,port=Number(process.env.TEST_PORT||5199);
const lab=process.env.LAB_URL||'http://127.0.0.1:5197/drawing-lab.html';
const result={date:new Date().toISOString(),stableVersion:JSON.parse(fs.readFileSync(path.join(stable,'package.json'))).version,sourceSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(stable,'src/js/main.js'))).digest('hex'),method:'96 deterministic 160x90 raster frames; desktop Edge. Controlled frame ticks call existing updateAllCells. Synthetic mouse/pen unless explicitly native real-time. No physical device or media decode test.',cases:[],errors:[]};
(async()=>{
let browser;
const server=spawn(process.execPath,[path.join(stable,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:stable,windowsHide:true,stdio:['ignore','pipe','pipe']});
let log='';server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
try{
for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error(log);try{if((await fetch('http://127.0.0.1:'+port)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
browser=await chromium.launch({channel:'msedge',headless:true});result.browser=browser.version();
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.on('pageerror',e=>result.errors.push(e.message));
await page.addInitScript(()=>{const original=Element.prototype.setPointerCapture;Element.prototype.setPointerCapture=function(id){if(id!==91)return original.call(this,id);};});
await page.route('**/src/js/main.js*',async route=>{
 const response=await route.fetch(),source=await response.text(),end=source.lastIndexOf('})();');assert.ok(end>0);
 const names=['renderGrid','applyFrameTargetAspect','updateTransform','toggleDrawMode','setDrawTarget','setViewMode','resizeDrawCanvas','getFrameAtPoint','getCanvasPointXY','compositeAllLayers','drawExportDrawings','drawExportBgLayer','hardClearAllDrawingsAndUndo','updateOnionForItem','endStroke','ensureFrameSheet','applyTemplateToFrames','drawCanvas','frameSheetCanvas','bgCanvas','bgCanvasSingle','tplCanvas','templateFrameCanvas','updateAllCells','startAnimation','stopAnimation','toggleTemplateVisibility','showTemplateFrame'];
 await route.fulfill({response,body:source.slice(0,end)+'\nwindow.__audit={'+names.join(',')+', undo:()=>drawUndoStack, temporal:()=>({isDrawing,holdStampLastFrame,path:longStrokePath.map(p=>({...p})),touched:[...longStrokeTouchedFrames]})};\n'+source.slice(end)});
});
await page.goto('http://127.0.0.1:'+port,{waitUntil:'networkidle'});
await page.evaluate(async()=>{
 const s=_fgState,d=__audit,c=document.createElement('canvas');c.width=160;c.height=90;c.getContext('2d').fillRect(0,0,160,90);const img=new Image();img.src=c.toDataURL();await img.decode();
 Object.assign(s,{videoWidth:1280,videoHeight:720,captureW:160,captureH:90,quality:.125,frames:Array.from({length:96},(_,i)=>({img,dataUrl:img.src,frameNumber:i,time:i/24})),gridCols:8,cellSize:1,spacing:12,showTimecode:false,showInfoCard:false,autoFit:false,scale:.5,panX:0,panY:0,drawSize:10,drawColor:'#ed3367',drawOpacity:1,brushType:'round',drawLongStroke:false,drawOneFrame:false,exportDrawings:true,frameTargetAspect:'auto',animPattern:'sequential',animDirection:'forward',currentTick:0});
 document.getElementById('dropZone').classList.add('hidden');d.applyFrameTargetAspect();d.renderGrid();d.updateTransform();d.toggleDrawMode();
 window.settle=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 window.digest=c=>{if(!c.width||!c.height)return{pixels:0,alpha:0,hash:0};return summarize(c.getContext('2d').getImageData(0,0,c.width,c.height).data,c.width);};
 window.summarize=(a,w)=>{let pixels=0,alpha=0,x=0,y=0,hash=2166136261;for(let i=0;i<a.length;i++){hash=Math.imul(hash^a[i],16777619);if(i%4===3&&a[i]){const n=(i-3)/4;pixels++;alpha+=a[i];x+=(n%w)*a[i];y+=Math.floor(n/w)*a[i];}}return{pixels,alpha,x:alpha?x/alpha:null,y:alpha?y/alpha:null,hash:hash>>>0};};
 window.tiles=()=>{const{frameSheetTileW:w,frameSheetTileH:h,frameSheetCols:cols}=s;const ctx=d.frameSheetCanvas.getContext('2d');return s.frames.map((_,i)=>({frame:i,...summarize(ctx.getImageData(i%cols*w,Math.floor(i/cols)*h,w,h).data,w)}));};
 window.painted=()=>tiles().filter(t=>t.pixels);
 window.firstRect=()=>{const r=document.querySelector('.frame-item').getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};};
 window.point=(u=.5,v=.5)=>{const r=firstRect();return{x:r.x+r.w*u,y:r.y+r.h*v};};
 window.input=(type,p,kind='mouse',canvas=d.drawCanvas)=>{
   if(kind==='mouse')canvas.dispatchEvent(new MouseEvent({down:'mousedown',move:'mousemove',up:'mouseup'}[type],{clientX:p.x,clientY:p.y,button:0,buttons:type==='up'?0:1,bubbles:true,cancelable:true}));
   else{const e=new PointerEvent('pointer'+type,{clientX:p.x,clientY:p.y,pointerType:kind,pointerId:91,isPrimary:true,button:0,buttons:type==='up'?0:1,pressure:.5,bubbles:true,cancelable:true});if(type==='move')Object.defineProperty(e,'getCoalescedEvents',{value:()=>[e]});canvas.dispatchEvent(e);}
 };
 window.reset=async(mode='single',extra={})=>{d.stopAnimation();d.endStroke();d.hardClearAllDrawingsAndUndo();Object.assign(s,{drawTarget:'frame',drawLongStroke:false,drawOneFrame:false,drawEraser:false,drawOpacity:1,drawOnion:false,showTemplateDrawing:true,currentTick:0,gridCols:8,animDirection:'forward',longStrokeFade:0,drawSize:10,...extra});d.showTemplateFrame(false);d.renderGrid();d.setViewMode(mode);d.setDrawTarget('frame');d.resizeDrawCanvas();d.updateAllCells();await settle();};
 window.tick=n=>{s.currentTick=n;d.updateAllCells();};
 await reset();
});
async function audit(name,fn,arg){const data=await page.evaluate(fn,arg);result.cases.push({name,...data});console.log(name,JSON.stringify(data).slice(0,600));}
await audit('held-stationary-regular',async()=>{
 await reset();_fgState.isPlaying=true;const p=point();input('down',p);const trace=[{tick:0,tiles:painted()}];
 for(let t=1;t<=5;t++){tick(t);trace.push({tick:t,tiles:painted()});}input('up',p);_fgState.isPlaying=false;
 const beforeUndo=painted();document.getElementById('drawUndo').onclick();return{trace,beforeUndo,afterUndo:painted()};
});
await audit('held-moving-regular',async()=>{
 await reset();_fgState.isPlaying=true;input('down',point(.2));for(let t=1;t<=5;t++){input('move',point(.2+t*.1));tick(t);}
 input('up',point(.7));_fgState.isPlaying=false;return{tiles:painted()};
});
await audit('same-frame-dedupe-and-loop-revisit',async()=>{
 await reset('single',{drawOpacity:.4});_fgState.isPlaying=true;const p=point();input('down',p);const samples=[];
 for(const t of [0,0,1,1,96,96]){tick(t);samples.push({tick:t,tiles:painted()});}input('up',p);_fgState.isPlaying=false;return{samples};
});
for(const kind of ['mouse','pen'])for(const oneFrame of [false,true])await audit('edge-'+kind+'-1F-'+oneFrame,async({kind,oneFrame})=>{
 await reset('grid',{drawOneFrame:oneFrame,drawSize:30});const p=point(.995,.5);input('down',p,kind);input('up',p,kind);const before=painted();document.getElementById('drawUndo').onclick();return{painted:before,afterUndo:painted()};
},{kind,oneFrame});
for(const kind of ['mouse','pen'])for(const trail of [0,2])await audit('long-'+kind+'-trail-'+trail,async({kind,trail})=>{
 await reset('single',{drawLongStroke:true,longStrokeFade:trail});_fgState.isPlaying=true;input('down',point(.2),kind);input('move',point(.35),kind);
 const trace=[];for(let t=1;t<=4;t++){tick(t);input('move',point(.35+t*.1),kind);trace.push({tick:t,temporal:__audit.temporal(),tiles:painted()});}
 const beforeRelease=painted();input('up',point(.75),kind);const afterRelease=painted();for(let t=5;t<10;t++)tick(t);const afterMoreTicks=painted();_fgState.isPlaying=false;document.getElementById('drawUndo').onclick();return{trace,beforeRelease,afterRelease,afterMoreTicks,afterUndo:painted()};
},{kind,trail});
await audit('column-reflow-and-clear-undo',async()=>{
 await reset('grid');for(let t=0;t<3;t++){tick(t);input('down',point(.25+t*.2));input('up',point(.25+t*.2));}
 const before=tiles();_fgState.gridCols=6;__audit.renderGrid();__audit.ensureFrameSheet();await settle();const after=tiles();
 document.getElementById('drawClear').onclick();const cleared=painted();document.getElementById('drawUndo').onclick();return{samePerFrame:JSON.stringify(before)===JSON.stringify(after),before:before.filter(t=>t.pixels),after:after.filter(t=>t.pixels),cleared,afterClearUndo:painted()};
});
await audit('onion-neighbors-and-no-wrap',async()=>{
 await reset();const d=__audit,s=_fgState,c=d.frameSheetCanvas.getContext('2d'),w=s.frameSheetTileW,h=s.frameSheetTileH,cols=s.frameSheetCols;
 for(const i of [0,2,95]){c.fillStyle=i===95?'#00ff00':'#ff0000';c.fillRect(i%cols*w+20,Math.floor(i/cols)*h+20,8,8);}
 s.drawOnion=true;const el=document.querySelector('.frame-item');d.updateOnionForItem(el,1);const center=digest(el.querySelector('.frame-onion'));d.updateOnionForItem(el,0);const first=digest(el.querySelector('.frame-onion'));return{center,first};
});
await audit('template-bake-undo-and-hidden-export',async()=>{
 await reset();const d=__audit,s=_fgState;d.setDrawTarget('template');await settle();
 const rect=d.templateFrameCanvas.getBoundingClientRect(),p={x:rect.x+rect.width*.5,y:rect.y+rect.height*.5};input('down',p,'mouse',d.templateFrameCanvas);input('up',p,'mouse',d.templateFrameCanvas);
 const tpl=digest(d.tplCanvas);d.applyTemplateToFrames();const baked=painted();document.getElementById('drawUndo').onclick();const restored={tpl:digest(d.tplCanvas),frm:painted()};
 s.showTemplateDrawing=false;const c=document.createElement('canvas');c.width=160;c.height=90;d.drawExportDrawings(c.getContext('2d'),0,0,160,90,0);return{tpl,bakedCount:baked.length,restored,hiddenTemplateExport:digest(c)};
});
await audit('BG-gap-and-separated-views',async()=>{
 await reset('grid');const d=__audit;d.setDrawTarget('background');const cells=[...document.querySelectorAll('.frame-item')],a=cells[0].getBoundingClientRect(),b=cells[1].getBoundingClientRect(),p={x:(a.right+b.left)/2,y:a.y+a.height/2};const hit=d.getFrameAtPoint(d.getCanvasPointXY(p.x,p.y));
 input('down',p);input('up',p);const grid=digest(d.bgCanvas);d.setViewMode('single');await settle();const singleBefore=digest(d.bgCanvasSingle);input('down',point());input('up',point());const singleAfter=digest(d.bgCanvasSingle);return{gapCss:b.left-a.right,hitMaySnap:hit?.snapped,grid,singleBefore,singleAfter};
});
await audit('save-slot-empty-TPL-restoration',async()=>{
 await reset();const d=__audit;await document.getElementById('savePointSave1').onclick();d.setDrawTarget('template');await settle();const r=d.templateFrameCanvas.getBoundingClientRect(),p={x:r.x+r.width/2,y:r.y+r.height/2};input('down',p,'mouse',d.templateFrameCanvas);input('up',p,'mouse',d.templateFrameCanvas);const drawn=digest(d.tplCanvas);await document.getElementById('savePointLoad1').onclick();return{savedEmptyTPL:!_fgState.savePoints[0].templateDrawing,drawn,afterLoad:digest(d.tplCanvas)};
});
await audit('hold-regular-pen',async()=>{
 await reset();_fgState.isPlaying=true;input('down',point(),'pen');for(let t=1;t<=5;t++)tick(t);input('up',point(),'pen');_fgState.isPlaying=false;return{tiles:painted()};
});
await audit('native-real-time-preparation',async()=>{await reset('single');_fgState.animFps=8;return{point:point(),rect:firstRect()};});
const p=await page.evaluate(()=>point());await page.mouse.move(p.x,p.y);await page.evaluate(()=>__audit.startAnimation());await page.mouse.down();await page.waitForTimeout(760);await page.mouse.up();await page.evaluate(()=>__audit.stopAnimation());
await audit('native-real-time-hold',()=>({tiles:painted(),currentTick:_fgState.currentTick,temporal:__audit.temporal()}));
await page.screenshot({path:path.join(out,'stable-single.png')});
const lp=await browser.newPage({viewport:{width:1440,height:1000}});lp.on('pageerror',e=>result.errors.push('lab: '+e.message));
await lp.goto(lab,{waitUntil:'networkidle'});await lp.selectOption('#view','single');await lp.selectOption('#target','frm');await lp.evaluate(()=>timegridLab.reset());await lp.click('#play');
const start=await lp.evaluate(()=>({version:timegridLab.version,frame:timegridLab.stats().activeFrame,rect:timegridLab.layout()[0]}));
const lr=start.rect;await lp.mouse.move(lr.x+lr.w/2,lr.y+lr.h/2+await lp.locator('#canvas').evaluate(c=>c.getBoundingClientRect().top));await lp.mouse.down();const downFrame=await lp.evaluate(()=>timegridLab.stats().activeFrame);await lp.waitForTimeout(760);const upFrame=await lp.evaluate(()=>timegridLab.stats().activeFrame);await lp.mouse.up();await lp.click('#play');
const ld=await lp.evaluate(()=>({version:timegridLab.version,strokes:timegridLab.document().strokes.map(s=>({surface:s.surface,points:s.points.length,placements:s.placements})),stats:timegridLab.stats().activeFrame}));
result.cases.push({name:'lab-native-real-time-hold',downFrame,upFrame,...ld});console.log('lab-native-real-time-hold',JSON.stringify(result.cases.at(-1)));
await lp.screenshot({path:path.join(out,'lab-single.png')});
assert.equal(result.cases.find(c=>c.name==='held-stationary-regular').beforeUndo.length,6);
assert.ok(result.cases.find(c=>c.name==='native-real-time-hold').tiles.length>=4);
assert.ok(ld.strokes.length<upFrame-downFrame);
result.diagnosticAssertions='pass: stable controlled hold paints 6 frames, real-time paints >=4, lab misses intermediate frames';
}finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});