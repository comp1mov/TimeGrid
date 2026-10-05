import { getChronoAnimatedDepth, getChronoLayerOpacity } from './chrono-animation.mjs';

// Running source-over alphas produce a normalized weighted average for opaque
// footage, in the browser's compositing color space (not linear-light radiance).
export function buildChronoStackPlan(state, indices, frameIndex, opacityScale = 1) {
  const depth = getChronoAnimatedDepth(state, frameIndex, indices.length);
  const count = Math.ceil(depth);
  const mode = state.chronoBlend || 'screen';
  const scale = Math.max(0, Math.min(1, opacityScale));
  const exposure = mode === 'exposure';
  const profile = exposure ? {
    chronoOpacity: 1,
    chronoCascade: state.chronoCascade,
    chronoCascadeMirror: state.chronoCascadeMirror,
    chronoCascadeConst: state.chronoCascadeConst
  } : state;
  const alphas = Array.from({ length: count }, (_, step) => indices[step] == null
    ? 0 : getChronoLayerOpacity(step, depth, profile));
  if (exposure) {
    const mix = Math.max(0, Math.min(1, state.chronoOpacity ?? 1)) * scale;
    const ghostWeight = alphas.reduce((sum, weight) => sum + weight, 0);
    // (1-mix)*base + mix*(base + sum(w*ghost))/(1 + sum(w)).
    let accumulated = 1 + (1 - mix) * ghostWeight;
    for (let step = 0; step < count; step++) {
      const weight = alphas[step] * mix;
      accumulated += weight;
      alphas[step] = weight / accumulated;
    }
  } else {
    for (let step = 0; step < count; step++) alphas[step] *= scale;
  }
  return {
    alphas,
    cssBlend: exposure || mode === 'source-over' ? 'normal' : mode,
    canvasBlend: exposure ? 'source-over' : mode
  };
}
