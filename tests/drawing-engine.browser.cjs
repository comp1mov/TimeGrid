// Reproducible drawing baseline and pixel parity against an unchanged checkout.
// Uses deterministic raster frames: video decoding is outside this benchmark.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(process.env.TEST_ROOT || path.join(__dirname, '..'));
const output = path.resolve(process.env.DRAWING_OUTPUT || path.join(root, '.timegrid-bench/drawing.json'));
const isDrawingRelease = JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version.includes('-drawing.');
const referencePath = process.env.DRAWING_REFERENCE || (isDrawingRelease && path.join(__dirname,'../docs/drawing-evidence/2026-10-19/baseline-28.34-expanded.json'));
const reference = referencePath && JSON.parse(fs.readFileSync(referencePath));
const exposed = ['renderGrid', 'applyFrameTargetAspect', 'applyFrameImgTransform', 'updateTransform',
  'toggleDrawMode', 'setDrawTarget', 'setViewMode', 'resizeDrawCanvas', 'getFrameAtPoint',
  'getCanvasPointXY', 'compositeAllLayers', 'drawExportDrawings', 'hardClearAllDrawingsAndUndo',
  'updateOnionForItem', 'endStroke', 'ensureFrameSheet', 'applyTemplateToFrames', 'drawCanvas', 'frameSheetCanvas',
  'bgCanvas', 'bgCanvasSingle', 'tplCanvas', 'templateFrameCanvas', 'drawUndoStack', 'restoreUndoEntry'];
const summarize = xs => {
  const a = [...xs].sort((a,b) => a-b);
  return { n: a.length, median: a[Math.floor(a.length/2)] || 0, p95: a[Math.min(a.length-1, Math.ceil(a.length*.95)-1)] || 0, max: a.at(-1) || 0 };
};
(async () => {
  const port = Number(process.env.TEST_PORT || 5186);
  const server = spawn(process.execPath, [path.join(root,'node_modules/vite/bin/vite.js'), '--host','127.0.0.1','--port',String(port),'--strictPort'], {cwd:root, windowsHide:true, stdio:['ignore','pipe','pipe']});
  let log = ''; server.stdout.on('data', d => log += d); server.stderr.on('data', d => log += d);
  let browser;
  try {
    for(let i=0;i<100;i++) {
      if(server.exitCode != null) throw Error(log);
      try { if((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {}
      await new Promise(r=>setTimeout(r,100));
    }
    browser = await chromium.launch({channel:'msedge',headless:true});
    const result = { version: JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version,
      date: new Date().toISOString(), browser: browser.version(), fixture: 'deterministic 1920x1080 frames; no video decoding',
      viewport:{width:1440,height:1000}, dpr:1, cases:[] };
    for(const count of [24,96]) for(const quality of [.125,.5]) {
      const page = await browser.newPage({viewport:result.viewport,deviceScaleFactor:1});
      const errors=[]; page.on('pageerror', e=>errors.push(e.message));
      await page.addInitScript(() => {
        window.__metrics={rects:0,times:{}};
        const original=Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect=function(...args){ __metrics.rects++; return original.apply(this,args); };
        // Synthetic pen/touch exercise the adapters, not hardware pointer capture.
        const capture=Element.prototype.setPointerCapture;
        Element.prototype.setPointerCapture=function(id){if(id!==9)return capture.call(this,id);};
      });
      await page.route('**/src/js/main.js*', async route => {
        const response=await route.fetch(); let source=await response.text();
        const end=source.lastIndexOf('})();'); assert.ok(end>0);
        const wrap=['getFrameAtPoint','drawFrameStrokeResampled','compositeAllLayers'].map(name=>
          `{const original=${name}; ${name}=function(...args){const t=performance.now();try{return original.apply(this,args);}finally{(__metrics.times.${name} ||= []).push(performance.now()-t);}};}`).join('\n');
        await route.fulfill({response,body:source.slice(0,end)+wrap+`\nwindow.__draw={${exposed.join(',')}, geometry:()=>typeof getDrawingGeometry==='function'?getDrawingGeometry():null};`+source.slice(end)});
      });
      await page.goto(`http://127.0.0.1:${port}`,{waitUntil:'networkidle'});
      await page.evaluate(async ({count,quality}) => {
        const s=_fgState, c=document.createElement('canvas'); c.width=1920*quality; c.height=1080*quality;
        const ctx=c.getContext('2d');ctx.fillStyle='#6586a3';ctx.fillRect(0,0,c.width,c.height);
        const img=new Image();img.src=c.toDataURL();await img.decode();
        Object.assign(s,{videoWidth:1920,videoHeight:1080,captureW:c.width,captureH:c.height,quality,
          frames:Array.from({length:count},(_,i)=>({img,dataUrl:img.src,frameNumber:i,time:i/24})),gridCols:8,cellSize:1,
          spacing:12,showTimecode:false,showInfoCard:false,autoFit:false,scale:.48,panX:0,panY:0,
          drawSize:7,drawColor:'#ed3367',drawOpacity:1,brushType:'round',drawLongStroke:false,drawOneFrame:false,
          exportDrawings:true,exportShowMetadata:false,frameTargetAspect:'auto'});
        document.getElementById('dropZone').classList.add('hidden');
        __draw.applyFrameTargetAspect(); __draw.renderGrid(); __draw.updateTransform();
        window.__settle=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        window.__digest=async c=>{
          if(!c.width||!c.height)return {w:c.width,h:c.height,empty:true};
          const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
          const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(b=>b.toString(16).padStart(2,'0')).join('');
          let pixels=0;for(let i=3;i<data.length;i+=4)if(data[i])pixels++;
          return {w:c.width,h:c.height,hash,pixels};
        };
        window.__size=()=>({w:__draw.frameSheetCanvas.width,h:__draw.frameSheetCanvas.height,bytes:__draw.frameSheetCanvas.width*__draw.frameSheetCanvas.height*4});
        window.__stroke=async(target,mode='mouse',erase=false)=>{
          __draw.setDrawTarget(target);_fgState.drawEraser=erase;await __settle();
          const cells=[...document.querySelectorAll('.frame-item')].filter(c=>c.getBoundingClientRect().width>0);
          const canvas=target==='template'?__draw.templateFrameCanvas:__draw.drawCanvas;
          const a=(target==='template'?canvas:cells[0]).getBoundingClientRect(),b=(target==='template'?canvas:cells.at(-1)).getBoundingClientRect();
          const points=Array.from({length:15},(_,i)=>({clientX:a.left+a.width*.2+(b.right-b.width*.2-a.left-a.width*.2)*i/14,clientY:a.top+a.height*.25+(b.bottom-b.height*.25-a.top-a.height*.25)*i/14}));
          __metrics={rects:0,times:{}};
          for(let i=0;i<points.length;i++) {
            if(mode==='mouse')canvas.dispatchEvent(new MouseEvent(i?'mousemove':'mousedown',{...points[i],button:0,buttons:1,bubbles:true,cancelable:true}));
            else {
              const e=new PointerEvent(i?'pointermove':'pointerdown',{...points[i],pointerType:mode,pointerId:9,isPrimary:true,button:0,buttons:1,bubbles:true,cancelable:true});
              if(i)Object.defineProperty(e,'getCoalescedEvents',{value:()=>[e]});
              canvas.dispatchEvent(e);
            }
            await new Promise(r=>requestAnimationFrame(r));
          }
          canvas.dispatchEvent(mode==='mouse'?new MouseEvent('mouseup',{button:0,bubbles:true}):new PointerEvent('pointerup',{pointerType:mode,pointerId:9,bubbles:true}));
          await __settle(); return structuredClone(__metrics);
        };
        await __settle();
      },{count,quality});
      const before=await page.evaluate(()=>__size());
      await page.evaluate(async()=>{__draw.toggleDrawMode();await __settle();});
      const opened=await page.evaluate(()=>__size());
      const metrics=await page.evaluate(()=>__stroke('frame'));
      const painted=await page.evaluate(()=>__digest(__draw.frameSheetCanvas));
      assert.ok(painted.pixels>0);
      if(count===24&&quality===.125){
        const fixture=path.join(referencePath?path.dirname(referencePath):path.dirname(output),'legacy-28.34-frm.png');
        if(!reference){
          fs.mkdirSync(path.dirname(fixture),{recursive:true});
          const png=await page.evaluate(()=>__draw.frameSheetCanvas.toDataURL().split(',')[1]);
          fs.writeFileSync(fixture,Buffer.from(png,'base64'));
        }else{
          const loaded=await page.evaluate(async b64=>{
            const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
            _fgState.savePoints[2]={frameSheetBlob:new Blob([bytes],{type:'image/png'})};
            __draw.frameSheetCanvas.width=0;__draw.frameSheetCanvas.height=0;
            await document.getElementById('savePointLoad3').onclick();
            return __digest(__draw.frameSheetCanvas);
          },fs.readFileSync(fixture).toString('base64'));
          assert.deepEqual(loaded,painted,'legacy 28.34 PNG slot');
        }
      }
      const checks=await page.evaluate(async()=>{
        const d=__draw, results={};
        // Real PNG-backed save slot round-trip, then restore the painted sheet.
        await document.getElementById('savePointSave1').onclick();
        d.frameSheetCanvas.getContext('2d').clearRect(0,0,d.frameSheetCanvas.width,d.frameSheetCanvas.height);
        await document.getElementById('savePointLoad1').onclick();
        results.roundTrip=await __digest(d.frameSheetCanvas);
        // Export drawings onto a transparent surface, with one tile per frame.
        const c=document.createElement('canvas'); c.width=8*120;c.height=Math.ceil(_fgState.frames.length/8)*68;
        for(let i=0;i<_fgState.frames.length;i++)d.drawExportDrawings(c.getContext('2d'),i%8*120,Math.floor(i/8)*68,120,68,i);
        results.export=await __digest(c);
        document.getElementById('drawUndo').onclick(); await __settle();results.undo=await __digest(d.frameSheetCanvas);
        await __stroke('background');results.bg=await __digest(d.bgCanvas);
        await __stroke('template');results.tpl=await __digest(d.tplCanvas);
        await __stroke('frame','pen');results.pen=await __digest(d.frameSheetCanvas);
        await __stroke('frame','touch',true);results.touchErase=await __digest(d.frameSheetCanvas);
        return results;
      });
      assert.equal(checks.roundTrip.hash,painted.hash,'PNG save slot changed pixels');
      // 28.34 leaves a few edge pixels after a cross-cell undo; preserve and report
      // that baseline separately instead of masking it as a passing full clear.
      assert.ok(checks.undo.pixels<painted.pixels,'undo should remove the stroke');
      assert.ok(checks.export.pixels>0 && checks.bg.pixels>0 && checks.tpl.pixels>0);
      const item={count,quality,before,opened,painted,checks,rects:metrics.rects,times:Object.fromEntries(Object.entries(metrics.times).map(([k,v])=>[k,summarize(v)]))};
      if(count===24&&quality===.125) item.extended=await page.evaluate(async()=>{
        const d=__draw,s=_fgState,out={};
        // Real DOM changes, including same-task invalidation and live frame IDs.
        function checkHits(){
          const canvasRect=d.drawCanvas.getBoundingClientRect(),sx=d.drawCanvas.width/canvasRect.width,sy=d.drawCanvas.height/canvasRect.height;
          const cells=[...document.querySelectorAll('.frame-item')];
          for(let i=0;i<cells.length;i++){
            const r=cells[i].getBoundingClientRect();if(!r.width||!r.height)continue;
            const x=r.left+r.width*.5,y=r.top+r.height*.5,p=d.getCanvasPointXY(x,y),h=d.getFrameAtPoint(p);
            if(!h||h.cellEl!==cells[i]||Math.abs(h.localX-r.width*sx*.5)>.001||Math.abs(h.localY-r.height*sy*.5)>.001)throw Error('stale geometry at cell '+i);
          }
          const el=cells[0],r=el.getBoundingClientRect(),p=d.getCanvasPointXY(r.left+r.width/2,r.top+r.height/2),old=el.dataset.frameIdx;
          el.dataset.frameIdx='17';if(d.getFrameAtPoint(p).frameIdx!==17)throw Error('cached frame ID');el.dataset.frameIdx=old;
        }
        checkHits();s.panX+=37;s.panY-=23;s.scale=.731;d.updateTransform();checkHits();
        d.setViewMode('single',{fit:false});checkHits();await __settle();checkHits();
        await __stroke('background');out.bgSingle=await __digest(d.bgCanvasSingle);
        d.setViewMode('grid',{fit:false});await __settle();
        s.gridCols=6;s.spacing=0;s.frameTargetAspect='1:1';d.applyFrameTargetAspect();d.renderGrid();await __settle();checkHits();
        s.frameImgRot=37;s.frameImgScaleX=-1;d.applyFrameImgTransform();checkHits();
        d.setDrawTarget('frame');s.drawOnion=true;for(const el of document.querySelectorAll('.frame-item'))d.updateOnionForItem(el,Number(el.dataset.frameIdx));
        out.onion=await __digest(document.querySelector('canvas.frame-onion'));
        s.refFrameSource=s.frames[0].img;s.refFrameVisible=true;s.refFrameOpacity=.3;
        d.compositeAllLayers();out.reference=await __digest(d.drawCanvas);
        // All brush types remain deterministic with a fixed spray RNG.
        for(const brush of ['round','spray','pencil','calligraphy']){
          d.hardClearAllDrawingsAndUndo();s.brushType=brush;
          let seed=1234;const random=Math.random;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
          try{await __stroke('frame');}finally{Math.random=random;}
          out[brush]=await __digest(d.frameSheetCanvas);
        }
        d.hardClearAllDrawingsAndUndo();s.brushType='round';s.drawLongStroke=true;s.isPlaying=true;s.longStrokeFade=0;
        await __stroke('frame');s.isPlaying=false;s.drawLongStroke=false;out.longStroke=await __digest(d.frameSheetCanvas);
        d.hardClearAllDrawingsAndUndo();await __stroke('template');d.applyTemplateToFrames();out.baked=await __digest(d.frameSheetCanvas);
        return out;
      });
      if(reference){const ref=reference.cases.find(c=>c.count===count&&c.quality===quality);assert.deepEqual(item.painted,ref.painted);assert.deepEqual(item.checks,ref.checks);assert.equal(before.bytes,0);assert.equal(opened.bytes,0);assert.ok(item.rects<ref.rects/4,'geometry reads should fall substantially');}
      if(reference&&item.extended)assert.deepEqual(item.extended,reference.cases.find(c=>c.count===count&&c.quality===quality).extended);
      if(reference){
        const empty=await page.evaluate(async()=>{
          __draw.hardClearAllDrawingsAndUndo();await __settle();
          _fgState.drawOnion=true;for(const el of document.querySelectorAll('.frame-item'))__draw.updateOnionForItem(el,Number(el.dataset.frameIdx));
          __draw.drawExportDrawings(document.createElement('canvas').getContext('2d'),0,0,100,100,0);
          await document.getElementById('savePointSave2').onclick();
          __draw.setDrawTarget('frame');
          __draw.drawCanvas.dispatchEvent(new MouseEvent('mousedown',{clientX:-10000,clientY:-10000,button:0,bubbles:true}));
          __draw.endStroke();
          return {bytes:__size().bytes,savedBlob:!!_fgState.savePoints[1].frameSheetBlob};
        });
        assert.deepEqual(empty,{bytes:0,savedBlob:false});
      }
      assert.deepEqual(errors,[]);
      result.cases.push(item);console.log(JSON.stringify(item));await page.close();
    }
    fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
    console.log('Evidence: '+output);
  } finally { if(browser)await browser.close();server.kill(); }
})().catch(e=>{console.error(e);process.exitCode=1});
