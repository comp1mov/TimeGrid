import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDrawingHitMap, hitDrawingMap } from '../src/js/drawing-geometry.mjs';

// Independent reference for the legacy first-containing/nearest-gap rule.
function legacy(rects,p,tol) {
  let best=null,distance=Infinity;
  for(const r of rects) {
    if(p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h)
      return {rect:r,localX:p.x-r.x,localY:p.y-r.y,snapped:false};
  }
  for(const r of rects) {
    const x=Math.min(r.x+r.w,Math.max(r.x,p.x)),y=Math.min(r.y+r.h,Math.max(r.y,p.y));
    const d=(p.x-x)**2+(p.y-y)**2;
    if(Math.abs(p.x-x)<=tol&&Math.abs(p.y-y)<=tol&&d<distance){best=r;distance=d;}
  }
  return best?{rect:best,localX:Math.min(best.w,Math.max(0,p.x-best.x)),localY:Math.min(best.h,Math.max(0,p.y-best.y)),snapped:true}:null;
}
test('regular, partial rows, seams and gaps match the legacy rule at edges and off-grid',()=>{
  for(const count of [1,24,91,96])for(const gap of [0,1,12,48])for(const tol of [0,12,22,100]) {
    const rects=Array.from({length:count},(_,i)=>({x:-10+i%8*(60+gap),y:12+Math.floor(i/8)*(34+gap),w:60,h:34,i}));
    const map=buildDrawingHitMap(rects,8);assert.ok(map.regular);
    const points=rects.flatMap(r=>[-tol-1,0,30,60,60+tol].flatMap(x=>[-tol-1,0,17,34,34+tol].map(y=>({x:r.x+x,y:r.y+y}))));
    for(const p of points)assert.deepEqual(hitDrawingMap(map,p,tol),legacy(rects,p,tol));
  }
});
test('irregular and hidden cells preserve DOM ordering and snapping',()=>{
  const rects=[{x:0,y:0,w:40,h:20},{x:0,y:0,w:0,h:0},{x:55.7,y:2,w:37,h:29},{x:-10,y:50,w:90,h:35}];
  const map=buildDrawingHitMap(rects,2);assert.equal(map.regular,null);
  for(let x=-30;x<150;x+=3)for(let y=-30;y<100;y+=3)assert.deepEqual(hitDrawingMap(map,{x,y},22),legacy(rects,{x,y},22));
  assert.equal(hitDrawingMap(map,{x:NaN,y:0},12),null);
});
test('fractional transform rounding only broadens candidates, never changes the hit',()=>{
  const rects=Array.from({length:96},(_,i)=>({x:(i%8)*60.3+(i%3)*.0001,y:Math.floor(i/8)*35.7+(i%2)*.0001,w:60.3,h:35.7}));
  const map=buildDrawingHitMap(rects,8);assert.ok(map.regular);
  for(const r of rects)for(const dx of [-.001,0,.001,r.w-.001,r.w,r.w+.001])for(const dy of [0,r.h]) {
    const p={x:r.x+dx,y:r.y+dy};assert.deepEqual(hitDrawingMap(map,p,12),legacy(rects,p,12));
  }
});
