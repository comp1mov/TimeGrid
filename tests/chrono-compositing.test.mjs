import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChronoStackPlan } from '../src/js/chrono-compositing.mjs';

const exposure = { chronoBlend: 'exposure', chronoOpacity: 1 };
const composite = (base, ghosts, alphas) => ghosts.reduce((value, ghost, i) => value * (1 - alphas[i]) + ghost * alphas[i], base);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('Exposure computes an equal average instead of an order-dependent opacity stack', () => {
  const plan = buildChronoStackPlan(exposure, [1, 2, 3], 0);
  close(composite(200, [20, 80, 100], plan.alphas), 100);
  close(composite(200, [100, 20, 80], plan.alphas), 100);
  assert.equal(plan.cssBlend, 'normal');
  assert.equal(plan.canvasBlend, 'source-over');
});

test('static background stays constant at any depth or mix', () => {
  for (const depth of [0, 1, 5, 20, 100]) for (const mix of [0, 0.2, 0.5, 1]) {
    const indices = Array.from({ length: depth }, (_, i) => i);
    const plan = buildChronoStackPlan({ ...exposure, chronoOpacity: mix }, indices, 0);
    close(composite(128, indices.map(() => 128), plan.alphas), 128);
  }
});

test('Mix blends the averaged stack with the sharp original frame', () => {
  for (const mix of [0, 0.25, 0.5, 1]) {
    const plan = buildChronoStackPlan({ ...exposure, chronoOpacity: mix }, [1, 2, 3], 0);
    close(composite(200, [20, 80, 100], plan.alphas), 200 * (1 - mix) + 100 * mix);
  }
});

test('Clean Loop null slots are excluded from normalization', () => {
  const plan = buildChronoStackPlan(exposure, [1, null, null], 0);
  close(composite(200, [0, 255, 255], plan.alphas), 100);
  assert.deepEqual(plan.alphas, [0.5, 0, 0]);
  assert.deepEqual(buildChronoStackPlan(exposure, [null, null], 0).alphas, [0, 0]);
});

test('Cascade provides normalized weights instead of reducing overall brightness', () => {
  const plan = buildChronoStackPlan({ ...exposure, chronoCascade: true, chronoCascadeConst: 1 }, [1, 2, 3], 0);
  close(composite(100, [20, 60, 200], plan.alphas), (100 + 20 + 60 * 2 / 3 + 200 / 3) / 3);
});

test('fractional depth has a fractional sample weight and reaches the untouched frame at zero', () => {
  const state = { ...exposure, chronoAnimation: { enabled: true, interpolation: 'linear', keys: [{ frame: 1, percent: 0 }, { frame: 3, percent: 100 }] } };
  assert.deepEqual(buildChronoStackPlan(state, [1, 2, 3], 0).alphas, []);
  const plan = buildChronoStackPlan(state, [1, 2, 3], 1);
  close(composite(100, [20, 200], plan.alphas), (100 + 20 + 0.5 * 200) / 2.5);
});

test('existing blend modes retain their opacity behavior', () => {
  assert.deepEqual(buildChronoStackPlan({ chronoBlend: 'darken', chronoOpacity: 0.6 }, [1, 2, 3], 0, 0.5), {
    cssBlend: 'darken', canvasBlend: 'darken', alphas: [0.3, 0.3, 0.3]
  });
  assert.equal(buildChronoStackPlan({ chronoBlend: 'source-over' }, [1], 0).cssBlend, 'normal');
});
