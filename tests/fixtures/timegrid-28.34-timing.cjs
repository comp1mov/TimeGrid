// Unmodified function bodies from stable 28.34 main.js, commit 3dfd4f0.
// Full source SHA256 6636e424f18390523557d17c811d858e78b9b6d7ef5ef1d510ed939819caabfa.
// Frozen reference. Do not synchronize this fixture with the new adapter.
function mulberry32(seed) {
    let a = (seed >>> 0) || 1;
    return function() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

function buildShuffledOrder(seed, n) {
    const arr = Array.from({ length: n }, (_, i) => i);
    const rnd = mulberry32(seed);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

function ensureAnimDirShuffle(frameCount) {
    if (!frameCount) {
      state.animDirShuffle = null;
      state.animDirShuffleSeed = null;
      state.animDirShuffleFrames = 0;
      return;
    }
    if (!state.animDirShuffleSeed) {
      state.animDirShuffleSeed = (Math.floor(Math.random() * 1000000000) >>> 0) || 1;
    }
    if (!state.animDirShuffle || state.animDirShuffleFrames !== frameCount) {
      state.animDirShuffle = buildShuffledOrder(state.animDirShuffleSeed >>> 0, frameCount);
      state.animDirShuffleFrames = frameCount;
    }
  }

function ensureAnimRandomStarts(totalCells) {
    const frameCount = state.frames.length;
    if (!frameCount || !totalCells) {
      state.animRandomStarts = [];
      state.animRandomStartsSeed = null;
      state.animRandomStartsFrames = 0;
      state.animRandomStartsCols = 0;
      state.animRandomStartsPattern = '';
      return;
    }

    const seed = (parseInt(state.animSeed, 10) || 1) >>> 0;
    const cols = getEffectiveGridCols(totalCells);
    const pattern = state.animPattern;

    if (!state.animRandomStarts ||
        state.animRandomStarts.length !== totalCells ||
        state.animRandomStartsSeed !== seed ||
        state.animRandomStartsFrames !== frameCount ||
        state.animRandomStartsCols !== cols ||
        state.animRandomStartsPattern !== pattern) {

      // IMPORTANT: Use two different RNG streams.
      // If we shuffle cells and frames with the same seed + same algorithm (and same length),
      // the mapping can cancel out and look sequential.
      const frameOrder = buildShuffledOrder(seed, frameCount);
      const cellSeed = (seed ^ 0x9E3779B9) >>> 0;
      const cellOrder = buildShuffledOrder(cellSeed, totalCells);

      const starts = new Array(totalCells);
      for (let i = 0; i < totalCells; i++) {
        const cell = cellOrder[i];
        starts[cell] = frameOrder[i % frameCount];
      }

      state.animRandomStarts = starts;
      state.animRandomStartsSeed = seed;
      state.animRandomStartsFrames = frameCount;
      state.animRandomStartsCols = cols;
      state.animRandomStartsPattern = pattern;
    }
  }

function getAnimDirectionCycleLength(frameCount, dir) {
    if (dir === 'pingpong' || dir === 'bounce-offset') return frameCount > 1 ? (frameCount - 1) * 2 : 1;
    return frameCount;
  }

function resolveDirectionFrame(tick, baseOffset, frameCount, dir, shuffleArray) {
    window._fgResolveFrame = resolveDirectionFrame; // expose for top-level use
    if (frameCount <= 0) return 0;

    if (dir === 'sync') {
      return tick % frameCount;
    }

    if (dir === 'bounce-offset') {
      const cycle = frameCount > 1 ? (frameCount - 1) * 2 : 1;
      const globalPos = tick % cycle;
      const seqFrame = globalPos < frameCount ? globalPos : cycle - globalPos;
      return (seqFrame + baseOffset) % frameCount;
    }

    const t = tick + baseOffset;

    if (dir === 'pingpong') {
      const cycle = frameCount > 1 ? (frameCount - 1) * 2 : 1;
      const pos = t % cycle;
      return pos < frameCount ? pos : cycle - pos;
    } else if (dir === 'backward') {
      return (frameCount - 1 - (t % frameCount) + frameCount) % frameCount;
    } else if (dir === 'random') {
      return shuffleArray[t % frameCount];
    } else if (dir === 'stutter') {
      const group = Math.floor(t / 4);
      const cycle = t % 4;
      const offsetVal = (cycle === 0 || cycle === 2) ? 0 : 1;
      return (group * 2 + offsetVal) % frameCount;
    } else if (dir === 'holdskip') {
      return (Math.floor(t / 2) * 2) % frameCount;
    } else if (dir === 'shuffleloop') {
      const loopNum = Math.floor(t / frameCount);
      const idxInLoop = t % frameCount;
      return shuffleArray[(idxInLoop + loopNum) % frameCount];
    } else {
      return t % frameCount; // forward
    }
  }

function applyLoopAfterN(t, baseOffset, frameCount, dir, animDirShuffle) {
    // In single view, ignore loopAfterN — show all frames sequentially
    const loopN = (state.loopAfterN > 0 && state.loopAfterN < frameCount && state.viewMode !== 'single') ? state.loopAfterN : frameCount;
    // loopOffset shifts the loop window: allows changing which frames get cycled on the fly
    const shiftedOffset = loopN < frameCount
      ? (baseOffset + (state.loopOffset || 0)) % frameCount
      : baseOffset;
    const loopStart = Math.floor(shiftedOffset / loopN) * loopN;
    const localOffset = shiftedOffset % loopN;

    // For pingpong / bounce-offset with active loopN window:
    // localT only covers 0..(loopN-1), so t%cycle never reaches backward phase.
    // Compute true per-cell bounce directly using global tick t.
    if (loopN < frameCount && (dir === 'pingpong' || dir === 'bounce-offset')) {
      const cycle = loopN > 1 ? (loopN - 1) * 2 : 1;
      let localFrame;
      if (dir === 'pingpong') {
        const pos = (t + localOffset) % cycle;
        localFrame = pos < loopN ? pos : cycle - pos;
      } else {
        const pos = t % cycle;
        const seq = pos < loopN ? pos : cycle - pos;
        localFrame = (seq + localOffset) % loopN;
      }
      return Math.min(loopStart + localFrame, frameCount - 1);
    }

    // Pass raw tick when loopAfterN disabled so pingpong/bounce-offset reach backward phase
    const localT = loopN < frameCount ? t % loopN : t;
    const localFrame = resolveDirectionFrame(localT, localOffset, loopN, dir, animDirShuffle);
    return Math.min(loopStart + localFrame, frameCount - 1);
  }

function generateCellOrder(totalCells, cols) {
    const rows = Math.ceil(totalCells / cols);
    const order = [];
    
    if (state.animPattern === 'sequential') {
      for (let i = 0; i < totalCells; i++) order.push(i);
    } else if (state.animPattern === 'center') {
      // Center-out: spiral from center
      const centerX = (cols - 1) / 2;
      const centerY = (rows - 1) / 2;
      const cells = [];
      for (let i = 0; i < totalCells; i++) {
        const x = i % cols;
        const y = Math.floor(i / cols);
        const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        cells.push({ idx: i, dist });
      }
      cells.sort((a, b) => a.dist - b.dist);
      cells.forEach(c => order.push(c.idx));
    } else if (state.animPattern === 'snake') {
      // Snake: zigzag rows
      for (let r = 0; r < rows; r++) {
        if (r % 2 === 0) {
          for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            if (idx < totalCells) order.push(idx);
          }
        } else {
          for (let c = cols - 1; c >= 0; c--) {
            const idx = r * cols + c;
            if (idx < totalCells) order.push(idx);
          }
        }
      }
    } else if (state.animPattern === 'vertical') {
      // Column by column
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const idx = r * cols + c;
          if (idx < totalCells) order.push(idx);
        }
      }
    } else if (state.animPattern === 'vertical-snake') {
      for (let c = 0; c < cols; c++) {
        if (c % 2 === 0) {
          for (let r = 0; r < rows; r++) {
            const idx = r * cols + c;
            if (idx < totalCells) order.push(idx);
          }
        } else {
          for (let r = rows - 1; r >= 0; r--) {
            const idx = r * cols + c;
            if (idx < totalCells) order.push(idx);
          }
        }
      }
    } else if (state.animPattern === 'checkerboard') {
      // Evens then odds
      for (let i = 0; i < totalCells; i++) {
        if ((i % cols + Math.floor(i / cols)) % 2 === 0) order.push(i);
      }
      for (let i = 0; i < totalCells; i++) {
        if ((i % cols + Math.floor(i / cols)) % 2 !== 0) order.push(i);
      }
    } else if (state.animPattern === 'spiral') {
      let top = 0, bottom = rows - 1, left = 0, right = cols - 1;
      let dir = 0; // 0=right, 1=down, 2=left, 3=up
      while (top <= bottom && left <= right) {
        if (dir === 0) {
          for (let i = left; i <= right; i++) { const idx = top * cols + i; if (idx < totalCells) order.push(idx); }
          top++;
        } else if (dir === 1) {
          for (let i = top; i <= bottom; i++) { const idx = i * cols + right; if (idx < totalCells) order.push(idx); }
          right--;
        } else if (dir === 2) {
          for (let i = right; i >= left; i--) { const idx = bottom * cols + i; if (idx < totalCells) order.push(idx); }
          bottom--;
        } else if (dir === 3) {
          for (let i = bottom; i >= top; i--) { const idx = i * cols + left; if (idx < totalCells) order.push(idx); }
          left++;
        }
        dir = (dir + 1) % 4;
      }
    } else if (state.animPattern === 'random') {
      // Seeded random cell order
      const seed = (parseInt(state.animSeed, 10) || 1) >>> 0;
      const shuffled = buildShuffledOrder(seed, totalCells);
      shuffled.forEach(i => order.push(i));
    }

    // Apply Flips
    if (state.flipPatternX || state.flipPatternY) {
      for (let i = 0; i < order.length; i++) {
        const val = order[i];
        const x = val % cols;
        const y = Math.floor(val / cols);
        const nx = state.flipPatternX ? (cols - 1 - x) : x;
        const ny = state.flipPatternY ? (rows - 1 - y) : y;
        const nval = ny * cols + nx;
        if (nval >= 0 && nval < totalCells) {
          order[i] = nval;
        }
      }
    }

    return order;
  }

function getCellBaseFrameOffset(cellOrderIdx, cellCount, frameCount) {
    const n = Math.max(1, Math.floor(Number(frameCount) || 1));
    const cells = Math.max(1, Math.floor(Number(cellCount) || 1));
    const idxRaw = Number(cellOrderIdx);
    const idx = Number.isFinite(idxRaw) && idxRaw >= 0 ? Math.floor(idxRaw) : 0;
    const phaseCount = Math.max(1, Number(state.gridLoops) || 1);
    if (state.sequenceMode) return (idx * phaseCount) % n;
    return Math.floor(idx * n * phaseCount / cells) % n;
  }

function getFrameCellInfo(cellIdx, tick, opts = {}) {
    const frameCount = Math.max(0, Math.floor(Number(opts.frameCount ?? state.frames.length) || 0));
    if (!frameCount) {
      return { frameIdx: 0, baseOffset: 0, cellOrderIdx: 0, cellCount: 1, frameCount: 0 };
    }

    const cellCount = Math.max(1, Math.floor(Number(opts.cellCount) || getEffectiveGridCellCount(frameCount)));
    if (state.animPattern === 'random') ensureAnimRandomStarts(cellCount);
    let cellOrderIdx = Number(opts.cellOrderIdx);

    if (!Number.isFinite(cellOrderIdx) || cellOrderIdx < 0) {
      const cellOrderMap = opts.cellOrderMap;
      if (cellOrderMap && typeof cellOrderMap.get === 'function') {
        cellOrderIdx = cellOrderMap.get(cellIdx);
      } else if (Array.isArray(opts.cellOrder)) {
        cellOrderIdx = opts.cellOrder.indexOf(cellIdx);
      }
    }

    if (!Number.isFinite(cellOrderIdx) || cellOrderIdx < 0) cellOrderIdx = cellIdx;
    const baseOffset = state.animPattern === 'random'
      ? (state.animRandomStarts[cellIdx] ?? 0)
      : getCellBaseFrameOffset(cellOrderIdx, cellCount, frameCount);

    if (!opts.skipEnsureShuffle) ensureAnimDirShuffle(frameCount);
    const dir = opts.dir || state.animDirection;
    const frameIdx = applyLoopAfterN(
      Number.isFinite(Number(tick)) ? Math.floor(Number(tick)) : 0,
      baseOffset,
      frameCount,
      dir,
      opts.shuffle || state.animDirShuffle
    );

    return {
      frameIdx: normalizeFrameIndex(frameIdx, frameCount),
      baseOffset,
      cellOrderIdx,
      cellCount,
      frameCount
    };
  }

function normalizeFrameIndex(idx, frameCount = state.frames.length) {
    const n = Math.max(1, Math.floor(Number(frameCount) || 1));
    const v = Number.isFinite(Number(idx)) ? Math.floor(Number(idx)) : 0;
    return ((v % n) + n) % n;
  }

function getEffectiveFrameTargetCount() {
    const ft = Number(state.frameTarget) || 1;
    if (ft <= 1) return state.frames.length;
    return Math.min(state.frames.length, Math.max(2, Math.round(ft)));
  }

function getEffectiveGridCellCount(frameCount = state.frames.length) {
    const cellSize = Math.max(1, Number(state.cellSize) || 1);
    const sourceCount = Math.max(0, Math.floor(Number(frameCount) || 0));
    const targetCount = sourceCount > 0
      ? getEffectiveFrameTargetCount()
      : Math.max(1, Math.round(Number(state.frameCount) || 1));
    return Math.max(1, Math.ceil(Math.max(1, targetCount) / cellSize));
  }

function getEffectiveGridCols(cellCount = getEffectiveGridCellCount()) {
    const cells = Math.max(1, Math.floor(Number(cellCount) || 1));
    const requested = Math.max(1, Math.round(Number(state.gridCols) || 1));
    return Math.max(1, Math.min(requested, cells));
  }