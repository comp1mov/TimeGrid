const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const fs=require('fs');
const out='docs/drawing-evidence/2026-10-26-live-input-review';
fs.mkdirSync(out,{recursive:true});
const pct=(a,p)=>[...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*p))]||0;
const summarize=a=>({n:a.length,p50:pct(a,.5),p95:pct(a,.95),max:Math.max(0,...a),firstThirdP95:pct(a.slice(0,Math.ceil(a.length/3)),.95),lastThirdP95:pct(a.slice(-Math.ceil(a.length/3)),.95)});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),results=[];
 for(const config of [{version:3,type:'round',softness:0},{version:4,type:'round',softness:0},{version:4,type:'round',softness:70},{version:4,type:'spray',softness:0},{version:4,type:'spray',softness:70}]){
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://comp1mov.github.io/TimeGrid/drawing/28.35.0-drawing.'+config.version+'/drawing-lab.html');
  await page.waitForFunction(()=>window.timegridLab?.layout().length===96);
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('#sizeNumber').fill('80');
  if(config.version===4){await page.selectOption('#brushType',config.type);await page.locator('#softness').fill(String(config.softness))}
  await page.uncheck('#velocity');await page.evaluate(()=>timegridLab.flush());
  const r=await page.evaluate(()=>{
   const m=timegridLab.stats().metrics;for(const k of ['inputMs','geometryMs','renderMs','eventToRenderEndMs'])m[k]=[];
   const b=document.querySelector('#canvas').getBoundingClientRect(),a=timegridLab.layout()[0],z=timegridLab.layout()[95];
   return{x:b.x+a.x,y:b.y+a.y,w:z.x+z.w-a.x,h:z.y+z.h-a.y}
  });
  await page.mouse.move(r.x+r.w*.08,r.y+r.h*.5);await page.mouse.down();
  const frames=await page.evaluate(async r=>{
   const c=document.querySelector('#canvas'),durations=[];let last=performance.now();
   for(let i=1;i<=240;i++){
    await new Promise(requestAnimationFrame);let now=performance.now();durations.push(now-last);last=now;
    const t=i/240;
    c.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:1,pointerType:'mouse',buttons:1,pressure:.5,clientX:r.x+r.w*(.08+.84*t),clientY:r.y+r.h*(.5+.12*Math.sin(t*Math.PI*2))}));
   }
   await timegridLab.flush();return durations;
  },r);
  const live=await page.evaluate(()=>({metrics:timegridLab.stats().metrics,cache:timegridLab.stats().cache,status:document.querySelector('#status').textContent}));
  await page.mouse.move(r.x+r.w*.92,r.y+r.h*.5);const t=Date.now();await page.mouse.up();await page.evaluate(()=>timegridLab.flush());
  const end=await page.evaluate(()=>({strokes:timegridLab.document().strokes.map(s=>({points:s.points.length,stamps:s.stamps?.length||0,placements:s.placements.length})),status:document.querySelector('#status').textContent}));
  const report={config,url:page.url(),live:Object.fromEntries(['inputMs','geometryMs','renderMs','eventToRenderEndMs'].map(k=>[k,summarize(live.metrics[k])])),callbackIntervals:summarize(frames),releaseAndFlushWallMs:Date.now()-t,cache:live.cache,end,errors,raw:{metrics:live.metrics,callbackIntervals:frames}};
  results.push(report);fs.writeFileSync(out+'/results.json',JSON.stringify({date:new Date().toISOString(),browser:browser.version(),method:'Standard Edge headless desktop, native down/up with synthetic pointermove on each rAF. 240 samples, same logical sheet path and size 80. Callback intervals and JS durations, not physical input or GPU presentation latency.',results},null,2));
  console.log(JSON.stringify({...report,raw:undefined}));await page.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
