import test from 'node:test';
import assert from 'node:assert/strict';
import { createChronoKeys, normalizeChronoKeys, evaluateChronoPercent, getChronoAnimatedDepth, getChronoLayerOpacity } from '../src/js/chrono-animation.mjs';

test('default keys cover one loop and never duplicate short clips', () => {
  assert.deepEqual(createChronoKeys(120), [
    { frame: 1, percent: 0 }, { frame: 60, percent: 100 }, { frame: 120, percent: 0 }
  ]);
  for (const n of [0, 1, 2, 3, 5, 120]) {
    const keys = createChronoKeys(n);
    assert.equal(new Set(keys.map(k => k.frame)).size, keys.length);
    assert.ok(keys.every(k => k.frame >= 1 && k.frame <= n));
  }
});

test('key normalization sorts, clamps and resolves duplicates', () => {
  assert.deepEqual(normalizeChronoKeys([
    { frame: 20, percent: 160 }, { frame: 0, percent: -5 },
    { frame: 6, percent: 40 }, { frame: 6, percent: 80 }
  ], 10), [{ frame: 1, percent: 0 }, { frame: 6, percent: 80 }, { frame: 10, percent: 100 }]);
  assert.deepEqual(normalizeChronoKeys([{ frame: 120, percent: 0 }]), [{ frame: 120, percent: 0 }]);
});

test('interpolation uses source frame index, exact keys and held endpoints', () => {
  const keys = [{ frame: 5, percent: 0 }, { frame: 9, percent: 100 }, { frame: 13, percent: 0 }];
  assert.equal(evaluateChronoPercent(keys, 5, 'linear'), 25);
  assert.equal(evaluateChronoPercent(keys, 5, 'smooth'), 15.625);
  assert.equal(evaluateChronoPercent(keys, 7, 'step'), 0);
  assert.equal(evaluateChronoPercent(keys, 8, 'step'), 100);
  assert.equal(evaluateChronoPercent(keys, 11, 'step'), 100);
  assert.equal(evaluateChronoPercent(keys, 12, 'step'), 0);
  assert.equal(evaluateChronoPercent(keys, 0), 0);
  assert.equal(evaluateChronoPercent(keys, 100), 0);
  assert.equal(evaluateChronoPercent([], 0), 100);
  assert.equal(evaluateChronoPercent([{ frame: 8, percent: 42 }], 0), 42);
});

test('disabled animation and empty table preserve static depth; zero really hides all copies', () => {
  const state = { chronoAnimation: { enabled: true, interpolation: 'linear', keys: createChronoKeys(120) } };
  assert.equal(getChronoAnimatedDepth(state, 0, 20), 0);
  assert.equal(getChronoAnimatedDepth(state, 59, 20), 20);
  assert.equal(getChronoAnimatedDepth(state, 119, 20), 0);
  state.chronoAnimation.enabled = false;
  assert.equal(getChronoAnimatedDepth(state, 0, 20), 20);
  state.chronoAnimation.enabled = true;
  state.chronoAnimation.keys = [];
  assert.equal(getChronoAnimatedDepth(state, 0, 20), 20);
});

test('fractional copy fades in without changing full copies', () => {
  const state = { chronoOpacity: 0.8 };
  assert.equal(getChronoLayerOpacity(0, 0, state), 0);
  assert.equal(getChronoLayerOpacity(0, 0.5, state), 0.4);
  assert.equal(getChronoLayerOpacity(6, 7.25, state), 0.8);
  assert.equal(getChronoLayerOpacity(7, 7.25, state), 0.2);
  assert.equal(getChronoLayerOpacity(8, 7.25, state), 0);
});

test('cascade and mirror retain integer profiles and remain continuous at every depth boundary', () => {
  const state = { chronoOpacity: 1, chronoCascade: true, chronoCascadeConst: 1 };
  [1, 2 / 3, 1 / 3].forEach((expected, step) => {
    assert.ok(Math.abs(getChronoLayerOpacity(step, 3, state) - expected) < 1e-12);
  });
  for (const mirror of [false, true]) {
    state.chronoCascadeMirror = mirror;
    for (const constant of [1, 3, 20]) {
      state.chronoCascadeConst = constant;
      for (let depth = 1; depth <= 20; depth++) {
        for (let step = 0; step <= depth; step++) {
          const exact = getChronoLayerOpacity(step, depth, state);
          assert.ok(Math.abs(getChronoLayerOpacity(step, depth - 1e-7, state) - exact) < 1e-6);
          assert.ok(Math.abs(getChronoLayerOpacity(step, depth + 1e-7, state) - exact) < 1e-6);
          assert.ok(exact >= 0 && exact <= 1);
        }
      }
    }
  }
});

test('large key tables resolve correctly without a key count limit', () => {
  const keys = Array.from({ length: 10000 }, (_, i) => ({ frame: i + 1, percent: i % 101 }));
  assert.equal(evaluateChronoPercent(keys, 8765), 8765 % 101);
});
