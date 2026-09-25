// Frame numbers in keys are one-based; renderers supply zero-based source indices.
export function createChronoKeys(frameCount) {
  const n = Math.max(0, Math.floor(frameCount));
  if (!n) return [];
  if (n === 1) return [{ frame: 1, percent: 100 }];
  if (n === 2) return [{ frame: 1, percent: 0 }, { frame: 2, percent: 100 }];
  return [{ frame: 1, percent: 0 }, { frame: Math.round(n / 2), percent: 100 }, { frame: n, percent: 0 }];
}

export function normalizeChronoKeys(keys, frameCount = Infinity) {
  const byFrame = new Map();
  for (const key of keys) {
    if (!Number.isFinite(Number(key.frame)) || !Number.isFinite(Number(key.percent))) continue;
    const frame = Math.max(1, Math.min(frameCount, Math.round(Number(key.frame))));
    byFrame.set(frame, { frame, percent: Math.max(0, Math.min(100, Number(key.percent))) });
  }
  return [...byFrame.values()].sort((a, b) => a.frame - b.frame);
}

// Keys are kept sorted by the editor. Binary search keeps large tables inexpensive.
export function evaluateChronoPercent(keys, frameIndex, interpolation = 'smooth') {
  if (!keys?.length) return 100;
  const frame = frameIndex + 1;
  if (frame <= keys[0].frame) return keys[0].percent;
  if (frame >= keys[keys.length - 1].frame) return keys[keys.length - 1].percent;
  let lo = 0, hi = keys.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].frame <= frame) lo = mid;
    else hi = mid;
  }
  const left = keys[lo], right = keys[hi];
  let t = (frame - left.frame) / (right.frame - left.frame);
  if (interpolation === 'step') t = 0;
  else if (interpolation === 'smooth') t = t * t * (3 - 2 * t);
  return left.percent + (right.percent - left.percent) * t;
}

export function getChronoAnimatedDepth(state, frameIndex, maxDepth) {
  const animation = state.chronoAnimation;
  if (!animation?.enabled || !Number.isFinite(frameIndex)) return maxDepth;
  return maxDepth * evaluateChronoPercent(animation.keys, frameIndex, animation.interpolation) / 100;
}

function integerLayerOpacity(step, depth, state) {
  if (step >= depth || depth <= 0) return 0;
  const alpha = state.chronoOpacity ?? 1;
  if (!state.chronoCascade) return alpha;
  const constant = Math.max(1, Math.min(depth, Math.round(state.chronoCascadeConst || 1)));
  const fadeCount = depth - constant;
  if (state.chronoCascadeMirror) {
    const distance = Math.abs(step - (depth - 1) / 2) - constant / 2;
    const t = fadeCount > 0 ? Math.max(0, distance / (fadeCount / 2)) : 0;
    return alpha * (1 - Math.min(1, t));
  }
  const fadeStep = step - constant;
  return fadeStep < 0 ? alpha : alpha * (1 - (fadeStep + 1) / (fadeCount + 1));
}

// Blend neighboring integer stacks, including their cascade profiles. This avoids
// popping both the new layer and existing layers when depth crosses an integer.
export function getChronoLayerOpacity(step, depth, state) {
  const lower = Math.floor(depth);
  const fraction = depth - lower;
  const a = integerLayerOpacity(step, lower, state);
  return fraction === 0 ? a : a + (integerLayerOpacity(step, lower + 1, state) - a) * fraction;
}
