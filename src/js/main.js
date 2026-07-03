import { inject } from '@vercel/analytics';

inject();

(function() {
  'use strict';

  // Single source of truth
  const APP_NAME = 'TimeGrid';
  const APP_VERSION = 'v28.16';
  const APP_LABEL = `${APP_NAME} ${APP_VERSION}`;

  const EXPORT_CONF = {
    RES: { low: 540, medium: 720, hd: 1080, high: 2160, max: Infinity },
    MR_BITS: { low: 2000000, medium: 3500000, hd: 6000000, high: 10000000, max: 12000000 },
    VE_BITS_CAP: { low: 8000000, medium: 12000000, hd: 18000000, high: 25000000, max: 30000000 },
    VE_BITS_MIN: { low: 6000000, medium: 8000000, hd: 10000000, high: 15000000, max: 20000000 },
    STILL_MAX: 8192,
    STILL_PREV: 2048
  };

  // Global Event Delegation for dynamic header elements
  document.addEventListener('click', (e) => {
    if (e.target.closest('#metaFpsMinus')) {
      if (state.animFps > 1) { 
        state.animFps--; 
        if (typeof animFpsInput !== 'undefined' && animFpsInput) animFpsInput.value = state.animFps; 
        if (state.isPlaying) restartAnimation(); 
        updateMetaAnimFps(); 
      }
    }
    if (e.target.closest('#metaFpsPlus')) {
      if (state.animFps < 60) { 
        state.animFps++; 
        if (typeof animFpsInput !== 'undefined' && animFpsInput) animFpsInput.value = state.animFps; 
        if (state.isPlaying) restartAnimation(); 
        updateMetaAnimFps(); 
      }
    }
  });

  // Sync document/UI labels
  document.title = APP_LABEL;
  const logoTextEl = document.getElementById('fgLogoText') || document.querySelector('.metadata-logo-text'); if (logoTextEl) logoTextEl.textContent = APP_LABEL; const aboutVerEl = document.querySelector('.about-version'); if (aboutVerEl) aboutVerEl.textContent = `Version ${APP_VERSION}`;

  // Prevent browser zoom on the entire page (especially important for iOS)
  document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });
  document.addEventListener('gestureend', e => e.preventDefault(), { passive: false });
  

  const state = {
    videoFile: null, filenameOverride: '', drawCanvasDpr: 1, videoUrl: null, videoDuration: 0,
    // Source type
    isSingleImage: false,
    imageImportMode: 'loop', // 'loop' or 'cut'
    pendingImageImportMode: 'loop',
    cutCols: 3,
    cutRows: 3,
    imageUrl: null,
    imageUrls: [],
    imageFiles: [],
    videoWidth: 0, videoHeight: 0, videoFps: 30, videoDate: null,
    frames: [], frameCount: 24,
    sceneCount: 5,
    sceneDepth: 8,
    sceneDistance: 1, gridCols: 6,
    selectionMode: 'count', intervalValue: 3, quality: 0.5,
    startFrame: 0, endFrame: 0, // Frame range
    showMetadata: true, // Timecode format options
    tcShowIndex: false,
    tcShowTime: false,
    tcShowFrame: false, // Original frame number, shown as F0001
    tcShowText: false,
    tcCustomText: '',
    tcShowFilename: false,
    tcShowDisplayName: false,
    tcFilenameTail: 24,
    autoFit: true, canvasAspect: 'auto', bgColor: '#020202',
    bgGridShow: false, bgGridType: 'lines', bgGridColor: '#ffffff', bgGridOpacity: 0.12, bgGridSize: 24,
    previewCellW: 240, // preview cell width in CSS px (stabilizes iPad grid sizing)

    fontSize: 10, spacing: 0, sequenceMode: false,
    tcTextColor: '#ffffff', tcBgColor: '#000000', tcOpacity: 0.7,
    tcAlign: 'center', tcPosition: 'center', tcPadding: 0, tcMargin: 0,
    // Frame image transform inside each cell (preview + export)
    frameImgScale: 1.02, frameImgScaleX: 1.02, frameImgScaleY: 1.02, frameImgScaleLink: true,
    frameImgRot: 0,
    frameImgOffX: 0, // percent of cell width
    frameImgOffY: 0, // percent of cell height
    frameImgOpacity: 1.0,
    // Color Correction
    cc: { enabled: false, brightness: 1.0, contrast: 1.0, saturation: 1.0, hue: 0, invert: false, allLayers: true },
    colorama: { enabled: false, allLayers: true, colorA: '#0a0a2e', colorB: '#ff4400', colorC: '#ffee00', offset: 0, blend: 'normal', opacity: 1.0, speed: 0, cascade: false, cascadeAmt: 1.0 },
    chronoEnabled: false, chronoBlend: 'darken', chronoDepth: 5, chronoOpacity: 1.0, chronoCascade: false, chronoCascadeMirror: false, chronoCascadeConst: 1, chronoStride: 1, chronoCleanLoop: false, chronoSeamBlend: false, chronoSeamLength: 0, chronoSeamMode: 'chrono', chronoSeamStrength: 0.55,
    frameDiffEnabled: false, frameDiffPlateIdx: 0, frameDiffPlateMode: 'static', frameDiffPlateStep: 1, frameDiffPlateLoopN: 8, frameDiffPlateOffset: 0, frameDiffBlend: 'difference', frameDiffOpacity: 1.0,
    frameImgFill: 'empty', // 'empty' or 'edge'

    frameBgColor: '#000000', frameBgOpacity: 1.0, // background behind scaled-down frame image
    frameTargetAspect: 'auto', // 'auto' (source) or aspect string like '16:9'
    scale: 1, panX: 0, panY: 0, isPanning: false,
    startPanX: 0, startPanY: 0, startMouseX: 0, startMouseY: 0,
    menuOpen: false,
    // Animation
    animFps: 14, animDirection: 'forward', animPattern: 'sequential', flipPatternX: false, flipPatternY: false,
    animSeed: 1, animRandomOrder: [], animRandomOrderSeed: null,
    animRandomStarts: [], animRandomStartsSeed: null, animRandomStartsFrames: 0, animRandomStartsCols: 0, animRandomStartsPattern: '',
    isPlaying: false, animFrame: 0, animInterval: null,
    currentTick: 0, // global animation position
    viewMode: 'grid', // 'grid' or 'single'
    frameTarget: 1,  // 1 = all frames, N>=2 = visible target slots with phase sampling
    cellSize: 1, // frames per cell (1, 2, 4, 8...)
        gridLoops: 1, // 1-5: how many distinct phase offsets are used across grid cells
    loopAfterN: 0, // 0=disabled, N=cycle each cell within its N-frame window
    loopOffset: 0,    // shifts the loop window start (0 = no shift)
    savePoints: [null, null, null], // 3 save slots — {frameSheetBlob, bgDrawing, bgDrawingSingle, templateDrawing}
    drawOneFrame: false, // constrain drawing to the single frame under brush

    // Scene sampling mode
    sceneMode: 0, // 0=disabled, 1=enabled
    sceneCount: 5, // number of scenes to sample
    sceneDepth: 3, // frames around each scene anchor
    sceneSpacing: 10, // min frames between scene anchors
exportQuality: 'hd', // low, medium, high, max
    exportPaddingPx: 160, // padding around export content (px, applied only when BG export is ON)
    showExportGuides: false, // overlay guides for export padding in the main viewport
    _exportBgCropGrid: null,
    _exportBgCropSingle: null,
    exportLoops: 1, // 1-10 loops for MP4
    accent2Color: '#f28c35',  // second accent color (logo last-frame dot)
    currentFrame: 0, // current frame index for manual scrubbing
    // Drawing state - Layer architecture:
    // 1. bgDrawing - background around frames
    // 2. frames - video frames
    // 3. templateDrawing - LIVE overlay on ALL frames (not copied, drawn live)
    // 4. frameDrawings - per-frame individual drawings
    drawMode: false,
    drawColor: '#ffffff',
    prevDrawColor: null,
    drawSize: 4,
    drawEraser: false,
    drawOnion: false,
    drawLongStroke: false,
    longStrokeFade: 8,
    brushType: 'round',
    // Spray brush tuning (multipliers). 1.0 keeps the current look.
    sprayScatter: 1.5,
    sprayDotScale: 0.1,
    drawOpacity: 1.0,
    edgeSoftness: 0.0,
    recentColors: [],
    videoPalette: [],
    drawTemplate: false,
    drawTarget: 'background', // 'background', 'template', 'frame'
    showTemplateDrawing: true,

    // Reference Frame overlay (per-cell, independent from template/frame drawings)
    refFrameSource: null, // ImageBitmap or HTMLImageElement
    refFrameVisible: true,
    refFrameOpacity: 1,
    refFrameOffX: 0, // percent of cell width
    refFrameOffY: 0, // percent of cell height
    refFrameScaleX: 1, refFrameScaleY: 1, refFrameScaleLink: true,
    refFrameRot: 0,
    refFrameIncludeInExport: false,
    refFrameAboveDrawings: false, // ref frame layer position relative to drawings
    bgLayerAboveDrawings: false, // background drawing layer above template/frame overlays


    refFrameFollowFrameTransform: false,

    exportDrawings: true,
    exportBgLayer: false,
    exportAlphaDrawings: false,
    
    exportAudioLayer: false,
exportShowMetadata: false, // metadata header in exports (independent from UI bar)
    bgDrawing: null, // ImageData for background layer (GRID view)
    bgDrawingSingle: null, // ImageData for background layer (SINGLE view)
    templateDrawing: null, // ImageData for template (live overlay on all frames)
    frameDrawings: {}, // { frameIndex: ImageData } per-frame drawings
    // Frame-sheet layer (v0.15.08): one big drawing that gets sliced per frame and follows animation
    frameSheetCols: 0,
    frameSheetTileW: 0,
    frameSheetTileH: 0,
    frameSheetDrawing: null // ImageData for the whole sheet (optional snapshot for undo)

  }
  window._fgState = state; // exposed for top-level render functions;


  // Frame target aspect helpers
  function parseAspectValue(val) {
    if (!val || val === 'source' || val === 'auto') return null;
    const parts = String(val).split(':');
    if (parts.length !== 2) return null;
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    if (!isFinite(a) || !isFinite(b) || a <= 0 || b <= 0) return null;
    return a / b;
  }

  function getSourceAspectSafe() {
    const w = Number(state.videoWidth) || 0;
    const h = Number(state.videoHeight) || 0;
    if (w > 0 && h > 0) return w / h;
    return 16 / 9;
  }

  function getEffectiveFrameAspect() {
    const target = parseAspectValue(state.frameTargetAspect);
    return target || getSourceAspectSafe();
  }

  function applyFrameTargetAspect() {
    if (!framesGrid) return;
    framesGrid.style.setProperty('--video-aspect', String(getEffectiveFrameAspect()));
  }

  function getExportScaledGap(frameW) {
  const baseGap = Math.max(0, Number(state.spacing) || 0);
  if (baseGap === 0) return 0;
  // UI gap is relative to the previewCellW (typically 240px). 
  // We scale it so it looks identical on export.
  const previewW = Number(state.previewCellW) || 240;
  return Math.round(baseGap * (frameW / previewW));
}

function getTargetFrameOutputDims() {
    const srcW = Math.max(1, Math.round(Number(state.videoWidth) || 1));
    const srcH = Math.max(1, Math.round(Number(state.videoHeight) || 1));
    const srcAspect = srcW / srcH;

    const targetAspect = parseAspectValue(state.frameTargetAspect);
    if (!targetAspect) return { w: srcW, h: srcH };

    if (targetAspect > srcAspect) {
      const h = Math.max(1, Math.round(srcW / targetAspect));
      return { w: srcW, h };
    } else {
      const w = Math.max(1, Math.round(srcH * targetAspect));
      return { w, h: srcH };
    }
  }


  // DOM
  const $ = id => document.getElementById(id);
  const app = $('app'), metadataBar = $('metadataBar'), canvasArea = $('canvasArea');
  const canvasInner = $('canvasInner'), framesGrid = $('framesGrid'), dropZone = $('dropZone'), bgGridLayer = $('bgGridLayer');
  const sideMenu = $('sideMenu'), menuToggleBtn = $('menuToggleBtn'), menuCloseBtn = $('menuCloseBtn');
  const progressBar = $('progressBar'), progressFill = $('progressFill');
  const loadingOverlay = $('loadingOverlay'), loadingProgress = $('loadingProgress');
  const videoElement = $('videoElement'), videoInput = $('videoInput'), imageInput = $('imageInput');
  const refFrameInput = $('refFrameInput');
  const captureCanvas = $('captureCanvas'), captureCtx = captureCanvas.getContext('2d');
  const gridHint = $('gridHint');

  const gridColsInput = $('gridCols'), canvasAspectSelect = $('canvasAspect');
  const selectionModeSelect = $('selectionMode'), frameCountInput = $('frameCount');
  const countMinus = $('countMinus'), countPlus = $('countPlus');
  const intervalValueInput = $('intervalValue'), qualitySelect = $('qualitySelect');
  const sceneCountInput = $('sceneCountInput'), sceneDepthInput = $('sceneDepthInput'), sceneDistanceInput = $('sceneDistanceInput');
  const sceneCountMinus = $('sceneCountMinus'), sceneCountPlus = $('sceneCountPlus');
  const sceneDepthMinus = $('sceneDepthMinus'), sceneDepthPlus = $('sceneDepthPlus');
  const sceneDistanceMinus = $('sceneDistanceMinus'), sceneDistancePlus = $('sceneDistancePlus');
  const startFrameInput = $('startFrame'), endFrameInput = $('endFrame');
  const cutColsInput = $('cutCols'), cutRowsInput = $('cutRows'), cutTotalInput = $('cutTotal'), sliceFirstImageBtn = $('sliceFirstImageBtn');
  // Frame image transform (preview + export)
  const frameTargetAspectSelect = $('frameTargetAspect');
  const toggleScaleLink = $('toggleScaleLink');
  const frameImgScaleSliderX = $('frameImgScaleX');
  const frameImgScaleNumX = $('frameImgScaleNumX');
  const frameImgScaleSliderY = $('frameImgScaleY');
  const frameImgScaleNumY = $('frameImgScaleNumY');
  const frameImgRotSlider = $('frameImgRot');
    const frameImgRotNum = $('frameImgRotNum');
  const frameImgOffXSlider = $('frameImgOffX');
    const frameImgOffXNum = $('frameImgOffXNum');
  const frameImgOffYSlider = $('frameImgOffY');
    const frameImgOffYNum = $('frameImgOffYNum');
  const frameImgOpacitySlider = $('frameImgOpacity');
    const frameImgOpacityNum = $('frameImgOpacityNum');
  const frameImgFillSelect = $('frameImgFill');
  const frameBgColorInput = $('frameBgColor');
  const frameBgOpacitySlider = $('frameBgOpacity');
  const frameBgOpacityLabel = $('frameBgOpacityLabel');
  const applyFrameImgTransformBtn = $('applyFrameImgTransformBtn');
  const resetFrameTransformBtn = $('resetFrameTransformBtn');
  const countRow = $('countRow'), intervalRow = $('intervalRow'), intervalLabel = $('intervalLabel');
  // Display toggles (timecode is driven by per-field toggles below)
  
  const toggleAutoFit = $('toggleAutoFit');
  const fontSizeSlider = $('fontSizeSlider'), fontSizeValue = $('fontSizeValue');
  const spacingInput = $('spacingInput'), spacingMinus = $('spacingMinus'), spacingPlus = $('spacingPlus');
  const bgColorInput = $('bgColor'), toggleBgGrid = $('toggleBgGrid'), bgGridTypeSelect = $('bgGridType'), bgGridColorInput = $('bgGridColor'), bgGridOpacitySlider = $('bgGridOpacity'), bgGridOpacityValue = $('bgGridOpacityValue'), bgGridSizeSlider = $('bgGridSize'), bgGridSizeValue = $('bgGridSizeValue'), generateBtn = $('generateBtn');
  const exportSmallBtn = $('exportSmallBtn');
  const exportFullBtn = $('exportFullBtn');
  const exportMp4GridBtn = $('exportMp4GridBtn'), exportMp4SingleBtn = $('exportMp4SingleBtn');
  const exportResampledBtn = $('exportResampledBtn');
  const exportResampledGridBtn = $('exportResampledGridBtn');
  const exportWebmAVGridBtn = $('exportWebmAVGridBtn');
  const exportWebmAVSingleBtn = $('exportWebmAVSingleBtn');
  const exportPngSingleBtn = $('exportPngSingleBtn');
  const exportJpegSingleBtn = $('exportJpegSingleBtn');
  const exportPngSeqDrawBtn = $('exportPngSeqDrawBtn');
  const toggleExportMetadata = $('toggleExportMetadata');
    const toggleExportResetPlay = $('toggleExportResetPlay');
  if (toggleExportResetPlay) {
    toggleExportResetPlay.onclick = () => {
      state.exportResetPlay = !state.exportResetPlay;
      toggleExportResetPlay.classList.toggle('active', state.exportResetPlay);
    };
  }

  const toggleExportAlphaDraw = $('toggleExportAlphaDraw');
  const toggleExportRefFrame = $('toggleExportRefFrame');
  const toggleExportBg = $('toggleExportBg');
  const toggleExportGuides = $('toggleExportGuides');
  const exportGuides = $('exportGuides');
  const exportPaddingRange = $('exportPaddingRange');
  const exportPaddingNum = $('exportPaddingNum');
  const exportQualitySelect = $('exportQuality');
  const loopsInput = $('loopsInput'), loopsMinus = $('loopsMinus'), loopsPlus = $('loopsPlus');
  const newVideoBtn = $('newVideoBtn'), browseVideoBtn = $('browseVideoBtn'), browseImageBtn = $('browseImageBtn'), browseCutBtn = $('browseCutBtn');
  const metaFilename = $('metaFilename'), metaResolution = $('metaResolution');

  // Top bar filename: click to rename (affects export base name)
  metaFilename.classList.add('editable');

  function setFilenameOverride(next) {
    const v = String(next || '').trim();
    state.filenameOverride = v;
    updateMetaDisplay();
    if (typeof updateAllTimecodes === 'function') {
      updateAllTimecodes();
      updateTimecodeVisibility();
    }
  }

  function beginMetaFilenameEdit() {
    // Avoid creating multiple inputs
    if (metaFilename.querySelector('input')) return;

    const currentText = (metaFilename.textContent || '').trim();
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'metadata-edit-input';
    input.value = (currentText === 'No file') ? '' : currentText;

    // Replace content with input
    metaFilename.innerHTML = '';
    metaFilename.appendChild(input);

    // Focus/select
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });

    const commit = (apply) => {
      if (!metaFilename.contains(input)) return;
      const next = apply ? (input.value || '') : (state.filenameOverride || '');
      if (apply) setFilenameOverride(next);
      else updateMetaDisplay();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(true); }
      if (e.key === 'Escape') { e.preventDefault(); commit(false); }
      e.stopPropagation();
    });
    input.addEventListener('blur', () => commit(true));
    input.addEventListener('click', (e) => { e.stopPropagation(); });
  }

  metaFilename.addEventListener('click', (e) => {
    if (e.target && e.target.tagName && e.target.tagName.toLowerCase() === 'input') return;
    beginMetaFilenameEdit();
  });
  const metaDuration = $('metaDuration'), metaSourceFrames = $('metaSourceFrames'), metaAnimFps = $('metaAnimFps'), metaDate = $('metaDate'), metaFrames = $('metaFrames'), metaGridShape = $('metaGridShape'), metaLayout = $('metaLayout');

  function updateMetaAnimFps() {
    const txt = document.getElementById('metaAnimFpsText');
    if (txt) txt.textContent = `${state.animFps} fps`;
    if (typeof animFpsInput !== 'undefined' && animFpsInput) animFpsInput.value = state.animFps;
  }

  // Logo icon: animate the active square while playing (based on currentTick)
  const fgLogoIcon = document.getElementById('fgLogoIcon');
  const fgLogoIconWelcome = document.getElementById('fgLogoIconWelcome');
  const fgLogoCellsA = fgLogoIcon ? Array.from(fgLogoIcon.querySelectorAll('.fg-logo-cell')) : [];
  const fgLogoCellsB = fgLogoIconWelcome ? Array.from(fgLogoIconWelcome.querySelectorAll('.fg-logo-cell')) : [];
  const fgLogoCellGroups = [fgLogoCellsA, fgLogoCellsB].filter(g => g && g.length);

  
  function getLogoActiveIndicesForTick(tick) {
    const t = Number.isFinite(tick) ? Math.max(0, tick) : 0;
    const dir = String(state.animDirection || 'forward').toLowerCase();

    // Sync mode -> flashes on the first frame of the cycle
    if (dir === 'sync') {
       const mainFrames = Math.max(1, state.frames.length || 1);
       if (t % mainFrames === 0) return { first: [0, 1, 2, 3, 4, 5, 6, 7, 8], last: [] };
       return { first: [], last: [] };
    }

    // We map the actual grid's state down to the 3x3 logo.
    const frameCount = Math.max(1, state.frames.length || 1);
    const cellCount = Math.ceil(frameCount / Math.max(1, state.cellSize || 1));
    const totalCells = state.showInfoCard ? cellCount + 1 : cellCount;
    const offset = 0;
    const animCellCount = cellCount; 

    // Safety check
    if (animCellCount <= 0) return { first: [0], last: [] };

    const cols = Math.max(1, state.gridCols || 1);
    const rows = Math.ceil(totalCells / cols);

    const cellOrder = generateCellOrder(animCellCount, cols);
    const cellOrderMap = new Map();
    cellOrder.forEach((cell, idx) => cellOrderMap.set(cell, idx));

    ensureAnimDirShuffle(frameCount);
    if (state.animPattern === 'random') ensureAnimRandomStarts(animCellCount);

    const firstCells = new Set();
    const lastCells  = new Set();
    const lastFrame  = frameCount - 1;

    for (let c = 0; c < animCellCount; c++) {
      const cellOrderIdx = cellOrderMap.get(c) ?? 0;
      const phaseCount = Math.max(1, state.gridLoops || 1);
      const cellOffset = Math.floor(cellOrderIdx * frameCount * phaseCount / Math.max(1, animCellCount)) % frameCount;
      const baseOffset = (state.animPattern === 'random') ? (state.animRandomStarts[c] ?? 0) : cellOffset;

      const frameIdx = applyLoopAfterN(t, baseOffset, frameCount, dir, state.animDirShuffle);
      const isFirst = frameIdx === 0;
      const isLast  = frameIdx === lastFrame && lastFrame > 0;

      if (isFirst || isLast) {
        const uiIdx = c + offset;
        const x = uiIdx % cols;
        const y = Math.floor(uiIdx / cols);
        const lx = Math.min(2, Math.floor((x / cols) * 3));
        const ly = Math.min(2, Math.floor((y / rows) * 3));
        if (isFirst) firstCells.add(ly * 3 + lx);
        if (isLast)  lastCells.add(ly * 3 + lx);
      }
    }

    return { first: Array.from(firstCells), last: Array.from(lastCells) };
  }

  let exportLogoIndices = [0];

  function updateLogoFromTick() {
    if (!fgLogoCellGroups.length) return;
    const _logoResult = getLogoActiveIndicesForTick(state.currentTick);
    const first = Array.isArray(_logoResult) ? _logoResult : (_logoResult.first || []);
    const last  = Array.isArray(_logoResult) ? []          : (_logoResult.last  || []);
    exportLogoIndices = first;
    for (const g of fgLogoCellGroups) {
      for (let i = 0; i < g.length; i++) {
        g[i].classList.toggle('active',  first.includes(i));
        g[i].classList.toggle('active2', last.includes(i) && !first.includes(i));
      }
    }
  }

  // Animation controls
  const animFpsInput = $('animFps');
  const fpsMinus = $('fpsMinus'), fpsPlus = $('fpsPlus');
  const startMinus = $('startMinus'), startPlus = $('startPlus');
  const endMinus = $('endMinus'), endPlus = $('endPlus');
  const animDirectionSelect = $('animDirection'), animPatternSelect = $('animPattern');
  const animSeedRow = $('animSeedRow'), animSeedInput = $('animSeed'), animSeedRandBtn = $('animSeedRand');
  const playBtn = $('playBtn'), stopBtn = $('stopBtn');

  // Ref Frame UI
  const refFrameSection = $('refFrameSection');
  const refFrameLoadBtn = $('refFrameLoadBtn');
  const refFrameClearBtn = $('refFrameClearBtn');
  const refFrameResetTransformBtn = $('refFrameResetTransformBtn');
  const toggleRefFrameVisible = $('toggleRefFrameVisible');
  const toggleRefFrameFollow = $('toggleRefFrameFollow');
  const toggleRefFrameAbove = $('toggleRefFrameAbove');
  const refFrameOpacitySlider = $('refFrameOpacity');
    const refFrameOpacityNum = $('refFrameOpacityNum');  const refFrameOffXSlider = $('refFrameOffX');  const refFrameOffXNum = $('refFrameOffXNum');
  const refFrameOffYSlider = $('refFrameOffY');  const refFrameOffYNum = $('refFrameOffYNum');
  const refFrameRotSlider = $('refFrameRot');  const refFrameRotNum = $('refFrameRotNum');
  const refFrameScaleSliderX = $('refFrameScaleX'); const refFrameScaleNumX = $('refFrameScaleNumX');
  const refFrameScaleSliderY = $('refFrameScaleY'); const refFrameScaleNumY = $('refFrameScaleNumY');
  const toggleRefScaleLink = $('toggleRefScaleLink');
  
  // Column +/- buttons
  const colsMinus = $('colsMinus'), colsPlus = $('colsPlus');
  const cellSizeInput = $('cellSizeInput'), cellMinus = $('cellMinus'), cellPlus = $('cellPlus');
  const cellSizePresets = $('cellSizePresets');
  const toggleSequenceMode = $('toggleSequenceMode');
  if (toggleSequenceMode) {
    toggleSequenceMode.onclick = () => {
      state.sequenceMode = !state.sequenceMode;
      toggleSequenceMode.classList.toggle('active', state.sequenceMode);
      if (state.isPlaying) restartAnimation(); else updateAllCells();
    };
  }
  const gridLoopsInput = $('gridLoopsInput'), loopMinus = $('loopMinus'), loopPlus = $('loopPlus');
  const loopNInput = $('loopNInput'), loopNMinus = $('loopNMinus'), loopNPlus = $('loopNPlus');

  if (loopNInput) {
    loopNInput.onchange = () => {
      let v = Math.max(0, parseInt(loopNInput.value) || 0);
      if (v === 1) v = 2; // skip 1 — static frame is useless
      state.loopAfterN = v;
      loopNInput.value = v;
      if (!v) { state.loopOffset = 0; if (loopOffsetInput) loopOffsetInput.value = 0; }
      _updateLoopOffsetRowVis();
      updateAllCells();
    };
    loopNMinus.onclick = () => {
      if (state.loopAfterN > 0) {
        // Skip 1: 2→0 directly (loopAfterN=1 is static — useless)
        state.loopAfterN = state.loopAfterN <= 2 ? 0 : state.loopAfterN - 1;
        loopNInput.value = state.loopAfterN;
        if (!state.loopAfterN) { state.loopOffset = 0; if (loopOffsetInput) loopOffsetInput.value = 0; }
        _updateLoopOffsetRowVis();
        updateAllCells();
      }
    };
    loopNPlus.onclick = () => {
      // Skip 1: 0→2 directly
      state.loopAfterN = state.loopAfterN === 0 ? 2 : state.loopAfterN + 1;
      loopNInput.value = state.loopAfterN;
      _updateLoopOffsetRowVis();
      updateAllCells();
    };
  }
  
  // Quick toolbar
  const qMode = $('qMode'), qReset = $('qReset'), qPrev = $('qPrev'), qPlay = $('qPlay'), qNext = $('qNext'), qDraw = $('qDraw'), qFit = $('qFit');
  const qOne = $('qOne');
  const qMenu = $('qMenu');
  
  // Timecode style controls
  const tcTextColorInput = $('tcTextColor'), tcBgColorInput = $('tcBgColor');
  const tcOpacitySlider = $('tcOpacitySlider'), tcOpacityValue = $('tcOpacityValue');
  const tcAlignSelect = $('tcAlign'), tcPositionSelect = $('tcPosition');

  // Draw (spray) tuning inside Display & Style
  const sprayScatterSlider = $('sprayScatterSlider'), sprayScatterValue = $('sprayScatterValue');
  const sprayDotScaleSlider = $('sprayDotScaleSlider'), sprayDotScaleValue = $('sprayDotScaleValue');
  const toggleBrushPanel = $('toggleBrushPanel');
  const toggleBgAboveDrawings = $('toggleBgAboveDrawings');

  // MENU
  function openMenu() {
    
    state.menuOpen = true;
    sideMenu.classList.add('open');
    menuToggleBtn.classList.add('active');
    canvasArea.classList.add('has-menu');
  }
  function closeMenu() {
    
    state.menuOpen = false;
    sideMenu.classList.remove('open');
    menuToggleBtn.classList.remove('active');
    canvasArea.classList.remove('has-menu');
  }
  function toggleMenu() { state.menuOpen ? closeMenu() : openMenu(); }

  menuToggleBtn.onclick = toggleMenu;
  menuCloseBtn.onclick = closeMenu;
  $('aboutHeader').onclick = () => $('aboutHeader').parentElement.classList.toggle('collapsed');
  document.querySelectorAll('.menu-section-title').forEach(t => t.onclick = () => t.parentElement.classList.toggle('collapsed'));

  // FILE - Extended format support
  const supportedFormats = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska', 'video/ogg', 'video/x-m4v'];
  const validVideoExts = ['mp4', 'mov', 'webm', 'avi', 'mkv', 'ogv', 'm4v'];
  const validImageExts = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff'];
  
    function isImageFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const mime = file.type || '';
    return mime.startsWith('image/') || validImageExts.includes(ext);
  }

  function isVideoFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const mime = file.type || '';
    return mime.startsWith('video/') || validVideoExts.includes(ext);
  }

  function revokeImageUrls() {
    // Revoke previous object URLs to avoid leaks
    if (state.imageUrls && state.imageUrls.length) {
      for (const u of state.imageUrls) {
        if (!u) continue;
        if (u) URL.revokeObjectURL(u);
      }
    } else if (state.imageUrl) {
      if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
    }
    state.imageUrls = [];
    state.imageFiles = [];
    state.imageUrl = null;
  }

  function handleFile(input) {
    const files = (input instanceof File) ? [input] : Array.from(input || []);
    if (!files.length) return;

    const videos = files.filter(isVideoFile);
    const images = files.filter(isImageFile);

    if (videos.length) return handleVideoFile(videos[0]);
    if (images.length) return handleImageFiles(images);

    alert('Unsupported format. Please use a video (MP4, MOV, WebM, AVI, MKV, OGV, M4V) or an image (PNG, JPG, WEBP, GIF).');
  }

  function handleVideoFile(file) {
    if (!file) return;

    // VIDEO
    state.isSingleImage = false;
    state.imageImportMode = 'loop';
    state.pendingImageImportMode = 'loop';
    revokeImageUrls();

    state.videoFile = file;
    state.filenameOverride = '';
    state.videoDate = new Date(file.lastModified);
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    state.videoUrl = URL.createObjectURL(file);
    videoElement.src = state.videoUrl;
    videoElement.load();
    // iOS/Safari reliability: ensure inline playback and prime the decoder
    videoElement.muted = true;
    videoElement.playsInline = true;
    videoElement.setAttribute('playsinline','');
    videoElement.setAttribute('webkit-playsinline','');
    videoElement.preload = 'auto';
    // Try a quick play/pause to enable frame seeking after the user gesture.
    const p = videoElement.play();
    if (p && p.catch) p.catch(()=>{});
    setTimeout(() => { try { videoElement.pause(); } catch (e) {} }, 80);
    dropZone.classList.add('hidden');
    loadingOverlay.classList.add('visible');
  }

  
  // Video metadata hook (restored for v022 video+image UI)
  videoElement.onloadedmetadata = () => {
    // Ignore spurious events while in image mode / without a valid video source
    if (state.isSingleImage || !state.videoUrl) return;

    state.videoDuration = videoElement.duration || 0;
    if (typeof updateRegenHint === 'function') updateRegenHint();
    if (typeof updateQualityResHint === 'function') updateQualityResHint();
    state.videoWidth = videoElement.videoWidth || 1;
    state.videoHeight = videoElement.videoHeight || 1;
    state._frameTileDims = null; // recalculate for new source

    // Set frame range
    state.startFrame = 0;
    state.endFrame = getMaxFrameIndex();
    syncFrameRangeInputs();

    applyFrameTargetAspect();
    updateMetaDisplay();
    loadingOverlay.classList.remove('visible');
    generateFrames();
  };

  videoElement.onerror = () => {
    // Only surface errors for video mode
    if (state.isSingleImage) return;
    loadingOverlay.classList.remove('visible');
    dropZone.classList.remove('hidden');
    alert('Error loading video. This format may not be supported by your browser.\n\nTry converting to MP4 or WebM.');
  };

function handleImageFiles(files, importMode = "loop") {
    if (!files || !files.length) return;

    // IMAGE MODE: treat imported images as sources for the frame sequence.
    state.isSingleImage = true;
    state.imageImportMode = (importMode === 'cut') ? 'cut' : 'loop';

    // Force "Fixed Count" UI for image mode, since interval-based selection doesn't apply here.
    state.selectionMode = 'count';
    selectionModeSelect.value = 'count';
    updateIntervalUI();

    // Clear any existing video source
    try { videoElement.pause(); } catch (e) {}
    try { videoElement.removeAttribute('src'); videoElement.load(); } catch (e) {}
    if (state.videoUrl) {
      if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
      state.videoUrl = null;
    }

    // Replace images
    revokeImageUrls();
    const normalizedFiles = Array.from(files || []).filter(Boolean);
    state.imageFiles = (state.imageImportMode === 'cut' ? normalizedFiles.slice(0, 1) : normalizedFiles.slice(0, 3000));
    // Auto frame count for image mode:
    // - Single image: default 24 frames (loop)
    // - Multiple images: match image count for 1:1 sequence preview
    // - Cut mode: rows * cols
    const imgCount = state.imageFiles.length;
    const autoCount = (state.imageImportMode === 'cut') ? getCutTotal() : ((imgCount > 1) ? imgCount : 24);
    state.frameCount = Math.max(1, Math.min(3000, autoCount));
    frameCountInput.value = state.frameCount;
    updateCutUI();
    updateGridHint();

    // Power-user auto-settings for big image sequences
    // If many images are imported, default to Quarter quality for smoother preview.
    // If the sequence is very large, also switch to Single view and disable auto-fit (avoids auto-centering jumps).
    if (imgCount > 100) {
      state.quality = 0.25;
      if (qualitySelect) qualitySelect.value = '0.25';
    }
    if (imgCount > 500) {
      state.viewMode = 'single';
      state.gridCols = 1;
      if (gridColsInput) gridColsInput.value = 1;
      state.autoFit = false;
      if (toggleAutoFit) toggleAutoFit.classList.toggle('active', state.autoFit);
    }
state.imageUrls = state.imageFiles.map(f => URL.createObjectURL(f));
    state.imageUrl = state.imageUrls[0] || null;

    state.videoFile = state.imageFiles[0];
    state.filenameOverride = '';
    state.videoDate = new Date(state.videoFile.lastModified);

    dropZone.classList.add('hidden');
    loadingOverlay.classList.add('visible');

    const img = new Image();
    img.onload = () => {
      state.videoWidth = img.naturalWidth || img.width || 1;
      state.videoHeight = img.naturalHeight || img.height || 1;
      state._frameTileDims = null;

      // Range + duration are synthetic for image mode (used only for display).
      const n = Math.max(1, Math.min(state.frameCount || 1, 3000));
      state.videoDuration = Math.max(1, n / state.videoFps);
      state.startFrame = 0;
      state.endFrame = Math.max(0, n - 1);
      syncFrameRangeInputs();

      applyFrameTargetAspect();
      updateMetaDisplay();
      loadingOverlay.classList.remove('visible');
      generateFrames();
    };
    img.onerror = () => {
      loadingOverlay.classList.remove('visible');
      dropZone.classList.remove('hidden');
      alert('Error loading image. Please try PNG, JPG, WEBP, or GIF.');
    };
    img.src = state.imageUrl;
  }


  function getApproxSourceFrameCount() {
    if (state.isSingleImage) {
      if (state.imageImportMode === 'cut') return Math.max(1, getCutTotal());
      if (state.imageFiles && state.imageFiles.length > 1) return Math.max(1, state.imageFiles.length);
      return Math.max(1, state.frames.length || state.frameCount || 1);
    }
    return Math.max(1, Math.floor((state.videoDuration || 0) * (state.videoFps || 1)) || 0);
  }

  function updateMetaLayoutInfo() {
    if (!metaLayout) return;
    const dims = getFrameTileDims();
    const tw = Math.max(0, Math.round(dims?.tw || 0));
    const th = Math.max(0, Math.round(dims?.th || 0));
    const cols = Math.max(1, Math.round(state.gridCols || 1));
    const visibleCells = getVisibleGridCellCount();
    const rows = Math.max(1, Math.ceil(visibleCells / cols));
    const gw = tw && cols ? tw * cols : 0;
    const gh = th && rows ? th * rows : 0;

    // Grid vs Single visibility
    const isSingle = (state.gridCols === 1 && state.cellSize >= state.frames.length);
    const mPtn = $('metaPattern');
    const mDir = $('metaDirection');
    const mGrp = $('metaAnimSettingsGroup');
    const mGap = $('metaAnimSettingsGap');

    if (isSingle) {
       if (mGrp) mGrp.style.display = 'none';
       if (mGap) mGap.style.display = 'none';
    } else {
       if (mGrp) mGrp.style.display = 'flex';
       if (mGap) mGap.style.display = 'block';
       const mDirLabel = document.getElementById('metaDirLabel');
       const mPtnLabel = document.getElementById('metaPtnLabel');
       if (mDirLabel) mDirLabel.textContent = String(state.animDirection || 'forward');
       let ptnStr = String(state.animPattern || 'sequential');
       if (state.flipPatternX && state.flipPatternY) ptnStr += ' flipXY';
       else if (state.flipPatternX) ptnStr += ' flipX';
       else if (state.flipPatternY) ptnStr += ' flipY';
       if (mPtnLabel) mPtnLabel.textContent = ptnStr;
    }

    if (metaGridShape) {
       if (isSingle) {
          metaGridShape.innerHTML = '';
       } else {
          const cs = Math.max(1, Number(state.cellSize) || 1);
          const lp = Math.max(1, Number(state.gridLoops) || 1);
          let shapeStr = `c${cols}r${rows}`;
          if (cs > 1) shapeStr += ` /${cs}`;
          if (lp > 1) shapeStr += ` x${lp}`;
          metaGridShape.innerHTML = `<span>${shapeStr}</span>`;
       }
    }
    if (!tw || !th) {
      metaLayout.innerHTML = '';
      return;
    }
    metaLayout.innerHTML = '<span class="metadata-layout-inline"><span></span><span></span></span>';
    const spans = metaLayout.querySelectorAll('span span');
    if (spans[0]) spans[0].textContent = `cell ${tw}×${th}`;
    if (spans[1]) spans[1].textContent = `grid ${gw}×${gh}`;
  }

  function updateMetaDisplay() {
    const hasFile = !!state.videoFile;

    const defaultName = !hasFile ? 'No file'
      : ((state.isSingleImage && state.imageFiles && state.imageFiles.length > 1)
        ? `${state.imageFiles.length} images`
        : state.videoFile.name);

    const override = (state.filenameOverride && String(state.filenameOverride).trim()) ? String(state.filenameOverride).trim() : '';
    const name = override || defaultName;

    metaFilename.innerHTML = '<span></span>';
    metaFilename.querySelector('span').textContent = name;

    updateMetaAnimFps();

    if (!hasFile) {
      metaResolution.innerHTML = '';
      metaDuration.innerHTML = '';
      if (metaSourceFrames) metaSourceFrames.innerHTML = '';
      metaDate.innerHTML = '';
      metaFrames.innerHTML = '';
      if (metaGridShape) metaGridShape.innerHTML = '';
      if (metaLayout) metaLayout.innerHTML = '';
      return;
    }

    metaResolution.innerHTML = '<span></span>';
    metaResolution.querySelector('span').textContent = `${state.videoWidth}×${state.videoHeight}`;

    const sourceFrames = getApproxSourceFrameCount();
    metaDuration.innerHTML = '<span></span>';
    metaDuration.querySelector('span').textContent = `${formatTime(state.videoDuration)}`;

    if (metaSourceFrames) {
      metaSourceFrames.innerHTML = '<span></span>';
      metaSourceFrames.querySelector('span').textContent = `${sourceFrames}f`;
    }

    if (state.videoDate) {
      metaDate.innerHTML = '<span></span>';
      metaDate.querySelector('span').textContent = formatDate(state.videoDate);
    } else {
      metaDate.innerHTML = '';
    }

    metaFrames.innerHTML = `<span>${Math.max(0, state.frames.length || 0)}f</span>`;
    updateMetaLayoutInfo();
  }

  updateLogoFromTick();

  function clampCutValue(value, fallback = 3) {
    return Math.max(1, Math.min(64, parseInt(value, 10) || fallback));
  }

  function getCutTotal() {
    return Math.max(1, clampCutValue(state.cutCols, 3) * clampCutValue(state.cutRows, 3));
  }

  function updateCutUI() {
    state.cutCols = clampCutValue(state.cutCols, 3);
    state.cutRows = clampCutValue(state.cutRows, 3);
    if (cutColsInput) cutColsInput.value = state.cutCols;
    if (cutRowsInput) cutRowsInput.value = state.cutRows;
    const tot = getCutTotal();
    if (cutTotalInput) cutTotalInput.value = String(tot);
    const totEl = document.getElementById('cutTotalText');
    if (totEl) totEl.textContent = String(tot);
    if (state.selectionMode === 'slice') {
      const alreadyDone = state.frames.length > 0
        && state._lastSliceCols === state.cutCols
        && state._lastSliceRows === state.cutRows;
      if (alreadyDone) markRegenDone(); else markRegenPending();
    }
  }

  function saveCutSettings() {
    try {
      localStorage.setItem('fg_cut_settings', JSON.stringify({ cols: state.cutCols, rows: state.cutRows }));
    } catch (e) {}
  }

  function loadCutSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem('fg_cut_settings') || '{}');
      if (raw && typeof raw === 'object') {
        if (raw.cols != null) state.cutCols = clampCutValue(raw.cols, state.cutCols);
        if (raw.rows != null) state.cutRows = clampCutValue(raw.rows, state.cutRows);
      }
    } catch (e) {}
    updateCutUI();
  }

  function loadImageElement(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function getMaxFrameIndex() {
    const approx = Math.max(1, Math.floor((state.videoDuration || 0) * (state.videoFps || 1)));
    return Math.max(0, approx - 1);
  }

  function syncFrameRangeInputs() {
    if (startFrameInput) startFrameInput.value = String(Math.max(1, (Number(state.startFrame) || 0) + 1));
    if (endFrameInput) endFrameInput.value = String(Math.max(1, (Number(state.endFrame) || 0) + 1));
  }

  function isFullVideoRange() {
    if (state.isSingleImage) return false;
    const maxFrame = getMaxFrameIndex();
    return state.startFrame <= 0 && state.endFrame >= maxFrame;
  }

  function evaluateMenuExpression(raw, fallback) {
    const src = String(raw ?? '').trim().replace(/,/g, '.');
    if (!src) return fallback;
    if (!/^[0-9+\-*/().\s]+$/.test(src)) return fallback;
    try {
      const out = Function(`"use strict"; return (${src});`)();
      return Number.isFinite(out) ? out : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function resolveIntMenuValue(input, fallback, minVal, maxVal) {
    const v = Math.round(evaluateMenuExpression(input && input.value, fallback));
    return Math.max(minVal, Math.min(maxVal, Number.isFinite(v) ? v : fallback));
  }

  function syncGridAspectMode() {
    state.autoFit = state.canvasAspect !== 'custom';
    if (typeof toggleAutoFit !== 'undefined' && toggleAutoFit) toggleAutoFit.classList.toggle('active', state.autoFit);
    if (typeof canvasAspectSelect !== 'undefined' && canvasAspectSelect) canvasAspectSelect.value = state.canvasAspect || 'auto';
    if (typeof loopNInput !== 'undefined' && loopNInput) loopNInput.value = state.loopAfterN || 0;

    const scInput = document.getElementById('sceneCountInput');
    const sdInput = document.getElementById('sceneDepthInput');
    const sdistInput = document.getElementById('sceneDistanceInput');
    if (scInput) scInput.value = state.sceneCount || 5;
    if (sdInput) sdInput.value = state.sceneDepth || 8;
    if (sdistInput) sdistInput.value = state.sceneDistance || 1;
  }

  function getVisibleGridCellCount() {
    if (state.frames.length) return getEffectiveGridCellCount();
    const total = Math.max(1, state.frameCount || 1);
    const cellSize = Math.max(1, Number(state.cellSize) || 1);
    return Math.max(1, Math.ceil(total / cellSize));
  }

  function requestImageImport(mode) {
    state.pendingImageImportMode = (mode === 'cut') ? 'cut' : 'loop';
    imageInput.multiple = state.pendingImageImportMode === 'cut' ? false : true;
    imageInput.click();
  }

  loadCutSettings();

  // Drag & Drop
  dropZone.ondragover = e => { e.preventDefault(); dropZone.classList.add('drag-over'); };
  dropZone.ondragleave = () => dropZone.classList.remove('drag-over');
  dropZone.ondrop = e => { e.preventDefault(); dropZone.classList.remove('drag-over'); handleFile(e.dataTransfer.files); };
  dropZone.onclick = e => { if (!e.target.closest('.drop-zone-btn')) videoInput.click(); };

  browseVideoBtn.onclick = () => videoInput.click();
  browseImageBtn.onclick = () => requestImageImport('loop');
  browseCutBtn.onclick = () => requestImageImport('cut');
  browseCutBtn.ondragover = e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add('drag-over'); };
  browseCutBtn.ondragleave = e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('drag-over'); };
  browseCutBtn.ondrop = e => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter(isImageFile);
    if (files.length) handleImageFiles(files.slice(0, 1), 'cut');
  };
  newVideoBtn.onclick = () => videoInput.click();

  videoInput.onchange = e => {
    if (e.target.files && e.target.files[0]) handleVideoFile(e.target.files[0]);
    e.target.value = '';
  };

  imageInput.onchange = e => {
    if (e.target.files && e.target.files.length) {
      const mode = state.pendingImageImportMode || 'loop';
      const files = Array.from(e.target.files);
      handleImageFiles(mode === 'cut' ? files.slice(0, 1) : files, mode);
    }
    state.pendingImageImportMode = 'loop';
    imageInput.multiple = true;
    e.target.value = '';
  };

  // FRAMES

  // High-quality step-down downsampling: halves dimensions iteratively to avoid bilinear blur.
  function drawImageHQ(ctx, source, sx, sy, sw, sh, dx, dy, dw, dh) {
    if (dw >= sw && dh >= sh) {
      // No downscale needed
      ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
      return;
    }
    // Step 1: crop to source rect into a temp canvas
    let tmp = document.createElement('canvas');
    tmp.width = sw; tmp.height = sh;
    tmp.getContext('2d').drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    let curW = sw, curH = sh;
    // Step 2: halve until within 2× of target
    while (curW / 2 >= dw && curH / 2 >= dh) {
      const nW = Math.max(dw, Math.round(curW / 2));
      const nH = Math.max(dh, Math.round(curH / 2));
      const tmp2 = document.createElement('canvas');
      tmp2.width = nW; tmp2.height = nH;
      tmp2.getContext('2d').drawImage(tmp, 0, 0, nW, nH);
      tmp = tmp2; curW = nW; curH = nH;
    }
    // Final draw to destination
    ctx.drawImage(tmp, 0, 0, curW, curH, dx, dy, dw, dh);
  }

  function getImageImportFileName(index) {
    const files = Array.isArray(state.imageFiles) ? state.imageFiles : [];
    const idx = Math.max(0, Math.min(files.length - 1, Math.floor(Number(index) || 0)));
    return files[idx] && files[idx].name ? String(files[idx].name) : '';
  }

  async function generateFrames() {
    // Regenerate Grid should also reset drawings and caches, to avoid mismatched resolutions.
    hardClearAllDrawingsAndUndo();


    // SINGLE IMAGE MODE: either loop images or slice the first image into a grid.
    if (state.isSingleImage) {
      state.frames = [];
      progressBar.classList.add('visible');
      loadingOverlay.classList.add('visible');

      const urls = (state.imageUrls && state.imageUrls.length) ? state.imageUrls : (state.imageUrl ? [state.imageUrl] : ['']);

      if (state.imageImportMode === 'cut') {
        const src = urls[0] || '';
        const cols = clampCutValue(state.cutCols, 3);
        const rows = clampCutValue(state.cutRows, 3);
        const total = Math.max(1, Math.min(cols * rows, 3000));
        state.frameCount = total;
        frameCountInput.value = state.frameCount;
        updateCutUI();

        if (src) {
          const img = await loadImageElement(src);
          const srcW = img.naturalWidth || img.width || state.videoWidth || 1;
          const srcH = img.naturalHeight || img.height || state.videoHeight || 1;
          const tileCanvas = document.createElement('canvas');
          const tileCtx = tileCanvas.getContext('2d');
          let idx = 0;
          let firstTileW = Math.max(1, Math.round(srcW / cols));
          let firstTileH = Math.max(1, Math.round(srcH / rows));

          for (let row = 0; row < rows; row++) {
            const sy = Math.round((row * srcH) / rows);
            const ey = Math.round(((row + 1) * srcH) / rows);
            const sh = Math.max(1, ey - sy);
            for (let col = 0; col < cols; col++) {
              const sx = Math.round((col * srcW) / cols);
              const ex = Math.round(((col + 1) * srcW) / cols);
              const sw = Math.max(1, ex - sx);

              // Apply quality downscaling here for the final slice
              const qual = Number(state.quality) || 1;
              const dsW = Math.max(1, Math.round(sw * qual));
              const dsH = Math.max(1, Math.round(sh * qual));

              tileCanvas.width = dsW;
              tileCanvas.height = dsH;
              tileCtx.clearRect(0, 0, dsW, dsH);
              drawImageHQ(tileCtx, img, sx, sy, sw, sh, 0, 0, dsW, dsH);

              state.frames.push({ time: idx / state.videoFps, frameNumber: idx, dataUrl: tileCanvas.toDataURL('image/png'), sourceName: getImageImportFileName(0), sourceIndex: 0 });
              if (idx === 0) {
                firstTileW = dsW;
                firstTileH = dsH;
              }
              idx++;
              progressFill.style.width = `${(idx / total) * 100}%`;
              loadingProgress.textContent = `${idx} / ${total}`;
            }
          }

          state.videoWidth = firstTileW;
          state.videoHeight = firstTileH;
        }
      } else {
        const n = Math.max(1, Math.min(state.frameCount || 1, 3000));
        const k = urls.length;
        for (let i = 0; i < n; i++) {
          const time = i / state.videoFps;
          const idx = Math.min(k - 1, Math.floor((i * k) / n));
          state.frames.push({ time, frameNumber: i, dataUrl: urls[idx] || '', sourceName: getImageImportFileName(idx), sourceIndex: idx });
          progressFill.style.width = `${((i + 1) / n) * 100}%`;
          loadingProgress.textContent = `${i + 1} / ${n}`;
        }
      }

      const n = Math.max(1, state.frames.length || 1);
      state.captureW = Math.round((state.videoWidth || 1) * (state.quality || 1));
      state.captureH = Math.round((state.videoHeight || 1) * (state.quality || 1));
      captureCanvas.width = Math.max(1, state.captureW);
      captureCanvas.height = Math.max(1, state.captureH);
      state._frameTileDims = null;

      state.videoDuration = Math.max(1, n / state.videoFps);
      state.startFrame = 0;
      state.endFrame = Math.max(0, n - 1);
      syncFrameRangeInputs();
      applyFrameTargetAspect();
      updateMetaDisplay();

      progressBar.classList.remove('visible');
      loadingOverlay.classList.remove('visible');
      progressFill.style.width = '0%';

      metaFrames.innerHTML = `<span>${state.frames.length}f</span>`;

      if (state.autoFit) {
        const cellCount = Math.ceil(getEffectiveFrameTargetCount() / Math.max(1, state.cellSize || 1));
        state.gridCols = calculateOptimalColumns(cellCount);
        gridColsInput.value = state.gridCols;
      }

      state._lastSliceCols = state.cutCols;
      state._lastSliceRows = state.cutRows;
      markRegenDone();
      renderGrid();
      setViewMode(state.viewMode);
      updateGridHint();
      if (state.autoFit) { requestFitToActiveView(); }
      return;
    }

    if (!state.videoUrl && !state.isSingleImage) return;
    const times = calculateFrameTimes();
    
    if (state.autoFit) {
      const cellCount = Math.ceil(Math.min(times.length, ((Number(state.frameTarget)||1) <= 1 ? times.length : Math.max(2, Math.round(Number(state.frameTarget)||1)))) / Math.max(1, state.cellSize || 1));
      state.gridCols = calculateOptimalColumns(cellCount);
      gridColsInput.value = state.gridCols;
    }
    
    state.frames = [];
    progressBar.classList.add('visible');
    loadingOverlay.classList.add('visible');
    captureCanvas.width = Math.round(state.videoWidth * state.quality);
    captureCanvas.height = Math.round(state.videoHeight * state.quality);

    

    state.captureW = captureCanvas.width;
    state.captureH = captureCanvas.height;
    state._frameTileDims = null;
for (let i = 0; i < times.length; i++) {
      const time = times[i];
      let dataUrl = await captureFrame(time);
      if (!dataUrl) {
        // iOS/Safari occasional blank frame: retry once after a tiny delay.
        await new Promise(r => queueMicrotask(r));
        dataUrl = await captureFrame(time);
      }
      if (!dataUrl) dataUrl = '';
      state.frames.push({ time, frameNumber: Math.floor(time * state.videoFps), dataUrl, sourceName: state.videoFile && state.videoFile.name ? String(state.videoFile.name) : '' });
      progressFill.style.width = `${((i + 1) / times.length) * 100}%`;
      loadingProgress.textContent = `${i + 1} / ${times.length}`;
    }

    progressBar.classList.remove('visible');
    loadingOverlay.classList.remove('visible');
    progressFill.style.width = '0%';
    
    metaFrames.innerHTML = `<span>${state.frames.length}f</span>`;
    renderGrid();
    setViewMode(state.viewMode);
      updateGridHint();
    if (state.autoFit) { requestFitToActiveView(); }
    if (!state.isSingleImage) queueMicrotask(generateVideoPalette); // auto-generate palette from video
  }



  function calcSceneTimes(startTime, endTime, fps, hasEdges, max) {
    const times = [];
    const scenes = Math.max(1, state.sceneCount || 5);
    const depth  = Math.max(1, state.sceneDepth  || 8);
    const dist   = Math.max(1, state.sceneDistance || 1);
    const step   = dist / fps;
    const range  = endTime - startTime;

    // Anchor positions:
    // DEFAULT (no explicit start/end): match fixed-count formula → (range/(n+1)) * (i+1)
    //   depth=1 gives IDENTICAL positions to fixed count mode
    // EXPLICIT start/end: edge-inclusive → range/(n-1) * i  (first=start, last=end)
    const anchors = [];
    if (!hasEdges) {
      const innerSpacing = range / (scenes + 1);
      for (let s = 0; s < scenes; s++) anchors.push(startTime + innerSpacing * (s + 1));
    } else {
      const spacing = scenes > 1 ? range / (scenes - 1) : 0;
      for (let s = 0; s < scenes; s++) anchors.push(startTime + spacing * s);
    }

    for (let s = 0; s < scenes && times.length < max; s++) {
      // Shift anchor backward so full depth window fits — guarantees exactly `depth` unique frames
      let anchor = Math.min(anchors[s], endTime - (depth - 1) * step);
      anchor = Math.max(anchor, startTime);
      for (let d = 0; d < depth && times.length < max; d++) {
        const t  = anchor + d * step;
        const ct = Math.max(0, Math.min(t, endTime));
        if (!times.length || Math.abs(times[times.length - 1] - ct) > (0.25 / fps)) {
          times.push(ct);
        }
      }
    }
    return times;
  }


  function calculateFrameTimes() {
    const times = [], max = 10000;
    const fps = Math.max(1, state.videoFps || 1);
    const startTime = state.startFrame / fps;
    const endTime   = state.endFrame   / fps;
    const rangeDuration = endTime - startTime;
    const includeEdges = !isFullVideoRange();

    // Clamp generated times strictly within [startTime, endTime].
    // captureFrame() already applies its own iOS seek-safety clamp independently.
    const clamp = (t) => Math.max(startTime, Math.min(t, endTime));
    const pushUnique = (t) => {
      const ct = clamp(t);
      if (!times.length || Math.abs(times[times.length - 1] - ct) > (0.25 / fps)) times.push(ct);
    };

    if (!includeEdges) {
      if (state.selectionMode === 'count') {
        const n = Math.min(state.frameCount, max);
        for (let i = 0; i < n; i++) {
          times.push(clamp(startTime + (rangeDuration / (n + 1)) * (i + 1)));
        }
      } else if (state.selectionMode === 'seconds') {
        for (let t = startTime; t < endTime && times.length < max; t += state.intervalValue) {
          times.push(clamp(t));
        }
      } else if (state.selectionMode === 'scene') {
        calcSceneTimes(startTime, endTime, fps, false, max).forEach(t => times.push(clamp(t)));
      } else {
        for (let f = state.startFrame; f < state.endFrame && times.length < max; f += state.intervalValue) {
          times.push(clamp(f / fps));
        }
      }
      return times;
    }

    if (state.selectionMode === 'count') {
      const n = Math.min(state.frameCount, max);
      if (n <= 1) {
        pushUnique(startTime);
      } else {
        for (let i = 0; i < n; i++) {
          pushUnique(startTime + (rangeDuration / (n - 1)) * i);
        }
      }
    } else if (state.selectionMode === 'seconds') {
      pushUnique(startTime);
      for (let t = startTime + state.intervalValue; t < endTime && times.length < max; t += state.intervalValue) {
        pushUnique(t);
      }
      if (times.length < max) pushUnique(endTime);
    } else if (state.selectionMode === 'scene') {
      calcSceneTimes(startTime, endTime, fps, true, max).forEach(t => pushUnique(t));
    } else {
      for (let f = state.startFrame; f <= state.endFrame && times.length < max; f += state.intervalValue) {
        pushUnique(f / fps);
      }
      if (times.length < max) pushUnique(endTime);
    }
    return times;
  }

  function calculateOptimalColumns(totalFrames) {
    const frameAspect = getEffectiveFrameAspect();
    let targetCanvasAspect;

    if (state.canvasAspect === 'custom') {
      return Math.max(1, parseInt(state.gridCols, 10) || 1);
    }

    if (state.canvasAspect !== 'auto') {
      const [w, h] = state.canvasAspect.split(':').map(Number);
      targetCanvasAspect = w / h;
    } else {
      const rect = canvasArea.getBoundingClientRect();
      targetCanvasAspect = rect.width / rect.height;
    }
    
    let bestCols = 4, bestScore = -Infinity;
    
    for (let cols = 1; cols <= Math.min(totalFrames, 40); cols++) {
      const rows = Math.ceil(totalFrames / cols);
      const gridAspect = (cols * frameAspect) / rows;
      const emptyFrames = cols * rows - totalFrames;
      
      const aspectRatio = gridAspect / targetCanvasAspect;
      const aspectScore = 1 - Math.abs(1 - aspectRatio) * 0.5;
      const emptyPenalty = (emptyFrames / totalFrames) * 0.3;
      const perfectBonus = emptyFrames === 0 ? 0.2 : 0;
      
      const score = aspectScore - emptyPenalty + perfectBonus;
      
      if (score > bestScore) {
        bestScore = score;
        bestCols = cols;
      }
    }
    return bestCols;
  }

  function updateGridHint() {
    const frameAspect = getEffectiveFrameAspect();

    let targetAspect;
    if (state.canvasAspect === 'custom') {
      const rowsNow = Math.max(1, Math.ceil(getVisibleGridCellCount() / Math.max(1, state.gridCols || 1)));
      targetAspect = (Math.max(1, state.gridCols || 1) * frameAspect) / rowsNow;
    } else if (state.canvasAspect !== 'auto') {
      const [w, h] = state.canvasAspect.split(':').map(Number);
      targetAspect = w / h;
    } else {
      const rect = canvasArea.getBoundingClientRect();
      targetAspect = rect.width / rect.height;
    }

    const perfectCounts = [];
    for (let cols = 2; cols <= 12; cols++) {
      for (let rows = 2; rows <= 12; rows++) {
        const count = cols * rows;
        const gridAspect = (cols * frameAspect) / rows;
        const aspectDiff = Math.abs(gridAspect / targetAspect - 1);
        if (aspectDiff < 0.15 && count >= 4 && count <= 100) perfectCounts.push({ count, cols, rows, diff: aspectDiff });
      }
    }
    perfectCounts.sort((a, b) => a.diff - b.diff);
    const uniqueCounts = [...new Set(perfectCounts.slice(0, 6).map(p => p.count))];

    let _estFrameCount = state.frameCount || 1;
    if (state.selectionMode === 'scene') {
      _estFrameCount = Math.max(1, (state.sceneCount || 5) * (state.sceneDepth || 8));
    }
    const sourceFrames = Math.max(1, state.frames.length || _estFrameCount);
    const visibleCells = getVisibleGridCellCount();
    gridHint.classList.remove('hint-good', 'hint-warn', 'hint-bad');
    if (!sourceFrames) {
      gridHint.classList.add('hint-good');
      gridHint.innerHTML = uniqueCounts.length ? `Ideal frames: ${uniqueCounts.join(', ')}` : 'Load video to see suggestions';
      updateMetaLayoutInfo();
      return;
    }

    const rows = Math.max(1, Math.ceil(visibleCells / Math.max(1, state.gridCols || 1)));
    const gridAspect = (Math.max(1, state.gridCols || 1) * frameAspect) / rows;
    const aspectDiffCurrent = Math.abs(gridAspect / targetAspect - 1);
    const empty = Math.max(0, Math.max(1, state.gridCols || 1) * rows - visibleCells);

    const divisors = [];
    for (let i = 2; i <= Math.min(visibleCells, 20); i++) if (visibleCells % i === 0) divisors.push(i);

    let aspectLabel = '';
    if (Math.abs(gridAspect - 1) < 0.15) aspectLabel = '~1:1';
    else if (Math.abs(gridAspect - 16/9) < 0.2) aspectLabel = '~16:9';
    else if (Math.abs(gridAspect - 9/16) < 0.15) aspectLabel = '~9:16';
    else if (Math.abs(gridAspect - 4/3) < 0.15) aspectLabel = '~4:3';
    else aspectLabel = `~${gridAspect.toFixed(2)}:1`;

    const cs = Math.max(1, state.cellSize || 1);

    let html;
    if (cs > 1) {
      html = `${visibleCells} cells (×${cs}) → ${state.gridCols}×${rows}`;
      if (empty > 0) html += ` (+${empty} empty)`;
    } else {
      html = empty === 0
        ? `✓ ${state.gridCols}×${rows} = ${visibleCells}f (${aspectLabel})`
        : `${state.gridCols}×${rows} (${empty} empty) ${aspectLabel}`;
    }

    if (state.canvasAspect !== 'auto' && state.canvasAspect !== 'custom') html += `<br>Target: ${state.canvasAspect} · Current: ${gridAspect.toFixed(2)}:1`;
    if (state.canvasAspect === 'auto') html += `<br>Target: auto · Current: ${gridAspect.toFixed(2)}:1`;
    if (state.canvasAspect === 'custom') html += `<br>Target: custom · Current: ${gridAspect.toFixed(2)}:1`;
    if (divisors.length && empty > 0 && cs === 1) html += `<br>Perfect cols: ${divisors.slice(0,5).join(', ')}`;
    if (uniqueCounts.length) {
      if (cs > 1) {
        // Show ideal SOURCE frame counts (cell count × cellSize)
        const idealSrc = uniqueCounts.slice(0, 6).map(c => c * cs);
        // Group: ≤ current source count and above
        const srcCount = state.frames.length || sourceFrames;
        const below = idealSrc.filter(n => n <= srcCount * 1.2).slice(0, 3);
        const above = idealSrc.filter(n => n > srcCount * 1.2).slice(0, 3);
        if (below.length)  html += `<br>≈ Perfect sources: ${below.join(', ')}`;
        if (above.length)  html += `<br>↑ Next perfect: ${above.join(', ')}`;
        // Scene mode: show how many scenes needed at current depth
        if (state.selectionMode === 'scene') {
          const depth = Math.max(1, state.sceneDepth || 8);
          const allSrc = [...new Set([...below, ...above])];
          const sceneNums = allSrc.map(n => Math.ceil(n / depth)).filter(n => n > 0).slice(0, 4);
          if (sceneNums.length) html += `<br>Scenes (depth ${depth}): ${sceneNums.join(', ')}`;
        }
      } else {
        html += `<br>Ideal frames: ${uniqueCounts.slice(0, 4).join(', ')}`;
        if (uniqueCounts.length > 4) html += `<br>Next ideal: ${uniqueCounts.slice(4, 8).join(', ')}`;
      }
    }

    if (state.canvasAspect === 'auto' || state.canvasAspect === 'custom' || aspectDiffCurrent < 0.045) {
      gridHint.classList.add('hint-good');
    } else {
      gridHint.classList.add('hint-warn');
    }

    gridHint.innerHTML = html;
    updateMetaLayoutInfo();
    updateInfoPanel();
  }

  
  let _gpuInfoCache = null;
  function getGpuInfo() {
    if (_gpuInfoCache) return _gpuInfoCache;
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2', { powerPreference: 'high-performance' })
            || c.getContext('webgl', { powerPreference: 'high-performance' })
            || c.getContext('experimental-webgl', { powerPreference: 'high-performance' });
      if (!gl) {
        _gpuInfoCache = { renderer: 'Unavailable', vendor: 'Unavailable', mode: 'No WebGL', hint: 'Browser cannot expose GPU info' };
        return _gpuInfoCache;
      }
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = dbg ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : (gl.getParameter(gl.RENDERER) || '');
      const vendor = dbg ? (gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || '') : (gl.getParameter(gl.VENDOR) || '');
      const low = String(renderer + ' ' + vendor).toLowerCase();
      let mode = 'Unknown';
      let hint = 'Browser-selected GPU';
      if (low.includes('swiftshader') || low.includes('software')) {
        mode = 'Software';
        hint = 'Hardware acceleration may be disabled';
      } else if (low.includes('nvidia') || low.includes('geforce') || low.includes('rtx') || low.includes('quadro')) {
        mode = 'Discrete';
        hint = 'High-performance GPU appears active';
      } else if (low.includes('amd') || low.includes('radeon') || low.includes('intel') || low.includes('iris')) {
        mode = 'Integrated / Auto';
        hint = 'You can force Chrome to High Performance in Windows Graphics settings';
      }
      _gpuInfoCache = {
        renderer: renderer || 'Hidden',
        vendor: vendor || 'Hidden',
        mode,
        hint
      };
      return _gpuInfoCache;
    } catch (e) {
      _gpuInfoCache = { renderer: 'Error', vendor: 'Error', mode: 'Unavailable', hint: 'GPU detection failed' };
      return _gpuInfoCache;
    }
  }

function updateInfoPanel() {
    applyNoPinAttributes(document);
    const iv = document.getElementById('infoVideoRes');
    const icap = document.getElementById('infoCaptureRes');
    const ig = document.getElementById('infoGridCells');
    const icell = document.getElementById('infoCellRes');
    const id = document.getElementById('infoDrawRes');
    const itpl = document.getElementById('infoTplRes');
    const it = document.getElementById('infoFrameTile');
    const iup = document.getElementById('infoUpscale');
    const iz = document.getElementById('infoZoom');
    const is = document.getElementById('infoDrawScale');
    const igpur = document.getElementById('infoGpuRenderer');
    const igpuv = document.getElementById('infoGpuVendor');
    const igpum = document.getElementById('infoGpuMode');
    const igpuh = document.getElementById('infoGpuHint');
    const ifps = document.getElementById('infoUiFps');
    const icomp = document.getElementById('infoCompositeMs');

    if (!iv || !ig || !id || !it || !is) return;

    const vw = state.videoWidth || 0;
    const vh = state.videoHeight || 0;
    iv.textContent = vw && vh ? `${vw}×${vh}` : '—';

    const cw = state.captureW || 0;
    const ch = state.captureH || 0;
    if (icap) icap.textContent = cw && ch ? `${cw}×${ch}` : '—';

    // Frame count as currently configured in the grid (not the range length).
    const cols = state.cols || 0;
    const rows = state.rows || 0;
    const cellCount = cols && rows ? (cols * rows) : 0;
    ig.textContent = cellCount ? `${cellCount} (${cols} cols)` : '—';

    // Draw canvas internal pixel buffer.
    id.textContent = `${drawCanvas.width}×${drawCanvas.height}`;

    if (itpl) itpl.textContent = `${tplCanvas.width}×${tplCanvas.height}`;

    const dims = getFrameTileDims();
    it.textContent = `${dims.tw}×${dims.th}`;

    if (iz) iz.textContent = (typeof state.scale === 'number') ? state.scale.toFixed(2) : '—';

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const targetCell = framesGrid.querySelector('.frame-item[data-cell-idx]');
    if (icell || iup) {
      if (targetCell) {
        const r = targetCell.getBoundingClientRect();
        const cssW = Math.round(r.width);
        const cssH = Math.round(r.height);
        if (icell) icell.textContent = `${cssW}×${cssH} css px`;

        // compare device pixels on screen to stored FRM tile pixels
        const upW = dims.tw ? (cssW * dpr) / dims.tw : 0;
        const upH = dims.th ? (cssH * dpr) / dims.th : 0;
        const up = Math.max(upW, upH);
        if (iup) {
          if (!up || !isFinite(up)) iup.textContent = '—';
          else iup.textContent = `${up.toFixed(2)}x`;
        }
      } else {
        if (icell) icell.textContent = '—';
        if (iup) iup.textContent = '—';
      }
    }

    // Draw scale = internal pixels / displayed css pixels (for the DRAW overlay canvas)
    const r = drawCanvas.getBoundingClientRect();
    const drawScale = (r.width > 0) ? (drawCanvas.width / r.width) : 0;
    is.textContent = drawScale ? `${drawScale.toFixed(2)}x` : '—';
  

    const gpu = getGpuInfo();
    if (igpur) igpur.textContent = gpu.renderer || '—';
    if (igpuv) igpuv.textContent = gpu.vendor || '—';
    if (igpum) igpum.textContent = gpu.mode || '—';
    if (igpuh) igpuh.textContent = gpu.hint || '—';

    if (ifps) ifps.textContent = (typeof state._uiFps === 'number' && state._uiFps > 0) ? String(state._uiFps) : '—';
    if (icomp) icomp.textContent = (typeof state._compAvgMs === 'number' && state._compAvgMs > 0) ? `${state._compAvgMs.toFixed(1)} ms` : '—';
}

    function captureFrame(time) {
    return new Promise(resolve => {
      const v = videoElement;

      const clampTime = (t) => {
        if (!isFinite(t)) return 0;
        if (v.duration && isFinite(v.duration)) {
          // Keep a tiny epsilon away from the end to avoid iOS black frames.
          return Math.min(Math.max(t, 0), Math.max(0, v.duration - 0.001));
        }
        return Math.max(t, 0);
      };

      const target = clampTime(time);

      let done = false;
      const finish = (dataUrl) => {
        if (done) return;
        done = true;
        resolve(dataUrl);
      };

      const onSeeked = () => {
        // iOS/Safari can fire 'seeked' before the frame is actually ready for drawImage.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            try {
              drawImageHQ(captureCtx, v, 0, 0, v.videoWidth || captureCanvas.width, v.videoHeight || captureCanvas.height, 0, 0, captureCanvas.width, captureCanvas.height);
              finish(captureCanvas.toDataURL('image/jpeg', 0.9));
            } catch (e) {
              // If drawImage fails (rare on iOS), resolve with null so caller can skip/retry.
              finish(null);
            }
          });
        });
      };

      v.addEventListener('seeked', onSeeked, { once: true });

      // Fallback in case 'seeked' never fires (iOS edge cases).
      setTimeout(() => {
        if (!done) onSeeked();
      }, 250);

      if (Math.abs(v.currentTime - target) < 1e-4) {
        onSeeked();
      } else {
        v.currentTime = target;
      }
    });
  }

  function computeShowTimecode() {
    const hasText = !!(state.tcShowText && String(state.tcCustomText || '').trim());
    return !!(state.tcShowIndex || state.tcShowTime || state.tcShowFrame || hasText || state.tcShowFilename || state.tcShowDisplayName);
  }

  // Draw a timecode overlay on a canvas export (PNG/JPEG/MP4) using the same visual logic as the UI.
  function drawTimecodeOverlay(ctx, x, y, w, h, frame, derivedIndex, totalFrames, frameIdx, opts = {}) {
    try {
      if (!frame) return;
      const label = formatTimecode(frame, derivedIndex, totalFrames, frameIdx);
      if (!label) return;

      // Calculate scale to perfectly match the preview UI proportions.
      // In preview, the font size and margins are rendered relative to the previewCellW.
      const scaleBoost = Number.isFinite(opts.scaleBoost) ? Math.max(1, Number(opts.scaleBoost)) : 1;
      const baseW = Number(state.previewCellW) || 240;
      const scale = (w / baseW) * scaleBoost;

      const fontSize = Math.max(1, Math.round((Number(state.fontSize) || 10) * scale));
      const pad = Math.max(0, Math.round((Number(state.tcPadding) || 0) * scale));
      const margin = Math.max(0, Math.round((Number(state.tcMargin) || 0) * scale));

      ctx.save();
      ctx.font = `${fontSize}px system-ui`;
      ctx.textBaseline = 'top';

      const textW = Math.ceil(ctx.measureText(label).width);
      const boxW = Math.min(w, textW + pad * 2);
      const boxH = fontSize + pad * 2;

      // Position inside the cell
      let bx = x + margin;
      if (state.tcAlign === 'center') bx = x + (w - boxW) / 2;
      else if (state.tcAlign === 'right') bx = x + w - margin - boxW;

      let by = y + margin;
      if (state.tcPosition === 'center') by = y + (h - boxH) / 2;
      else if (state.tcPosition === 'bottom') by = y + h - margin - boxH;

      // Clamp
      bx = Math.max(x, Math.min(x + w - boxW, bx));
      by = Math.max(y, Math.min(y + h - boxH, by));

      // BG color with opacity
      const bg = String(state.tcBgColor || '#000000');
      const rr = parseInt(bg.slice(1, 3), 16) || 0;
      const gg = parseInt(bg.slice(3, 5), 16) || 0;
      const bb = parseInt(bg.slice(5, 7), 16) || 0;
      const aa = Math.max(0, Math.min(1, Number(state.tcOpacity) || 0));

      ctx.fillStyle = `rgba(${rr},${gg},${bb},${aa})`;
      ctx.fillRect(bx, by, boxW, boxH);

      // Text
      ctx.fillStyle = state.tcTextColor || '#ffffff';
      ctx.textAlign = (state.tcAlign === 'center') ? 'center' : (state.tcAlign === 'right') ? 'right' : 'left';

      const tx = (state.tcAlign === 'center') ? (bx + boxW / 2)
        : (state.tcAlign === 'right') ? (bx + boxW - pad)
        : (bx + pad);

      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, by, boxW, boxH);
      ctx.clip();
      ctx.fillText(label, tx, by + pad);
      ctx.restore();
      ctx.restore();
    } catch (e) {}
  }

  function updateTimecodeVisibility() {
    const show = computeShowTimecode();
    document.querySelectorAll('.frame-timecode').forEach(el => el.classList.toggle('hidden', !show));
  }

  function updateTimecodeStyles() {
    const r = parseInt(state.tcBgColor.slice(1,3), 16);
    const g = parseInt(state.tcBgColor.slice(3,5), 16);
    const b = parseInt(state.tcBgColor.slice(5,7), 16);
    framesGrid.style.setProperty('--tc-bg-color', `rgba(${r},${g},${b},${state.tcOpacity})`);
    framesGrid.style.setProperty('--tc-text-color', state.tcTextColor);
    const p = state.tcPadding || 0;
    const m = state.tcMargin || 0;
    framesGrid.style.setProperty('--tc-padding', `${p}px ${Math.round(p * 1.5)}px`);
    framesGrid.style.setProperty('--tc-margin', `${m}px`);
  }

  
// Post-grid rebuild: sync frame sheet + template canvas sizes AFTER layout settles.
// This avoids transient 0×0 measurements during rapid resizes (for example when opening DevTools).

function getViewportExportPadForElement(el, mode = 'grid') {
  const pad = state.exportBgLayer ? clampExportPaddingPx(state.exportPaddingPx || 0) : 0;
  if (!el || !pad) return { padX: 0, padY: 0, pad };

  let dstContentW = 0;
  let dstContentH = 0;
  try {
    if (mode === 'single') {
      const dims = getTargetFrameOutputDims();
      dstContentW = Math.max(1, Math.round(dims.w));
      dstContentH = Math.max(1, Math.round(dims.h));
    } else {
      const dims = getTargetFrameOutputDims();
      const baseFrameW = Math.max(1, Math.round(dims.w));
      const baseFrameH = Math.max(1, Math.round(dims.h));
      const cellCount = Math.ceil(getEffectiveFrameTargetCount() / Math.max(1, state.cellSize || 1));
      const total = cellCount + (0);
      const rows = Math.ceil(total / state.gridCols);
      const gap = getExportScaledGap(baseFrameW);
      dstContentW = state.gridCols * baseFrameW + Math.max(0, state.gridCols - 1) * gap;
      dstContentH = rows * baseFrameH + Math.max(0, rows - 1) * gap;
    }
  } catch (e) {}

  const elW = Math.max(1, el.offsetWidth || el.clientWidth || 0);
  const elH = Math.max(1, el.offsetHeight || el.clientHeight || 0);
  const padX = dstContentW > 0 ? (pad * elW / dstContentW) : pad;
  const padY = dstContentH > 0 ? (pad * elH / dstContentH) : pad;
  return { padX, padY, pad };
}

function getPreviewExportGeometry(mode = 'grid') {
  try {
    const innerLayoutW = Math.max(1, canvasInner.scrollWidth || canvasInner.offsetWidth || 0);
    const innerLayoutH = Math.max(1, canvasInner.scrollHeight || canvasInner.offsetHeight || 0);
    if (!innerLayoutW || !innerLayoutH) return null;

    let el = null;
    if (mode === 'single') {
      const items = framesGrid.querySelectorAll('.frame-item');
      const offset = 0;
      el = items[offset] || null;
    } else {
      el = framesGrid;
    }
    if (!el) return null;

    const contentW = el.offsetWidth || 0;
    const contentH = el.offsetHeight || 0;
    if (contentW <= 0 || contentH <= 0) return null;

    const off = getOffsetWithin(el, canvasInner);
    const vp = getViewportExportPadForElement(el, mode);
    const outerX = (off.x || 0) - vp.padX;
    const outerY = (off.y || 0) - vp.padY;
    const outerW = contentW + vp.padX * 2;
    const outerH = contentH + vp.padY * 2;
    if (outerW <= 0 || outerH <= 0) return null;

    return {
      mode,
      el,
      innerLayoutW,
      innerLayoutH,
      contentX: off.x || 0,
      contentY: off.y || 0,
      contentW,
      contentH,
      outerX,
      outerY,
      outerW,
      outerH,
      padX: vp.padX,
      padY: vp.padY,
      pad: vp.pad
    };
  } catch (e) {
    return null;
  }
}

function computeExportBgCrop(mode = 'grid') {
  try {
    const data = getPreviewExportGeometry(mode);
    if (!data) return null;
    const cnv = (mode === 'single') ? bgCanvasSingle : bgCanvas;
    if (!cnv || !cnv.width || !cnv.height) return null;

    const scaleX = cnv.width / Math.max(1, data.innerLayoutW);
    const scaleY = cnv.height / Math.max(1, data.innerLayoutH);

    let sx = data.outerX * scaleX;
    let sy = data.outerY * scaleY;
    let sw = data.outerW * scaleX;
    let sh = data.outerH * scaleY;

    sx = Math.max(0, Math.min(cnv.width - 1, sx));
    sy = Math.max(0, Math.min(cnv.height - 1, sy));
    sw = Math.max(1, Math.min(cnv.width - sx, sw));
    sh = Math.max(1, Math.min(cnv.height - sy, sh));

    const crop = { sx, sy, sw, sh };
    if (mode === 'single') state._exportBgCropSingle = crop;
    else state._exportBgCropGrid = crop;
    return crop;
  } catch (e) {
    if (mode === 'single') state._exportBgCropSingle = null;
    else state._exportBgCropGrid = null;
    return null;
  }
}

function getStillExportPlacement(mode, contentW, contentH, headerH = 0, fallbackPad = 0) {
  const pad = Math.max(0, Math.round(fallbackPad || 0));
  const bodyW = Math.max(1, Math.round(contentW + pad * 2));
  const bodyH = Math.max(1, Math.round(contentH + pad * 2));
  return {
    canvasW: bodyW,
    canvasH: Math.max(1, Math.round(headerH + bodyH)),
    bodyW,
    bodyH,
    dx: pad,
    dy: pad
  };
}


function getExportHeaderHeight(mode, canvasW) {
  // Let's make the header height a consistent ~4.5% of the canvas width, just like single was.
  // This will make the grid metadata strip feel proportional to the whole image.
  return Math.max(48, Math.round(canvasW * 0.045));
}


function getDeterministicVideoExportLayout(mode, rows) {
  const dims = getTargetFrameOutputDims();
  const frameW = Math.max(2, Math.round(dims.w));
  const gapBase = getExportScaledGap(frameW);
  const padPx = state.exportBgLayer ? clampExportPaddingPx(state.exportPaddingPx || 0) : 0;
  const qualityCap = EXPORT_CONF.RES[state.exportQuality] || 1080;

  let logicalCanvasW = 0;
  let logicalCanvasH = 0;
  let layout = {
    mode,
    padPx,
    headerH: 0,
    baseHeaderH: 0,
    gap: gapBase,
    frameW: 0,
    frameH: 0,
    gridW: 0,
    gridH: 0,
    dx: 0,
    dy: 0,
    logicalW: 0,
    logicalH: 0,
    scaleX: 1,
    scaleY: 1,
  };

  if (mode === 'grid') {
    // dims and frameW already defined above
    const frameH = Math.max(2, Math.round(dims.h));
    const gridW = state.gridCols * frameW + Math.max(0, state.gridCols - 1) * gapBase;
    const gridH = rows * frameH + Math.max(0, rows - 1) * gapBase;

    // Grid width determines the base header size
    const rawHeader = getExportHeaderHeight('grid', gridW);
    const baseHeaderH = state.exportShowMetadata ? rawHeader : 0;
    let headerH = baseHeaderH;

    const placement = getStillExportPlacement('grid', gridW, gridH, headerH, padPx);
    logicalCanvasW = placement.canvasW;
    logicalCanvasH = placement.canvasH;

    if (state.exportShowMetadata && baseHeaderH > 0) {
      const measureCanvas = document.createElement('canvas');
      const mctx = measureCanvas.getContext('2d');
      const metaTextLocal = buildExportMetaText({
        mode: 'grid',
        cols: state.gridCols,
        frameW,
        frameH,
        frames: state.frames.length,
        fps: state.animFps,
        srcW: state.videoWidth,
        srcH: state.videoHeight,
        duration: state.videoDuration,
        date: state.videoDate
      });
      const newHeaderH = computeExportMetadataHeaderH(mctx, logicalCanvasW, baseHeaderH, metaTextLocal);
      if (newHeaderH > headerH) {
        logicalCanvasH += (newHeaderH - headerH);
        headerH = newHeaderH;
      }
    }

    layout = {
      mode,
      padPx,
      headerH,
      baseHeaderH,
      gap: gapBase,
      frameW,
      frameH,
      gridW,
      gridH,
      dx: placement.dx,
      dy: placement.dy,
      logicalW: logicalCanvasW,
      logicalH: logicalCanvasH,
      scaleX: 1,
      scaleY: 1,
    };
    computeExportBgCrop('grid');
  } else {
    const dims = getTargetFrameOutputDims();
    const frameW = Math.max(2, Math.round(dims.w));
    const frameH = Math.max(2, Math.round(dims.h));
    const rawHeader = getExportHeaderHeight('single', frameW);
    const baseHeaderH = state.exportShowMetadata ? rawHeader : 0;
    let headerH = baseHeaderH;
    const placement = getStillExportPlacement('single', frameW, frameH, headerH, padPx);
    logicalCanvasW = placement.canvasW;
    logicalCanvasH = placement.canvasH;

    if (state.exportShowMetadata && baseHeaderH > 0) {
      const measureCanvas = document.createElement('canvas');
      const mctx = measureCanvas.getContext('2d');
      const idx = getPrimaryPreviewFrameIndex();
      const fr = state.frames[idx];
      const metaTextLocal = buildExportMetaText({
        mode: 'single',
        frameW,
        frameH,
        frames: state.frames.length,
        fps: state.animFps,
        frameIdx: idx,
        time: fr?.time || 0,
        srcW: state.videoWidth,
        srcH: state.videoHeight,
        duration: state.videoDuration,
        date: state.videoDate
      });
      const newHeaderH = computeExportMetadataHeaderH(mctx, logicalCanvasW, baseHeaderH, metaTextLocal);
      if (newHeaderH > headerH) {
        logicalCanvasH += (newHeaderH - headerH);
        headerH = newHeaderH;
      }
    }

    layout = {
      mode,
      padPx,
      headerH,
      baseHeaderH,
      gap: 0,
      frameW,
      frameH,
      gridW: frameW,
      gridH: frameH,
      dx: placement.dx,
      dy: placement.dy,
      logicalW: logicalCanvasW,
      logicalH: logicalCanvasH,
      scaleX: 1,
      scaleY: 1,
    };
    computeExportBgCrop('single');
  }

  const even = (n) => Math.max(2, Math.floor(n / 2) * 2);
  let canvasW = logicalCanvasW;
  let canvasH = logicalCanvasH;
  if (Number.isFinite(qualityCap) && qualityCap > 0) {
    const qScale = Math.min(1, qualityCap / Math.max(logicalCanvasW, logicalCanvasH));
    canvasW = Math.max(2, Math.round(logicalCanvasW * qScale));
    canvasH = Math.max(2, Math.round(logicalCanvasH * qScale));
  }
  canvasW = even(canvasW);
  canvasH = even(canvasH);

  layout.scaleX = canvasW / Math.max(1, logicalCanvasW);
  layout.scaleY = canvasH / Math.max(1, logicalCanvasH);
  layout.logicalW = logicalCanvasW;
  layout.logicalH = logicalCanvasH;

  return { canvasW, canvasH, layout, logicalCanvasW, logicalCanvasH, qualityCap };
}

function updateExportGuidesOverlay() {
  if (!exportGuides) return;

  const rawPad = state.exportBgLayer ? clampExportPaddingPx(state.exportPaddingPx || 0) : 0;
  const shouldShow = !!state.showExportGuides && rawPad > 0;

  if (!shouldShow) {
    exportGuides.classList.remove('visible');
    exportGuides.style.left = '0px';
    exportGuides.style.top = '0px';
    exportGuides.style.width = '0px';
    exportGuides.style.height = '0px';
    exportGuides.style.setProperty('--pad', '0px');
    return;
  }

  const mode = state.viewMode === 'single' ? 'single' : 'grid';
  const data = getPreviewExportGeometry(mode);
  if (!data) return;

  exportGuides.style.left = `${data.outerX}px`;
  exportGuides.style.top = `${data.outerY}px`;
  exportGuides.style.width = `${data.outerW}px`;
  exportGuides.style.height = `${data.outerH}px`;
  exportGuides.style.setProperty('--pad', `${Math.max(data.padX, data.padY)}px`);
  exportGuides.classList.add('visible');
}

let postGridSyncRAF = 0;
function schedulePostGridSync() {
  if (postGridSyncRAF) cancelAnimationFrame(postGridSyncRAF);
  postGridSyncRAF = requestAnimationFrame(() => {
    postGridSyncRAF = 0;
    requestAnimationFrame(() => {
      try {
        // Sync drawing geometry after grid build
        ensureFrameSheet();
        const dims = getFrameTileDims();

        if (tplCanvas.width !== dims.tw || tplCanvas.height !== dims.th) {
          const prev = document.createElement('canvas');
          prev.width = tplCanvas.width || 1;
          prev.height = tplCanvas.height || 1;
          if (tplCanvas.width && tplCanvas.height) prev.getContext('2d').drawImage(tplCanvas, 0, 0);

          tplCanvas.width = dims.tw;
          tplCanvas.height = dims.th;
          tplCtx.clearRect(0, 0, dims.tw, dims.th);
          if (prev.width && prev.height) tplCtx.drawImage(prev, 0, 0, dims.tw, dims.th);

          templateFrameCanvas.width = dims.tw;
          templateFrameCanvas.height = dims.th;
          renderTemplateFramePreview();
        }

        // After geometry sync, refresh draw overlays if needed
        if (state.drawMode) {
          resizeDrawCanvas();
          compositeAllLayers();
        }

        updateExportGuidesOverlay();
      } catch (e) {}
    });
  });
}


  
  
  function applyNoPinAttributes(root = document) {
    try {
      root.querySelectorAll('img').forEach(img => {
        img.setAttribute('nopin', 'nopin');
        img.setAttribute('data-pin-nopin', 'true');
        img.setAttribute('data-pin-no-hover', 'true');
      });
    } catch (e) {}
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

  function normalizeFrameIndex(idx, frameCount = state.frames.length) {
    const n = Math.max(1, Math.floor(Number(frameCount) || 1));
    const v = Number.isFinite(Number(idx)) ? Math.floor(Number(idx)) : 0;
    return ((v % n) + n) % n;
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
    const frameIdx = applyLoopAfterN(
      Number.isFinite(Number(tick)) ? Math.floor(Number(tick)) : 0,
      baseOffset,
      frameCount,
      state.animDirection,
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

  function smoothstep01(v) {
    const t = Math.max(0, Math.min(1, Number(v) || 0));
    return t * t * (3 - 2 * t);
  }

  function normalizeChronoSeamMode(value) {
    if (value === 'frame-soft' || value === 'frame-full') return value;
    return 'chrono';
  }

  function getChronoSeamMode() {
    return normalizeChronoSeamMode(state.chronoSeamMode);
  }

  function getChronoSeamStrength() {
    const v = Number(state.chronoSeamStrength);
    if (!Number.isFinite(v)) return 0.55;
    return Math.max(0.05, Math.min(1, v));
  }

  function getChronoSeamBaseOpacity(seamInfo) {
    if (!seamInfo) return 0;
    const alpha = Number.isFinite(Number(seamInfo.alpha)) ? Math.max(0, Math.min(1, Number(seamInfo.alpha))) : 0;
    if (alpha <= 0) return 0;
    const mode = normalizeChronoSeamMode(seamInfo.mode || state.chronoSeamMode);
    if (mode === 'frame-full') return alpha;
    if (mode === 'frame-soft') return alpha * getChronoSeamStrength();
    return 0;
  }

  function getChronoSeamGhostOpacityScale(seamInfo) {
    if (!seamInfo) return 0;
    const alpha = Number.isFinite(Number(seamInfo.alpha)) ? Math.max(0, Math.min(1, Number(seamInfo.alpha))) : 0;
    if (alpha <= 0) return 0;
    const mode = normalizeChronoSeamMode(seamInfo.mode || state.chronoSeamMode);
    if (mode === 'frame-full') return alpha;
    return alpha * getChronoSeamStrength();
  }

  function getChronoCurrentOpacityScale(seamInfo) {
    if (!seamInfo || !state.chronoSeamBlend) return 1;
    const mode = normalizeChronoSeamMode(seamInfo.mode || state.chronoSeamMode);
    if (mode !== 'chrono') return 1;
    return 1 - getChronoSeamGhostOpacityScale(seamInfo);
  }

  function getChronoSeamAutoLength() {
    const depth = Math.max(1, Math.round(Number(state.chronoDepth) || 3));
    const stride = Math.max(1, Math.round(Number(state.chronoStride) || 1));
    return Math.max(1, depth * stride);
  }

  function getChronoSeamCycleLength(frameCount, dir, mode) {
    const n = Math.max(1, Math.floor(Number(frameCount) || 1));
    const viewMode = mode || state.viewMode || 'grid';
    const loopN = Math.max(0, Math.floor(Number(state.loopAfterN) || 0));
    if (viewMode !== 'single' && loopN > 0 && loopN < n) return Math.max(1, loopN);
    return Math.max(1, getAnimDirectionCycleLength(n, dir || state.animDirection));
  }

  function getChronoSeamLengthForCycle(cycleLength) {
    const cycle = Math.max(1, Math.floor(Number(cycleLength) || 1));
    const manual = Math.max(0, Math.round(Number(state.chronoSeamLength) || 0));
    let len = manual > 0 ? manual : getChronoSeamAutoLength();
    if (cycle <= 1) return 0;
    return Math.max(1, Math.min(cycle - 1, len));
  }

  function getChronoSeamBlendInfo(tick, frameCount, opts = {}) {
    if (!state.chronoSeamBlend || frameCount <= 1) return { alpha: 0 };

    const dir = opts.dir || state.animDirection;
    const cycleLength = getChronoSeamCycleLength(frameCount, dir, opts.mode);
    const seamLength = getChronoSeamLengthForCycle(cycleLength);
    if (seamLength <= 0) return { alpha: 0, cycleLength, seamLength };

    const rawTick = Number.isFinite(Number(tick)) ? Math.floor(Number(tick)) : 0;
    const phase = ((rawTick % cycleLength) + cycleLength) % cycleLength;
    const start = Math.max(0, cycleLength - seamLength);
    if (phase < start) return { alpha: 0, cycleLength, seamLength, phase };

    const progress = seamLength <= 1 ? 1 : (phase - start) / Math.max(1, seamLength - 1);
    return {
      alpha: smoothstep01(progress),
      cycleLength,
      seamLength,
      phase,
      progress: Math.max(0, Math.min(1, progress))
    };
  }

  function getChronoSeamForCell(cellIdx, tick, opts = {}) {
    const frameCount = Math.max(0, Math.floor(Number(opts.frameCount ?? state.frames.length) || 0));
    const seam = getChronoSeamBlendInfo(tick, frameCount, opts);
    if (!seam || seam.alpha <= 0) return seam || { alpha: 0 };

    const targetInfo = getFrameCellInfo(cellIdx, 0, {
      frameCount,
      cellCount: opts.cellCount,
      cellOrderIdx: opts.cellOrderIdx,
      cellOrderMap: opts.cellOrderMap,
      cellOrder: opts.cellOrder,
      shuffle: opts.shuffle || state.animDirShuffle,
      skipEnsureShuffle: true
    });

    return {
      ...seam,
      mode: getChronoSeamMode(),
      strength: getChronoSeamStrength(),
      targetFrameIdx: targetInfo.frameIdx,
      targetBaseOffset: targetInfo.baseOffset,
      targetGhostIndices: state.chronoEnabled
        ? buildChronoGhostIndices(0, targetInfo.baseOffset, frameCount, opts.dir || state.animDirection, opts.shuffle || state.animDirShuffle)
        : []
    };
  }

function renderGrid() {
    // ── Sync setup ───────────────────────────────────────────────────────────
    invalidateCellCaches();
    framesGrid._cellCount = 0;
    framesGrid.innerHTML = '';
    framesGrid.classList.toggle('onion-off', !state.drawOnion);
    framesGrid.style.setProperty('--cell-w', `${state.previewCellW || 240}px`);
    framesGrid.style.gridTemplateColumns = `repeat(${state.gridCols}, var(--cell-w))`;
    framesGrid.style.gridAutoRows = 'auto';
    framesGrid.style.setProperty('--grid-gap', `${state.spacing}px`);
    framesGrid.classList.toggle('seamless', Number(state.spacing) === 0);
    framesGrid.style.setProperty('--meta-font-size', `${state.fontSize}px`);
    applyFrameImgTransform();
    updateTimecodeStyles();

    if (state.showInfoCard && state.videoFile) {
      const item = document.createElement('div');
      item.className = 'frame-item';
      item.innerHTML = `<div class="info-card">
        <div class="info-card-title">VIDEO INFO</div>
        <div class="info-card-row">File: ${state.videoFile.name}</div>
        <div class="info-card-row">Res: ${state.videoWidth}×${state.videoHeight}</div>
        <div class="info-card-row">Duration: ${formatTime(state.videoDuration)}</div>
        <div class="info-card-row">Frames: ${state.frames.length}</div>
      </div>`;
      framesGrid.appendChild(item);
    }

    const cellCount = getEffectiveGridCellCount();
    const tick = Number.isFinite(Number(state.currentTick)) ? Math.floor(Number(state.currentTick)) : 0;
    const cellOrder = generateCellOrder(cellCount, state.gridCols);
    const cellOrderMap = new Map();
    cellOrder.forEach((cell, idx) => cellOrderMap.set(cell, idx));
    if (state.animPattern === 'random') ensureAnimRandomStarts(cellCount);
    ensureAnimDirShuffle(state.frames.length);

    // ── Reusable cell-node builder ───────────────────────────────────────────
    function _buildCell(c) {
      const displayFrameIdx = getFrameCellInfo(c, tick, {
        cellCount,
        cellOrderMap,
        shuffle: state.animDirShuffle,
        skipEnsureShuffle: true
      }).frameIdx;
      const frame = state.frames[displayFrameIdx];
      if (!frame) return null;
      const item  = document.createElement('div');
      item.className = 'frame-item';
      item.dataset.cellIdx  = c;
      item.dataset.frameIdx = displayFrameIdx;
      const wrap  = document.createElement('div');
      wrap.className = 'frame-image-wrap';
      const xform = document.createElement('div');
      xform.className = 'frame-media-xform';
      const img   = document.createElement('img');
      img.className = 'frame-main-img';
      img.setAttribute('nopin', 'nopin');
      img.setAttribute('data-pin-nopin', 'true');
      img.setAttribute('data-pin-no-hover', 'true');
      if (img.src !== frame.dataUrl) img.src = frame.dataUrl;
      xform.appendChild(img);
      const onionCnv = document.createElement('canvas');
      onionCnv.className = 'frame-onion';
      xform.appendChild(onionCnv);
      wrap.appendChild(xform);
      const tc = document.createElement('div');
      const showTC = computeShowTimecode();
      tc.className = `frame-timecode pos-${state.tcPosition} align-${state.tcAlign}` + (showTC ? '' : ' hidden');
      const derivedIdx = getDerivedIndexFromFrameIdx(displayFrameIdx);
      tc.textContent = formatTimecode(frame, derivedIdx, cellCount, displayFrameIdx);
      wrap.appendChild(tc);
      item.appendChild(wrap);
      if (state.viewMode === 'single' && c > 0) item.style.display = 'none';
      return item;
    }

    function _finalize() {
      updateTimecodeVisibility();
      framesGrid._cellCount = framesGrid.querySelectorAll('.frame-item').length;
      applyNoPinAttributes(framesGrid);
      setViewMode(state.viewMode);
      schedulePostGridSync();
    }

    const ASYNC_THRESHOLD = 200;
    const BATCH_SIZE      = 80;

    if (cellCount <= ASYNC_THRESHOLD) {
      // ── Fast sync path: one DocumentFragment flush ────────────────────────
      const frag = document.createDocumentFragment();
      for (let c = 0; c < cellCount; c++) {
        const n = _buildCell(c); if (n) frag.appendChild(n);
      }
      framesGrid.appendChild(frag);
      _finalize();
    } else {
      // ── Async batched path: non-blocking with progress bar ────────────────
      const overlay = document.getElementById('gridBusyOverlay');
      const bar     = document.getElementById('gridBusyBar');
      if (overlay) { bar.style.width = '0%'; overlay.style.display = 'flex'; }

      if (renderGrid._token) renderGrid._token.dead = true;
      const token = { dead: false };
      renderGrid._token = token;

      let c = 0;
      function _tick() {
        if (token.dead) return;
        const frag = document.createDocumentFragment();
        const end  = Math.min(c + BATCH_SIZE, cellCount);
        for (; c < end; c++) {
          const n = _buildCell(c); if (n) frag.appendChild(n);
        }
        framesGrid.appendChild(frag);
        if (bar) bar.style.width = `${Math.round(c / cellCount * 100)}%`;
        if (c < cellCount) { setTimeout(_tick, 0); }
        else { if (overlay) overlay.style.display = 'none'; _finalize(); }
      }
      setTimeout(_tick, 0);
    }
  }


  // PAN & ZOOM

  const VIEW_SCALE_MIN = 0.03;
  const VIEW_SCALE_MAX = 10;

  let _infoRaf = 0;
  function scheduleInfoUpdate() {
    if (_infoRaf) return;
    _infoRaf = requestAnimationFrame(() => {
      _infoRaf = 0;
      updateInfoPanel();
    });
  }

  function clampViewScale(s) {
    if (!Number.isFinite(s)) return 1;
    return Math.max(VIEW_SCALE_MIN, Math.min(VIEW_SCALE_MAX, s));
  }

  // Zoom around a point in canvasArea coordinates (px, py).
  // Keeps the content under the pointer stable.
  function zoomAt(px, py, desiredScale) {
    const prevScale = Number.isFinite(state.scale) ? state.scale : 1;
    const nextScale = clampViewScale(desiredScale);
    if (!Number.isFinite(prevScale) || !Number.isFinite(nextScale) || nextScale === prevScale) return;

    const sc = nextScale / prevScale;
    state.panX = px - (px - state.panX) * sc;
    state.panY = py - (py - state.panY) * sc;
    state.scale = nextScale;
  }


  canvasArea.onwheel = e => {
    if (e.target.closest('.side-menu')) return;
    e.preventDefault();

    const rect = canvasArea.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Smooth wheel zoom: deltaY > 0 zoom out, < 0 zoom in.
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const desired = (Number.isFinite(state.scale) ? state.scale : 1) * delta;

    zoomAt(mx, my, desired);
    updateTransform();
  };

  canvasArea.onmousedown = e => {
    if (e.target.closest('.drop-zone,.side-menu,.draw-palette')) return;
    // Right button or middle button = pan, left button reserved for drawing
    if (e.button === 2 || e.button === 1) {
      e.preventDefault();
      state.isPanning = true;
      state.startMouseX = e.clientX; state.startMouseY = e.clientY;
      state.startPanX = state.panX; state.startPanY = state.panY;
      canvasArea.classList.add('panning');
    }
  };

  document.onmousemove = e => {
    if (!state.isPanning) return;
    state.panX = state.startPanX + (e.clientX - state.startMouseX);
    state.panY = state.startPanY + (e.clientY - state.startMouseY);
    updateTransform();
  };

  document.onmouseup = () => { state.isPanning = false; canvasArea.classList.remove('panning'); };
  canvasArea.oncontextmenu = e => { if (!e.target.closest('.side-menu')) e.preventDefault(); };

  // Touch router (laptop touchscreen / iPad)
  let navTouchMode = null;
  let navTouchActive = false;
  let navStartDist = 0;
  let navLastCenter = null;
  let navStartX = 0;
  let navStartY = 0;
  let navStartPanX = 0;
  let navStartPanY = 0;
  let threeFingersStartY = null;
  let threeFingersStartSize = null;

  function navStart(touches) {
    if (!touches || !touches.length) return;
    navTouchActive = true;
    if (touches.length >= 2) {
      navTouchMode = 'pinch';
      navStartDist = Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY);
      navLastCenter = { x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 };
    } else {
      navTouchMode = 'pan';
      navStartX = touches[0].clientX;
      navStartY = touches[0].clientY;
    }
    navStartPanX = state.panX;
    navStartPanY = state.panY;
  }

  function navMove(touches) {
    if (!navTouchActive) return;
    if (touches.length >= 2) {
      const dist = Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY);
      const rect = canvasArea.getBoundingClientRect();
      const cx = (touches[0].clientX + touches[1].clientX) / 2;
      const cy = (touches[0].clientY + touches[1].clientY) / 2;
      if (navStartDist) {
        const prevScale = Number.isFinite(state.scale) ? state.scale : 1;
        zoomAt(cx - rect.left, cy - rect.top, prevScale * (dist / navStartDist));
      }
      if (navLastCenter) {
        state.panX += cx - navLastCenter.x;
        state.panY += cy - navLastCenter.y;
      }
      navStartDist = dist;
      navLastCenter = { x: cx, y: cy };
      updateTransform();
      return;
    }
    if (navTouchMode === 'pan' && touches.length === 1) {
      state.panX = navStartPanX + (touches[0].clientX - navStartX);
      state.panY = navStartPanY + (touches[0].clientY - navStartY);
      updateTransform();
    }
  }

  function navEnd() {
    navTouchMode = null;
    navTouchActive = false;
    navStartDist = 0;
    navLastCenter = null;
    threeFingersStartY = null;
    threeFingersStartSize = null;
  }

  const touchOpts = { passive: false };
  function isQuickUI(target) {
    return !!(target && target.closest('.quick-toolbar, .quick-btn'));
  }
  canvasArea.addEventListener('touchstart', e => {
    if (isQuickUI(e.target)) return;
    if (e.target.closest('.side-menu,.draw-palette,.drop-zone')) return;
    if (e.touches.length >= 2) {
      e.preventDefault();
      navStart(e.touches);
      return;
    }
    if (!state.drawMode && e.touches.length === 1) {
      e.preventDefault();
      navStart(e.touches);
      return;
    }
    if (state.drawMode && e.touches.length === 3) {
      e.preventDefault();
      threeFingersStartY = (e.touches[0].clientY + e.touches[1].clientY + e.touches[2].clientY) / 3;
      threeFingersStartSize = state.drawSize;
    }
  }, touchOpts);
  canvasArea.addEventListener('touchmove', e => {
    if (isQuickUI(e.target)) return;
    if (e.target.closest('.side-menu,.draw-palette,.drop-zone')) return;
    if (navTouchActive) {
      e.preventDefault();
      navMove(e.touches);
      return;
    }
    if (state.drawMode && e.touches.length === 3 && threeFingersStartY !== null) {
      e.preventDefault();
      const currentY = (e.touches[0].clientY + e.touches[1].clientY + e.touches[2].clientY) / 3;
      const deltaY = threeFingersStartY - currentY;
      setDrawSize(Math.max(1, Math.min(120, threeFingersStartSize + Math.round(deltaY / 3))));
    }
  }, touchOpts);
  canvasArea.addEventListener('touchend', e => { navEnd(); }, touchOpts);
  canvasArea.addEventListener('touchcancel', e => { navEnd(); }, touchOpts);

  document.querySelectorAll('.quick-toolbar .quick-btn').forEach(btn => {
    btn.addEventListener('touchstart', e => { e.stopPropagation(); }, { passive: true });
    btn.addEventListener('touchmove', e => { e.stopPropagation(); }, { passive: true });
  });
  function updateTransform() {
    // view scale is clamped globally

    if (!Number.isFinite(state.scale)) state.scale = 1;
    state.scale = clampViewScale(state.scale);

    if (!Number.isFinite(state.panX)) state.panX = 0;
    if (!Number.isFinite(state.panY)) state.panY = 0;
canvasInner.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.scale})`;
    if (templateFrame && templateFrame.classList.contains('visible')) updateTemplateFrameFollow();

    // Keep brush cursor size in sync with zoom even when the pointer is stationary.
    try {
      if (state.drawMode && brushCursor && brushCursor.classList.contains('visible')) {
        const screenSize = state.drawSize * state.scale;
        brushCursor.style.width = screenSize + 'px';
        brushCursor.style.height = screenSize + 'px';
      }
    } catch (e) {}

    scheduleInfoUpdate();
  }

  function getOffsetWithin(el, ancestor) {
    // Computes untransformed offset of `el` inside `ancestor` using the offsetParent chain.
    // Works even when `ancestor` is transformed, because offsetLeft/Top are layout-based.
    let x = 0, y = 0;
    let cur = el;
    const MAX_HOPS = 50;
    let hops = 0;
    while (cur && cur !== ancestor && hops < MAX_HOPS) {
      x += (cur.offsetLeft || 0);
      y += (cur.offsetTop || 0);
      cur = cur.offsetParent;
      hops++;
    }
    // If we did not reach ancestor, fallback to 0,0 (safer than a wrong huge offset).
    if (cur !== ancestor) return { x: 0, y: 0 };
    return { x, y };
  }

  function getFitPad(rect) {
    const base = Math.round(Math.min(rect.width, rect.height) * 0.10);
    return Math.max(20, base);
  }

  function fitToScreen() {
    
    if (!state.frames.length) return;

    const MIN_VIEW_SCALE = VIEW_SCALE_MIN;
    const MAX_VIEW_SCALE = VIEW_SCALE_MAX;
    const MAX_TRIES = 10;

    let tries = 0;

    const attempt = () => {
      tries++;

      const rect = canvasArea.getBoundingClientRect();
      const pad = getFitPad(rect);
      const availW = rect.width - pad * 2;
      const availH = rect.height - pad * 2;

      // Use layout metrics unaffected by the current CSS transform.
      const gridW = framesGrid.offsetWidth;
      const gridH = framesGrid.offsetHeight;

      const dimsOk =
        rect.width > 200 && rect.height > 200 &&
        availW > 0 && availH > 0 &&
        gridW > 40 && gridH > 40;

      const scaleCandidate = dimsOk
        ? Math.min(availW / Math.max(1, gridW), availH / Math.max(1, gridH))
        : NaN;

      if (!Number.isFinite(scaleCandidate)) {
        if (typeof dbg === 'function') {
        }
        if (tries < MAX_TRIES) return queueMicrotask(attempt);
        return;
      }

      const off = getOffsetWithin(framesGrid, canvasInner);

      state.scale = Math.max(MIN_VIEW_SCALE, Math.min(MAX_VIEW_SCALE, scaleCandidate));
      state.panX = (rect.width - gridW * state.scale) / 2 - off.x * state.scale;
      state.panY = (rect.height - gridH * state.scale) / 2 - off.y * state.scale;

      

      updateTransform();

      if (state.drawMode) {
        resizeDrawCanvas();
        compositeAllLayers();
      }
    };

    attempt();
  }

  function zoomTo100() {
    if (!state.frames.length) return;

    state.scale = 1;
    state.panX = 0;
    state.panY = 0;
    updateTransform();

    requestAnimationFrame(() => {
      const areaRect = canvasArea.getBoundingClientRect();

      if (state.viewMode === 'single') {
        const items = framesGrid.querySelectorAll('.frame-item');
        const offset = 0;
        const firstFrame = items[offset];
        if (!firstFrame) return;

        const frameW = firstFrame.offsetWidth;
        const frameH = firstFrame.offsetHeight;
        const off = getOffsetWithin(firstFrame, canvasInner);

        state.panX = (areaRect.width - frameW) / 2 - off.x;
        state.panY = (areaRect.height - frameH) / 2 - off.y;
      } else {
        const gridRect = framesGrid.getBoundingClientRect();
        const areaCx = areaRect.left + areaRect.width * 0.5;
        const areaCy = areaRect.top + areaRect.height * 0.5;
        const gridCx = gridRect.left + gridRect.width * 0.5;
        const gridCy = gridRect.top + gridRect.height * 0.5;

        state.panX += (areaCx - gridCx);
        state.panY += (areaCy - gridCy);
      }

      updateTransform();
      requestAnimationFrame(() => {
        updateExportGuidesOverlay();
        requestComposite();
      });
    });
  }

function fitToSingleFrame() {
    if (!state.frames.length) return;

    const rect = canvasArea.getBoundingClientRect();
    const pad = getFitPad(rect);

    // Find first frame item (skip info card if present)
    const items = framesGrid.querySelectorAll('.frame-item');
    const offset = 0;
    const firstFrame = items[offset];
    if (!firstFrame) return;

    // Use layout metrics (unaffected by current CSS transform)
    const frameW = firstFrame.offsetWidth;
    const frameH = firstFrame.offsetHeight;
    const off = getOffsetWithin(firstFrame, canvasInner);

    const availW = rect.width - pad * 2;
    const availH = rect.height - pad * 2;

    const dimsOk =
      rect.width > 200 && rect.height > 200 &&
      availW > 0 && availH > 0 &&
      frameW > 10 && frameH > 10;

    const scaleCandidate = dimsOk
      ? Math.min(availW / Math.max(1, frameW), availH / Math.max(1, frameH), 3)
      : NaN;

    if (!Number.isFinite(scaleCandidate)) return;

    state.scale = scaleCandidate;
    // Center the frame in viewport
    state.panX = (rect.width - frameW * state.scale) / 2 - off.x * state.scale;
    state.panY = (rect.height - frameH * state.scale) / 2 - off.y * state.scale;

    updateTransform();
  }

  function fitActiveView() {
    if (state.viewMode === 'single') fitToSingleFrame();
    else fitToScreen();
  }

  function requestFitToActiveView() {
    requestAnimationFrame(() => requestAnimationFrame(() => fitActiveView()));
  }

  function refreshActiveViewLayout() {
    requestAnimationFrame(() => {
      fitActiveView();
      requestAnimationFrame(() => {
        updateExportGuidesOverlay();
        requestComposite();
      });
    });
  }

  function setViewMode(mode) {
    state.viewMode = mode;
    qMode.textContent = mode === 'grid' ? 'GRID' : '1';
    qMode.classList.toggle('active', mode === 'single');
    const items = framesGrid.querySelectorAll('.frame-item');
    const offset = 0;
    items.forEach((item, i) => {
      if (i < offset) return;
      if (mode === 'single') {
        item.style.display = (i === offset) ? '' : 'none';
      } else {
        item.style.display = '';
      }
      item.classList.remove('dimmed');
    });
    refreshActiveViewLayout();
  }

  function cycleSelectOption(selectId, delta) {
    const sel = document.getElementById(selectId);
    if (!sel || !sel.options || sel.options.length <= 0) return false;
    const count = sel.options.length;
    sel.selectedIndex = (sel.selectedIndex + delta + count) % count;
    if (typeof sel.onchange === 'function') sel.onchange();
    else sel.dispatchEvent(new Event('change'));
    return true;
  }

  // CONTROLS
  syncGridAspectMode();
  gridColsInput.onchange = () => {
    state.gridCols = resolveIntMenuValue(gridColsInput, state.gridCols || 6, 1, 100);
    invalidateCellCaches();
    gridColsInput.value = state.gridCols;
    state.canvasAspect = 'custom';
    syncGridAspectMode();
    if (state.frames.length) { renderGrid(); updateGridHint(); fitActiveView(); }
  };


  function syncCellSizePresetUI() {
    if (!cellSizePresets) return;
    const cur = Math.max(1, parseInt(cellSizeInput?.value, 10) || state.cellSize || 1);
    cellSizePresets.querySelectorAll('[data-cell-size]').forEach(btn => {
      const presetValue = Math.max(1, parseInt(btn.dataset.cellSize, 10) || 1);
      btn.classList.toggle('active', presetValue === cur);
    });
  }

  function applyCellSizeValue(value) {
    state.cellSize = Math.max(1, Math.min(9999, parseInt(value, 10) || 1));
    if (cellSizeInput) cellSizeInput.value = state.cellSize;
    syncCellSizePresetUI();
    if (state.autoFit && state.frames.length) {
      const cellCount = Math.ceil(getEffectiveFrameTargetCount() / Math.max(1, state.cellSize || 1));
      state.gridCols = calculateOptimalColumns(cellCount);
      if (gridColsInput) gridColsInput.value = state.gridCols;
    }
    updateMetaLayoutInfo();
    if (state.frames.length) debouncedRenderGrid();
  }

  if (cellSizeInput) {
    cellSizeInput.onchange = () => applyCellSizeValue(cellSizeInput.value);
    syncCellSizePresetUI();
  }
  if (cellSizePresets) {
    cellSizePresets.querySelectorAll('[data-cell-size]').forEach(btn => {
      btn.onclick = () => applyCellSizeValue(btn.dataset.cellSize);
    });
  }

  const frameTargetInput = $('frameTargetInput');
  const frameTargetMinus = $('frameTargetMinus'), frameTargetPlus = $('frameTargetPlus');
  const frameTargetPresets = $('frameTargetPresets');
  if (frameTargetInput) {
    frameTargetInput.value = state.frameTarget || 1;
    const syncFrameTargetPresetUI = () => {
      if (!frameTargetPresets) return;
      const cur = Math.max(1, parseInt(frameTargetInput.value, 10) || state.frameTarget || 1);
      frameTargetPresets.querySelectorAll('[data-frame-target]').forEach(btn => {
        const presetValue = Math.max(1, parseInt(btn.dataset.frameTarget, 10) || 1);
        btn.classList.toggle('active', presetValue === cur);
      });
    };
    const applyFrameTarget = () => {
      const v = Math.max(1, parseInt(frameTargetInput.value, 10) || 1);
      state.frameTarget = v;
      frameTargetInput.value = v;
      syncFrameTargetPresetUI();
      if (state.autoFit && state.frames.length) {
        const cellCount = Math.ceil(getEffectiveFrameTargetCount() / Math.max(1, state.cellSize || 1));
        state.gridCols = calculateOptimalColumns(cellCount);
        if (gridColsInput) gridColsInput.value = state.gridCols;
      }
      if (state.frames.length) { renderGrid(); updateGridHint(); fitActiveView(); }
    };
    frameTargetInput.onchange = applyFrameTarget;
    if (frameTargetMinus) frameTargetMinus.onclick = () => {
      frameTargetInput.value = Math.max(1, (parseInt(frameTargetInput.value)||1) - 1);
      applyFrameTarget();
    };
    if (frameTargetPlus) frameTargetPlus.onclick = () => {
      frameTargetInput.value = Math.max(1, (parseInt(frameTargetInput.value)||1) + 1);
      applyFrameTarget();
    };
    if (frameTargetPresets) {
      frameTargetPresets.querySelectorAll('[data-frame-target]').forEach(btn => {
        btn.onclick = () => {
          frameTargetInput.value = Math.max(1, parseInt(btn.dataset.frameTarget, 10) || 1);
          applyFrameTarget();
        };
      });
    }
    syncFrameTargetPresetUI();
  }

  if (gridLoopsInput) {
    gridLoopsInput.onchange = () => {
      state.gridLoops = resolveIntMenuValue(gridLoopsInput, state.gridLoops || 1, 1, 9999);
      gridLoopsInput.value = state.gridLoops;
      if (typeof updateMetaLayoutInfo === 'function') updateMetaLayoutInfo();
      updateAllCells();
    };
  }

  canvasAspectSelect.onchange = () => {
    state.canvasAspect = canvasAspectSelect.value;
    syncGridAspectMode();

    if (state.frames.length) {
      if (state.canvasAspect !== 'custom') {
        const cellCount = getVisibleGridCellCount();
        state.gridCols = calculateOptimalColumns(cellCount);
        gridColsInput.value = state.gridCols;
      }

      renderGrid();
      updateGridHint();
      if (state.autoFit) { requestFitToActiveView(); }
    } else {
      updateGridHint();
    }
  };

  selectionModeSelect.onchange = () => {
    const prev = state.selectionMode;
    state.selectionMode = selectionModeSelect.value;

    // Smart conversion when switching to/from scene mode
    if (state.selectionMode === 'scene' && prev === 'count') {
      // frames → scene: find optimal sceneCount + sceneDepth
      const total = Math.max(1, state.frameCount || 24);
      const depth = total >= 20 ? 4 : 3;          // prefer depth 4 for larger counts, 3 for small
      const scenes = Math.max(1, Math.round(total / depth));
      state.sceneDepth    = depth;
      state.sceneCount    = scenes;
      state.sceneDistance = 1;
      if (sceneCountInput)    sceneCountInput.value    = state.sceneCount;
      if (sceneDepthInput)    sceneDepthInput.value    = state.sceneDepth;
      if (sceneDistanceInput) sceneDistanceInput.value = state.sceneDistance;

    } else if (state.selectionMode === 'count' && prev === 'scene') {
      // scene → frames: restore total frame count
      const total = Math.max(1, (state.sceneCount || 5) * (state.sceneDepth || 4));
      state.frameCount = total;
      frameCountInput.value = total;
    }

    updateIntervalUI(); markRegenPending();
  };

  if (sceneCountInput) {
    const syncScene = () => {
      state.sceneCount    = resolveIntMenuValue(sceneCountInput,    state.sceneCount    || 5,  1, 999);
      state.sceneDepth    = resolveIntMenuValue(sceneDepthInput,    state.sceneDepth    || 8,  1, 999);
      state.sceneDistance = resolveIntMenuValue(sceneDistanceInput, state.sceneDistance || 1,  1, 999);
      sceneCountInput.value    = state.sceneCount;
      sceneDepthInput.value    = state.sceneDepth;
      sceneDistanceInput.value = state.sceneDistance;
      updateGridHint();
      markRegenPending();
    };
    sceneCountInput.onchange = sceneDepthInput.onchange = sceneDistanceInput.onchange = syncScene;
    [sceneCountInput, sceneDepthInput, sceneDistanceInput].forEach(inp => {
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); syncScene(); inp.blur(); } });
    });
    sceneCountMinus.onclick = () => { if (state.sceneCount > 1) { state.sceneCount--; sceneCountInput.value = state.sceneCount; updateGridHint(); markRegenPending(); } };
    sceneCountPlus.onclick = () => { state.sceneCount = (state.sceneCount || 5) + 1; sceneCountInput.value = state.sceneCount; updateGridHint(); markRegenPending(); };
    sceneDepthMinus.onclick = () => { if (state.sceneDepth > 1) { state.sceneDepth--; sceneDepthInput.value = state.sceneDepth; updateGridHint(); markRegenPending(); } };
    sceneDepthPlus.onclick = () => { state.sceneDepth = (state.sceneDepth || 8) + 1; sceneDepthInput.value = state.sceneDepth; updateGridHint(); markRegenPending(); };
    sceneDistanceMinus.onclick = () => { if (state.sceneDistance > 1) { state.sceneDistance--; sceneDistanceInput.value = state.sceneDistance; updateGridHint(); markRegenPending(); } };
    sceneDistancePlus.onclick = () => { state.sceneDistance = (state.sceneDistance || 1) + 1; sceneDistanceInput.value = state.sceneDistance; updateGridHint(); markRegenPending(); };
  }
  frameCountInput.onchange = () => {
    state.frameCount = resolveIntMenuValue(frameCountInput, state.frameCount || 24, 1, 3000);
    frameCountInput.value = state.frameCount;
    updateGridHint();
    markRegenPending();
  };
  
  // Frame count +/-
  countMinus.onclick = () => { if (state.frameCount > 1) { state.frameCount--; frameCountInput.value = state.frameCount; updateGridHint(); }   markRegenPending();
  };
  countPlus.onclick = () => { if (state.frameCount < 10000) { state.frameCount++; frameCountInput.value = state.frameCount; updateGridHint(); }   markRegenPending();
  };
  
  intervalValueInput.onchange = () => { state.intervalValue = Math.max(1, parseInt(intervalValueInput.value) || 1); intervalValueInput.value = state.intervalValue;   markRegenPending();
  };
  
  // Start/End frame inputs
  const frameStep = 10;
  if (startFrameInput) startFrameInput.min = '1';
  if (endFrameInput) endFrameInput.min = '1';
  startMinus.onclick = () => { state.startFrame = Math.max(0, state.startFrame - frameStep); syncFrameRangeInputs();   markRegenPending();
  };
  startPlus.onclick = () => { state.startFrame = Math.min(state.endFrame - 1, state.startFrame + frameStep); syncFrameRangeInputs();   markRegenPending();
  };
  endMinus.onclick = () => { state.endFrame = Math.max(state.startFrame + 1, state.endFrame - frameStep); syncFrameRangeInputs();   markRegenPending();
  };
  endPlus.onclick = () => { const maxFrame = getMaxFrameIndex(); state.endFrame = Math.min(maxFrame, state.endFrame + frameStep); syncFrameRangeInputs();   markRegenPending();
  };
  startFrameInput.onchange = () => {
    const startUser = resolveIntMenuValue(startFrameInput, (state.startFrame || 0) + 1, 1, Math.max(1, state.endFrame || 1));
    state.startFrame = Math.max(0, Math.min(state.endFrame - 1, startUser - 1));
    syncFrameRangeInputs();
    markRegenPending();
  };
  endFrameInput.onchange = () => {
    const maxFrame = getMaxFrameIndex();
    const endUser = resolveIntMenuValue(endFrameInput, (state.endFrame || 0) + 1, 1, maxFrame + 1);
    state.endFrame = Math.max(state.startFrame + 1, Math.min(maxFrame, endUser - 1));
    syncFrameRangeInputs();
    markRegenPending();
  };

  if (cutColsInput) cutColsInput.onchange = () => {
    state.cutCols = clampCutValue(cutColsInput.value, state.cutCols);
    updateCutUI();
    saveCutSettings();
  };
  if (cutRowsInput) cutRowsInput.onchange = () => {
    state.cutRows = clampCutValue(cutRowsInput.value, state.cutRows);
    updateCutUI();
    saveCutSettings();
  };

  const sliceColsMinus = $('sliceColsMinus'), sliceColsPlus = $('sliceColsPlus');
  const sliceRowsMinus = $('sliceRowsMinus'), sliceRowsPlus = $('sliceRowsPlus');

  if (sliceColsMinus) sliceColsMinus.onclick = () => { if (state.cutCols > 1) { state.cutCols--; cutColsInput.value = state.cutCols; updateCutUI(); saveCutSettings(); } };
  if (sliceColsPlus) sliceColsPlus.onclick = () => { if (state.cutCols < 64) { state.cutCols++; cutColsInput.value = state.cutCols; updateCutUI(); saveCutSettings(); } };
  if (sliceRowsMinus) sliceRowsMinus.onclick = () => { if (state.cutRows > 1) { state.cutRows--; cutRowsInput.value = state.cutRows; updateCutUI(); saveCutSettings(); } };
  if (sliceRowsPlus) sliceRowsPlus.onclick = () => { if (state.cutRows < 64) { state.cutRows++; cutRowsInput.value = state.cutRows; updateCutUI(); saveCutSettings(); } };

  const loadNewImageBtn = $('loadNewImageBtn');
  if (loadNewImageBtn) {
    loadNewImageBtn.onclick = () => {
      requestImageImport('cut');
    };
  }
  sliceFirstImageBtn.onclick = () => {
    state.cutCols = clampCutValue(cutColsInput.value, state.cutCols);
    state.cutRows = clampCutValue(cutRowsInput.value, state.cutRows);
    updateCutUI();
    saveCutSettings();
    if (!state.imageFiles || !state.imageFiles.length) {
      requestImageImport('cut');
      return;
    }
    state.imageImportMode = 'cut';
    state.frameCount = Math.min(3000, getCutTotal());
    frameCountInput.value = state.frameCount;
    generateFrames();
  };
  
  const updateQualityResHint = () => {
    const el = document.getElementById('qualityResHint');
    if (!el) return;
    const q = parseFloat(state.quality) || 1;
    const w = state.videoWidth || 0;
    const h = state.videoHeight || 0;
    if (!w || !h) { el.textContent = ''; return; }
    el.textContent = `${Math.round(w * q)}×${Math.round(h * q)}`;
  };

  qualitySelect.onchange = () => {
    state.quality = parseFloat(qualitySelect.value);
    updateQualityResHint();
    markRegenPending();
  };

  function updateIntervalUI() {
    const isScene = state.selectionMode === 'scene';
    const isCount = state.selectionMode === 'count';
    const isSlice = state.selectionMode === 'slice';
    countRow.style.display = isCount ? 'flex' : 'none';
    intervalRow.style.display = (!isCount && !isScene && !isSlice) ? 'flex' : 'none';
    if (!isCount && !isScene && !isSlice) intervalLabel.textContent = state.selectionMode === 'seconds' ? 'Seconds' : 'Frames';
    const sceneDisplay = isScene ? 'flex' : 'none';
    if ($('sceneCountRow')) {
      $('sceneCountRow').style.display = sceneDisplay;
      $('sceneDepthRow').style.display = sceneDisplay;
      $('sceneDistanceRow').style.display = sceneDisplay;
    }
    const sliceDisplay = isSlice ? 'flex' : 'none';
    if ($('sliceColsRow')) {
      $('sliceColsRow').style.display = sliceDisplay;
      $('sliceRowsRow').style.display = sliceDisplay;
      $('sliceTotalRow').style.display = sliceDisplay;
      $('sliceBtnsRow').style.display = isSlice ? 'flex' : 'none';
    }
    updateRegenHint();
  }

  // Metadata bar is always visible in the UI; export metadata is controlled separately.
  // Timecode format toggles

  // Chronophoto bindings
  const toggleChronophoto = $('toggleChronophoto');
  const chronoBlend = $('chronoBlend');
  const chronoDepth = $('chronoDepth');
  const chronoDepthMinus = $('chronoDepthMinus');
  const chronoDepthPlus = $('chronoDepthPlus');
  const chronoOpacity = $('chronoOpacity');
  const chronoOpacityNum = $('chronoOpacityNum');
  const toggleChronoCascade = $('toggleChronoCascade');
  const toggleChronoSeamBlend = $('toggleChronoSeamBlend');
  const chronoSeamModeSelect = $('chronoSeamMode');
  const chronoSeamModeRow = $('chronoSeamModeRow');
  const chronoSeamStrengthInput = $('chronoSeamStrength');
  const chronoSeamStrengthNum = $('chronoSeamStrengthNum');
  const chronoSeamStrengthRow = $('chronoSeamStrengthRow');
  const chronoSeamLengthInput = $('chronoSeamLength');
  const chronoSeamLengthMinus = $('chronoSeamLengthMinus');
  const chronoSeamLengthPlus = $('chronoSeamLengthPlus');
  const chronoSeamLengthRow = $('chronoSeamLengthRow');
  // Initialize state from HTML default if needed
  if (state.chronoDepth === undefined) state.chronoDepth = 5;
  if (state.chronoOpacity === undefined) state.chronoOpacity = 1.0;
  if (state.chronoBlend === undefined) state.chronoBlend = 'darken';
  if (state.chronoStride === undefined) state.chronoStride = 1;
  if (state.chronoCleanLoop === undefined) state.chronoCleanLoop = false;
  if (state.chronoSeamBlend === undefined) state.chronoSeamBlend = false;
  if (state.chronoSeamLength === undefined) state.chronoSeamLength = 0;
  state.chronoSeamMode = normalizeChronoSeamMode(state.chronoSeamMode);
  if (state.chronoSeamStrength === undefined) state.chronoSeamStrength = 0.55;
  if (state.frameDiffEnabled === undefined)  state.frameDiffEnabled  = false;
  if (state.frameDiffPlateIdx === undefined) state.frameDiffPlateIdx = 0;
  if (state.frameDiffBlend === undefined)    state.frameDiffBlend    = 'difference';
  if (state.frameDiffOpacity === undefined)  state.frameDiffOpacity  = 1.0;


  // ── Color Correction ──────────────────────────────────────────────────────
  // buildCCFilter → top-level

  const toggleCC        = $('toggleCC');
  const ccBrightness    = $('ccBrightness');    const ccBrightnessNum    = $('ccBrightnessNum');
  const ccContrast      = $('ccContrast');      const ccContrastNum      = $('ccContrastNum');
  const ccSaturation    = $('ccSaturation');    const ccSaturationNum    = $('ccSaturationNum');
  const ccHue           = $('ccHue');           const ccHueNum           = $('ccHueNum');
  const ccResetBtn      = $('ccReset');

  if (toggleCC) {
    toggleCC.onclick = () => {
      state.cc.enabled = !state.cc.enabled;
      toggleCC.classList.toggle('active', state.cc.enabled);
      updateAllCells();
    };
  }

  // Invert toggle
  const toggleCCInvert = $('toggleCCInvert');
  if (toggleCCInvert) {
    toggleCCInvert.onclick = () => {
      state.cc.invert = !state.cc.invert;
      toggleCCInvert.classList.toggle('active', state.cc.invert);
      updateAllCells();
    };
  }


  // ── COLORAMA controls ────────────────────────────────────────────────────
  const toggleColorama       = $('toggleColorama');
  const caColorA             = $('caColorA');
  const caColorB             = $('caColorB');
  const caColorC             = $('caColorC');
  const caOffset             = $('caOffset');
  const caOffsetNum          = $('caOffsetNum');
  const caBlend              = $('caBlend');
  const caOpacity            = $('caOpacity');
  const caOpacityNum         = $('caOpacityNum');
  const caResetBtn           = $('caReset');
  const caSpeed              = $('caSpeed');
  const toggleCACascade      = $('toggleCACascade');
  const caCascadeAmt         = $('caCascadeAmt');
  const caCascadeAmtNum      = $('caCascadeAmtNum');

  function syncColoramaUI() {
    const ca = state.colorama;
    if (toggleColorama)         toggleColorama.classList.toggle('active', !!ca.enabled);
    if (toggleCACascade)        toggleCACascade.classList.toggle('active', !!ca.cascade);
    if (caColorA)    caColorA.value    = ca.colorA  || '#0a0a2e';
    if (caColorB)    caColorB.value    = ca.colorB  || '#ff4400';
    if (caColorC)    caColorC.value    = ca.colorC  || '#ffee00';
    if (caOffset)    caOffset.value    = ca.offset  || 0;
    if (caOffsetNum) caOffsetNum.value = ca.offset  || 0;
    if (caBlend)     caBlend.value     = ca.blend   || 'normal';
    if (caOpacity)   caOpacity.value   = isFinite(ca.opacity) ? ca.opacity : 1;
    if (caOpacityNum) caOpacityNum.value = isFinite(ca.opacity) ? ca.opacity : 1;
    if (caSpeed)     caSpeed.value     = ca.speed   || 0;
    if (caCascadeAmt)    caCascadeAmt.value    = isFinite(ca.cascadeAmt) ? ca.cascadeAmt : 1;
    if (caCascadeAmtNum) caCascadeAmtNum.value = isFinite(ca.cascadeAmt) ? ca.cascadeAmt : 1;
    const cascadeRow = document.getElementById('caCascadeAmtRow');
    if (cascadeRow) cascadeRow.style.display = ca.cascade ? '' : 'none';
    updateColoramaSVG();
  }

  function onColoramaChange() {
    const ca = state.colorama;
    if (caColorA)    ca.colorA  = caColorA.value;
    if (caColorB)    ca.colorB  = caColorB.value;
    if (caColorC)    ca.colorC  = caColorC.value;
    if (caOffset)  { ca.offset  = parseFloat(caOffset.value) || 0;
                     if (caOffsetNum) caOffsetNum.value = ca.offset; }
    if (caBlend)     ca.blend   = caBlend.value;
    if (caOpacity) { ca.opacity = parseFloat(caOpacity.value);
                     if (caOpacityNum) caOpacityNum.value = ca.opacity; }
    if (caSpeed)     ca.speed   = parseInt(caSpeed.value) || 0;
    if (caCascadeAmt) { ca.cascadeAmt = parseFloat(caCascadeAmt.value) || 0;
                        if (caCascadeAmtNum) caCascadeAmtNum.value = ca.cascadeAmt; }
    const cascadeRow = document.getElementById('caCascadeAmtRow');
    if (cascadeRow) cascadeRow.style.display = ca.cascade ? '' : 'none';
    updateColoramaSVG();
    updateAllCells();
  }

  if (toggleColorama) {
    toggleColorama.onclick = () => {
      state.colorama.enabled = !state.colorama.enabled;
      toggleColorama.classList.toggle('active', state.colorama.enabled);
      updateColoramaSVG();
      updateAllCells();
    };
  }
  if (toggleCACascade) {
    toggleCACascade.onclick = () => {
      state.colorama.cascade = !state.colorama.cascade;
      toggleCACascade.classList.toggle('active', state.colorama.cascade);
      const cascadeRow = document.getElementById('caCascadeAmtRow');
      if (cascadeRow) cascadeRow.style.display = state.colorama.cascade ? '' : 'none';
      updateColoramaSVG();
      updateAllCells();
    };
  }
  if (caSpeed) caSpeed.onchange = onColoramaChange;
  if (caCascadeAmt)    caCascadeAmt.oninput    = onColoramaChange;
  if (caCascadeAmtNum) caCascadeAmtNum.oninput = () => {
    const v = parseFloat(caCascadeAmtNum.value);
    if (!isNaN(v) && caCascadeAmt) caCascadeAmt.value = v;
    onColoramaChange();
  };
  if (caColorA)    caColorA.oninput    = onColoramaChange;
  if (caColorB)    caColorB.oninput    = onColoramaChange;
  if (caColorC)    caColorC.oninput    = onColoramaChange;
  if (caOffset)    caOffset.oninput    = onColoramaChange;
  if (caOffsetNum) caOffsetNum.oninput = () => {
    const v = parseFloat(caOffsetNum.value);
    if (!isNaN(v) && caOffset) caOffset.value = v;
    onColoramaChange();
  };
  if (caBlend)     caBlend.onchange    = onColoramaChange;
  if (caOpacity)   caOpacity.oninput   = onColoramaChange;
  if (caOpacityNum) caOpacityNum.oninput = () => {
    const v = parseFloat(caOpacityNum.value);
    if (!isNaN(v) && caOpacity) caOpacity.value = v;
    onColoramaChange();
  };
  if (caResetBtn) {
    caResetBtn.onclick = () => {
      state.colorama = { enabled: state.colorama.enabled, allLayers: true,
        colorA: '#0a0a2e', colorB: '#ff4400', colorC: '#ffee00',
        offset: 0, blend: 'normal', opacity: 1.0,
        speed: 0, cascade: false, cascadeAmt: 1.0 };
      syncColoramaUI();
      updateColoramaSVG();
      updateAllCells();
    };
  }

  // Init colorama bar on load
  setTimeout(() => { updateColoramaSVG(); }, 100);


  function makeCCSlider(slider, num, key, parse) {
    parse = parse || parseFloat;
    if (!slider) return;
    slider.oninput = () => {
      state.cc[key] = parse(slider.value);
      if (num) num.value = state.cc[key];
      updateAllCells();
    };
    if (num) num.oninput = () => {
      const v = parse(num.value);
      if (!isNaN(v)) {
        state.cc[key] = v;
        slider.value = v;
        updateAllCells();
      }
    };
  }
  makeCCSlider(ccBrightness, ccBrightnessNum, 'brightness');
  makeCCSlider(ccContrast,   ccContrastNum,   'contrast');
  makeCCSlider(ccSaturation, ccSaturationNum, 'saturation');
  makeCCSlider(ccHue,        ccHueNum,        'hue', parseInt);

  if (ccResetBtn) {
    ccResetBtn.onclick = () => {
      state.cc.brightness = 1; state.cc.contrast = 1;
      state.cc.saturation = 1; state.cc.hue = 0;
      state.cc.invert = false; state.cc.allLayers = true;
      ccBrightness.value = ccBrightnessNum.value = 1;
      ccContrast.value   = ccContrastNum.value   = 1;
      ccSaturation.value = ccSaturationNum.value = 1;
      ccHue.value        = ccHueNum.value        = 0;
      if (toggleCCInvert)    toggleCCInvert.classList.remove('active');
      updateAllCells();
    };
  }

  const updateChronoUI = () => {
    syncChronoSeamUI();
    updateAllCells();
  };

  function syncChronoSeamUI() {
    const seamEnabled = !!state.chronoSeamBlend;
    const seamMode = getChronoSeamMode();
    const seamStrength = getChronoSeamStrength();
    if (toggleChronoSeamBlend) toggleChronoSeamBlend.classList.toggle('active', !!state.chronoSeamBlend);
    if (chronoSeamModeSelect) chronoSeamModeSelect.value = seamMode;
    if (chronoSeamModeRow) chronoSeamModeRow.style.display = seamEnabled ? '' : 'none';
    if (chronoSeamStrengthInput) chronoSeamStrengthInput.value = seamStrength.toFixed(2);
    if (chronoSeamStrengthNum) chronoSeamStrengthNum.value = seamStrength.toFixed(2);
    if (chronoSeamStrengthRow) chronoSeamStrengthRow.style.display = seamEnabled && seamMode !== 'frame-full' ? '' : 'none';
    if (chronoSeamLengthInput) chronoSeamLengthInput.value = Math.max(0, Math.round(Number(state.chronoSeamLength) || 0));
    if (chronoSeamLengthRow) chronoSeamLengthRow.style.display = seamEnabled ? '' : 'none';
  }

  if (toggleChronoCascade) {
    toggleChronoCascade.onclick = () => {
      state.chronoCascade = !state.chronoCascade;
      toggleChronoCascade.classList.toggle('active', state.chronoCascade);
      updateChronoUI();
    };
    toggleChronoCascade.classList.toggle('active', !!state.chronoCascade);
  }

  const toggleChronoCascadeMirror = $('toggleChronoCascadeMirror');
  if (toggleChronoCascadeMirror) {
    toggleChronoCascadeMirror.classList.toggle('active', !!state.chronoCascadeMirror);
    toggleChronoCascadeMirror.onclick = () => {
      state.chronoCascadeMirror = !state.chronoCascadeMirror;
      toggleChronoCascadeMirror.classList.toggle('active', state.chronoCascadeMirror);
      updateChronoUI();
    };
  }

  const cascadeConstInput = $('chronoCascadeConst');
  const cascadeConstMinus = $('chronoCascadeConstMinus');
  const cascadeConstPlus  = $('chronoCascadeConstPlus');
  if (cascadeConstInput) {
    cascadeConstInput.value = state.chronoCascadeConst || 1;
    const updateConst = () => {
      const v = Math.max(1, Math.min(24, parseInt(cascadeConstInput.value, 10) || 1));
      state.chronoCascadeConst = v;
      cascadeConstInput.value = v;
      updateChronoUI();
    };
    cascadeConstInput.onchange = updateConst;
    if (cascadeConstMinus) cascadeConstMinus.onclick = () => { cascadeConstInput.value = Math.max(1, (parseInt(cascadeConstInput.value)||1) - 1); updateConst(); };
    if (cascadeConstPlus)  cascadeConstPlus.onclick  = () => { cascadeConstInput.value = Math.min(24, (parseInt(cascadeConstInput.value)||1) + 1); updateConst(); };
  }

  // ── Phase Stride ──────────────────────────────────────────────────────────
  const chronoStrideInput  = $('chronoStride');
  const chronoStrideMinus  = $('chronoStrideMinus');
  const chronoStridePlus   = $('chronoStridePlus');
  if (chronoStrideInput) {
    chronoStrideInput.value = state.chronoStride || 1;
    chronoStrideInput.onchange = () => {
      state.chronoStride = Math.max(1, Math.min(50, parseInt(chronoStrideInput.value) || 1));
      chronoStrideInput.value = state.chronoStride;
      updateChronoUI();
    };
  }
  if (chronoStrideMinus) {
    chronoStrideMinus.onclick = () => {
      if (state.chronoStride > 1) {
        state.chronoStride--;
        if (chronoStrideInput) chronoStrideInput.value = state.chronoStride;
        updateChronoUI();
      }
    };
  }
  if (chronoStridePlus) {
    chronoStridePlus.onclick = () => {
      if (state.chronoStride < 50) {
        state.chronoStride++;
        if (chronoStrideInput) chronoStrideInput.value = state.chronoStride;
        updateChronoUI();
      }
    };
  }

  // ── Clean Loop ────────────────────────────────────────────────────────────
  const toggleChronoCleanLoop = $('toggleChronoCleanLoop');
  if (toggleChronoCleanLoop) {
    toggleChronoCleanLoop.classList.toggle('active', !!state.chronoCleanLoop);
    toggleChronoCleanLoop.onclick = () => {
      state.chronoCleanLoop = !state.chronoCleanLoop;
      toggleChronoCleanLoop.classList.toggle('active', state.chronoCleanLoop);
      updateChronoUI();
    };
  }

  if (toggleChronoSeamBlend) {
    syncChronoSeamUI();
    toggleChronoSeamBlend.onclick = () => {
      state.chronoSeamBlend = !state.chronoSeamBlend;
      syncChronoSeamUI();
      updateChronoUI();
    };
  }

  if (chronoSeamModeSelect) {
    chronoSeamModeSelect.onchange = () => {
      state.chronoSeamMode = normalizeChronoSeamMode(chronoSeamModeSelect.value);
      syncChronoSeamUI();
      updateChronoUI();
    };
  }

  function applyChronoSeamStrength(value) {
    const v = Math.max(0.05, Math.min(1, Number(value) || 0.55));
    state.chronoSeamStrength = v;
    if (chronoSeamStrengthInput) chronoSeamStrengthInput.value = v.toFixed(2);
    if (chronoSeamStrengthNum) chronoSeamStrengthNum.value = v.toFixed(2);
    updateChronoUI();
  }

  if (chronoSeamStrengthInput) {
    chronoSeamStrengthInput.oninput = () => applyChronoSeamStrength(chronoSeamStrengthInput.value);
  }
  if (chronoSeamStrengthNum) {
    chronoSeamStrengthNum.oninput = () => applyChronoSeamStrength(chronoSeamStrengthNum.value);
    chronoSeamStrengthNum.onchange = () => {
      chronoSeamStrengthNum.value = getChronoSeamStrength().toFixed(2);
    };
  }

  function applyChronoSeamLength(value) {
    const v = Math.max(0, Math.min(300, Math.round(Number(value) || 0)));
    state.chronoSeamLength = v;
    if (chronoSeamLengthInput) chronoSeamLengthInput.value = v;
    updateChronoUI();
  }

  if (chronoSeamLengthInput) {
    chronoSeamLengthInput.onchange = () => applyChronoSeamLength(chronoSeamLengthInput.value);
  }
  if (chronoSeamLengthMinus) {
    chronoSeamLengthMinus.onclick = () => applyChronoSeamLength((Number(state.chronoSeamLength) || 0) - 1);
  }
  if (chronoSeamLengthPlus) {
    chronoSeamLengthPlus.onclick = () => applyChronoSeamLength((Number(state.chronoSeamLength) || 0) + 1);
  }
  syncChronoSeamUI();

  // ── Frame Diff ─────────────────────────────────────────────────────────────
  const toggleFrameDiff      = $('toggleFrameDiff');
  const frameDiffControls    = $('frameDiffControls');
  const frameDiffPlateInput  = $('frameDiffPlateInput');
  const frameDiffPlateMinus  = $('frameDiffPlateMinus');
  const frameDiffPlatePlus   = $('frameDiffPlatePlus');
  const frameDiffBlendSelect = $('frameDiffBlendSelect');
  const frameDiffOpacityEl   = $('frameDiffOpacity');
  const frameDiffOpacityNum  = $('frameDiffOpacityNum');

  const updateFrameDiffUI = () => { updateAllCells(); };

  const syncFrameDiffUI = () => {
    const on = !!state.frameDiffEnabled;
    if (toggleFrameDiff) toggleFrameDiff.classList.toggle('active', on);
    if (frameDiffControls) frameDiffControls.style.display = on ? '' : 'none';
    if (frameDiffPlateInput) {
      frameDiffPlateInput.max = Math.max(0, state.frames.length - 1);
      frameDiffPlateInput.value = state.frameDiffPlateIdx || 0;
    }
    if (frameDiffModeSelect) frameDiffModeSelect.value = state.frameDiffPlateMode || 'static';
    if (frameDiffStepRow) frameDiffStepRow.style.display = '';
    if (frameDiffLoopRow) frameDiffLoopRow.style.display = '';
    if (frameDiffOffsetRow) frameDiffOffsetRow.style.display = '';
    if (frameDiffStepInput) frameDiffStepInput.value = state.frameDiffPlateStep || 1;
    if (frameDiffLoopInput) frameDiffLoopInput.value = state.frameDiffPlateLoopN || 1;
    if (frameDiffOffsetInput) frameDiffOffsetInput.value = state.frameDiffPlateOffset || 0;
    if (frameDiffBlendSelect) frameDiffBlendSelect.value = state.frameDiffBlend || 'difference';
    if (frameDiffOpacityEl)  frameDiffOpacityEl.value  = (state.frameDiffOpacity !== undefined) ? state.frameDiffOpacity : 1.0;
    if (frameDiffOpacityNum) frameDiffOpacityNum.value = (state.frameDiffOpacity !== undefined) ? state.frameDiffOpacity : 1.0;
  };

  if (toggleFrameDiff) {
    syncFrameDiffUI();
    toggleFrameDiff.onclick = () => {
      state.frameDiffEnabled = !state.frameDiffEnabled;
      syncFrameDiffUI();
      updateFrameDiffUI();
    };
  }
  if (frameDiffPlateInput) {
    frameDiffPlateInput.onchange = () => {
      const max = Math.max(0, state.frames.length - 1);
      state.frameDiffPlateIdx = Math.max(0, Math.min(max, parseInt(frameDiffPlateInput.value) || 0));
      frameDiffPlateInput.value = state.frameDiffPlateIdx;
      updateFrameDiffUI();
    };
  }
  if (frameDiffModeSelect) {
    frameDiffModeSelect.onchange = () => {
      state.frameDiffPlateMode = frameDiffModeSelect.value || 'static';
      updateFrameDiffUI();
    };
  }
  if (frameDiffStepInput) {
    frameDiffStepInput.onchange = () => {
      state.frameDiffPlateStep = Math.max(1, parseInt(frameDiffStepInput.value) || 1);
      frameDiffStepInput.value = state.frameDiffPlateStep;
      updateFrameDiffUI();
    };
  }
  if (frameDiffStepMinus) {
    frameDiffStepMinus.onclick = () => {
      state.frameDiffPlateStep = Math.max(1, (state.frameDiffPlateStep || 1) - 1);
      if (frameDiffStepInput) frameDiffStepInput.value = state.frameDiffPlateStep;
      updateFrameDiffUI();
    };
  }
  if (frameDiffStepPlus) {
    frameDiffStepPlus.onclick = () => {
      state.frameDiffPlateStep = (state.frameDiffPlateStep || 1) + 1;
      if (frameDiffStepInput) frameDiffStepInput.value = state.frameDiffPlateStep;
      updateFrameDiffUI();
    };
  }
  if (frameDiffLoopInput) {
    frameDiffLoopInput.onchange = () => {
      state.frameDiffPlateLoopN = Math.max(1, parseInt(frameDiffLoopInput.value) || 1);
      frameDiffLoopInput.value = state.frameDiffPlateLoopN;
      updateFrameDiffUI();
    };
  }
  if (frameDiffLoopMinus) {
    frameDiffLoopMinus.onclick = () => {
      state.frameDiffPlateLoopN = Math.max(1, (state.frameDiffPlateLoopN || 1) - 1);
      if (frameDiffLoopInput) frameDiffLoopInput.value = state.frameDiffPlateLoopN;
      updateFrameDiffUI();
    };
  }
  if (frameDiffLoopPlus) {
    frameDiffLoopPlus.onclick = () => {
      state.frameDiffPlateLoopN = (state.frameDiffPlateLoopN || 1) + 1;
      if (frameDiffLoopInput) frameDiffLoopInput.value = state.frameDiffPlateLoopN;
      updateFrameDiffUI();
    };
  }
  if (frameDiffOffsetInput) {
    frameDiffOffsetInput.onchange = () => {
      state.frameDiffPlateOffset = Math.max(0, parseInt(frameDiffOffsetInput.value) || 0);
      frameDiffOffsetInput.value = state.frameDiffPlateOffset;
      updateFrameDiffUI();
    };
  }
  if (frameDiffOffsetMinus) {
    frameDiffOffsetMinus.onclick = () => {
      state.frameDiffPlateOffset = Math.max(0, (state.frameDiffPlateOffset || 0) - 1);
      if (frameDiffOffsetInput) frameDiffOffsetInput.value = state.frameDiffPlateOffset;
      updateFrameDiffUI();
    };
  }
  if (frameDiffOffsetPlus) {
    frameDiffOffsetPlus.onclick = () => {
      state.frameDiffPlateOffset = (state.frameDiffPlateOffset || 0) + 1;
      if (frameDiffOffsetInput) frameDiffOffsetInput.value = state.frameDiffPlateOffset;
      updateFrameDiffUI();
    };
  }
  if (frameDiffPlateMinus) {
    frameDiffPlateMinus.onclick = () => {
      if (state.frameDiffPlateIdx > 0) {
        state.frameDiffPlateIdx--;
        if (frameDiffPlateInput) frameDiffPlateInput.value = state.frameDiffPlateIdx;
        updateFrameDiffUI();
      }
    };
  }
  if (frameDiffPlatePlus) {
    frameDiffPlatePlus.onclick = () => {
      const max = Math.max(0, state.frames.length - 1);
      if (state.frameDiffPlateIdx < max) {
        state.frameDiffPlateIdx++;
        if (frameDiffPlateInput) frameDiffPlateInput.value = state.frameDiffPlateIdx;
        updateFrameDiffUI();
      }
    };
  }
  if (frameDiffBlendSelect) {
    frameDiffBlendSelect.onchange = () => {
      state.frameDiffBlend = frameDiffBlendSelect.value;
      updateFrameDiffUI();
    };
  }
  if (frameDiffOpacityEl) {
    frameDiffOpacityEl.oninput = () => {
      state.frameDiffOpacity = parseFloat(frameDiffOpacityEl.value);
      if (frameDiffOpacityNum) frameDiffOpacityNum.value = state.frameDiffOpacity.toFixed(2);
      updateFrameDiffUI();
    };
  }
  if (frameDiffOpacityNum) {
    frameDiffOpacityNum.oninput = () => {
      const v = Math.max(0.01, Math.min(1.0, parseFloat(frameDiffOpacityNum.value) || 1.0));
      state.frameDiffOpacity = v;
      if (frameDiffOpacityEl) frameDiffOpacityEl.value = v;
      updateFrameDiffUI();
    };
  }


  if (toggleChronophoto) {
    toggleChronophoto.onclick = () => {
      state.chronoEnabled = !state.chronoEnabled;
      toggleChronophoto.classList.toggle('active', state.chronoEnabled);
      updateChronoUI();
    };
  }

  if (chronoBlend) {
    chronoBlend.onchange = () => {
      state.chronoBlend = chronoBlend.value;
      updateChronoUI();
    };
  }

  if (chronoDepth) {
    chronoDepth.onchange = () => {
      state.chronoDepth = Math.max(1, Math.min(100, parseInt(chronoDepth.value) || 1));
      chronoDepth.value = state.chronoDepth;
      updateChronoUI();
    };
  }

  if (chronoDepthMinus) {
    chronoDepthMinus.onclick = () => {
      if (state.chronoDepth > 1) {
        state.chronoDepth--;
        chronoDepth.value = state.chronoDepth;
        updateChronoUI();
      }
    };
  }

  if (chronoDepthPlus) {
    chronoDepthPlus.onclick = () => {
      if (state.chronoDepth < 100) {
        state.chronoDepth++;
        chronoDepth.value = state.chronoDepth;
        updateChronoUI();
      }
    };
  }

  if (chronoOpacity) {
    chronoOpacity.oninput = () => {
      state.chronoOpacity = parseFloat(chronoOpacity.value) || 0.05;
      if (chronoOpacityNum) chronoOpacityNum.value = state.chronoOpacity.toFixed(2);
      updateChronoUI();
    };
  }

  if (chronoOpacityNum) {
    chronoOpacityNum.oninput = () => {
      const v = parseFloat(chronoOpacityNum.value);
      state.chronoOpacity = isNaN(v) ? 0.05 : Math.max(0.01, Math.min(1.0, v));
      if (chronoOpacity) chronoOpacity.value = String(state.chronoOpacity);
      updateChronoUI();
    };
    chronoOpacityNum.onchange = () => {
        chronoOpacityNum.value = state.chronoOpacity.toFixed(2);
    }
  }

  const toggleTcIndex = $('toggleTcIndex');
  const toggleTcTime = $('toggleTcTime');
  const toggleTcFrame = $('toggleTcFrame');
  const toggleTcText = $('toggleTcText');
  const toggleTcFilename = $('toggleTcFilename');
  const toggleTcDisplayName = $('toggleTcDisplayName');
  const tcCustomTextRow = $('tcCustomTextRow');
  const tcCustomTextInput = $('tcCustomTextInput');
  const tcFilenameTailRow = $('tcFilenameTailRow');
  const tcFilenameTailInput = $('tcFilenameTailInput');
  const tcFilenameTailMinus = $('tcFilenameTailMinus');
  const tcFilenameTailPlus = $('tcFilenameTailPlus');
  if (state.tcShowFilename === undefined) state.tcShowFilename = false;
  if (state.tcShowDisplayName === undefined) state.tcShowDisplayName = false;
  if (state.tcFilenameTail === undefined) state.tcFilenameTail = 24;
  
  function updateAllTimecodes() {
    const items = framesGrid.querySelectorAll('.frame-item');
    const offset = 0;
    const cellCount = Math.ceil(getEffectiveFrameTargetCount() / Math.max(1, state.cellSize || 1));
    items.forEach((item, i) => {
      if (i < offset) return;
      const cellIdx = i - offset;
      const frameIdx = parseInt(item.dataset.frameIdx) || 0;
      const frame = state.frames[frameIdx];
      const tc = item.querySelector('.frame-timecode');
      if (tc && frame) {
        const derivedIdx = getDerivedIndexFromFrameIdx(frameIdx);
        tc.textContent = formatTimecode(frame, derivedIdx, cellCount, frameIdx);
      }
    });
    updateTimecodeVisibility();
  }
  
  if (toggleTcIndex) toggleTcIndex.onclick = () => { state.tcShowIndex = !state.tcShowIndex; toggleTcIndex.classList.toggle('active-toggle', state.tcShowIndex); updateAllTimecodes(); updateTimecodeVisibility(); };
  if (toggleTcTime) toggleTcTime.onclick = () => { state.tcShowTime = !state.tcShowTime; toggleTcTime.classList.toggle('active-toggle', state.tcShowTime); updateAllTimecodes(); updateTimecodeVisibility(); };
  if (toggleTcFrame) toggleTcFrame.onclick = () => { state.tcShowFrame = !state.tcShowFrame; toggleTcFrame.classList.toggle('active-toggle', state.tcShowFrame); updateAllTimecodes(); updateTimecodeVisibility(); };
  
  if (toggleTcText) toggleTcText.onclick = () => {
    state.tcShowText = !state.tcShowText;
    toggleTcText.classList.toggle('active-toggle', state.tcShowText);
    if (tcCustomTextRow) tcCustomTextRow.style.display = state.tcShowText ? 'flex' : 'none';
    updateAllTimecodes();
    updateTimecodeVisibility();
  };

  function syncTcFilenameUI() {
    const enabled = !!(state.tcShowFilename || state.tcShowDisplayName);
    const tail = Math.max(0, Math.min(300, Math.round(Number(state.tcFilenameTail) || 0)));
    state.tcFilenameTail = tail;
    if (toggleTcFilename) toggleTcFilename.classList.toggle('active-toggle', !!state.tcShowFilename);
    if (toggleTcDisplayName) toggleTcDisplayName.classList.toggle('active-toggle', !!state.tcShowDisplayName);
    if (tcFilenameTailRow) tcFilenameTailRow.style.display = enabled ? 'flex' : 'none';
    if (tcFilenameTailInput) tcFilenameTailInput.value = tail;
  }

  function applyTcFilenameTail(value) {
    state.tcFilenameTail = Math.max(0, Math.min(300, Math.round(Number(value) || 0)));
    syncTcFilenameUI();
    updateAllTimecodes();
    updateTimecodeVisibility();
  }

  if (toggleTcFilename) {
    toggleTcFilename.onclick = () => {
      state.tcShowFilename = !state.tcShowFilename;
      syncTcFilenameUI();
      updateAllTimecodes();
      updateTimecodeVisibility();
    };
  }
  if (toggleTcDisplayName) {
    toggleTcDisplayName.onclick = () => {
      state.tcShowDisplayName = !state.tcShowDisplayName;
      syncTcFilenameUI();
      updateAllTimecodes();
      updateTimecodeVisibility();
    };
  }
  if (tcFilenameTailInput) {
    tcFilenameTailInput.onchange = () => applyTcFilenameTail(tcFilenameTailInput.value);
  }
  if (tcFilenameTailMinus) {
    tcFilenameTailMinus.onclick = () => applyTcFilenameTail((Number(state.tcFilenameTail) || 0) - 1);
  }
  if (tcFilenameTailPlus) {
    tcFilenameTailPlus.onclick = () => applyTcFilenameTail((Number(state.tcFilenameTail) || 0) + 1);
  }

  if (tcCustomTextInput) {
    tcCustomTextInput.value = state.tcCustomText || '';
    tcCustomTextInput.oninput = () => {
      state.tcCustomText = tcCustomTextInput.value || '';
      updateAllTimecodes();
      updateTimecodeVisibility();
    };
  }
  // Init text toggle UI
  if (toggleTcText) toggleTcText.classList.toggle('active-toggle', !!state.tcShowText);
  if (tcCustomTextRow) tcCustomTextRow.style.display = state.tcShowText ? 'flex' : 'none';
  syncTcFilenameUI();

  toggleAutoFit.onclick = () => {
    syncGridAspectMode();
  };


  function hexToRgba(hex, a) {
    let str = String(hex || '').trim();
    if (str.startsWith('var(')) {
      const varName = str.match(/var\(([^,)]+)/)?.[1];
      if (varName) {
        const computed = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        if (computed) str = computed;
      }
      if (str.startsWith('var(') || !str) {
        const fallback = str.match(/,\s*(#[0-9a-fA-F]+)/)?.[1];
        if (fallback) str = fallback;
      }
    }
    const h = str.replace('#', '').trim();
    const full = h.length === 3 ? h.split('').map(ch => ch + ch).join('') : h.padEnd(6, '0').slice(0, 6);
    const r = parseInt(full.slice(0, 2), 16) || 0;
    const g = parseInt(full.slice(2, 4), 16) || 0;
    const b = parseInt(full.slice(4, 6), 16) || 0;
    const alpha = Math.max(0, Math.min(1, Number.isFinite(a) ? a : 0));
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function updateBgAppearance() {
    const bg = String(state.bgColor || '#020202');
    app.style.setProperty('--bg-color', bg);
    canvasArea.style.backgroundColor = bg;
    if (!bgGridLayer) return;
    const show = !!state.bgGridShow;
    bgGridLayer.style.display = show ? 'block' : 'none';
    if (!show) {
      bgGridLayer.style.backgroundImage = 'none';
      return;
    }
    const size = Math.max(6, parseInt(state.bgGridSize, 10) || 24);
    const opacity = Math.max(0, Math.min(1, Number(state.bgGridOpacity) || 0));
    const color = hexToRgba(state.bgGridColor || '#ffffff', opacity);
    if ((state.bgGridType || 'lines') === 'dots') {
      const dot = Math.max(1, Math.min(3, Math.round(size * 0.08)));
      bgGridLayer.style.backgroundImage = `radial-gradient(circle at ${dot}px ${dot}px, ${color} ${dot}px, transparent ${dot + 0.5}px)`;
    } else {
      bgGridLayer.style.backgroundImage = `linear-gradient(to right, ${color} 1px, transparent 1px), linear-gradient(to bottom, ${color} 1px, transparent 1px)`;
    }
    bgGridLayer.style.backgroundSize = `${size}px ${size}px`;
    bgGridLayer.style.backgroundPosition = '0 0';
  }

  fontSizeSlider.oninput = () => { state.fontSize = parseInt(fontSizeSlider.value); fontSizeValue.textContent = `${state.fontSize}px`; framesGrid.style.setProperty('--meta-font-size', `${state.fontSize}px`); };
  function applySpacing(val) {
    state.spacing = Math.max(0, val);
    if (spacingInput) spacingInput.value = state.spacing;
    framesGrid.style.setProperty('--grid-gap', `${state.spacing}px`);
    framesGrid.style.setProperty('--cell-margin', `0px`);
    framesGrid.classList.toggle('seamless', Number(state.spacing) === 0);
  }
  if (spacingInput) {
    spacingInput.onchange = () => { applySpacing(parseInt(spacingInput.value) || 0); };
    spacingMinus.onclick = () => { applySpacing(Math.max(0, state.spacing - 1)); };
    spacingPlus.onclick = () => { applySpacing(Math.min(200, state.spacing + 1)); };
  }
  bgColorInput.oninput = () => { state.bgColor = bgColorInput.value; updateBgAppearance(); };
  const accentColorInput = $('fgAccentColor');
  if (accentColorInput) {
    accentColorInput.value = state.fgAccentColor || '#35f2a3';
    accentColorInput.oninput = () => {
      state.fgAccentColor = accentColorInput.value;
      document.documentElement.style.setProperty('--fg-accent', state.fgAccentColor);
      updateLogoFromTick(); // Redraw logo in UI
    };
  }

  const accent2ColorInput = $('fgAccent2Color');
  if (accent2ColorInput) {
    accent2ColorInput.value = state.accent2Color || '#f28c35';
    accent2ColorInput.oninput = () => {
      state.accent2Color = accent2ColorInput.value;
      document.documentElement.style.setProperty('--fg-accent2', state.accent2Color);
      updateLogoFromTick();
    };
  }

  if (toggleBgGrid) {
    toggleBgGrid.onclick = () => {
      state.bgGridShow = !state.bgGridShow;
      toggleBgGrid.classList.toggle('active', !!state.bgGridShow);
      updateBgAppearance();
    };
  }
  if (bgGridTypeSelect) {
    bgGridTypeSelect.onchange = () => {
      state.bgGridType = bgGridTypeSelect.value || 'lines';
      updateBgAppearance();
    };
  }
  if (bgGridColorInput) {
    bgGridColorInput.oninput = () => {
      state.bgGridColor = bgGridColorInput.value || '#ffffff';
      updateBgAppearance();
    };
  }
  if (bgGridOpacitySlider) {
    bgGridOpacitySlider.oninput = () => {
      state.bgGridOpacity = Math.max(0, Math.min(1, (parseInt(bgGridOpacitySlider.value, 10) || 0) / 100));
      if (bgGridOpacityValue) bgGridOpacityValue.textContent = `${Math.round(state.bgGridOpacity * 100)}%`;
      updateBgAppearance();
    };
  }
  if (bgGridSizeSlider) {
    bgGridSizeSlider.oninput = () => {
      state.bgGridSize = Math.max(6, parseInt(bgGridSizeSlider.value, 10) || 24);
      if (bgGridSizeValue) bgGridSizeValue.textContent = `${state.bgGridSize}px`;
      updateBgAppearance();
    };
  }
    // Helper for dual slider+number inputs
  function bindDualInput(stateKey, sliderEl, numEl, min, max, decimals, callback, syncCallback) {
    if (!sliderEl && !numEl) return;

    const formatVal = (v) => decimals > 0 ? v.toFixed(decimals) : String(Math.round(v));

    if (sliderEl) {
      sliderEl.oninput = () => {
        let v = parseFloat(sliderEl.value);
        if (isNaN(v)) return;
        v = Math.max(min, Math.min(max, v));
        state[stateKey] = v;
        if (numEl) numEl.value = formatVal(v);
        if (syncCallback) syncCallback(v);
        if (callback) callback();
      };
    }
    if (numEl) {
      numEl.oninput = () => {
        let v = parseFloat(numEl.value);
        if (isNaN(v)) return;
        v = Math.max(min, Math.min(max, v));
        state[stateKey] = v;
        if (sliderEl) sliderEl.value = String(v);
        if (syncCallback) syncCallback(v);
        if (callback) callback();
      };
      numEl.onchange = () => {
        let v = parseFloat(numEl.value);
        if (isNaN(v)) v = min;
        v = Math.max(min, Math.min(max, v));
        state[stateKey] = v;
        numEl.value = formatVal(v);
        if (sliderEl) sliderEl.value = String(v);
        if (syncCallback) syncCallback(v);
        if (callback) callback();
      };
    }
  }

  if (frameBgColorInput) {
    frameBgColorInput.oninput = () => {
      state.frameBgColor = frameBgColorInput.value || '#111111';
      applyFrameImgTransform();
    };
  }
  if (frameBgOpacitySlider) {
    frameBgOpacitySlider.oninput = () => {
      state.frameBgOpacity = parseFloat(frameBgOpacitySlider.value);
      if (frameBgOpacityLabel) frameBgOpacityLabel.value = state.frameBgOpacity.toFixed(2);
      applyFrameImgTransform();
    };
  }
  if (frameBgOpacityLabel) {
    frameBgOpacityLabel.onchange = () => {
      let val = parseFloat(frameBgOpacityLabel.value);
      if (isNaN(val)) val = 1;
      val = Math.max(0, Math.min(1, val));
      state.frameBgOpacity = val;
      frameBgOpacitySlider.value = val;
      frameBgOpacityLabel.value = val.toFixed(2);
      applyFrameImgTransform();
    };
  }

  // Spray brush tuning (multipliers). 100% keeps the current look.
  if (sprayScatterSlider && sprayScatterValue) {
    const init = Math.round((typeof state.sprayScatter === 'number' ? state.sprayScatter : 1) * 100);
    sprayScatterSlider.value = String(init);
    sprayScatterValue.textContent = `${init}%`;
    sprayScatterSlider.oninput = () => {
      const v = parseInt(sprayScatterSlider.value) || 100;
      state.sprayScatter = v / 100;
      sprayScatterValue.textContent = `${v}%`;
    };
  }
  if (sprayDotScaleSlider && sprayDotScaleValue) {
    const init = Math.round((typeof state.sprayDotScale === 'number' ? state.sprayDotScale : 1) * 100);
    sprayDotScaleSlider.value = String(init);
    sprayDotScaleValue.textContent = `${init}%`;
    sprayDotScaleSlider.oninput = () => {
      const v = parseInt(sprayDotScaleSlider.value) || 100;
      state.sprayDotScale = v / 100;
      sprayDotScaleValue.textContent = `${v}%`;
    };
  }

  // Timecode style controls
  tcTextColorInput.oninput = () => { state.tcTextColor = tcTextColorInput.value; updateTimecodeStyles(); };
  tcBgColorInput.oninput = () => { state.tcBgColor = tcBgColorInput.value; updateTimecodeStyles(); };
  tcOpacitySlider.oninput = () => { state.tcOpacity = parseInt(tcOpacitySlider.value) / 100; tcOpacityValue.textContent = `${tcOpacitySlider.value}%`; updateTimecodeStyles(); };
  tcAlignSelect.onchange = () => { state.tcAlign = tcAlignSelect.value; renderGrid(); if (state.autoFit) { requestFitToActiveView(); } };
  tcPositionSelect.onchange = () => { state.tcPosition = tcPositionSelect.value; renderGrid(); if (state.autoFit) { requestFitToActiveView(); } };
  const tcPaddingSlider = $('tcPaddingSlider'), tcPaddingValue = $('tcPaddingValue');
  if (tcPaddingSlider) tcPaddingSlider.oninput = () => { state.tcPadding = parseInt(tcPaddingSlider.value); tcPaddingValue.textContent = `${state.tcPadding}px`; updateTimecodeStyles(); };
  const tcMarginSlider = $('tcMarginSlider'), tcMarginValue = $('tcMarginValue');
  if (tcMarginSlider) tcMarginSlider.oninput = () => { state.tcMargin = parseInt(tcMarginSlider.value); tcMarginValue.textContent = `${state.tcMargin}px`; updateTimecodeStyles(); };

  // Frame image transform UI
  function applyFrameImgTransform() {
    if (!framesGrid) return;
    framesGrid.style.setProperty('--img-scale-x', String(state.frameImgScaleX !== undefined ? state.frameImgScaleX : 1));
    framesGrid.style.setProperty('--img-scale-y', String(state.frameImgScaleY !== undefined ? state.frameImgScaleY : 1));
    framesGrid.style.setProperty('--img-rot', `${state.frameImgRot}deg`);
    framesGrid.style.setProperty('--img-off-x', `${state.frameImgOffX}%`);
    framesGrid.style.setProperty('--img-off-y', `${state.frameImgOffY}%`);
    framesGrid.style.setProperty('--frame-img-opacity', String(state.frameImgOpacity !== undefined ? state.frameImgOpacity : 1));
    const op = state.frameBgOpacity !== undefined ? state.frameBgOpacity : 1;
    framesGrid.style.setProperty('--frame-bg', hexToRgba(state.frameBgColor || '#000000', op));
    if (state.refFrameSource && state.refFrameVisible && state.refFrameFollowFrameTransform) {
      requestComposite();
    }
    // Live preview only: no cache rebuild needed.
  }



  if (frameTargetAspectSelect) {
    frameTargetAspectSelect.value = (state.frameTargetAspect === 'source' || !state.frameTargetAspect) ? 'auto' : state.frameTargetAspect;
    frameTargetAspectSelect.onchange = () => {
      state.frameTargetAspect = frameTargetAspectSelect.value || 'auto';
      applyFrameTargetAspect();
      // Target aspect changes the cell geometry: resize FRM sheet tiles so FRM drawing is not stretched.
      state._frameTileDims = null;
      ensureFrameSheet();
      updateGridHint();
      resizeDrawCanvas();
      requestComposite();
      if (state.autoFit) requestFitToActiveView();
    };
  }

    if (toggleScaleLink) {
    toggleScaleLink.onclick = () => {
      state.frameImgScaleLink = !state.frameImgScaleLink;
      toggleScaleLink.classList.toggle('active', state.frameImgScaleLink);
      if (state.frameImgScaleLink) {
        state.frameImgScaleY = state.frameImgScaleX;
        if (frameImgScaleSliderY) frameImgScaleSliderY.value = String(state.frameImgScaleY);
        if (frameImgScaleNumY) frameImgScaleNumY.value = state.frameImgScaleY.toFixed(2);
        applyFrameImgTransform();
      }
    };
  }

  const syncScaleY = (val) => {
    if (state.frameImgScaleLink) {
      state.frameImgScaleY = val;
      if (frameImgScaleSliderY) frameImgScaleSliderY.value = String(val);
      if (frameImgScaleNumY) frameImgScaleNumY.value = val.toFixed(2);
    }
  };
  const syncScaleX = (val) => {
    if (state.frameImgScaleLink) {
      state.frameImgScaleX = val;
      if (frameImgScaleSliderX) frameImgScaleSliderX.value = String(val);
      if (frameImgScaleNumX) frameImgScaleNumX.value = val.toFixed(2);
    }
  };

  bindDualInput('frameImgScaleX', frameImgScaleSliderX, frameImgScaleNumX, 0.1, 4.0, 2, applyFrameImgTransform, syncScaleY);
  bindDualInput('frameImgScaleY', frameImgScaleSliderY, frameImgScaleNumY, 0.1, 4.0, 2, applyFrameImgTransform, syncScaleX);
  bindDualInput('frameImgOffX', frameImgOffXSlider, frameImgOffXNum, -50, 50, 0, applyFrameImgTransform);
  bindDualInput('frameImgOffY', frameImgOffYSlider, frameImgOffYNum, -50, 50, 0, applyFrameImgTransform);
  bindDualInput('frameImgRot', frameImgRotSlider, frameImgRotNum, -360, 360, 1, applyFrameImgTransform);

  const compositeCallback = () => { applyFrameImgTransform(); requestComposite(); };
  bindDualInput('frameImgOpacity', frameImgOpacitySlider, frameImgOpacityNum, 0, 1, 2, compositeCallback);

  if (resetFrameTransformBtn) {
    resetFrameTransformBtn.addEventListener('click', () => {
      state.frameImgScaleX = 1;
      state.frameImgScaleY = 1;
      state.frameImgOffX = 0;
      state.frameImgOffY = 0;
      state.frameImgRot = 0;
      state.frameImgOpacity = 1;

      if (frameImgScaleSliderX) frameImgScaleSliderX.value = '1';
      if (frameImgScaleNumX) frameImgScaleNumX.value = '1.00';
      if (frameImgScaleSliderY) frameImgScaleSliderY.value = '1';
      if (frameImgScaleNumY) frameImgScaleNumY.value = '1.00';
      if (frameImgOpacitySlider) frameImgOpacitySlider.value = '1';
      if (frameImgOpacityNum) frameImgOpacityNum.value = '1.00';

      if (frameImgOffXSlider) frameImgOffXSlider.value = '0';
      if (frameImgOffXNum) frameImgOffXNum.value = '0';

      if (frameImgOffYSlider) frameImgOffYSlider.value = '0';
      if (frameImgOffYNum) frameImgOffYNum.value = '0';

      if (frameImgRotSlider) frameImgRotSlider.value = '0';
      if (frameImgRotNum) frameImgRotNum.value = '0.0';

      applyFrameImgTransform();
      renderGrid();
      compositeAllLayers();
    });
  }
  if (applyFrameImgTransformBtn) {
    applyFrameImgTransformBtn.onclick = () => {
      applyFrameImgTransform();
      // Redraw timecodes and template preview after transform change (safe no-op if not needed)
      updateAllTimecodes();
      renderTemplateFramePreview();
    };
  }

  generateBtn.onclick = () => {
    if (state.isPlaying) stopAnimation();
    markRegenDone();
    invalidateCellCaches();
    generateFrames();
  };

  
  // Column +/- buttons
  colsMinus.onclick = () => {
    if (state.gridCols > 1) {
      state.gridCols--;
      gridColsInput.value = state.gridCols;
      state.canvasAspect = 'custom';
      syncGridAspectMode();
      if (state.frames.length) updateGridColsOnly();
    }
  };
  colsPlus.onclick = () => {
    if (state.gridCols < 100) {
      state.gridCols++;
      gridColsInput.value = state.gridCols;
      state.canvasAspect = 'custom';
      syncGridAspectMode();
      if (state.frames.length) { renderGrid(); updateGridHint(); fitActiveView(); }
    }
  };
  
  // HIDE (cell size / subdivision) - combines N frames into 1 cell
  cellMinus.onclick = () => {
    if (state.cellSize > 1) {
      applyCellSizeValue(state.cellSize - 1);
    }
  };
  cellPlus.onclick = () => {
    const maxCellSize = state.frames.length || 1;
    if (state.cellSize < maxCellSize && state.cellSize < 64) {
      applyCellSizeValue(state.cellSize + 1);
    }
  };
  
  

  // Loop Phases (grid duplication / phase reduction)
  function updateLoopPhasesUI() {
    if(gridLoopsInput) gridLoopsInput.value = state.gridLoops;
  }
  loopMinus.onclick = () => {
    if (state.gridLoops > 1) {
      state.gridLoops -= 1;
      updateLoopPhasesUI();
      updateMetaLayoutInfo();
      updateAllCells();
    }
  };
  loopPlus.onclick = () => {
    if (state.gridLoops < 64) {
      state.gridLoops += 1;
      updateLoopPhasesUI();
      updateMetaLayoutInfo();
      updateAllCells();
    }
  };
  updateLoopPhasesUI();
// Quick toolbar
  qMode.onclick = () => setViewMode(state.viewMode === 'grid' ? 'single' : 'grid');
  qReset.onclick = () => resetToStart();
  qPrev.onclick = () => stepFrame(-1);
  qNext.onclick = () => stepFrame(1);
  qPlay.onclick = () => { state.isPlaying ? stopAnimation() : startAnimation(); };
  qFit.onclick = () => { fitActiveView(); };
  qOne.onclick = () => { zoomTo100(); };
  // qRegen and qExport removed from toolbar
  qMenu.onclick = toggleMenu;
  
  function updatePlayButton() {
    qPlay.innerHTML = state.isPlaying ? '<svg viewBox="0 0 24 24" style="width:14px;height:14px;"><rect x="5" y="4" width="4" height="16" fill="currentColor"/><rect x="15" y="4" width="4" height="16" fill="currentColor"/></svg>' : '<svg viewBox="0 0 24 24" style="width:14px;height:14px;"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>';
    qPlay.classList.toggle('active', state.isPlaying);
  }
  exportSmallBtn.onclick = () => exportImage('jpeg', EXPORT_CONF.STILL_PREV).catch(e => console.error(e));
  exportFullBtn.onclick = () => exportImage('png', EXPORT_CONF.STILL_MAX).catch(e => console.error(e));
  exportMp4GridBtn.onclick = () => {
    if (state.exportAudioLayer) recordAudioSeqAV('grid');
    else exportMp4('grid');
  };
  if (exportPngSingleBtn) exportPngSingleBtn.onclick = () => exportSingleStill('png').catch(e => console.error(e));
  if (exportJpegSingleBtn) exportJpegSingleBtn.onclick = () => exportSingleStill('jpeg').catch(e => console.error(e));
  exportMp4SingleBtn.onclick = () => {
    if (state.exportAudioLayer) recordAudioSeqAV('single');
    else exportMp4('single');
  };
  if (exportResampledBtn) exportResampledBtn.onclick = () => exportResampledVideo('single');
  if (exportResampledGridBtn) exportResampledGridBtn.onclick = () => exportResampledVideo('grid');
  if (exportPngSeqDrawBtn) exportPngSeqDrawBtn.onclick = exportPngSeqDrawings;
 
  // Consolidated Export UI Logic
  let activeExportMode = 'grid';
  const exportTargetMode = document.getElementById('exportTargetMode');
  if (exportTargetMode) {
     const btns = exportTargetMode.querySelectorAll('.menu-btn');
     btns.forEach(b => {
       b.addEventListener('click', () => {
         btns.forEach(x => x.classList.remove('active-toggle'));
         b.classList.add('active-toggle');
         activeExportMode = b.dataset.val;
       });
     });
  }

  const expJpegBtn = document.getElementById('expJpegBtn');
  const expPngBtn = document.getElementById('expPngBtn');
  const expMp4Btn = document.getElementById('expMp4Btn');
  const expSeqBtn = document.getElementById('expSeqBtn');
  const expSyncAudioBtn = document.getElementById('expSyncAudioBtn');

  if (expJpegBtn) expJpegBtn.onclick = () => { activeExportMode === 'grid' ? $('exportSmallBtn').click() : $('exportJpegSingleBtn').click(); };
  if (expPngBtn) expPngBtn.onclick = () => { activeExportMode === 'grid' ? $('exportFullBtn').click() : $('exportPngSingleBtn').click(); };
  if (expMp4Btn) expMp4Btn.onclick = () => { activeExportMode === 'grid' ? $('exportMp4GridBtn').click() : $('exportMp4SingleBtn').click(); };
  if (expSeqBtn) expSeqBtn.onclick = () => { $('exportPngSeqDrawBtn').click(); };
  if (expSyncAudioBtn) expSyncAudioBtn.onclick = () => { activeExportMode === 'grid' ? $('exportResampledGridBtn').click() : $('exportResampledBtn').click(); };
 
  // Export quality and loops
  exportQualitySelect.onchange = () => { state.exportQuality = exportQualitySelect.value; };
  loopsMinus.onclick = () => { if (state.exportLoops > 1) { state.exportLoops--; loopsInput.value = state.exportLoops; } };
  loopsPlus.onclick = () => { if (state.exportLoops < 10) { state.exportLoops++; loopsInput.value = state.exportLoops; } };
  loopsInput.onchange = () => { state.exportLoops = Math.max(1, Math.min(10, parseInt(loopsInput.value) || 1)); loopsInput.value = state.exportLoops; };

  // Animation controls
  animFpsInput.onchange = () => { state.animFps = Math.max(1, Math.min(60, parseInt(animFpsInput.value) || 8)); animFpsInput.value = state.animFps; if (state.isPlaying) restartAnimation(); updateMetaAnimFps(); };
  fpsMinus.onclick = () => { if (state.animFps > 1) { state.animFps--; animFpsInput.value = state.animFps; if (state.isPlaying) restartAnimation(); updateMetaAnimFps(); } };
  fpsPlus.onclick = () => { if (state.animFps < 60) { state.animFps++; animFpsInput.value = state.animFps; if (state.isPlaying) restartAnimation(); updateMetaAnimFps(); } };
  animDirectionSelect.onchange = () => { state.animDirection = animDirectionSelect.value; if (state.animDirection === 'random') { state.animDirShuffleSeed = null; state.animDirShuffle = null; state.animDirShuffleFrames = 0; } updateAnimSeedUI(); updateMetaLayoutInfo(); if (state.isPlaying) restartAnimation(); else updateAllCells(); };
  animPatternSelect.onchange = () => { state.animPattern = animPatternSelect.value; updateAnimSeedUI(); state.animRandomStartsSeed = null; updateMetaLayoutInfo(); if (state.isPlaying) restartAnimation(); else updateAllCells(); };
  const btnFlipX = $('btnFlipX');
  const btnFlipY = $('btnFlipY');
  if (btnFlipX) {
     btnFlipX.onclick = () => {
        state.flipPatternX = !state.flipPatternX;
        btnFlipX.classList.toggle('primary', state.flipPatternX);
        state.animRandomStartsSeed = null; 
        updateMetaLayoutInfo();
        if (state.isPlaying) restartAnimation(); else updateAllCells();
     };
  }
  if (btnFlipY) {
     btnFlipY.onclick = () => {
        state.flipPatternY = !state.flipPatternY;
        btnFlipY.classList.toggle('primary', state.flipPatternY);
        state.animRandomStartsSeed = null; 
        updateMetaLayoutInfo();
        if (state.isPlaying) restartAnimation(); else updateAllCells();
     };
  }
  if (animSeedInput) {
    animSeedInput.onchange = () => {
      state.animSeed = (parseInt(animSeedInput.value, 10) || 1) >>> 0;
      state.animRandomStartsSeed = null;
      if (state.isPlaying) restartAnimation();
      else updateAllCells();
    };
  }
  if (animSeedRandBtn) {
    animSeedRandBtn.onclick = () => {
      const s = (Math.floor(Math.random() * 1000000000) >>> 0) || 1;
      state.animSeed = s;
      if (animSeedInput) animSeedInput.value = s;
      state.animRandomStartsSeed = null;
      if (state.isPlaying) restartAnimation();
      else updateAllCells();
    };
  }
  updateAnimSeedUI();

  
  const longStrokeFadeInput = $('longStrokeFade');
  if (longStrokeFadeInput) {
    longStrokeFadeInput.onchange = () => { state.longStrokeFade = Math.max(0, Math.min(50, parseInt(longStrokeFadeInput.value) || 8)); longStrokeFadeInput.value = state.longStrokeFade; };
  }
  
  // FIX v0.16: updateAllCells uses state.currentTick, updates BOTH img elements
  
    
  // Chronophoto DOM update
    // Build ghost frame indices for chronophoto using tick-based logic.
  // Works correctly for all directions (forward, pingpong, bounce, shuffle).
  
  // Shared cascade opacity calculator — used in both preview and export.
  function computeCascadeOpacity(step, depth, alphaBase) {
    const mirror   = window._fgState ? window._fgState.chronoCascadeMirror : false;
    const constVal = Math.max(1, Math.min(depth, Math.round(
      (window._fgState ? window._fgState.chronoCascadeConst : 1) || 1
    )));

    if (mirror) {
      // Mirror mode: centre of stack is fully opaque, fades to both edges
      const fadeCount = depth - constVal;         // how many frames actually fade
      const cStart    = (depth - constVal) / 2;   // start of plateau (can be fractional)
      const dist      = Math.abs(step - (depth - 1) / 2) - constVal / 2;  // distance outside plateau
      const t         = fadeCount > 0 ? Math.max(0, dist / (fadeCount / 2)) : 0;
      return alphaBase * (1 - Math.min(1, t));
    } else {
      // Normal mode: newest ghost fully opaque for constVal frames, then fades
      const fadeCount = depth - constVal;
      const fadeStep  = step - constVal;          // how far past the plateau
      if (fadeStep < 0) return alphaBase;          // within constant zone
      return alphaBase * (1 - (fadeStep + 1) / (fadeCount + 1));
    }
  }

  function buildChronoGhostIndices(tick, baseOffset, frameCount, dir, shuffle) {
    const depth     = state.chronoDepth  || 3;
    const stride    = Math.max(1, state.chronoStride || 1);
    const cleanLoop = !!state.chronoCleanLoop;
    const n         = state.frames.length;
    const indices   = [];

    for (let step = 1; step <= depth; step++) {
      const ghostTick = tick - step * stride;
      if (cleanLoop && ghostTick < 0) {
        indices.push(null);
      } else {
        // Decouple Chronophoto from Loop After N
        // Ghost frames are sampled from the full global timeline to allow "stretching" (stride)
        // Normalize negative ticks to maintain true looping history across all direction modes
        const normGhost = typeof _fgNormalizeTick === 'function' ? _fgNormalizeTick(ghostTick, frameCount, dir) : Math.max(0, ghostTick);
        indices.push(resolveDirectionFrame(normGhost, baseOffset, frameCount, dir, shuffle));
      }
    }
    return indices;
  }

  function updateChronoForItem(item, ghostIndices, opacityScale = 1) {
    const xform = item.querySelector('.frame-media-xform');
    if (!xform) return;

    if (!state.chronoEnabled || !state.frames.length || !ghostIndices || !ghostIndices.length) {
      xform.querySelectorAll('.frame-chrono').forEach(el => el.remove());
      return;
    }

    const blendMode = state.chronoBlend   || 'screen';
    const alphaBase = (state.chronoOpacity !== undefined) ? state.chronoOpacity : 1.0;
    const stackScale = Number.isFinite(Number(opacityScale)) ? Math.max(0, Math.min(1, Number(opacityScale))) : 1;
    const depth     = ghostIndices.length;
    const imgArr    = Array.from(xform.querySelectorAll('.frame-chrono'));
    let slot = 0;

    for (let step = 0; step < depth; step++) {
      const ghostFrameIdx = ghostIndices[step];

      if (ghostFrameIdx === null) {
        const img = imgArr[slot];
        if (img) { img.style.opacity = '0'; img.style.display = 'none'; }
        slot++; continue;
      }

      const frame = state.frames[ghostFrameIdx];
      if (!frame) { slot++; continue; }

      let finalOpacity = alphaBase;
      if (state.chronoCascade) {
        finalOpacity = computeCascadeOpacity(step, depth, alphaBase);
      }
      finalOpacity *= stackScale;

      let img = imgArr[slot];
      if (!img) {
        img = document.createElement('img');
        img.className = 'frame-chrono';
        img.setAttribute('nopin', 'nopin');
        img.setAttribute('data-pin-nopin', 'true');
        img.setAttribute('data-pin-no-hover', 'true');
        img.style.position = 'absolute';
        img.style.inset = '0';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.style.pointerEvents = 'none';
        img.style.zIndex = '1';
        xform.appendChild(img);
        imgArr.push(img);
      }

      if (img.src !== frame.dataUrl) img.src = frame.dataUrl;
      img.style.display = '';
      img.style.mixBlendMode = blendMode;
      img.style.opacity = Math.max(0, Math.min(1, finalOpacity)).toFixed(3);
      img.style.filter = (state.cc && state.cc.enabled) ? buildCCFilter() : '';
      slot++;
    }

    for (let i = slot; i < imgArr.length; i++) imgArr[i].remove();
  }

  function createFrameOverlayImg(className, zIndex) {
    const img = document.createElement('img');
    img.className = className;
    img.setAttribute('nopin', 'nopin');
    img.setAttribute('data-pin-nopin', 'true');
    img.setAttribute('data-pin-no-hover', 'true');
    img.style.position = 'absolute';
    img.style.inset = '0';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.style.pointerEvents = 'none';
    img.style.zIndex = String(zIndex);
    return img;
  }

  function clearSeamBlendForItem(xform) {
    xform.querySelectorAll('.frame-seam-blend,.frame-seam-chrono').forEach(el => el.remove());
  }

  function updateSeamBlendForItem(item, seamInfo) {
    const xform = item.querySelector('.frame-media-xform');
    if (!xform) return;

    const alpha = seamInfo && Number.isFinite(Number(seamInfo.alpha)) ? Math.max(0, Math.min(1, Number(seamInfo.alpha))) : 0;
    if (!state.chronoSeamBlend || !state.frames.length || alpha <= 0 || !Number.isFinite(Number(seamInfo && seamInfo.targetFrameIdx))) {
      clearSeamBlendForItem(xform);
      return;
    }

    const baseOpacity = getChronoSeamBaseOpacity(seamInfo);
    const ghostOpacityScale = getChronoSeamGhostOpacityScale(seamInfo);
    let base = xform.querySelector('.frame-seam-blend');
    if (baseOpacity > 0) {
      const frame = state.frames[normalizeFrameIndex(seamInfo.targetFrameIdx, state.frames.length)];
      if (!frame) {
        clearSeamBlendForItem(xform);
        return;
      }
      if (!base) {
        base = createFrameOverlayImg('frame-seam-blend', 2);
        xform.appendChild(base);
      }
      if (base.src !== frame.dataUrl) base.src = frame.dataUrl;
      base.style.display = '';
      base.style.mixBlendMode = 'normal';
      base.style.opacity = (baseOpacity * Math.max(0, Math.min(1, Number(state.frameImgOpacity) || 1))).toFixed(3);
      base.style.filter = (state.cc && state.cc.enabled) ? buildCCFilter() : '';
    } else if (base) {
      base.remove();
    }

    const ghostIndices = state.chronoEnabled && ghostOpacityScale > 0 ? (seamInfo.targetGhostIndices || []) : [];
    const ghostArr = Array.from(xform.querySelectorAll('.frame-seam-chrono'));
    let slot = 0;
    const blendMode = state.chronoBlend || 'screen';
    const alphaBase = (state.chronoOpacity !== undefined) ? state.chronoOpacity : 1.0;
    const depth = ghostIndices.length;

    for (let step = 0; step < depth; step++) {
      const ghostFrameIdx = ghostIndices[step];
      if (ghostFrameIdx === null) {
        const img = ghostArr[slot];
        if (img) { img.style.opacity = '0'; img.style.display = 'none'; }
        slot++;
        continue;
      }

      const ghostFrame = state.frames[normalizeFrameIndex(ghostFrameIdx, state.frames.length)];
      if (!ghostFrame) { slot++; continue; }

      let finalOpacity = alphaBase;
      if (state.chronoCascade) finalOpacity = computeCascadeOpacity(step, depth, alphaBase);
      finalOpacity *= ghostOpacityScale;

      let img = ghostArr[slot];
      if (!img) {
        img = createFrameOverlayImg('frame-seam-chrono', 2);
        xform.appendChild(img);
        ghostArr.push(img);
      }
      if (img.src !== ghostFrame.dataUrl) img.src = ghostFrame.dataUrl;
      img.style.display = '';
      img.style.mixBlendMode = blendMode;
      img.style.opacity = Math.max(0, Math.min(1, finalOpacity)).toFixed(3);
      img.style.filter = (state.cc && state.cc.enabled) ? buildCCFilter() : '';
      slot++;
    }

    for (let i = slot; i < ghostArr.length; i++) ghostArr[i].remove();
  }

  function updateFrameDiffForItem(item) {
    const xform = item.querySelector('.frame-media-xform');
    if (!xform) return;

    const existing = xform.querySelector('.frame-diff-plate');
    if (!state.frameDiffEnabled || !state.frames.length) {
      if (existing) existing.remove();
      return;
    }

    const n       = state.frames.length;
    const baseIdx = Math.max(0, Math.min(n - 1, state.frameDiffPlateIdx || 0));
    const blend   = state.frameDiffBlend   || 'difference';
    const opacity = (state.frameDiffOpacity !== undefined) ? state.frameDiffOpacity : 1.0;
    const step = Math.max(1, state.frameDiffPlateStep || 1);
    const loopN = Math.max(1, Math.min(n, state.frameDiffPlateLoopN || 1));
    const offset = Math.max(0, state.frameDiffPlateOffset || 0) % n;
    let pIdx = baseIdx;
    if (state.frameDiffPlateMode === 'tick') {
      pIdx = (baseIdx + Math.floor(Math.max(0, state.currentTick || 0) / step)) % n;
    } else if (state.frameDiffPlateMode === 'loop') {
      pIdx = (offset + (Math.floor(Math.max(0, state.currentTick || 0) / step) % loopN)) % n;
    }
    const frame   = state.frames[pIdx];
    if (!frame) { if (existing) existing.remove(); return; }

    let img = existing;
    if (!img) {
      img = document.createElement('img');
      img.className = 'frame-diff-plate';
      img.style.position = 'absolute';
      img.style.inset = '0';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';
      img.style.pointerEvents = 'none';
      img.style.zIndex = '3';
      xform.appendChild(img);
    }
    if (img.src !== frame.dataUrl) img.src = frame.dataUrl;
    img.style.display = '';
    img.style.mixBlendMode = blend;
    img.style.opacity = Math.max(0, Math.min(1, opacity)).toFixed(3);
    img.style.filter = (state.cc && state.cc.enabled) ? buildCCFilter() : '';
  }




  function updateColoramaForItem(item, cellIdx) {
    const xform = item.querySelector('.frame-media-xform');
    if (!xform) return;

    // Remove any legacy overlay divs
    const old = xform.querySelector('.frame-colorama-overlay');
    if (old) old.remove();

    const ca = state.colorama;
    const applyToLayers = ca && ca.enabled;
    const filterId = (ca && ca.enabled) ? coloramaFilterId(cellIdx) : '';

    xform.querySelectorAll('.frame-chrono,.frame-seam-blend,.frame-seam-chrono').forEach(img => {
      const ccf = buildCCFilter();
      const base = ccf === 'none' ? '' : ccf;
      const caf = (applyToLayers && filterId) ? ' url(#' + filterId + ')' : '';
      img.style.filter = (base + caf).trim() || '';
    });

    const diffPlate = xform.querySelector('.frame-diff-plate');
    if (diffPlate) {
      const ccf = buildCCFilter();
      const base = ccf === 'none' ? '' : ccf;
      const caf = (applyToLayers && filterId) ? ' url(#' + filterId + ')' : '';
      diffPlate.style.filter = (base + caf).trim() || '';
    }
  }

    function updateOnionForItem(item, frameIdx) {
    const cnv = item.querySelector('canvas.frame-onion');
    if (!cnv) return;

    const enabled = !!(state.drawOnion && state.drawMode && state.drawTarget === 'frame');
    if (!enabled) {
      cnv.style.display = 'none';
      return;
    }

    ensureFrameSheet();
    if (!frameSheetCanvas || !frameSheetCanvas.width || !frameSheetCanvas.height) {
      cnv.style.display = 'none';
      return;
    }

    const n = state.frames.length || 0;
    const tw = state.frameSheetTileW || 0;
    const th = state.frameSheetTileH || 0;
    const cols = state.frameSheetCols || 0;

    if (!(n > 0 && tw > 0 && th > 0 && cols > 0)) {
      cnv.style.display = 'none';
      return;
    }

    if (cnv.width !== tw || cnv.height !== th) {
      cnv.width = tw;
      cnv.height = th;
    }

    const ctx = cnv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, tw, th);

    const drawNeighbor = (idx, a) => {
      if (idx < 0 || idx >= n) return;
      const sx = (idx % cols) * tw;
      const sy = Math.floor(idx / cols) * th;
      ctx.globalAlpha = a;
      ctx.drawImage(frameSheetCanvas, sx, sy, tw, th, 0, 0, tw, th);
    };

    // Strict neighbors only. No wrap.
    drawNeighbor(frameIdx - 1, 0.35);
    drawNeighbor(frameIdx + 1, 0.35);

    ctx.globalAlpha = 1;
    cnv.style.display = 'block';
  }
// Random preview order, stable until seed changes
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
    const cols = state.gridCols;
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


  function updateAnimSeedUI() {
    if (!animSeedRow) return;
    const show = (state.animPattern === 'random');
    animSeedRow.style.display = show ? '' : 'none';
    if (animSeedInput) animSeedInput.value = (parseInt(state.animSeed, 10) || 1);
  }


  // Unified direction resolver
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

function updateAllCells() {
    const frameCount = state.frames.length;
    if (!frameCount) return;
    // Keep SVG filters in sync whenever cells are updated
    if (typeof updateColoramaSVG === 'function') updateColoramaSVG();

    // Rebuild DOM cache if null or stale (checked via framesGrid._cellCount, not DOM query)
    const _expectedCount = (framesGrid && framesGrid._cellCount) || 0;
    if (!_cellDOMCache || _cellDOMCache.length !== _expectedCount) buildCellDOMCache();
    const cells = _cellDOMCache;
    const totalCells = cells.length;
    if (!totalCells) return;

    if (state.animPattern === 'random') ensureAnimRandomStarts(totalCells);

    // Cached cellOrder Map — no rebuild unless pattern/cols changed
    const { map: cellOrderMap } = getCachedCellOrder(totalCells, state.gridCols);

    // Hoist loop-invariants out of per-cell loop
    const showTC      = computeShowTimecode();
    const hasOnion    = !!(state.drawOnion && state.drawMode && state.drawTarget === 'frame');
    ensureAnimDirShuffle(frameCount); // once, not per-cell

    const tick    = state.currentTick;
    const dir     = state.animDirection;
    const shuffle = state.animDirShuffle;
    const tcTotal = totalCells;

    coloramaSetCellCount(totalCells);
    for (let cellIdx = 0; cellIdx < totalCells; cellIdx++) {
      const cellOrderIdx = cellOrderMap.get(cellIdx) ?? 0;
      const cellInfo = getFrameCellInfo(cellIdx, tick, {
        cellCount: totalCells,
        cellOrderIdx,
        shuffle,
        skipEnsureShuffle: true
      });
      const baseOffset = cellInfo.baseOffset;
      const frameIdx   = cellInfo.frameIdx;

      const frame = state.frames[frameIdx];
      if (!frame) continue;

      const { mainImg, timecodeEl, item } = cells[cellIdx];
      if (mainImg && mainImg.src !== frame.dataUrl) mainImg.src = frame.dataUrl;
      if (mainImg) {
        const _ccf = buildCCFilter();
        const _cafId = (state.colorama && state.colorama.enabled) ? coloramaFilterId(cellIdx) : '';
        const _caf = _cafId ? (' url(#' + _cafId + ')') : '';
        mainImg.style.filter = (_ccf === 'none' && !_caf) ? 'none' : (_ccf === 'none' ? _caf.trim() : _ccf + _caf);
      }

      if (hasOnion) updateOnionForItem(item, frameIdx);
      const _ghostIndices = state.chronoEnabled
        ? buildChronoGhostIndices(tick, baseOffset, frameCount, dir, shuffle)
        : [];
      const _seamInfo = getChronoSeamForCell(cellIdx, tick, {
        frameCount,
        cellCount: totalCells,
        cellOrderIdx,
        shuffle,
        dir,
        mode: state.viewMode,
        skipEnsureShuffle: true
      });
      updateChronoForItem(item, _ghostIndices, getChronoCurrentOpacityScale(_seamInfo));
      updateSeamBlendForItem(item, _seamInfo);
      updateFrameDiffForItem(item);
      updateColoramaForItem(item, cellIdx);

      if (showTC && timecodeEl) {
        const derivedIdx = getDerivedIndexFromFrameIdx(frameIdx);
        timecodeEl.textContent = formatTimecode(frame, derivedIdx, tcTotal, frameIdx);
      }
      item.dataset.frameIdx = frameIdx;
    }
    // Keep drawings animating even when Draw Mode is OFF.

    // Composite is needed whenever any overlay layer exists (BG / Template / per-frame drawings).

    const _hasBG = !!(state.bgDrawing || state.bgDrawingSingle);

    const _hasTPL = !!state.templateDrawing;

    const _hasFRM = !!state.frameSheetDrawing || (state.frameDrawings && Object.keys(state.frameDrawings).length > 0);

    if (state.drawMode || _hasBG || _hasTPL || _hasFRM) requestComposite();
    if (state.drawMode && isDrawing && lastPointerPos && state.drawTarget === 'frame' && !state.drawLongStroke) {
      const hit = getFrameAtPoint(lastPointerPos);
      if (hit && typeof hit.frameIdx === 'number' && hit.frameIdx !== holdStampLastFrame) {
        ensureFrameSheet();
        const u = Math.min(1, Math.max(0, hit.localX / Math.max(1, hit.width)));
        const v = Math.min(1, Math.max(0, hit.localY / Math.max(1, hit.height)));
        const sp = sheetPoint(hit.frameIdx, u, v);
        captureUndoFrameTile(hit.frameIdx);
        if (state.drawOneFrame) {
          _drawOneTile(frameSheetCtx, hit.frameIdx, () =>
            drawDot(frameSheetCtx, sp, state.drawColor, getBrushSizeFrame(hit), state.drawEraser)
          );
        } else {
          drawDot(frameSheetCtx, sp, state.drawColor, getBrushSizeFrame(hit), state.drawEraser);
        }
        holdStampLastFrame = hit.frameIdx;
        if (activeFrameStroke) {
          activeFrameStroke.frameIdx = hit.frameIdx;
          activeFrameStroke.lastSheet = sp;
        }
        requestComposite();
      }
    }
    // Long stroke: stamp on new frame during animation even without mouse movement
    if (state.drawLongStroke && longStrokePath.length > 0) {
      const _lsTrailFrames = getLongStrokeTrailFrames();

      if (isDrawing && lastPointerPos) {
        const hit = getFrameAtPoint(lastPointerPos);
        if (hit && hit.frameIdx !== longStrokeLastFrame) {
          // Add a break-point for this new frame so we don't draw a stretched segment
          const u = Math.min(1, Math.max(0, hit.localX / Math.max(1, hit.width)));
          const v = Math.min(1, Math.max(0, hit.localY / Math.max(1, hit.height)));
          const _lsTick = state.isPlaying ? getLongStrokeTick() : advanceLongStrokeTick();

          longStrokePath.push({ u, v, brk: true, t: _lsTick });
          if (longStrokePath.length > 5000) longStrokePath = longStrokePath.slice(-5000);

          if (_lsTrailFrames > 0) {
            if (!longStrokeTileSnapshots || longStrokeTileSnapshots.size === 0) startLongStrokeTrailSnapshot();
            longStrokeEndTick = null;
            longStrokeLastFrame = hit.frameIdx;
            longStrokeBaseHit = longStrokeBaseHit || hit;
            longStrokeFrameTicks.set(hit.frameIdx, _lsTick);
            longStrokeTouchedFrames.add(hit.frameIdx);
            longStrokeActiveFrames.add(hit.frameIdx);
            renderLongStrokeFrame(hit.frameIdx);
          } else {
            drawLongStrokeOnFrame(hit.frameIdx);
            longStrokeLastFrame = hit.frameIdx;
          }

          if (activeFrameStroke) {
            activeFrameStroke.frameIdx = hit.frameIdx;
            holdStampLastFrame = hit.frameIdx;
            activeFrameStroke.lastSheet = sheetPoint(hit.frameIdx, u, v);
          }
          requestComposite();
        }
      }

      // Trail mode: enforce "last N frames" window and decay after mouse-up
      if (state.isPlaying && _lsTrailFrames > 0 && longStrokeTileSnapshots && longStrokeTileSnapshots.size && (isDrawing || longStrokeEndTick != null)) {
        updateLongStrokeTrail();
      }
    }
  }

  function restartAnimation() {
    if (!state.isPlaying) return;
    stopAnimation();
    startAnimation();
  }

  playBtn.onclick = startAnimation;
  stopBtn.onclick = stopAnimation;

  function startAnimation() {
    if (!state.frames.length) return;
    state.isPlaying = true;
    playBtn.style.display = 'none';
    stopBtn.style.display = 'block';
    updatePlayButton();
    // Long Stroke: when playback stops, restore any preview tiles so paused drawing behaves like normal brush
    try { cancelLongStrokeTrail(true); } catch (e) {}

    // Direction Random: build a fresh shuffle per play
    if (state.animDirection === 'random') {
      state.animDirShuffleSeed = (Math.floor(Math.random() * 1000000000) >>> 0) || 1;
      state.animDirShuffle = null;
      state.animDirShuffleFrames = 0;
    }
    
    const interval = 1000 / state.animFps;
    
    let _rafLastTs = null;
    function _rafLoop(ts) {
      if (!state.isPlaying) return;
      if (_rafLastTs === null) _rafLastTs = ts;
      const _interval = 1000 / Math.max(1, state.animFps);
      const _elapsed = ts - _rafLastTs;
      if (_elapsed >= _interval) {
        _rafLastTs = ts - (_elapsed % _interval);
        state.currentTick++;
        // Colorama speed: auto-animate offset
        if (state.colorama && state.colorama.enabled && state.colorama.speed > 0) {
          const _caFrames = Math.max(1, state.frames.length);
          const _caStep = state.colorama.speed / _caFrames;
          state.colorama.offset = ((state.colorama.offset + _caStep) + 4) % 1;
          // Sync UI
          const _caOff = document.getElementById('caOffset');
          const _caOffN = document.getElementById('caOffsetNum');
          if (_caOff)  _caOff.value  = state.colorama.offset.toFixed(3);
          if (_caOffN) _caOffN.value = state.colorama.offset.toFixed(3);
        }
        updateLogoFromTick();
        updateAllCells();
      }
      state.animInterval = requestAnimationFrame(_rafLoop);
    }
    state.animInterval = requestAnimationFrame(_rafLoop);
  }

  
  // Apply loopAfterN cycle limiter: each cell stays within its own N-frame window
  // baseOffset determines the window start; direction/pattern work normally inside
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


  
  // Batch-load frame images with progress and auto-pause
  async function loadFrameImagesWithProgress(label) {
    if (state.isPlaying) stopAnimation();
    const frames = state.frames;
    const total = frames.length;
    const BATCH = 30;
    const images = new Array(total);
    for (let i = 0; i < total; i += BATCH) {
      const end = Math.min(i + BATCH, total);
      loadingProgress.textContent = `${label} ${i}/${total}...`;
      await Promise.all(frames.slice(i, end).map((f, j) => new Promise(resolve => {
        const img = new Image();
        img.onload = () => { images[i + j] = img; resolve(); };
        img.onerror = () => { images[i + j] = null; resolve(); };
        img.src = f.dataUrl || getFrameDataUrl(f);
      })));
      await new Promise(r => queueMicrotask(r));
    }
    return images;
  }

  

  // ── Perf cache: DOM refs per cell (rebuilt on grid change) ──────────────────
  let _cellDOMCache = null;
  let _cellOrderCache = null;

  function invalidateCellCaches() {
    _cellDOMCache = null;
    _cellOrderCache = null;
  }

  function buildCellDOMCache() {
    const items = framesGrid.querySelectorAll('.frame-item');
    _cellDOMCache = Array.from(items).map(item => ({
      mainImg:    item.querySelector('.frame-main-img'),
      timecodeEl: item.querySelector('.frame-timecode'),
      item
    }));
  }

  function getCachedCellOrder(totalCells, cols) {
    const key = `${state.animPattern}|${cols}|${totalCells}|${state.flipPatternX}|${state.flipPatternY}`;
    if (_cellOrderCache && _cellOrderCache.key === key) return _cellOrderCache;
    const order = generateCellOrder(totalCells, cols);
    const map = new Map();
    order.forEach((cell, idx) => map.set(cell, idx));
    _cellOrderCache = { map, key };
    return _cellOrderCache;
  }
  // ────────────────────────────────────────────────────────────────────────────


  function getEstimatedFrameCount() {
    if (!state.videoDuration && !state.frames.length) return null;
    const fps = state.videoFps || 24;
    const dur = state.videoDuration || 0;
    const totalFrames = Math.round(dur * fps) || state.frames.length || 0;
    if (!totalFrames) return null;
    const startF = Math.max(0, state.startFrame || 0);
    const endF   = Math.min(totalFrames, state.endFrame > 0 ? state.endFrame : totalFrames);
    const range  = Math.max(1, endF - startF);
    const mode   = state.selectionMode || 'count';
    const ft = ((Number(state.frameTarget) || 1) <= 1) ? Infinity : getEffectiveFrameTargetCount();
    if (mode === 'count')   return Math.min(state.frameCount || 24, range, ft);
    if (mode === 'seconds') return Math.max(1, Math.floor(range / fps / (state.intervalValue || 3)) + 1);
    if (mode === 'frames')  return Math.max(1, Math.floor(range / (state.intervalValue || 1)) + 1);
    if (mode === 'scene')   return (state.sceneCount || 5) * (state.sceneDepth || 8);
    if (mode === 'slice')   return (state.cutCols || 3) * (state.cutRows || 3);
    return null;
  }

  function updateRegenHint() {
    const el = document.getElementById('regenFrameHint');
    if (!el) return;
    const n = getEstimatedFrameCount();
    el.textContent = n ? `${n} frames` : '';
  }


  function updateGridColsOnly() {
    // Fast path: just update CSS column template — no DOM rebuild
    framesGrid.style.gridTemplateColumns = `repeat(${state.gridCols}, var(--cell-w))`;
    invalidateCellCaches();
    updateGridHint();
    fitActiveView();
  }

  let _renderGridTimer = null;
  function debouncedRenderGrid() {
    if (_renderGridTimer) clearTimeout(_renderGridTimer);
    _renderGridTimer = setTimeout(() => {
      _renderGridTimer = null;
      if (state.frames.length) { renderGrid(); updateGridHint(); fitActiveView(); }
    }, 80);
  }

  function markRegenPending() {
    if (generateBtn) generateBtn.classList.add('pending');
    updateRegenHint();
  }
  function markRegenDone() {
    if (generateBtn) generateBtn.classList.remove('pending');
    updateRegenHint();
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

  // Unified frame calculation for any cell at any tick
  function getFrameForCell(cellIdx, tick) {
    if (state.animPattern === 'random') ensureAnimRandomStarts(getEffectiveGridCellCount());
    return getFrameCellInfo(cellIdx, tick).frameIdx;
  }

  // Update all cells to show frames at current tick
  // updateAllCells is defined above in the animation section

  function stopAnimation() {
    state.isPlaying = false;
    if (state.animInterval) {
      cancelAnimationFrame(state.animInterval);
      state.animInterval = null;
    }
    playBtn.style.display = 'block';
    stopBtn.style.display = 'none';
    updatePlayButton();
    // Do NOT reset tick or renderGrid - keep current position
  }
  
  // Go to specific frame (manual scrubbing)
  // Step animation by delta (+1 = next, -1 = prev)
  function stepFrame(delta) {
    if (!state.frames.length) return;
    if (state.isPlaying) stopAnimation();
    
    state.currentTick += delta;
    if (state.currentTick < 0) state.currentTick = state.frames.length - 1;
    
    updateLogoFromTick();
    updateAllCells();
  }
  
  // Reset to beginning
  function resetToStart() {
    if (state.isPlaying) stopAnimation();
    state.currentTick = 0;
    updateLogoFromTick();
    updateAllCells();
  }

  // ==================== DRAWING SYSTEM ====================
  // Layer architecture (bottom to top):
  // 1. bgDrawing - background canvas (around frames)
  // 2. frames - video frame images
  // 3. templateDrawing - LIVE overlay on ALL frames
  // 4. frameDrawings[i] - per-frame individual drawings
  
  const drawCanvas = $('drawCanvas');
  const drawCtx = drawCanvas.getContext('2d', { willReadFrequently: true });
  const bgUnderlayCanvas = $('bgUnderlayCanvas');
  const bgUnderlayCtx = bgUnderlayCanvas.getContext('2d', { willReadFrequently: true });
  const drawPalette = $('drawPalette');
  const drawToggle = $('drawToggle');
  const drawEraserBtn = $('drawEraser');
  const toggleTemplateVisibilityBtn = $('toggleTemplateVisibility');
  const drawClear = $('drawClear');
  const drawUndo = $('drawUndo');
  const applyTemplateToFramesBtn = $('applyTemplateToFrames');
  const drawOnionBtn = $('drawOnion');
  const drawLongStrokeBtn = $('drawLongStroke');
  const drawOneFrameBtn = $('drawOneFrameBtn');
  const drawColorInput = $('drawColorInput');
  const drawPaletteToggleBtn = $('drawPaletteToggle');
  const drawBrushLockBtn = $('drawBrushLock');
  const drawSizeSlider = $('drawSizeSlider');
  const drawSizeMinus = $('drawSizeMinus');
  const drawSizePlus = $('drawSizePlus');
  const drawSizePreview = $('drawSizePreview');
  let _sizeDrag = null;

  // FIX v0.16: implement missing updateDrawSizeUI
  function updateDrawSizeUI() {
    if (drawSizeDot) {
      const dotSize = Math.min(state.drawSize, 16);
      drawSizeDot.style.width = dotSize + 'px';
      drawSizeDot.style.height = dotSize + 'px';
    }
    if (drawSizeSlider) drawSizeSlider.value = state.drawSize;
    const sizeLabel = document.getElementById('drawSizeLabel');
    if (sizeLabel) sizeLabel.textContent = state.drawSize;
  }
  
  function updateDrawOpacityUI() {
    const opacity = Math.round((state.drawOpacity || 1) * 100);
    const slider = document.getElementById('drawOpacitySlider');
    if (slider) slider.value = opacity;
    const opacityLabel = document.getElementById('drawOpacityLabel');
    if (opacityLabel) opacityLabel.textContent = opacity + '%';
  }

  function updateEdgeSoftnessUI() {
    const v = Math.round((state.edgeSoftness || 0) * 100);
    const slider = document.getElementById('edgeSoftnessSlider');
    if (slider) slider.value = v;
    const lbl = document.getElementById('edgeSoftnessLabel');
    if (lbl) lbl.textContent = v + '%';
  }


  function setDrawSize(v) {
    const nv = Math.max(1, Math.min(120, Math.round(v)));
    state.drawSize = nv;
    if (drawSizeSlider) drawSizeSlider.value = nv;
    updateDrawSizeUI();
    // Update brush cursor size immediately, even if the pointer is stationary.
    // brushCursor is declared later; protect early calls during bootstrap.
    try {
      const screenSize = state.drawSize * state.scale;
      brushCursor.style.width = screenSize + 'px';
      brushCursor.style.height = screenSize + 'px';
    } catch (e) {}
  }

  if (drawSizeMinus) drawSizeMinus.onclick = () => setDrawSize((state.drawSize || 4) - 1);
  if (drawSizePlus) drawSizePlus.onclick = () => setDrawSize((state.drawSize || 4) + 1);

  if (drawSizePreview) {
    const start = (clientY) => { _sizeDrag = { y: clientY, size: state.drawSize || 4 }; };
    const move = (clientY) => {
      if (!_sizeDrag) return;
      const dy = (_sizeDrag.y - clientY);
      const step = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ? 3.0 : 6.0;
      setDrawSize(_sizeDrag.size + dy / step);
    };
    const end = () => { _sizeDrag = null; };

    drawSizePreview.addEventListener('touchstart', (e) => { e.preventDefault(); start(e.touches[0].clientY); }, { passive: false });
    drawSizePreview.addEventListener('touchmove', (e) => { e.preventDefault(); move(e.touches[0].clientY); }, { passive: false });
    drawSizePreview.addEventListener('touchend', end);
    drawSizePreview.addEventListener('touchcancel', end);

    drawSizePreview.addEventListener('mousedown', (e) => { start(e.clientY); });
    window.addEventListener('mousemove', (e) => { move(e.clientY); });
    window.addEventListener('mouseup', end);
  }


  const drawSizeDot = $('drawSizeDot');
  const drawColors = document.querySelectorAll('.draw-color');
  const drawTargetBtns = document.querySelectorAll('.draw-target-btn');
  const toggleExportAudioLayer = $('toggleExportAudioLayer');
  const toggleExportDraw = $('toggleExportDraw');

  // Template frame window (optional UI for the template layer)
  const templateFrame = $('templateFrame');
  const templateFrameHeader = $('templateFrameHeader');
  const templateFrameClose = $('templateFrameClose');
  const templateFrameCanvas = $('templateFrameCanvas');
  const templateFrameCtx = templateFrameCanvas ? templateFrameCanvas.getContext('2d') : null;

  // Template follow offset in GRID space (world units). Keeps manual moves stable across pan/zoom.
  let tplFollow = { dxWorld: 0, dyWorld: 0 };

  // Create separate canvases for each layer
  const bgCanvas = document.createElement('canvas');
  const bgCtx = bgCanvas.getContext('2d', { willReadFrequently: true });
  const bgCanvasSingle = document.createElement('canvas');
  const bgCtxSingle = bgCanvasSingle.getContext('2d', { willReadFrequently: true });

  function isSingleView() { return state.viewMode === 'single'; }
  function getActiveBgCanvas() { return isSingleView() ? bgCanvasSingle : bgCanvas; }
  function getActiveBgCtx() { return isSingleView() ? bgCtxSingle : bgCtx; }
  function syncBgUnderlayPreview() {
    if (!bgUnderlayCanvas || !bgUnderlayCtx) return;
    bgUnderlayCtx.clearRect(0, 0, bgUnderlayCanvas.width, bgUnderlayCanvas.height);
    if (state.bgLayerAboveDrawings) return;
    const src = getActiveBgCanvas();
    if (!src || !src.width || !src.height) return;
    bgUnderlayCtx.drawImage(src, 0, 0);
  }
  function clearBgUnderlayPreview() {
    if (!bgUnderlayCanvas || !bgUnderlayCtx) return;
    bgUnderlayCtx.clearRect(0, 0, bgUnderlayCanvas.width, bgUnderlayCanvas.height);
  }
  function getActiveBgDrawing() { return isSingleView() ? state.bgDrawingSingle : state.bgDrawing; }
  function setActiveBgDrawing(d) { if (isSingleView()) state.bgDrawingSingle = d; else state.bgDrawing = d; }
  const tplCanvas = document.createElement('canvas'); // template layer
  const tplCtx = tplCanvas.getContext('2d', { willReadFrequently: true });
  
  
  const frameSheetCanvas = document.createElement('canvas'); // per-frame sheet layer
  const frameSheetCtx = frameSheetCanvas.getContext('2d', { willReadFrequently: true });
let isDrawing = false;
  let suppressDrawTouchUntilRelease = false; // multi-touch gesture guard (iPad)
  let skipNextSegment = false; // used when pointer leaves drawable area or misses frame hit
  let _activePointerId = null; // Pointer Events: active pointer id (prevents double-fire w/ touch)
  let _pointerEventsActive = false; // true when a pointer (non-mouse) event is driving drawing

  let lastPoint = null;
  let activeFrameStroke = null; // { frameIdx, canvas, ctx, lastLocal }
  let longStrokePath = []; // Array of {u, v} normalized points for long stroke trail
  let longStrokeLastFrame = -1;
  let longStrokeBaseHit = null;
  let lastPointerPos = null;
  let holdStampLastFrame = -1;
  let longStrokeTileSnapshots = new Map(); // frameIdx -> per-tile snapshot canvas for trail mode (avoids huge full-sheet snapshot)
  let longStrokeFrameTicks = new Map(); // frameIdx -> tick when frame was last stamped
  let longStrokeActiveFrames = new Set(); // frames currently showing the trail
  let longStrokeTouchedFrames = new Set(); // frames touched since stroke start
  let longStrokeEndTick = null; // tick when mouse was released (for decay)
  let longStrokeVirtualTick = 0; // virtual tick used when animation is stopped (counts frame-changes / decay steps)
  let longStrokeDecayInterval = null; // interval id for decay when not playing

  let paletteX = 20, paletteY = 100;
  let paletteDragging = false;
  let paletteDragOffset = { x: 0, y: 0 };
  let drawUndoStack = [];
  const _isCoarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const DRAW_CANVAS_MAX_PIXELS = _isCoarsePointer ? 10_000_000 : 24_000_000;
  const DRAW_CANVAS_MAX_SIDE = _isCoarsePointer ? 8192 : 12000;

  function canSnapshotCanvas(cnv) {
    if (!cnv || !cnv.width || !cnv.height) return false;
    const px = cnv.width * cnv.height;
    const limit = _isCoarsePointer ? 12_000_000 : 40_000_000;
    return px <= limit;
  }

  function readCssPx(value) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }

  function getDrawCanvasLayoutSize() {
    const cs = window.getComputedStyle(canvasInner);
    const padRight = readCssPx(cs.paddingRight);
    const padBottom = readCssPx(cs.paddingBottom);
    const gridRight = framesGrid ? ((framesGrid.offsetLeft || 0) + (framesGrid.offsetWidth || 0)) : 0;
    const gridBottom = framesGrid ? ((framesGrid.offsetTop || 0) + (framesGrid.offsetHeight || 0)) : 0;

    return {
      cssW: Math.max(1, Math.ceil(Math.max(
        canvasInner.offsetWidth || 0,
        canvasInner.clientWidth || 0,
        gridRight + padRight
      ))),
      cssH: Math.max(1, Math.ceil(Math.max(
        canvasInner.offsetHeight || 0,
        canvasInner.clientHeight || 0,
        gridBottom + padBottom
      )))
    };
  }

  function resolveDrawCanvasDpr(cssW, cssH) {
    const base = _isCoarsePointer ? 1 : Math.min(2, window.devicePixelRatio || 1);
    const cssArea = Math.max(1, cssW * cssH);
    const byArea = Math.sqrt(DRAW_CANVAS_MAX_PIXELS / cssArea);
    const bySide = Math.min(DRAW_CANVAS_MAX_SIDE / Math.max(1, cssW), DRAW_CANVAS_MAX_SIDE / Math.max(1, cssH));
    return Math.max(0.1, Math.min(base, byArea, bySide));
  }

  function applyCanvasCssSize(cnv, cssW, cssH) {
    if (!cnv) return;
    const w = `${cssW}px`;
    const h = `${cssH}px`;
    if (cnv.style.width !== w) cnv.style.width = w;
    if (cnv.style.height !== h) cnv.style.height = h;
  }

  // ====================================
  //  DRAW UNDO v0.26.26 STEP3 (stable)
  //  - target-only snapshots
  //  - FRM captures per-tile snapshots
  //  - undo never clears layers when snapshot is missing
  // ====================================
  const DRAW_UNDO_MAX = 8; // keep last 8 actions (roughly 3-4 strokes + safety)
  let activeUndoEntry = null;

  function _cloneImageDataSafe(img) {
    try {
      if (!img) return null;
      return _isCoarsePointer ? img : new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
    } catch (e) { return null; }
  }

  function pushUndoEntry(entry) {
    if (!entry) return;
    drawUndoStack.push(entry);
    if (drawUndoStack.length > DRAW_UNDO_MAX) drawUndoStack.shift();
  }

  function beginUndoCaptureForDrawTarget(targetOverride) {
    activeUndoEntry = null;
    const t = targetOverride || state.drawTarget;

    if (t === 'background') {
      try {
        const bgTarget = isSingleView() ? 'single' : 'grid';
        const cnv = (bgTarget === 'single') ? bgCanvasSingle : bgCanvas;
        const ctx = (bgTarget === 'single') ? bgCtxSingle : bgCtx;
        let img = null;
        if (canSnapshotCanvas(cnv)) {
          img = ctx.getImageData(0, 0, cnv.width, cnv.height);
        } else {
          // fallback: use stored drawing if exists
          img = _cloneImageDataSafe(getActiveBgDrawing());
        }
        if (img) pushUndoEntry({ kind: 'bg', bgTarget, bg: _cloneImageDataSafe(img) });
      } catch (e) {}
      return;
    }

    if (t === 'template') {
      try {
        ensureTplCanvasSized();
        if (tplCanvas && canSnapshotCanvas(tplCanvas)) {
          const img = tplCtx.getImageData(0, 0, tplCanvas.width, tplCanvas.height);
          pushUndoEntry({ kind: 'tpl', tpl: _cloneImageDataSafe(img) });
        } else {
          const img = _cloneImageDataSafe(state.templateDrawing);
          if (img) pushUndoEntry({ kind: 'tpl', tpl: img });
        }
      } catch (e) {}
      return;
    }

    if (t === 'frame') {
      try {
        ensureFrameSheet();
        const tw = state.frameSheetTileW || 1;
        const th = state.frameSheetTileH || 1;
        const cols = state.frameSheetCols || 1;
        const entry = { kind: 'frm', tw, th, cols, tiles: new Map() };
        pushUndoEntry(entry);
        activeUndoEntry = entry;
      } catch (e) {}
      return;
    }
  }


  // Safety guard: if a frame-draw happens mid-stroke but activeUndoEntry was lost, recover it
  function _ensureActiveUndoEntry() {
    if (!isDrawing || state.drawTarget !== 'frame') return;
    if (activeUndoEntry && activeUndoEntry.kind === 'frm') return;
    const top = drawUndoStack[drawUndoStack.length - 1];
    if (top && top.kind === 'frm') { activeUndoEntry = top; return; }
    try {
      ensureFrameSheet();
      const entry = { kind: 'frm', tw: state.frameSheetTileW || 1,
        th: state.frameSheetTileH || 1, cols: state.frameSheetCols || 1,
        tiles: new Map() };
      pushUndoEntry(entry);
      activeUndoEntry = entry;
    } catch(e) {}
  }

  function captureUndoFrameTile(frameIdx) {
    _ensureActiveUndoEntry();
    if (!activeUndoEntry || activeUndoEntry.kind !== 'frm') return;
    const idx = frameIdx | 0;
    if (idx < 0) return;
    if (activeUndoEntry.tiles.has(idx)) return;
    try {
      const tw = activeUndoEntry.tw || state.frameSheetTileW || 1;
      const th = activeUndoEntry.th || state.frameSheetTileH || 1;
      const cols = activeUndoEntry.cols || state.frameSheetCols || 1;
      const sx = (idx % cols) * tw;
      const sy = Math.floor(idx / cols) * th;
      if (!canSnapshotCanvas({ width: tw, height: th })) {
        // canSnapshotCanvas expects canvas, so use a tiny custom check
        const px = tw * th;
        const limit = _isCoarsePointer ? 12_000_000 : 40_000_000;
        if (px > limit) return;
      }
      const img = frameSheetCtx.getImageData(sx, sy, tw, th);
      activeUndoEntry.tiles.set(idx, img);
    } catch (e) {}
  }

  function restoreUndoEntry(entry) {
    if (!entry) return;

    // Backward compatibility: older entries had no kind
    const kind = entry.kind || 'all';

    if (kind === 'bg') {
      try {
        if (!entry.bg) return;
        const bgTarget = entry.bgTarget || 'grid';
        const cnv = (bgTarget === 'single') ? bgCanvasSingle : bgCanvas;
        const ctx = (bgTarget === 'single') ? bgCtxSingle : bgCtx;
        if (bgTarget === 'single') state.bgDrawingSingle = entry.bg;
        else state.bgDrawing = entry.bg;
        ctx.putImageData(entry.bg, 0, 0);
        requestComposite();
      } catch (e) {}
      return;
    }

    if (kind === 'tpl') {
      try {
        if (!entry.tpl) return;
        ensureTplCanvasSized();
        state.templateDrawing = entry.tpl;
        tplCtx.putImageData(entry.tpl, 0, 0);
        renderTemplateFramePreview();
        requestComposite();
      } catch (e) {}
      return;
    }

    if (kind === 'frm') {
      try {
        ensureFrameSheet();
        if (!entry.tiles || !(entry.tiles instanceof Map) || entry.tiles.size === 0) return;
        const tw = entry.tw || state.frameSheetTileW || 1;
        const th = entry.th || state.frameSheetTileH || 1;
        const cols = entry.cols || state.frameSheetCols || 1;

        entry.tiles.forEach((img, idx) => {
          try {
            const sx = (idx % cols) * tw;
            const sy = Math.floor(idx / cols) * th;
            frameSheetCtx.putImageData(img, sx, sy);
          } catch (e) {}
        });

        requestComposite();
      } catch (e) {}
      return;
    }

    // kind === 'all' (legacy snapshots used by applyTemplateToFrames)
    try {
      if (entry.bg) {
        const bgTarget = entry.bgTarget || 'grid';
        const cnv = (bgTarget === 'single') ? bgCanvasSingle : bgCanvas;
        const ctx = (bgTarget === 'single') ? bgCtxSingle : bgCtx;
        if (bgTarget === 'single') state.bgDrawingSingle = entry.bg;
        else state.bgDrawing = entry.bg;
        try { ctx.putImageData(entry.bg, 0, 0); } catch (e) {}
      }

      if (entry.tpl) {
        ensureTplCanvasSized();
        state.templateDrawing = entry.tpl;
        try { tplCtx.putImageData(entry.tpl, 0, 0); } catch (e) {}
        try { renderTemplateFramePreview(); } catch (e) {}
      }

      if (entry.sheet) {
        ensureFrameSheet();
        try {
          const tmp = document.createElement('canvas');
          tmp.width = entry.sheet.width;
          tmp.height = entry.sheet.height;
          tmp.getContext('2d').putImageData(entry.sheet, 0, 0);
          frameSheetCtx.clearRect(0, 0, frameSheetCanvas.width, frameSheetCanvas.height);
          frameSheetCtx.drawImage(tmp, 0, 0, frameSheetCanvas.width, frameSheetCanvas.height);
        } catch (e) {}
      }

      requestComposite();
    } catch (e) {}
  }

  
  // Initialize positions
  drawPalette.style.left = paletteX + 'px';
  drawPalette.style.top = paletteY + 'px';
  
  // Palette dragging
  drawPalette.onmousedown = e => {
    if (e.button !== 0) return;
    if (e.target === drawPalette || (e.target.closest('.draw-palette-row, .draw-target-row') && !e.target.closest('button, input, .draw-color'))) {
      paletteDragging = true;
      paletteDragOffset.x = e.clientX - paletteX;
      paletteDragOffset.y = e.clientY - paletteY;
      e.preventDefault();
    }
  };
  
  document.addEventListener('mousemove', e => {
    if (paletteDragging) {
      paletteX = e.clientX - paletteDragOffset.x;
      paletteY = e.clientY - paletteDragOffset.y;
      drawPalette.style.left = paletteX + 'px';
      drawPalette.style.top = paletteY + 'px';
    }
  });
  
  document.addEventListener('mouseup', () => {
    paletteDragging = false;
  });
  
  // Touch support for palette
  drawPalette.ontouchstart = e => {
    if (e.target === drawPalette || (e.target.closest('.draw-palette-row, .draw-target-row') && !e.target.closest('button, input, .draw-color'))) {
      paletteDragging = true;
      const touch = e.touches[0];
      paletteDragOffset.x = touch.clientX - paletteX;
      paletteDragOffset.y = touch.clientY - paletteY;
    }
  };
  
  document.addEventListener('touchmove', e => {
    if (paletteDragging) {
      const touch = e.touches[0];
      paletteX = touch.clientX - paletteDragOffset.x;
      paletteY = touch.clientY - paletteDragOffset.y;
      drawPalette.style.left = paletteX + 'px';
      drawPalette.style.top = paletteY + 'px';
    }
  }, { passive: true });
  
  document.addEventListener('touchend', () => {
    paletteDragging = false;
  });
  
  
  let brushLocked = false;
  function syncBrushLockUI() {
    if (drawBrushLockBtn) drawBrushLockBtn.classList.toggle('brush-off', !!brushLocked);
  }
  function setBrushLocked(on) {
    brushLocked = !!on;
    syncBrushLockUI();
  }
  function toggleBrushLocked() {
    setBrushLocked(!brushLocked);
  }

function toggleDrawMode() {
    state.drawMode = !state.drawMode;
    drawCanvas.classList.toggle('active', state.drawMode);
    drawPalette.classList.toggle('visible', state.drawMode);
    qDraw.classList.toggle('active', state.drawMode);
    drawToggle.classList.toggle('active', state.drawMode);
    
    if (state.drawMode) {
      // Default target on entering Draw Mode: FRM
      if (state.drawTarget !== 'frame') {
        state.drawTarget = 'frame';
        drawTargetBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.target === 'frame'));
        showTemplateFrame(false);
      }

      drawCanvas.style.touchAction = 'none';
      drawCanvas.style.pointerEvents = 'auto';
      resizeDrawCanvas();
      compositeAllLayers();
      brushCursor.classList.toggle('eraser', state.drawEraser);
    } else {
      setBrushLocked(false);
      drawCanvas.style.touchAction = '';
      drawCanvas.style.pointerEvents = 'none';
      showTemplateFrame(false);
      brushCursor.classList.remove('visible');
    }
  }
  
  
  function updateTemplateCanvasSize() {
    // Make template canvas match a single frame cell in drawCanvas coordinates
    const items = framesGrid.querySelectorAll('.frame-item');
    const offset = 0;
    const first = items[offset];
    if (!first) return;
    const innerRect = canvasInner.getBoundingClientRect();
    if (!innerRect.width || !innerRect.height) return;
    const rect = first.getBoundingClientRect();
    const scaleX = drawCanvas.width / innerRect.width;
    const scaleY = drawCanvas.height / innerRect.height;
    const w = Math.max(1, Math.round(rect.width * scaleX));
    const h = Math.max(1, Math.round(rect.height * scaleY));

    if (tplCanvas.width !== w || tplCanvas.height !== h) {
      // Preserve existing template drawing by scaling into new buffer
      const prev = document.createElement('canvas');
      prev.width = tplCanvas.width || 1;
      prev.height = tplCanvas.height || 1;
      prev.getContext('2d').drawImage(tplCanvas, 0, 0);

      tplCanvas.width = w;
      tplCanvas.height = h;
      tplCtx.clearRect(0, 0, w, h);
      tplCtx.drawImage(prev, 0, 0, w, h);

      // Keep preview canvas in sync
      templateFrameCanvas.width = w;
      templateFrameCanvas.height = h;
      renderTemplateFramePreview();
    }
  }
function resizeDrawCanvas() {
    const { cssW, cssH } = getDrawCanvasLayoutSize();
    const dpr = resolveDrawCanvasDpr(cssW, cssH);
    state.drawCanvasDpr = dpr;
    const newW = Math.max(1, Math.round(cssW * dpr));
    const newH = Math.max(1, Math.round(cssH * dpr));

    applyCanvasCssSize(drawCanvas, cssW, cssH);
    applyCanvasCssSize(bgUnderlayCanvas, cssW, cssH);

    // If size unchanged, only keep template sized correctly
    if (drawCanvas.width === newW && drawCanvas.height === newH) {
      ensureTplCanvasSized();
      return;
    }

    // Snapshot BG layers before resize, because resizing clears canvas buffers
    let oldBg = null;
    if (canSnapshotCanvas(bgCanvas)) {
      oldBg = document.createElement('canvas');
      oldBg.width = bgCanvas.width || 1;
      oldBg.height = bgCanvas.height || 1;
      oldBg.getContext('2d').drawImage(bgCanvas, 0, 0);
    }

    let oldBgSingle = null;
    if (canSnapshotCanvas(bgCanvasSingle)) {
      oldBgSingle = document.createElement('canvas');
      oldBgSingle.width = bgCanvasSingle.width || 1;
      oldBgSingle.height = bgCanvasSingle.height || 1;
      oldBgSingle.getContext('2d').drawImage(bgCanvasSingle, 0, 0);
    }

    // Resize overlay canvases (clears content)
    drawCanvas.width = newW;
    drawCanvas.height = newH;
    bgUnderlayCanvas.width = newW;
    bgUnderlayCanvas.height = newH;
    bgCanvas.width = newW;
    bgCanvas.height = newH;
    bgCanvasSingle.width = newW;
    bgCanvasSingle.height = newH;

    // Restore BGs by scaling snapshots into the new size
    try {
      bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
      if (oldBg && oldBg.width > 1 && oldBg.height > 1) {
        bgCtx.drawImage(oldBg, 0, 0, newW, newH);
      }
    } catch (e) {}

    try {
      bgCtxSingle.clearRect(0, 0, bgCanvasSingle.width, bgCanvasSingle.height);
      if (oldBgSingle && oldBgSingle.width > 1 && oldBgSingle.height > 1) {
        bgCtxSingle.drawImage(oldBgSingle, 0, 0, newW, newH);
      }
    } catch (e) {}

    // Refresh cached BG snapshots only if safe (helps Undo)
    try {
      state.bgDrawing = canSnapshotCanvas(bgCanvas) ? bgCtx.getImageData(0, 0, bgCanvas.width, bgCanvas.height) : null;
    } catch (e) {
      state.bgDrawing = null;
    }
    try {
      state.bgDrawingSingle = canSnapshotCanvas(bgCanvasSingle) ? bgCtxSingle.getImageData(0, 0, bgCanvasSingle.width, bgCanvasSingle.height) : null;
    } catch (e) {
      state.bgDrawingSingle = null;
    }

    syncBgUnderlayPreview();

    // Template is per-frame overlay, keep it sized to one frame cell
    ensureTplCanvasSized();

    // Restore template snapshot (if any), scaling if size changed
    if (state.templateDrawing && tplCanvas.width && tplCanvas.height) {
      try {
        if (state.templateDrawing.width === tplCanvas.width && state.templateDrawing.height === tplCanvas.height) {
          tplCtx.putImageData(state.templateDrawing, 0, 0);
        } else {
          const tmp = document.createElement('canvas');
          tmp.width = state.templateDrawing.width;
          tmp.height = state.templateDrawing.height;
          tmp.getContext('2d').putImageData(state.templateDrawing, 0, 0);
          tplCtx.clearRect(0, 0, tplCanvas.width, tplCanvas.height);
          tplCtx.drawImage(tmp, 0, 0, tplCanvas.width, tplCanvas.height);
          state.templateDrawing = canSnapshotCanvas(tplCanvas) ? tplCtx.getImageData(0, 0, tplCanvas.width, tplCanvas.height) : null;
        }
      } catch (e) {}
    }
  }


  function showTemplateFrame(show) {
    if (!templateFrame) return;
    templateFrame.classList.toggle('visible', !!show);
    if (show) {
      ensureTplCanvasSized();
      syncTemplateFrameToFirstFrame();
      renderTemplateFramePreview();
    }
  }



  function getTemplateBaseRect() {
    const items = framesGrid.querySelectorAll('.frame-item');
    const offset = 0;
    const firstFrame = items[offset];
    const headerH = 24;
    if (!firstFrame) return { ok: false, headerH };
    return { ok: true, headerH, frameRect: firstFrame.getBoundingClientRect() };
  }

  // Reset to first frame (used when user re-activates Template).
  function syncTemplateFrameToFirstFrame() {
    tplFollow.dxWorld = 0;
    tplFollow.dyWorld = 0;
    updateTemplateFrameFollow();
  }

  // Keep Template window moving with pan/zoom, while preserving manual offsets.
  function updateTemplateFrameFollow() {
    if (!templateFrame || !templateFrame.classList.contains('visible')) return;

    const base = getTemplateBaseRect();
    const headerH = base.headerH || 24;
    const scale = Number.isFinite(state.scale) ? state.scale : 1;

    if (base.ok) {
      const frameRect = base.frameRect;

      const baseLeft = frameRect.left;
      const baseTop = frameRect.top - headerH;

      templateFrame.style.left = (baseLeft + (tplFollow.dxWorld * scale)) + 'px';
      templateFrame.style.top = (baseTop + (tplFollow.dyWorld * scale)) + 'px';
      templateFrame.style.width = frameRect.width + 'px';
      templateFrame.style.height = (frameRect.height + headerH) + 'px';
      // Allow the follow-size to go smaller than the default CSS min-size (important when zooming out).
      templateFrame.style.minWidth = '0px';
      templateFrame.style.minHeight = '0px';
      return;
    }

    // Fallback: keep existing placement, ensure sane size (header included).
    const aspect = getEffectiveFrameAspect();
    const baseW = Math.min(400, window.innerWidth * 0.4);
    const baseH = baseW / aspect;
    templateFrame.style.width = baseW + 'px';
    templateFrame.style.height = (baseH + headerH) + 'px';
    templateFrame.style.minWidth = '0px';
    templateFrame.style.minHeight = '0px';
  }




  function ensureTplCanvasSized() {
    // Template is a per-frame overlay: match the current frame-tile native resolution.
    const dims = getFrameTileDims();
    let targetW = dims.w;
    let targetH = dims.h;

    // Fallbacks (should rarely trigger)
    if (!targetW || !targetH || targetW < 2 || targetH < 2) {
      const aspect = getEffectiveFrameAspect();
      targetW = 1024;
      targetH = Math.max(2, Math.round(1024 / Math.max(0.0001, aspect)));
    }

    targetW = Math.max(2, Math.round(targetW));
    targetH = Math.max(2, Math.round(targetH));

    if (tplCanvas.width === targetW && tplCanvas.height === targetH) return;

    // Preserve existing template content by scaling into the new resolution
    const old = document.createElement('canvas');
    old.width = tplCanvas.width || 1;
    old.height = tplCanvas.height || 1;
    try { old.getContext('2d').drawImage(tplCanvas, 0, 0); } catch (e) {}

    tplCanvas.width = targetW;
    tplCanvas.height = targetH;

    try {
      tplCtx.setTransform(1, 0, 0, 1, 0, 0);
      tplCtx.clearRect(0, 0, targetW, targetH);
      if (old.width > 1 && old.height > 1) {
        tplCtx.drawImage(old, 0, 0, old.width, old.height, 0, 0, targetW, targetH);
      }
    } catch (e) {}
  }


  function renderTemplateFramePreview() {
    if (!templateFrameCanvas || !templateFrameCtx) return;
    if (!tplCanvas.width || !tplCanvas.height) return;

    // Keep preview canvas native resolution identical to tplCanvas,
    // and let CSS scale it visually (preserves aspect & pixel mapping).
    if (templateFrameCanvas.width !== tplCanvas.width || templateFrameCanvas.height !== tplCanvas.height) {
      templateFrameCanvas.width = tplCanvas.width;
      templateFrameCanvas.height = tplCanvas.height;
    }

    templateFrameCtx.clearRect(0, 0, templateFrameCanvas.width, templateFrameCanvas.height);
    templateFrameCtx.drawImage(tplCanvas, 0, 0, templateFrameCanvas.width, templateFrameCanvas.height);
  }
  // --- Frame-sheet helpers (per-frame drawings that follow animation) ---
  
  function getFrameTileDims() {
    // Goal: FRM tile resolution tracks captured frame resolution (video * quality),
    // but stays inside safe canvas limits (dimensions + total pixels).
    const capW = Math.max(1, state.captureW || Math.round((state.videoWidth || 1) * (state.quality || 1)));
    const capH = Math.max(1, state.captureH || Math.round((state.videoHeight || 1) * (state.quality || 1)));

    // IMPORTANT: FRM drawings must be pixel-matched to the *cell* aspect when Target Frame Aspect is enabled.
    // If the internal pixel aspect (canvas) differs from the CSS box aspect (cell), circles become ellipses.
    // So we compute the FRM tile source size as if the captured frame was already in the target aspect.
    let srcW = capW;
    let srcH = capH;
    const targetAspect = parseAspectValue(state.frameTargetAspect);
    if (targetAspect) {
      const srcAspect = capW / capH;
      if (targetAspect > srcAspect) {
        srcW = capW;
        srcH = Math.max(1, Math.round(capW / targetAspect));
      } else {
        srcW = Math.max(1, Math.round(capH * targetAspect));
        srcH = capH;
      }
    }

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    // Conservative limits. Many systems can do more, but this avoids silent downscales / glitches.
    const MAX_SHEET_SIDE = isIOS ? 4096 : 16384;
    // Total pixel cap for the whole sheet. 48M px ~= 192MB RGBA.
    const MAX_SHEET_PIXELS = isIOS ? 16_000_000 : 48_000_000;

    const cols = Math.max(1, state.gridCols || 1);
    const rows = Math.max(1, Math.ceil((state.frames?.length || 1) / cols));

    // Reuse cached dims if still valid
    if (state._frameTileDims) {
      const d = state._frameTileDims;
      const same = d._srcW === srcW && d._srcH === srcH && d._cols === cols && d._rows === rows;
      if (same) return d;
    }

    const reqSheetW = cols * srcW;
    const reqSheetH = rows * srcH;
    const reqPixels = reqSheetW * reqSheetH;

    let scaleDim = Math.min(
      1,
      (MAX_SHEET_SIDE / Math.max(1, reqSheetW)),
      (MAX_SHEET_SIDE / Math.max(1, reqSheetH))
    );

    let scaleArea = 1;
    if (reqPixels > MAX_SHEET_PIXELS) {
      scaleArea = Math.sqrt(MAX_SHEET_PIXELS / Math.max(1, reqPixels));
    }

    const scale = Math.min(scaleDim, scaleArea);

    let tw = Math.max(2, Math.round(srcW * scale));
    let th = Math.max(2, Math.round(srcH * scale));

    // Keep even dims for slightly nicer sampling
    if (tw % 2) tw += 1;
    if (th % 2) th += 1;

    state._frameTileDims = { tw, th, _srcW: srcW, _srcH: srcH, _cols: cols, _rows: rows, _scale: scale };
    return state._frameTileDims;
  }


  function ensureFrameSheet() {
    if (!state.frames.length) return;
    const { tw, th } = getFrameTileDims();
    const newCols = Math.max(1, state.gridCols || 1);
    const rows = Math.ceil(state.frames.length / newCols);
    const newW = newCols * tw;
    const newH = rows * th;

    // If nothing changed, keep
    if (frameSheetCanvas.width === newW && frameSheetCanvas.height === newH &&
        state.frameSheetCols === newCols && state.frameSheetTileW === tw && state.frameSheetTileH === th) {
      return;
    }

    // Remap old content tile-by-tile
    const oldCols = state.frameSheetCols || newCols;
    const oldTW = state.frameSheetTileW || tw;
    const oldTH = state.frameSheetTileH || th;
    const oldW = frameSheetCanvas.width || 0;
    const oldH = frameSheetCanvas.height || 0;

    const prev = document.createElement('canvas');
    prev.width = oldW || 1;
    prev.height = oldH || 1;
    if (oldW && oldH) prev.getContext('2d').drawImage(frameSheetCanvas, 0, 0);

    frameSheetCanvas.width = newW;
    frameSheetCanvas.height = newH;
    frameSheetCtx.clearRect(0, 0, newW, newH);

    // Copy each frame tile from old mapping to new mapping without scaling
    if (oldW && oldH) {
      for (let f = 0; f < state.frames.length; f++) {
        const osx = (f % oldCols) * oldTW;
        const osy = Math.floor(f / oldCols) * oldTH;
        const nsx = (f % newCols) * tw;
        const nsy = Math.floor(f / newCols) * th;
        frameSheetCtx.drawImage(prev, osx, osy, oldTW, oldTH, nsx, nsy, tw, th);
      }
    }

    state.frameSheetCols = newCols;
    state.frameSheetTileW = tw;
    state.frameSheetTileH = th;
  }

  function sheetPoint(frameIdx, u, v) {
    ensureFrameSheet();
    const tw = state.frameSheetTileW || 1;
    const th = state.frameSheetTileH || 1;
    const cols = state.frameSheetCols || 1;
    const ox = (frameIdx % cols) * tw;
    const oy = Math.floor(frameIdx / cols) * th;
    return { x: ox + u * tw, y: oy + v * th };
  }


  // Composite all layers onto the visible draw canvas
  
  // Composite throttling, avoids heavy redraw on every touch event (important on iPad)
  let _compositeQueued = false;
  function requestComposite() {
    if (_compositeQueued) return;
    _compositeQueued = true;
    requestAnimationFrame(() => {
      _compositeQueued = false;
      compositeAllLayers();
    });
  }

function compositeAllLayers() {
    const _t0 = performance.now();
    try {
      drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

      const drawBgLayer = () => {
        drawCtx.drawImage(getActiveBgCanvas(), 0, 0);
      };

      if (!state.bgLayerAboveDrawings) {
        syncBgUnderlayPreview();
      } else {
        clearBgUnderlayPreview();
        drawBgLayer();
      }

      // Ref Frame overlay (position relative to drawings is configurable)
      if (!state.refFrameAboveDrawings) {
        renderRefFrameOnFramesOnCanvas();
      }

      // Template (per-frame projection, repeated onto every visible frame)
      renderTemplateOnFramesOnCanvas();

      // Update template preview window (if visible)
      if (templateFrame && templateFrame.classList.contains('visible')) renderTemplateFramePreview();

      // Per-frame drawings (should follow the frame as it animates)
      renderFrameDrawingsOnCanvas();

      if (state.bgLayerAboveDrawings) {
        drawBgLayer();
      }

      // If requested, draw ref frame after drawings so blend modes affect drawings too
      if (state.refFrameAboveDrawings) {
        renderRefFrameOnFramesOnCanvas();
      }
  
    } finally {
      const _dt = performance.now() - _t0;
      state._compLastMs = _dt;
      state._compAvgMs = (typeof state._compAvgMs === 'number') ? (state._compAvgMs * 0.85 + _dt * 0.15) : _dt;
    }
  }

  function renderRefFrameOnFramesOnCanvas() {
    if (!state.refFrameSource || !state.refFrameVisible) return;

    const items = framesGrid.querySelectorAll('.frame-item');
    const offset = 0;

    const drawRect = drawCanvas.getBoundingClientRect();
    if (!drawRect.width || !drawRect.height) return;

    const scaleX = drawCanvas.width / Math.max(1, drawRect.width);
    const scaleY = drawCanvas.height / Math.max(1, drawRect.height);

    // Media dims (stable across cells)
    let srcW = 1, srcH = 1;
    const src = state.refFrameSource;
    if (src.videoWidth && src.videoHeight) { srcW = src.videoWidth; srcH = src.videoHeight; }
    else if (src.naturalWidth && src.naturalHeight) { srcW = src.naturalWidth; srcH = src.naturalHeight; }
    else if (src.width && src.height) { srcW = src.width; srcH = src.height; }
    srcW = Math.max(1, Number(srcW) || 1);
    srcH = Math.max(1, Number(srcH) || 1);

    const follow = !!state.refFrameFollowFrameTransform;
    const mainScaleX = follow ? (Number(state.frameImgScaleX) || Number(state.frameImgScale) || 1) : 1;
    const mainScaleY = follow ? (Number(state.frameImgScaleY) || Number(state.frameImgScale) || 1) : 1;
    const mainOffXPct = follow ? (Number(state.frameImgOffX) || 0) : 0;
    const mainOffYPct = follow ? (Number(state.frameImgOffY) || 0) : 0;
    const mainRot = follow ? (Number(state.frameImgRot) || 0) : 0;

    const sx = (Number(state.refFrameScaleX) || Number(state.refFrameScale) || 1) * mainScaleX;
    const sy = (Number(state.refFrameScaleY) || Number(state.refFrameScale) || 1) * mainScaleY;
    const rot = (Number(state.refFrameRot) || 0) + mainRot;
    const alpha = Math.max(0, Math.min(1, Number(state.refFrameOpacity) || 0));

    for (let i = offset; i < items.length; i++) {
      const item = items[i];
      const rect = item.getBoundingClientRect();
      const x = (rect.left - drawRect.left) * scaleX;
      const y = (rect.top - drawRect.top) * scaleY;
      const w = rect.width * scaleX;
      const h = rect.height * scaleY;

      const ox = ((Number(state.refFrameOffX) || 0) + mainOffXPct) * 0.01 * w;
      const oy = ((Number(state.refFrameOffY) || 0) + mainOffYPct) * 0.01 * h;
      const contain = Math.min(w / srcW, h / srcH);
      const dw = srcW * contain * sx;
      const dh = srcH * contain * sy;
      const dx = x + (w - dw) / 2 + ox;
      const dy = y + (h - dh) / 2 + oy;

      const cx = dx + dw / 2;
      const cy = dy + dh / 2;

      drawCtx.save();
      drawCtx.globalAlpha = alpha;
      drawCtx.globalCompositeOperation = 'source-over';
      drawCtx.beginPath();
      drawCtx.rect(x, y, w, h);
      drawCtx.clip();

      drawCtx.translate(cx, cy);
      drawCtx.rotate(rot * Math.PI / 180);
      drawCtx.drawImage(src, -dw / 2, -dh / 2, dw, dh);
      drawCtx.restore();
    }
  }

  function renderTemplateOnFramesOnCanvas() {
    if (!state.showTemplateDrawing) return;
    if (!tplCanvas.width || !tplCanvas.height) return;

    const items = framesGrid.querySelectorAll('.frame-item');
    const offset = 0;

    const drawRect = drawCanvas.getBoundingClientRect();
    if (!drawRect.width || !drawRect.height) return;

    const scaleX = drawCanvas.width / Math.max(1, drawRect.width);
    const scaleY = drawCanvas.height / Math.max(1, drawRect.height);

    for (let i = offset; i < items.length; i++) {
      const item = items[i];
      const rect = item.getBoundingClientRect();
      const x = (rect.left - drawRect.left) * scaleX;
      const y = (rect.top - drawRect.top) * scaleY;
      const w = rect.width * scaleX;
      const h = rect.height * scaleY;

      // Draw template as a per-frame overlay (scaled to the cell)
      drawCtx.drawImage(tplCanvas, x, y, w, h);
    }
  }

  
  function renderFrameDrawingsOnCanvas() {
    // Per-frame sheet: each visible cell gets the slice for its current frameIdx
    if (!frameSheetCanvas.width || !frameSheetCanvas.height) return;
    const items = framesGrid.querySelectorAll('.frame-item');
    const offset = 0;

    const drawRect = drawCanvas.getBoundingClientRect();
    if (!drawRect.width || !drawRect.height) return;
    const scaleX = drawCanvas.width / Math.max(1, drawRect.width);
    const scaleY = drawCanvas.height / Math.max(1, drawRect.height);

    const tw = state.frameSheetTileW || 1;
    const th = state.frameSheetTileH || 1;
    const cols = state.frameSheetCols || 1;

    for (let i = offset; i < items.length; i++) {
      const item = items[i];
      const frameIdx = Number.isFinite(parseInt(item.dataset.frameIdx)) ? parseInt(item.dataset.frameIdx) : (i - offset) * state.cellSize;
      if (!Number.isFinite(frameIdx)) continue;

      const rect = item.getBoundingClientRect();
      const x = (rect.left - drawRect.left) * scaleX;
      const y = (rect.top - drawRect.top) * scaleY;
      const w = rect.width * scaleX;
      const h = rect.height * scaleY;

      const sx = (frameIdx % cols) * tw;
      const sy = Math.floor(frameIdx / cols) * th;

      drawCtx.drawImage(frameSheetCanvas, sx, sy, tw, th, x, y, w, h);
    }
  }

  function saveCurrentLayer() {
    if (state.drawTarget === 'background') {
      try {
        const cnv = getActiveBgCanvas();
        const ctx = getActiveBgCtx();
        setActiveBgDrawing(ctx.getImageData(0, 0, cnv.width, cnv.height));
      } catch (e) {
        setActiveBgDrawing(null);
      }
    } else if (state.drawTarget === 'template') {
      state.templateDrawing = tplCtx.getImageData(0, 0, tplCanvas.width, tplCanvas.height);
    }
    // frame target is saved per-stroke in the drawing handler
  }
  
  function getTargetCanvas() {
    if (state.drawTarget === 'background') return { canvas: getActiveBgCanvas(), ctx: getActiveBgCtx() };
    if (state.drawTarget === 'template') return { canvas: tplCanvas, ctx: tplCtx };
    return null; // frame target handled per-stroke (needs frameIdx)
  }
  
  // Get point relative to canvas
  function getCanvasPoint(e) {
    const rect = drawCanvas.getBoundingClientRect();
    const scaleX = drawCanvas.width / rect.width;
    const scaleY = drawCanvas.height / rect.height;
    
    if (e.touches && e.touches.length > 0) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }
  
  // Get point from raw clientX/Y coordinates (used by Pointer Events)
  function getCanvasPointXY(clientX, clientY) {
    const rect = drawCanvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (drawCanvas.width  / rect.width),
      y: (clientY - rect.top)  * (drawCanvas.height / rect.height)
    };
  }

  // Find which frame cell a point is over (returns null if on background)
  function getFrameAtPoint(point) {
    const items = framesGrid.querySelectorAll('.frame-item');
    const offset = 0;
    const drawRect = drawCanvas.getBoundingClientRect();
    const scaleX = drawCanvas.width / Math.max(1, drawRect.width);
    const scaleY = drawCanvas.height / Math.max(1, drawRect.height);

    if (typeof dbg === 'function') {
    }

    const rects = [];
    for (let i = offset; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      const x = (rect.left - drawRect.left) * scaleX;
      const y = (rect.top - drawRect.top) * scaleY;
      const w = rect.width * scaleX;
      const h = rect.height * scaleY;

      const frameIdx = (Number.isFinite(parseInt(items[i].dataset.frameIdx))
        ? parseInt(items[i].dataset.frameIdx)
        : (i - offset) * state.cellSize);

      rects.push({ i, x, y, w, h, frameIdx, cellEl: items[i] });

      if (point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h) {
        return {
          frameIdx,
          cellEl: items[i],
          localX: point.x - x,
          localY: point.y - y,
          width: w,
          height: h,
          snapped: false
        };
      }
    }

    // SNAP: allow drawing slightly inside gaps between frames (important for fast strokes on iPad)
    const snapCss = _isCoarsePointer ? 22 : 12; // px in screen space
    const tol = snapCss * Math.max(scaleX, scaleY);

    let best = null;
    let bestD2 = Infinity;
    for (const r of rects) {
      const rx2 = r.x + r.w;
      const ry2 = r.y + r.h;
      const dx = (point.x < r.x) ? (r.x - point.x) : (point.x > rx2 ? (point.x - rx2) : 0);
      const dy = (point.y < r.y) ? (r.y - point.y) : (point.y > ry2 ? (point.y - ry2) : 0);
      const d2 = dx * dx + dy * dy;

      if (d2 < bestD2 && dx <= tol && dy <= tol) {
        best = r;
        bestD2 = d2;
      }
    }

    if (best) {
      const lx = Math.min(best.w, Math.max(0, point.x - best.x));
      const ly = Math.min(best.h, Math.max(0, point.y - best.y));
      return {
        frameIdx: best.frameIdx,
        cellEl: best.cellEl,
        localX: lx,
        localY: ly,
        width: best.w,
        height: best.h,
        snapped: true
      };
    }

    return null;
  }
  
    // Brush sizing helpers
  function getEffectiveDpr() {
    return (state.drawCanvasDpr && Number.isFinite(state.drawCanvasDpr)) ? state.drawCanvasDpr : Math.min(2, window.devicePixelRatio || 1);
  }

  function getBrushSizeBgTpl() {
    // drawSize is expressed in CSS px at scale=1.
    // bg/tpl canvases are sized in dpr-scaled pixels.
    return state.drawSize * getEffectiveDpr();
  }

  function getBrushSizeFrame(hit) {
    // Frame drawings live on a stable frame-sheet tile (tw x th).
    // Convert drawSize (CSS px at scale=1) into sheet pixels so that on-screen width matches the brush cursor.
    ensureFrameSheet();
    const tw = state.frameSheetTileW || getFrameTileDims().tw;
    const dpr = getEffectiveDpr();

    const w = (hit && hit.width)
      ? hit.width
      : (longStrokeBaseHit && longStrokeBaseHit.width ? longStrokeBaseHit.width : tw * dpr);

    const cellBaseW = Math.max(1, w / dpr);
    return state.drawSize * (tw / cellBaseW);
  }

// Smooth line drawing
  // Brush type selection
  const brushBtns = document.querySelectorAll('.draw-brush-btn');
  brushBtns.forEach(btn => {
    btn.onclick = () => {
      state.brushType = btn.dataset.brush;
      brushBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
  });


  
  // Soft edge brush stamps (cached)
  const _brushStampCache = new Map();
  function _clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function _parseColorToRGB(c) {
    if (!c) return { r: 255, g: 255, b: 255 };
    const s = ('' + c).trim();
    if (s[0] === '#') {
      const hex = s.slice(1);
      if (hex.length === 3) {
        const r = parseInt(hex[0] + hex[0], 16);
        const g = parseInt(hex[1] + hex[1], 16);
        const b = parseInt(hex[2] + hex[2], 16);
        return { r, g, b };
      }
      if (hex.length >= 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return { r, g, b };
      }
    }
    const m = s.match(/rgba?\(([^)]+)\)/i);
    if (m) {
      const parts = m[1].split(',').map(v => parseFloat(v.trim()));
      return { r: parts[0] || 255, g: parts[1] || 255, b: parts[2] || 255 };
    }
    return { r: 255, g: 255, b: 255 };
  }
  function getSoftCircleStamp(radius, color, softness) {
    const r = Math.max(0.5, radius);
    const soft = _clamp01(softness);
    const key = `${Math.round(r * 10) / 10}|${color}|${Math.round(soft * 100) / 100}`;
    const cached = _brushStampCache.get(key);
    if (cached) return cached;

    const size = Math.ceil(r * 2) + 2;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const gctx = c.getContext('2d');
    const cx = size / 2;
    const cy = size / 2;

    if (soft < 0.001) {
      gctx.fillStyle = color;
      gctx.beginPath();
      gctx.arc(cx, cy, r, 0, Math.PI * 2);
      gctx.fill();
    } else {
      const rgb = _parseColorToRGB(color);
      const inner = Math.max(0, r * (1 - soft));
      const grad = gctx.createRadialGradient(cx, cy, inner, cx, cy, r);
      const solid = `rgba(${rgb.r},${rgb.g},${rgb.b},1)`;
      const transparent = `rgba(${rgb.r},${rgb.g},${rgb.b},0)`;
      const innerStop = r === 0 ? 0 : (inner / r);
      grad.addColorStop(0, solid);
      grad.addColorStop(Math.max(0, Math.min(1, innerStop)), solid);
      grad.addColorStop(1, transparent);
      gctx.fillStyle = grad;
      gctx.beginPath();
      gctx.arc(cx, cy, r, 0, Math.PI * 2);
      gctx.fill();
    }

    const out = { canvas: c, r, half: size / 2 };
    _brushStampCache.set(key, out);
    return out;
  }

function drawSmoothLine(ctx, from, to, color, size, eraser) {
    ctx.save();

    const brush = state.brushType || 'round';

    // Common state
    if (eraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.globalAlpha = 1;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.globalAlpha = state.drawOpacity || 1;
    }

    // Brush styles
    if (brush === 'pencil') {
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      ctx.lineWidth = Math.max(1, size * 0.65);
      if (!eraser) ctx.globalAlpha *= 0.75;
    } else if (brush === 'spray') {
      // Spray brush: density and dot size scale with brush size (so it looks consistent on low/high resolutions)
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy) || 0;

      const scatter = Math.min(10, Math.max(0.05, (typeof state.sprayScatter === 'number' ? state.sprayScatter : 1)));
      const dotScale = Math.min(10, Math.max(0.05, (typeof state.sprayDotScale === 'number' ? state.sprayDotScale : 1)));

      // Spacing between spray "stamps" along the segment
      const step = Math.max(1.0, size * 0.22);
      const steps = Math.max(1, Math.ceil(dist / step));

      // Spray cloud radius around the stroke centerline
      const sprayRadius = Math.max(2, size * 0.95 * scatter);

      // Dot radius scales with size, with small random variation for a more organic look
      const baseDotR = Math.max(0.9 * dotScale, size * 0.10 * dotScale);

      // Dots per stamp. Scales with size but capped for performance.
      let count = Math.round(size * 1.6);
      count = Math.min(90, Math.max(10, count));

      // Performance guard: cap total dots per segment
      const maxDots = 900;
      const totalDots = (steps + 1) * count;
      if (totalDots > maxDots) {
        const k = maxDots / totalDots;
        count = Math.max(3, Math.floor(count * k));
      }

      if (!eraser) ctx.globalAlpha *= 0.35;

      for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : (i / steps);
        const cx = from.x + dx * t;
        const cy = from.y + dy * t;

        for (let j = 0; j < count; j++) {
          const a = Math.random() * Math.PI * 2;
          // sqrt gives more uniform distribution over the area of the disk
          const r = Math.sqrt(Math.random()) * sprayRadius;
          const px = cx + Math.cos(a) * r;
          const py = cy + Math.sin(a) * r;

          const dotR = baseDotR * (0.55 + Math.random() * 0.45);
          ctx.beginPath();
          ctx.arc(px, py, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
      return;
    } else if (brush === 'calligraphy') {
      // Simple calligraphy: stamp thin ellipses oriented to stroke direction
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy) || 0;
      const ang = Math.atan2(dy, dx) + Math.PI / 6; // slight slant
      const step = Math.max(2, size * 0.65);
      const steps = Math.max(1, Math.ceil(dist / step));
      const w = Math.max(2, size * 1.1);
      const h = Math.max(1, size * 0.35);
      if (!eraser) ctx.globalAlpha *= 0.85;

      for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : (i / steps);
        const cx = from.x + dx * t;
        const cy = from.y + dy * t;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      return;
    } else {
      // round (default)
      const edgeSoft = _clamp01(state.edgeSoftness || 0);
      if (edgeSoft > 0.001) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.hypot(dx, dy) || 0;
        const step = Math.max(1, size * 0.25);
        const steps = Math.max(1, Math.ceil(dist / step));
        const stamp = getSoftCircleStamp(size / 2, eraser ? '#000000' : color, edgeSoft);
        for (let i = 0; i <= steps; i++) {
          const t = steps === 0 ? 0 : (i / steps);
          const x = from.x + dx * t;
          const y = from.y + dy * t;
          ctx.drawImage(stamp.canvas, x - stamp.half, y - stamp.half);
        }
        ctx.restore();
        return;
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = size;
    }

ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    ctx.quadraticCurveTo(from.x, from.y, midX, midY);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }
  

  // One Frame mode: clip drawing to the current frame's tile on frameSheetCtx
  // Prevents brush radius from bleeding into adjacent tiles
  function _drawOneTile(ctx, frameIdx, drawFn) {
    const tw = state.frameSheetTileW || 1;
    const th = state.frameSheetTileH || 1;
    const cols = state.frameSheetCols || 1;
    const tx = (frameIdx % cols) * tw;
    const ty = Math.floor(frameIdx / cols) * th;
    ctx.save();
    ctx.beginPath();
    ctx.rect(tx, ty, tw, th);
    ctx.clip();
    drawFn();
    ctx.restore();
  }

  function drawDot(ctx, point, color, size, eraser) {
    ctx.save();
    if (eraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = state.drawOpacity || 1;
      ctx.fillStyle = color;
    }
    const brush = state.brushType || 'round';

    if (brush === 'spray') {
      const scatter = Math.min(10, Math.max(0.05, (typeof state.sprayScatter === 'number' ? state.sprayScatter : 1)));
      const dotScale = Math.min(10, Math.max(0.05, (typeof state.sprayDotScale === 'number' ? state.sprayDotScale : 1)));
      const count = Math.min(14, Math.max(6, Math.round(size * 1.2)));
      const radius = Math.max(2, size * 1.0 * scatter);
      if (!eraser) ctx.globalAlpha *= 0.35;
      for (let j = 0; j < count; j++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * radius;
        const px = point.x + Math.cos(a) * r;
        const py = point.y + Math.sin(a) * r;
        ctx.beginPath();
        ctx.arc(px, py, 1.1 * dotScale, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (brush === 'calligraphy') {
      const w = Math.max(2, size * 1.1);
      const h = Math.max(1, size * 0.35);
      const ang = Math.PI / 6;
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (brush === 'pencil') {
      const s2 = Math.max(1, size * 0.65);
      if (!eraser) ctx.globalAlpha *= 0.75;
      ctx.fillRect(point.x - s2 / 2, point.y - s2 / 2, s2, s2);
    } else {
      // round
      const edgeSoft = _clamp01(state.edgeSoftness || 0);
      if (edgeSoft > 0.001) {
        const stamp = getSoftCircleStamp(size / 2, eraser ? '#000000' : color, edgeSoft);
        ctx.drawImage(stamp.canvas, point.x - stamp.half, point.y - stamp.half);
      } else {
        ctx.beginPath();
        ctx.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  
  // Main drawing handlers
  drawCanvas.onmousedown = e => {
    if (!state.drawMode || e.button !== 0) return;
    e.preventDefault();
    
    // Eyedropper: pick color from video frame under cursor
    if (eyedropperActive) {
      const pt = getCanvasPoint(e);
      const hit = getFrameAtPoint(pt);
      if (hit && hit.cellEl) {
        const imgEl = hit.cellEl.querySelector('img');
        if (imgEl && imgEl.naturalWidth) {
          const u = hit.localX / Math.max(1, hit.width);
          const v = hit.localY / Math.max(1, hit.height);
          const tmpC = document.createElement('canvas');
          tmpC.width = 1; tmpC.height = 1;
          const tmpCtx2 = tmpC.getContext('2d', { willReadFrequently: true });
          try {
            tmpCtx2.drawImage(imgEl, Math.round(u * imgEl.naturalWidth), Math.round(v * imgEl.naturalHeight), 1, 1, 0, 0, 1, 1);
            const px = tmpCtx2.getImageData(0, 0, 1, 1).data;
            const hex = '#' + [px[0],px[1],px[2]].map(c => c.toString(16).padStart(2,'0')).join('');
            setDrawColor(hex);
          } catch (e) {}
        }
      }
      eyedropperActive = false;
      if (drawEyedropperBtn) drawEyedropperBtn.classList.remove('active');
      drawCanvas.style.cursor = state.drawEraser ? 'cell' : 'default';
      return;
    }

    // Save undo state (stable, target-only)
    beginUndoCaptureForDrawTarget();

    isDrawing = true;
    lastPoint = getCanvasPoint(e);
    lastPointerPos = lastPoint;
    holdStampLastFrame = -1;
    activeFrameStroke = null;

    // Frame target: draw into per-frame SHEET (continuous stroke gets sliced per frame)
    if (state.drawTarget === 'frame') {
      const hit = getFrameAtPoint(lastPoint);
      if (!hit) {
        isDrawing = false;
        lastPoint = null;
    holdStampLastFrame = -1;
        return;
      }
      holdStampLastFrame = hit.frameIdx;
      ensureFrameSheet();
      const u = Math.min(1, Math.max(0, hit.localX / Math.max(1, hit.width)));
      const v = Math.min(1, Math.max(0, hit.localY / Math.max(1, hit.height)));
      const sp = sheetPoint(hit.frameIdx, u, v);

      activeFrameStroke = { frameIdx: hit.frameIdx, lastSheet: sp };
      
      // Long Stroke mode: initialize
      if (state.drawLongStroke && state.isPlaying) {
        const _lsTrailFrames = getLongStrokeTrailFrames();

        if (_lsTrailFrames > 0) {
          startLongStrokeTrailSnapshot();

          longStrokePath = [{ u, v, brk: true, t: getLongStrokeTick() }]; // Store normalized coords + break + tick
          longStrokeLastFrame = hit.frameIdx;
          longStrokeBaseHit = hit;
          lastPointerPos = lastPoint; // allow stamping even if pointer doesn't move
          longStrokeEndTick = null;

          longStrokeFrameTicks.set(hit.frameIdx, getLongStrokeTick());
          longStrokeTouchedFrames.add(hit.frameIdx);
          longStrokeActiveFrames.add(hit.frameIdx);
          renderLongStrokeFrame(hit.frameIdx);
          requestComposite();
          return;
        }

        // Legacy long-stroke behavior
        longStrokePath = [{ u, v, brk: true, t: getLongStrokeTick() }];
        longStrokeLastFrame = hit.frameIdx;
        longStrokeBaseHit = hit;
        lastPointerPos = lastPoint;
        longStrokeEndTick = null;
      }

      captureUndoFrameTile(hit.frameIdx);
      if (state.drawOneFrame) {
        _drawOneTile(frameSheetCtx, hit.frameIdx, () =>
          drawDot(frameSheetCtx, sp, state.drawColor, getBrushSizeFrame(hit), state.drawEraser)
        );
      } else {
        drawDot(frameSheetCtx, sp, state.drawColor, getBrushSizeFrame(hit), state.drawEraser);
      }
      requestComposite();
      return;
    }

// Background / Template targets
    const target = getTargetCanvas();
    if (!target) return;
    drawDot(target.ctx, lastPoint, state.drawColor, getBrushSizeBgTpl(), state.drawEraser);
    requestComposite();
  };
  
  let _shiftStartPoint = null;
  
  function constrainToLine(start, current) {
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);
    // Snap to nearest axis: horizontal, vertical, or 45° diagonal
    if (absDx > absDy * 2) return { x: current.x, y: start.y }; // horizontal
    if (absDy > absDx * 2) return { x: start.x, y: current.y }; // vertical
    const diag = Math.max(absDx, absDy);
    return { x: start.x + diag * Math.sign(dx), y: start.y + diag * Math.sign(dy) }; // 45°
  }

  
  // Fast-stroke fix: when the pointer crosses multiple frame cells between events,
  // resample the segment and draw on each touched frame so strokes don't get "cut" near borders.
  function drawFrameStrokeResampled(p0, p1) {
    _ensureActiveUndoEntry();
    const rect = drawCanvas.getBoundingClientRect();
    const scaleX = drawCanvas.width / Math.max(1, rect.width);
    const scaleY = drawCanvas.height / Math.max(1, rect.height);
    const scale = Math.min(scaleX, scaleY);

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dist = Math.hypot(dx, dy) || 0;

    // Step in drawCanvas coords, roughly half a brush diameter in screen px.
    const step = Math.max(1.0, (state.drawSize || 10) * 0.35 * scale);
    const steps = Math.min(260, Math.max(1, Math.ceil(dist / step)));

    const touched = new Set();
    let prevHit = null;
    let prevSp = null;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = p0.x + dx * t;
      const py = p0.y + dy * t;

      const hit = getFrameAtPoint({ x: px, y: py });
      if (!hit) continue;

      ensureFrameSheet();
      const u = Math.min(1, Math.max(0, hit.localX / Math.max(1, hit.width)));
      const v = Math.min(1, Math.max(0, hit.localY / Math.max(1, hit.height)));
      const sp = sheetPoint(hit.frameIdx, u, v);
      const bs = getBrushSizeFrame(hit);

      if (!touched.has(hit.frameIdx)) {
        touched.add(hit.frameIdx);
        captureUndoFrameTile(hit.frameIdx);
      }

      if (!prevHit || hit.frameIdx !== prevHit.frameIdx) {
        drawDot(frameSheetCtx, sp, state.drawColor, bs, state.drawEraser);
      } else {
        drawSmoothLine(frameSheetCtx, prevSp, sp, state.drawColor, bs, state.drawEraser);
      }

      prevHit = hit;
      prevSp = sp;
    }

    if (prevHit && prevSp && activeFrameStroke) {
      activeFrameStroke.frameIdx = prevHit.frameIdx;
      holdStampLastFrame = prevHit.frameIdx;
      activeFrameStroke.lastSheet = prevSp;
    }
  }

drawCanvas.onmousemove = e => {
    if (!isDrawing || !lastPoint) return;
    let currentPoint = getCanvasPoint(e);
    lastPointerPos = currentPoint;
    // Shift constraint
    if (e.shiftKey) {
      if (!_shiftStartPoint) _shiftStartPoint = lastPoint;
      currentPoint = constrainToLine(_shiftStartPoint, currentPoint);
    } else {
      _shiftStartPoint = null;
    }
    // Eyedropper: handled on mousedown only
    if (eyedropperActive) return;

    if (skipNextSegment) {
      // We temporarily lost a stable hit (e.g., in a gap or outside). Restart segment cleanly.
      skipNextSegment = false;
      if (state.drawTarget === 'frame' && activeFrameStroke) {
        const hit0 = getFrameAtPoint(currentPoint);
        if (!hit0) return;
        ensureFrameSheet();
        const u0 = Math.min(1, Math.max(0, hit0.localX / Math.max(1, hit0.width)));
        const v0 = Math.min(1, Math.max(0, hit0.localY / Math.max(1, hit0.height)));
        const sp0 = sheetPoint(hit0.frameIdx, u0, v0);
        activeFrameStroke.frameIdx = hit0.frameIdx;
        holdStampLastFrame = hit0.frameIdx;
        activeFrameStroke.lastSheet = sp0;
        captureUndoFrameTile(hit0.frameIdx);
        if (state.drawOneFrame) {
          _drawOneTile(frameSheetCtx, hit0.frameIdx, () =>
            drawDot(frameSheetCtx, sp0, state.drawColor, getBrushSizeFrame(hit0), state.drawEraser)
          );
        } else {
          drawDot(frameSheetCtx, sp0, state.drawColor, getBrushSizeFrame(hit0), state.drawEraser);
        }
        lastPoint = currentPoint;
        requestComposite();
        return;
      } else {
        const t0 = getTargetCanvas();
        if (!t0) return;
        drawDot(t0.ctx, currentPoint, state.drawColor, getBrushSizeBgTpl(), state.drawEraser);
        lastPoint = currentPoint;
        requestComposite();
        return;
      }
    }

    // Frame sheet mode: draw a continuous stroke and auto-slice per frame tile
    if (state.drawTarget === 'frame' && activeFrameStroke) {
      const hit = getFrameAtPoint(currentPoint);
      if (!hit) { skipNextSegment = true; return; }
      ensureFrameSheet();

      const u = Math.min(1, Math.max(0, hit.localX / Math.max(1, hit.width)));
      const v = Math.min(1, Math.max(0, hit.localY / Math.max(1, hit.height)));
      const sp = sheetPoint(hit.frameIdx, u, v);
      const _lsFrameChanged = state.drawLongStroke && (hit.frameIdx !== longStrokeLastFrame);

      // Long Stroke mode: collect UV points, add a break marker when the frame changes
      if (state.drawLongStroke && state.isPlaying) {
        const _lsTick = state.isPlaying ? getLongStrokeTick() : advanceLongStrokeTick();
        longStrokePath.push({ u, v, brk: _lsFrameChanged, t: _lsTick });
        // Keep memory bounded
        if (longStrokePath.length > 5000) longStrokePath = longStrokePath.slice(-5000);

        // Trail mode: keep only last N frames visible (state.longStrokeFade)
        if (getLongStrokeTrailFrames() > 0) {
          if (!longStrokeTileSnapshots || longStrokeTileSnapshots.size === 0) startLongStrokeTrailSnapshot();
          longStrokeEndTick = null;
          longStrokeFrameTicks.set(hit.frameIdx, _lsTick);
          longStrokeTouchedFrames.add(hit.frameIdx);
          longStrokeActiveFrames.add(hit.frameIdx);
          renderLongStrokeFrame(hit.frameIdx);

          if (hit.frameIdx !== longStrokeLastFrame) longStrokeLastFrame = hit.frameIdx;

          activeFrameStroke.frameIdx = hit.frameIdx;
          holdStampLastFrame = hit.frameIdx;
          activeFrameStroke.lastSheet = sp;
          lastPoint = currentPoint;
          requestComposite();
          return;
        }
      }


      // When cursor moves to different cell: cut stroke.
      // In Long Stroke mode we also "stamp" the accumulated path onto the new frame,
      // so the stroke becomes a real trail across animated frames.
      const _frameChanged = (hit.frameIdx !== activeFrameStroke.frameIdx);

      if (_frameChanged) {
        if (state.drawOneFrame) {
          // One Frame mode: never draw across frame boundaries.
          // Just capture undo for new frame and place a clean dot there.
          captureUndoFrameTile(hit.frameIdx);
          activeFrameStroke.frameIdx = hit.frameIdx;
          holdStampLastFrame = hit.frameIdx;
          activeFrameStroke.lastSheet = sp;
          _drawOneTile(frameSheetCtx, hit.frameIdx, () =>
            drawDot(frameSheetCtx, sp, state.drawColor, getBrushSizeFrame(hit), state.drawEraser)
          );
          lastPoint = currentPoint;
          requestComposite();
          return;
        }
        if (state.drawLongStroke && state.isPlaying) {
          drawLongStrokeOnFrame(hit.frameIdx);
          longStrokeLastFrame = hit.frameIdx;
          activeFrameStroke.frameIdx = hit.frameIdx;
          holdStampLastFrame = hit.frameIdx;
          activeFrameStroke.lastSheet = sp;
        } else {
          // Fast movement can jump across cells between events. Resample the segment so the stroke reaches frame borders.
          drawFrameStrokeResampled(lastPoint, currentPoint);
        }
        lastPoint = currentPoint;
        requestComposite();
        return;
      }

      // Same frame: draw smooth line — in One Frame mode, clip to tile
      if (state.drawOneFrame) {
        _drawOneTile(frameSheetCtx, hit.frameIdx, () =>
          drawSmoothLine(frameSheetCtx, activeFrameStroke.lastSheet, sp, state.drawColor, getBrushSizeFrame(hit), state.drawEraser)
        );
      } else {
        drawSmoothLine(frameSheetCtx, activeFrameStroke.lastSheet, sp, state.drawColor, getBrushSizeFrame(hit), state.drawEraser);
      }
activeFrameStroke.lastSheet = sp;
      lastPoint = currentPoint;
      requestComposite();
      return;
    }

    const target = getTargetCanvas();
    if (!target) return;
    drawSmoothLine(target.ctx, lastPoint, currentPoint, state.drawColor, getBrushSizeBgTpl(), state.drawEraser);
    lastPoint = currentPoint;
    requestComposite();
  };
  
  // Long Stroke helpers (trail by frames)
  function getLongStrokeTick() {
    // When the grid animation is playing, follow the global tick.
    // When stopped, use a separate virtual tick so the long-stroke trail can still expire.
    if (state.isPlaying) return (typeof state.currentTick === 'number') ? state.currentTick : 0;
    return (typeof longStrokeVirtualTick === 'number') ? longStrokeVirtualTick : 0;
  }

  function advanceLongStrokeTick() {
    // Only advance when not playing (frame-change counter / decay steps)
    if (state.isPlaying) return getLongStrokeTick();
    longStrokeVirtualTick = ((typeof longStrokeVirtualTick === 'number') ? longStrokeVirtualTick : 0) + 1;
    return longStrokeVirtualTick;
  }

  function stopLongStrokeDecayTimer() {
    if (longStrokeDecayInterval) {
      clearInterval(longStrokeDecayInterval);
      longStrokeDecayInterval = null;
    }
  }

  function startLongStrokeDecayTimer() {
    stopLongStrokeDecayTimer();
    // If animation is running, updateAllCells() already advances state.currentTick, so no extra timer needed.
    if (state.isPlaying) return;
    const fps = Math.max(1, parseInt(state.animFps || 12, 10));
    longStrokeDecayInterval = setInterval(() => {
      if (!longStrokeTileSnapshots || longStrokeTileSnapshots.size === 0 || longStrokeEndTick == null || !state.drawLongStroke || longStrokePath.length === 0) {
        stopLongStrokeDecayTimer();
        return;
      }
      advanceLongStrokeTick();
      updateLongStrokeTrail();
      requestComposite();
      // stop when trail is fully gone
      if (!longStrokeTileSnapshots || longStrokeTileSnapshots.size === 0 || (longStrokeActiveFrames && longStrokeActiveFrames.size === 0)) {
        stopLongStrokeDecayTimer();
      }
    }, 1000 / fps);
  }
function getLongStrokeTrailFrames() {
    const n = parseInt(state.longStrokeFade || 0, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }

  function startLongStrokeTrailSnapshot() {
    // If a previous trail is still around, restore + reset first
    stopLongStrokeDecayTimer();
    cancelLongStrokeTrail(true);
    ensureFrameSheet();

    // Reset virtual tick baseline for stopped-animation mode
    longStrokeVirtualTick = (state.isPlaying && typeof state.currentTick === 'number') ? state.currentTick : 0;

    // Reset trail bookkeeping
    longStrokeTileSnapshots = new Map();
    longStrokeFrameTicks = new Map();
    longStrokeActiveFrames = new Set();
    longStrokeTouchedFrames = new Set();
    longStrokeEndTick = null;
  }

  function ensureLongStrokeTileSnapshot(frameIdx) {
    if (!longStrokeTileSnapshots) longStrokeTileSnapshots = new Map();
    if (longStrokeTileSnapshots.has(frameIdx)) return;

    const tw = state.frameSheetTileW || 1;
    const th = state.frameSheetTileH || 1;
    const cols = state.frameSheetCols || 1;
    const sx = (frameIdx % cols) * tw;
    const sy = Math.floor(frameIdx / cols) * th;

    const snap = document.createElement('canvas');
    snap.width = tw;
    snap.height = th;
    const sctx = snap.getContext('2d');
    if (sctx) {
      // Snapshot current tile pixels (base state before we draw trail on it)
      sctx.drawImage(frameSheetCanvas, sx, sy, tw, th, 0, 0, tw, th);
      longStrokeTileSnapshots.set(frameIdx, snap);
    }
  }

  function restoreLongStrokeTileFromSnapshot(frameIdx) {
    if (!longStrokeTileSnapshots) return;
    const snap = longStrokeTileSnapshots.get(frameIdx);
    if (!snap) return;

    const tw = state.frameSheetTileW || 1;
    const th = state.frameSheetTileH || 1;
    const cols = state.frameSheetCols || 1;
    const sx = (frameIdx % cols) * tw;
    const sy = Math.floor(frameIdx / cols) * th;

    frameSheetCtx.clearRect(sx, sy, tw, th);
    frameSheetCtx.drawImage(snap, 0, 0, tw, th, sx, sy, tw, th);
  }

  // Persist long-stroke pixels while drawing: keep the tile snapshot in sync with what we have drawn so far.
  // This makes long-stroke "commit as you draw", instead of only on mouse-up.
  function updateLongStrokeTileSnapshotFromSheet(frameIdx) {
    if (!longStrokeTileSnapshots) return;
    const snap = longStrokeTileSnapshots.get(frameIdx);
    if (!snap) return;

    const tw = state.frameSheetTileW || 1;
    const th = state.frameSheetTileH || 1;
    const cols = state.frameSheetCols || 1;
    const sx = (frameIdx % cols) * tw;
    const sy = Math.floor(frameIdx / cols) * th;

    const sctx = snap.getContext('2d');
    if (!sctx) return;
    sctx.clearRect(0, 0, tw, th);
    sctx.drawImage(frameSheetCanvas, sx, sy, tw, th, 0, 0, tw, th);
  }

function renderLongStrokeFrame(frameIdx) {
    const trailFrames = getLongStrokeTrailFrames();
    if (trailFrames <= 0) return;
    // Snapshot base tile on first touch to avoid full-sheet duplication
    ensureLongStrokeTileSnapshot(frameIdx);
    captureUndoFrameTile(frameIdx);
const nowTick = getLongStrokeTick();
    const endTick = (longStrokeEndTick == null) ? nowTick : longStrokeEndTick;
    const windowStart = nowTick - trailFrames + 1;
    
    const frameTick = longStrokeFrameTicks.get(frameIdx);
    if (frameTick == null) return;
    const maxT = Math.min(frameTick, endTick);
    
    // Always start by restoring the tile, then draw only the part of the stroke that is inside the active window.
    restoreLongStrokeTileFromSnapshot(frameIdx);
    if (maxT < windowStart) return;
    
    const bs = getBrushSizeFrame(longStrokeBaseHit || { width: 1, height: 1 });
    let prevSp = null;
    let started = false;
    
    for (let i = 0; i < longStrokePath.length; i++) {
      const pt = longStrokePath[i];
      const t = (pt && typeof pt.t === 'number') ? pt.t : 0;
      if (t < windowStart) { prevSp = null; started = false; continue; }
      if (t > maxT) break;
      
      const sp = sheetPoint(frameIdx, pt.u, pt.v);
      const brk = !!pt.brk || !started;
      
      if (brk || !prevSp) {
        captureUndoFrameTile(frameIdx);
        drawDot(frameSheetCtx, sp, state.drawColor, bs, state.drawEraser);
      } else {
        captureUndoFrameTile(frameIdx);
        drawSmoothLine(frameSheetCtx, prevSp, sp, state.drawColor, bs, state.drawEraser);
      }
      
      prevSp = sp;
      started = true;
    }

    // Persist immediately: once a segment is drawn on this frame, update the tile snapshot so it stays even without mouse-up.
    if (started) {
      try { updateLongStrokeTileSnapshotFromSheet(frameIdx); } catch (e) {}
    }
  }

  // Render long stroke for a frame at an explicit tick (used for baking on release)
  function renderLongStrokeFrameAtTick(frameIdx, nowTick) {
    const trailFrames = getLongStrokeTrailFrames();
    if (trailFrames <= 0) return;

    ensureLongStrokeTileSnapshot(frameIdx);
    captureUndoFrameTile(frameIdx);

    const windowStart = nowTick - trailFrames + 1;

    const frameTick = longStrokeFrameTicks.get(frameIdx);
    if (frameTick == null) return;
    const maxT = Math.min(frameTick, nowTick);

    restoreLongStrokeTileFromSnapshot(frameIdx);
    if (maxT < windowStart) return;

    const bs = getBrushSizeFrame(longStrokeBaseHit || { width: 1, height: 1 });
    let prevSp = null;
    let started = false;

    for (let i = 0; i < longStrokePath.length; i++) {
      const pt = longStrokePath[i];
      const t = (pt && typeof pt.t === 'number') ? pt.t : 0;
      if (t < windowStart) { prevSp = null; started = false; continue; }
      if (t > maxT) break;

      const sp = sheetPoint(frameIdx, pt.u, pt.v);
      const brk = !!pt.brk || !started;

      if (brk || !prevSp) {
        captureUndoFrameTile(frameIdx);
        drawDot(frameSheetCtx, sp, state.drawColor, bs, state.drawEraser);
      } else {
        captureUndoFrameTile(frameIdx);
        drawSmoothLine(frameSheetCtx, prevSp, sp, state.drawColor, bs, state.drawEraser);
      }

      prevSp = sp;
      started = true;
    }
  }
function stampLongStrokeFrame(frameIdx) {
    if (!state.drawLongStroke) return;

    const trailFrames = getLongStrokeTrailFrames();
    const tick = getLongStrokeTick();

    // Legacy mode (no trail cap): keep the old behavior (permanent stamping)
    if (trailFrames <= 0) {
      drawLongStrokeOnFrame(frameIdx);
      return;
    }

    if (!longStrokeTileSnapshots || longStrokeTileSnapshots.size === 0) startLongStrokeTrailSnapshot();
    ensureLongStrokeTileSnapshot(frameIdx);
    longStrokeFrameTicks.set(frameIdx, tick);
    longStrokeTouchedFrames.add(frameIdx);
    longStrokeActiveFrames.add(frameIdx);
    renderLongStrokeFrame(frameIdx);
  }

  function updateLongStrokeTrail() {
    if (!state.isPlaying) return;
    const trailFrames = getLongStrokeTrailFrames();
    if (trailFrames <= 0) return;
    if (!longStrokeTileSnapshots || longStrokeTileSnapshots.size === 0) return;
    if (!longStrokeFrameTicks || !longStrokeFrameTicks.size) return;

    const nowTick = getLongStrokeTick();
    const endTick = (longStrokeEndTick == null) ? nowTick : longStrokeEndTick;
    const windowStart = nowTick - trailFrames + 1;

    const nextActive = new Set();
    longStrokeFrameTicks.forEach((t, frameIdx) => {
      if (t >= windowStart && t <= endTick) nextActive.add(frameIdx);
    });

    // Restore tiles that just fell out of the window
    longStrokeActiveFrames.forEach(frameIdx => {
      if (!nextActive.has(frameIdx)) {
        restoreLongStrokeTileFromSnapshot(frameIdx);
        // Keep snapshots and ticks for final bake on release
      }
    });
    // Re-render active tiles (they may need to update when window shifts)
    nextActive.forEach(frameIdx => {
      renderLongStrokeFrame(frameIdx);
    });

    longStrokeActiveFrames = nextActive;

    // Cleanup when decay is done
    if (longStrokeEndTick != null && longStrokeActiveFrames.size === 0) {
      cancelLongStrokeTrail(false);
    }
  }

  function cancelLongStrokeTrail(restore) {
    stopLongStrokeDecayTimer();

    if (restore && longStrokeTileSnapshots) {
      const tw = state.frameSheetTileW || 1;
      const th = state.frameSheetTileH || 1;
      const cols = state.frameSheetCols || 1;

      const frames = new Set();
      if (longStrokeTouchedFrames && longStrokeTouchedFrames.size) {
        longStrokeTouchedFrames.forEach(f => frames.add(f));
      }
      if (longStrokeActiveFrames && longStrokeActiveFrames.size) {
        longStrokeActiveFrames.forEach(f => frames.add(f));
      }
      if (longStrokeFrameTicks && longStrokeFrameTicks.size) {
        longStrokeFrameTicks.forEach((_, f) => frames.add(f));
      }

      frames.forEach(frameIdx => {
        const snap = longStrokeTileSnapshots.get(frameIdx);
        if (!snap) return;
        const sx = (frameIdx % cols) * tw;
        const sy = Math.floor(frameIdx / cols) * th;
        frameSheetCtx.drawImage(snap, 0, 0, tw, th, sx, sy, tw, th);
      });
    }

    longStrokePath = [];
    longStrokeLastFrame = -1;
    longStrokeBaseHit = null;
    lastPointerPos = null;

    longStrokeTileSnapshots = new Map();
    longStrokeFrameTicks = new Map();
    longStrokeActiveFrames = new Set();
    longStrokeTouchedFrames = new Set();
    longStrokeEndTick = null;
  

  // Commit Long Stroke trail pixels into the sheet (bake on release)
  // This fixes stacking order: each new Long Stroke is drawn on top of previous strokes.
  // It also frees snapshot memory immediately and prevents "late" restores overwriting new strokes.
  function bakeLongStrokeTrailNow() {
    // Stop any decay loop (we are committing, not fading out)
    stopLongStrokeDecayTimer();

    // Ensure the last touched frame is rendered one last time
    try {
      const tf = getLongStrokeTrailFrames();
      if (tf > 0 && typeof longStrokeLastFrame === 'number' && longStrokeLastFrame >= 0) {
        renderLongStrokeFrame(longStrokeLastFrame);
      }
    } catch (e) {}

    // Keep current pixels on frameSheetCanvas and drop bookkeeping
    longStrokePath = [];
    longStrokeLastFrame = -1;
    longStrokeBaseHit = null;
    lastPointerPos = null;

    longStrokeTileSnapshots = new Map();
    longStrokeFrameTicks = new Map();
    longStrokeActiveFrames = new Set();
    longStrokeTouchedFrames = new Set();
    longStrokeEndTick = null;
  }
}

// Draw accumulated long stroke path on a specific frame (legacy mode only)


  // Draw accumulated long stroke path on a specific frame (legacy mode only)
  function drawLongStrokeOnFrame(frameIdx) {
    if (longStrokePath.length < 1) return;
    ensureFrameSheet();
    captureUndoFrameTile(frameIdx);

    const fadeFrames = state.longStrokeFade || 0;
    const pathLen = longStrokePath.length;

    // Calculate start index based on fade (points-based, legacy)
    let startIdx = 0;
    if (fadeFrames > 0 && pathLen > fadeFrames * 10) {
      startIdx = Math.max(0, pathLen - fadeFrames * 10);
    }

    const bs = getBrushSizeFrame(longStrokeBaseHit);

    let prevSp = null;
    for (let i = startIdx; i < longStrokePath.length; i++) {
      const pt = longStrokePath[i];
      const sp = sheetPoint(frameIdx, pt.u, pt.v);

      const brk = !!pt.brk || (i === startIdx);
      if (brk || !prevSp) {
        captureUndoFrameTile(frameIdx);
        drawDot(frameSheetCtx, sp, state.drawColor, bs, state.drawEraser);
      } else {
        captureUndoFrameTile(frameIdx);
        drawSmoothLine(frameSheetCtx, prevSp, sp, state.drawColor, bs, state.drawEraser);
      }
      prevSp = sp;
    }
  }


  // Bake Long Stroke trail into FRM sheet on release (fix stacking order)
  // Defined here to ensure it is in the same scope as endStroke().
  var bakeLongStrokeTrailNow = function() {
    // Commit Long Stroke trail into FRM sheet on release
    stopLongStrokeDecayTimer();

    const tf = getLongStrokeTrailFrames();
    if (tf <= 0) {
      longStrokePath = [];
      longStrokeLastFrame = -1;
      longStrokeBaseHit = null;
      lastPointerPos = null;
      longStrokeTileSnapshots = new Map();
      longStrokeFrameTicks = new Map();
      longStrokeActiveFrames = new Set();
      longStrokeTouchedFrames = new Set();
      longStrokeEndTick = null;
      requestComposite();
      return;
    }

    // Bake every frame we have tick data for
    try {
      if (longStrokeFrameTicks && longStrokeFrameTicks.size) {
        const frames = [];
        longStrokeFrameTicks.forEach((t, frameIdx) => frames.push([frameIdx, t]));
        frames.sort((a, b) => (a[0] | 0) - (b[0] | 0));

        for (let i = 0; i < frames.length; i++) {
          const frameIdx = frames[i][0] | 0;
          const t = frames[i][1] | 0;
          renderLongStrokeFrameAtTick(frameIdx, t);
        }
      }
    } catch (e) {}

    // Drop bookkeeping so nothing can restore over committed pixels later
    longStrokePath = [];
    longStrokeLastFrame = -1;
    longStrokeBaseHit = null;
    lastPointerPos = null;

    longStrokeTileSnapshots = new Map();
    longStrokeFrameTicks = new Map();
    longStrokeActiveFrames = new Set();
    longStrokeTouchedFrames = new Set();
    longStrokeEndTick = null;

    requestComposite();
  };

  function endStroke() {
    if (!isDrawing) return;
    isDrawing = false;
    skipNextSegment = false;
    lastPoint = null;

    // Long Stroke finalize (trail mode is committed on release)
    if (state.drawLongStroke && getLongStrokeTrailFrames() > 0 && longStrokeTileSnapshots && longStrokeTileSnapshots.size) {
      bakeLongStrokeTrailNow();
    } else {
      longStrokePath = [];
      longStrokeLastFrame = -1;
      longStrokeBaseHit = null;
      lastPointerPos = null;
      longStrokeTileSnapshots = new Map();
      longStrokeFrameTicks = new Map();
      longStrokeActiveFrames = new Set();
      longStrokeTouchedFrames = new Set();
      longStrokeEndTick = null;
    }

    if (state.drawTarget === 'frame' && activeFrameStroke) {
      // final save already done during drawing
      activeFrameStroke = null;
    } else {
      saveCurrentLayer();
    }
  }

  drawCanvas.onmouseup = endStroke;
  window.addEventListener('mouseup', endStroke, true);
  window.addEventListener('blur', endStroke);

  // Touch end/cancel should also finalize stroke
  drawCanvas.ontouchend = e => {
    // When a multi-touch gesture ends, require a full release before drawing again.
    if (!e.touches || e.touches.length === 0) suppressDrawTouchUntilRelease = false;
    if (state.drawMode) e.preventDefault();
    endStroke();
  };
  drawCanvas.ontouchcancel = e => {
    if (!e.touches || e.touches.length === 0) suppressDrawTouchUntilRelease = false;
    if (state.drawMode) e.preventDefault();
    endStroke();
  };

  // Prevent iOS long-press context menu from interrupting drawing
  drawCanvas.oncontextmenu = e => {
    if (state.drawMode) e.preventDefault();
  };
  
  drawCanvas.onmouseleave = () => {
    // Do NOT end stroke here. On iPad and during fast moves, leaving the canvas (or hitting a gap)
    // can happen frequently. We just restart the segment when we return.
    if (isDrawing) {
      skipNextSegment = true;
    }
  };
  
  // Touch support
  drawCanvas.ontouchstart = e => {
    if (!state.drawMode) return;
    if (brushLocked) return;
    // If Pointer Events already handling this touch, skip to avoid double-fire
    if (_pointerEventsActive) { e.preventDefault(); return; }

    // Multi-touch gestures (2-finger zoom / 3-finger brush size) must NOT draw.
    if (!e.touches || e.touches.length !== 1) {
      suppressDrawTouchUntilRelease = true;
      if (isDrawing) endStroke();
      return; // let canvasArea gesture handlers do their job
    }
    if (suppressDrawTouchUntilRelease) return;

        // Eyedropper: pick color on tap (mirrors mousedown logic)
    if (eyedropperActive) {
      const pt = getCanvasPoint(e);
      const hit = getFrameAtPoint(pt);
      if (hit && hit.cellEl) {
        const imgEl = hit.cellEl.querySelector('img');
        if (imgEl && imgEl.naturalWidth) {
          const u = hit.localX / Math.max(1, hit.width);
          const v = hit.localY / Math.max(1, hit.height);
          const tmpC = document.createElement('canvas');
          tmpC.width = 1; tmpC.height = 1;
          const tmpCtx2 = tmpC.getContext('2d', { willReadFrequently: true });
          try {
            tmpCtx2.drawImage(imgEl, Math.round(u * imgEl.naturalWidth), Math.round(v * imgEl.naturalHeight), 1, 1, 0, 0, 1, 1);
            const px = tmpCtx2.getImageData(0, 0, 1, 1).data;
            const hex = '#' + [px[0],px[1],px[2]].map(c => c.toString(16).padStart(2,'0')).join('');
            setDrawColor(hex);
          } catch (ex) {}
        }
      }
      eyedropperActive = false;
      if (drawEyedropperBtn) drawEyedropperBtn.classList.remove('active');
      drawCanvas.style.cursor = state.drawEraser ? 'cell' : 'default';
      return;
    }

    e.preventDefault();
    // Save undo state (stable, target-only)
    beginUndoCaptureForDrawTarget();

    isDrawing = true;
    lastPoint = getCanvasPoint(e);
    lastPointerPos = { x: lastPoint.x, y: lastPoint.y };
    holdStampLastFrame = -1;
    activeFrameStroke = null;

    // Frame target: use frameSheet like mouse handler
    if (state.drawTarget === 'frame') {
      const hit = getFrameAtPoint(lastPoint);
      if (!hit) {
        isDrawing = false;
        lastPoint = null;
        
        return;
      }
      holdStampLastFrame = hit.frameIdx;
      ensureFrameSheet();
      const u = Math.min(1, Math.max(0, hit.localX / Math.max(1, hit.width)));
      const v = Math.min(1, Math.max(0, hit.localY / Math.max(1, hit.height)));
      const sp = sheetPoint(hit.frameIdx, u, v);
      
      activeFrameStroke = { frameIdx: hit.frameIdx, lastSheet: sp };
      
      if (state.drawLongStroke && state.isPlaying) {
        const _lsTrailFrames = getLongStrokeTrailFrames();

        if (_lsTrailFrames > 0) {
          startLongStrokeTrailSnapshot();

          longStrokePath = [{ u, v, brk: true, t: getLongStrokeTick() }];
          longStrokeLastFrame = hit.frameIdx;
          longStrokeBaseHit = hit;
          lastPointerPos = { x: lastPoint.x, y: lastPoint.y };
          longStrokeEndTick = null;

          longStrokeFrameTicks.set(hit.frameIdx, getLongStrokeTick());
          longStrokeTouchedFrames.add(hit.frameIdx);
          longStrokeActiveFrames.add(hit.frameIdx);
          renderLongStrokeFrame(hit.frameIdx);
          requestComposite();
          
          return;
        }

        // Legacy long-stroke behavior
        longStrokePath = [{ u, v, brk: true, t: getLongStrokeTick() }];
        longStrokeLastFrame = hit.frameIdx;
        longStrokeBaseHit = hit;
        lastPointerPos = { x: lastPoint.x, y: lastPoint.y };
        longStrokeEndTick = null;
      }
      
      captureUndoFrameTile(hit.frameIdx);
      drawDot(frameSheetCtx, sp, state.drawColor, getBrushSizeFrame(hit), state.drawEraser);
      requestComposite();
      
      return;
    }

    const target = getTargetCanvas();
    if (!target) return;
    drawDot(target.ctx, lastPoint, state.drawColor, getBrushSizeBgTpl(), state.drawEraser);
    requestComposite();
  };
  
  drawCanvas.ontouchmove = e => {
    if (!state.drawMode) return;
    if (brushLocked) return;
    if (_pointerEventsActive) { e.preventDefault(); return; }

    // If this becomes a multi-touch gesture mid-stroke, stop drawing immediately.
    if (suppressDrawTouchUntilRelease || !e.touches || e.touches.length !== 1) {
      if (isDrawing) endStroke();
      return;
    }
    if (!isDrawing || !lastPoint) return;

    e.preventDefault();
    const currentPoint = getCanvasPoint(e);
    lastPointerPos = currentPoint;

    if (skipNextSegment) {
      // We temporarily lost a stable hit (e.g., in a gap or outside). Restart segment cleanly.
      skipNextSegment = false;
      if (state.drawTarget === 'frame' && activeFrameStroke) {
        const hit0 = getFrameAtPoint(currentPoint);
        if (!hit0) return;
        ensureFrameSheet();
        const u0 = Math.min(1, Math.max(0, hit0.localX / Math.max(1, hit0.width)));
        const v0 = Math.min(1, Math.max(0, hit0.localY / Math.max(1, hit0.height)));
        const sp0 = sheetPoint(hit0.frameIdx, u0, v0);
        activeFrameStroke.frameIdx = hit0.frameIdx;
        holdStampLastFrame = hit0.frameIdx;
        activeFrameStroke.lastSheet = sp0;
        captureUndoFrameTile(hit0.frameIdx);
        if (state.drawOneFrame) {
          _drawOneTile(frameSheetCtx, hit0.frameIdx, () =>
            drawDot(frameSheetCtx, sp0, state.drawColor, getBrushSizeFrame(hit0), state.drawEraser)
          );
        } else {
          drawDot(frameSheetCtx, sp0, state.drawColor, getBrushSizeFrame(hit0), state.drawEraser);
        }
        lastPoint = currentPoint;
        requestComposite();
        return;
      } else {
        const t0 = getTargetCanvas();
        if (!t0) return;
        drawDot(t0.ctx, currentPoint, state.drawColor, getBrushSizeBgTpl(), state.drawEraser);
        lastPoint = currentPoint;
        requestComposite();
        return;
      }
    }

    // Frame sheet mode (same as mouse)
    if (state.drawTarget === 'frame' && activeFrameStroke) {
      const hit = getFrameAtPoint(currentPoint);
      if (!hit) { skipNextSegment = true; return; }
      ensureFrameSheet();
      
      const u = Math.min(1, Math.max(0, hit.localX / Math.max(1, hit.width)));
      const v = Math.min(1, Math.max(0, hit.localY / Math.max(1, hit.height)));
      const sp = sheetPoint(hit.frameIdx, u, v);
      const _lsFrameChanged = state.drawLongStroke && (hit.frameIdx !== longStrokeLastFrame);

      // Long Stroke mode: collect UV points, add a break marker when the frame changes
      if (state.drawLongStroke && state.isPlaying) {
        const _lsTick = state.isPlaying ? getLongStrokeTick() : advanceLongStrokeTick();
        longStrokePath.push({ u, v, brk: _lsFrameChanged, t: _lsTick });
        // Keep memory bounded
        if (longStrokePath.length > 5000) longStrokePath = longStrokePath.slice(-5000);

        // Trail mode: keep only last N frames visible (state.longStrokeFade)
        if (getLongStrokeTrailFrames() > 0) {
          if (!longStrokeTileSnapshots || longStrokeTileSnapshots.size === 0) startLongStrokeTrailSnapshot();
          longStrokeEndTick = null;
          longStrokeFrameTicks.set(hit.frameIdx, _lsTick);
          longStrokeTouchedFrames.add(hit.frameIdx);
          longStrokeActiveFrames.add(hit.frameIdx);
          renderLongStrokeFrame(hit.frameIdx);

          if (hit.frameIdx !== longStrokeLastFrame) longStrokeLastFrame = hit.frameIdx;

          activeFrameStroke.frameIdx = hit.frameIdx;
          holdStampLastFrame = hit.frameIdx;
          activeFrameStroke.lastSheet = sp;
          lastPoint = currentPoint;
          requestComposite();
          return;
        }
      }


      // When cursor moves to different cell: cut stroke.
      // In Long Stroke mode we also "stamp" the accumulated path onto the new frame,
      // so the stroke becomes a real trail across animated frames.
      const _frameChanged = (hit.frameIdx !== activeFrameStroke.frameIdx);

      if (_frameChanged) {
        if (state.drawLongStroke && state.isPlaying) {
          drawLongStrokeOnFrame(hit.frameIdx);
          longStrokeLastFrame = hit.frameIdx;
        } else {
          captureUndoFrameTile(hit.frameIdx);
          drawDot(frameSheetCtx, sp, state.drawColor, getBrushSizeFrame(hit), state.drawEraser);
        }
        activeFrameStroke.frameIdx = hit.frameIdx;
        holdStampLastFrame = hit.frameIdx;
        activeFrameStroke.lastSheet = sp;
        lastPoint = currentPoint;
        requestComposite();
        return;
      }

      drawSmoothLine(frameSheetCtx, activeFrameStroke.lastSheet, sp, state.drawColor, getBrushSizeFrame(hit), state.drawEraser);
      activeFrameStroke.lastSheet = sp;
      lastPoint = currentPoint;
      requestComposite();
      return;
    }

    const target = getTargetCanvas();
    if (!target) return;
    drawSmoothLine(target.ctx, lastPoint, currentPoint, state.drawColor, getBrushSizeBgTpl(), state.drawEraser);
    lastPoint = currentPoint;
    requestComposite();
  };
 
  // ── Pointer Events (touch/pen on Windows/iPad, with coalesced events for smooth drawing) ──
  // Mouse is handled by existing onmousedown/move/up — we skip it here to avoid double-fire.
  drawCanvas.addEventListener('pointerdown', e => {
    if (!state.drawMode) return;
    if (brushLocked) return;
    if (e.pointerType === 'mouse') return; // mouse already handled by onmousedown
    if (_activePointerId !== null) return; // already tracking a pointer

    // Multi-touch: if a second pointer comes in, cancel drawing
    if (e.isPrimary === false) {
      suppressDrawTouchUntilRelease = true;
      if (isDrawing) endStroke();
      return;
    }

    e.preventDefault();
    _activePointerId = e.pointerId;
    _pointerEventsActive = true;
    drawCanvas.setPointerCapture(e.pointerId);

    // Mirror ontouchstart logic using pointer coords
    const fakeE = { clientX: e.clientX, clientY: e.clientY, touches: null };
    const pt = getCanvasPointXY(e.clientX, e.clientY);

    // Eyedropper
    if (eyedropperActive) {
      const hit = getFrameAtPoint(pt);
      if (hit && hit.cellEl) {
        const imgEl = hit.cellEl.querySelector('img');
        if (imgEl && imgEl.naturalWidth) {
          const u = hit.localX / Math.max(1, hit.width);
          const v = hit.localY / Math.max(1, hit.height);
          const tmpC = document.createElement('canvas');
          tmpC.width = 1; tmpC.height = 1;
          const tmpCtx2 = tmpC.getContext('2d', { willReadFrequently: true });
          try {
            tmpCtx2.drawImage(imgEl, Math.round(u * imgEl.naturalWidth), Math.round(v * imgEl.naturalHeight), 1, 1, 0, 0, 1, 1);
            const px = tmpCtx2.getImageData(0, 0, 1, 1).data;
            const hex = '#' + [px[0],px[1],px[2]].map(c => c.toString(16).padStart(2,'0')).join('');
            setDrawColor(hex);
          } catch (ex) {}
        }
      }
      eyedropperActive = false;
      if (drawEyedropperBtn) drawEyedropperBtn.classList.remove('active');
      drawCanvas.style.cursor = state.drawEraser ? 'cell' : 'default';
      _activePointerId = null; _pointerEventsActive = false;
      return;
    }

    beginUndoCaptureForDrawTarget();
    isDrawing = true;
    lastPoint = pt;
    lastPointerPos = { x: pt.x, y: pt.y };
    holdStampLastFrame = -1;
    activeFrameStroke = null;

    if (state.drawTarget === 'frame') {
      const hit = getFrameAtPoint(pt);
      if (!hit) { isDrawing = false; lastPoint = null; _activePointerId = null; _pointerEventsActive = false; return; }
      holdStampLastFrame = hit.frameIdx;
      ensureFrameSheet();
      const u = Math.min(1, Math.max(0, hit.localX / Math.max(1, hit.width)));
      const v = Math.min(1, Math.max(0, hit.localY / Math.max(1, hit.height)));
      const sp = sheetPoint(hit.frameIdx, u, v);
      activeFrameStroke = { frameIdx: hit.frameIdx, lastSheet: sp };
      captureUndoFrameTile(hit.frameIdx);
      drawDot(frameSheetCtx, sp, state.drawColor, getBrushSizeFrame(hit), state.drawEraser);
      requestComposite();
      return;
    }
    const target = getTargetCanvas();
    if (!target) return;
    drawDot(target.ctx, pt, state.drawColor, getBrushSizeBgTpl(), state.drawEraser);
    requestComposite();
  }, { passive: false });

  drawCanvas.addEventListener('pointermove', e => {
    if (!state.drawMode) return;
    if (brushLocked) return;
    if (e.pointerType === 'mouse') return;
    if (_activePointerId !== e.pointerId) return;
    if (!isDrawing || !lastPoint) return;

    e.preventDefault();

    // getCoalescedEvents gives all intermediate points — key for smooth lines
    const coalesced = (e.getCoalescedEvents && e.getCoalescedEvents()) || [e];

    for (const ce of coalesced) {
      const currentPoint = getCanvasPointXY(ce.clientX, ce.clientY);
      lastPointerPos = currentPoint;

      if (skipNextSegment) {
        skipNextSegment = false;
        if (state.drawTarget === 'frame' && activeFrameStroke) {
          const hit0 = getFrameAtPoint(currentPoint);
          if (!hit0) continue;
          ensureFrameSheet();
          const u0 = Math.min(1, Math.max(0, hit0.localX / Math.max(1, hit0.width)));
          const v0 = Math.min(1, Math.max(0, hit0.localY / Math.max(1, hit0.height)));
          const sp0 = sheetPoint(hit0.frameIdx, u0, v0);
          activeFrameStroke.frameIdx = hit0.frameIdx;
          holdStampLastFrame = hit0.frameIdx;
          activeFrameStroke.lastSheet = sp0;
          captureUndoFrameTile(hit0.frameIdx);
          drawDot(frameSheetCtx, sp0, state.drawColor, getBrushSizeFrame(hit0), state.drawEraser);
          lastPoint = currentPoint;
          requestComposite();
          continue;
        } else {
          const t0 = getTargetCanvas();
          if (!t0) continue;
          drawDot(t0.ctx, currentPoint, state.drawColor, getBrushSizeBgTpl(), state.drawEraser);
          lastPoint = currentPoint;
          requestComposite();
          continue;
        }
      }

      if (state.drawTarget === 'frame' && activeFrameStroke) {
        const hit = getFrameAtPoint(currentPoint);
        if (!hit) { skipNextSegment = true; continue; }
        ensureFrameSheet();
        const u = Math.min(1, Math.max(0, hit.localX / Math.max(1, hit.width)));
        const v = Math.min(1, Math.max(0, hit.localY / Math.max(1, hit.height)));
        const sp = sheetPoint(hit.frameIdx, u, v);
        const _frameChanged = (hit.frameIdx !== activeFrameStroke.frameIdx);
        if (_frameChanged) {
          captureUndoFrameTile(hit.frameIdx);
          drawDot(frameSheetCtx, sp, state.drawColor, getBrushSizeFrame(hit), state.drawEraser);
          activeFrameStroke.frameIdx = hit.frameIdx;
          holdStampLastFrame = hit.frameIdx;
          activeFrameStroke.lastSheet = sp;
          lastPoint = currentPoint;
          requestComposite();
          continue;
        }
        drawSmoothLine(frameSheetCtx, activeFrameStroke.lastSheet, sp, state.drawColor, getBrushSizeFrame(hit), state.drawEraser);
        activeFrameStroke.lastSheet = sp;
        lastPoint = currentPoint;
        requestComposite();
        continue;
      }

      const target = getTargetCanvas();
      if (!target) continue;
      drawSmoothLine(target.ctx, lastPoint, currentPoint, state.drawColor, getBrushSizeBgTpl(), state.drawEraser);
      lastPoint = currentPoint;
      requestComposite();
    }
  }, { passive: false });

  const _pointerEndHandler = e => {
    if (e.pointerType === 'mouse') return;
    if (_activePointerId !== e.pointerId) return;
    _activePointerId = null;
    _pointerEventsActive = false;
    if (isDrawing) endStroke();
  };
  drawCanvas.addEventListener('pointerup',     _pointerEndHandler);
  drawCanvas.addEventListener('pointercancel', _pointerEndHandler);
  drawCanvas.addEventListener('pointerleave',  _pointerEndHandler);

 
  
  function toggleOnionSkin() {
    state.drawOnion = !state.drawOnion;
    drawOnionBtn.classList.toggle('active', state.drawOnion);
    framesGrid.classList.toggle('onion-off', !state.drawOnion);
    if (state.frames.length) updateAllCells();
  }
  
  function setDrawColor(color) {
    const next = (color || '#ffffff');
    const cur = state.drawColor;

    // Track previous color for quick swapping (KeyX)
    if (!state._skipPrevCapture && cur && cur.toLowerCase() !== next.toLowerCase()) {
      state.prevDrawColor = cur;
    }
    state._skipPrevCapture = false;

    state.drawColor = next;
    drawColorInput.value = next;

    drawColors.forEach(c => c.classList.remove('active'));
    drawColors.forEach(c => {
      if (c.dataset.color && c.dataset.color.toLowerCase() === next.toLowerCase()) {
        c.classList.add('active');
      }
    });

    const norm = next.toLowerCase();
    if (!state._skipRecentCapture) {
      state.recentColors = state.recentColors.filter(c => (c || '').toLowerCase() !== norm);
      state.recentColors.unshift(norm);
      if (state.recentColors.length > 5) state.recentColors.length = 5;
      try { localStorage.setItem('fg_recentColors', JSON.stringify(state.recentColors)); } catch (e) {}
      renderRecentColors();
    } else {
      state._skipRecentCapture = false;
    }
  }

  function hardClearAllDrawingsAndUndo() {
    // stop any active long-stroke trail bookkeeping
    try { if (typeof flushLongFrameTrailNow === 'function') flushLongFrameTrailNow(true); } catch (e) {}
    try { if (typeof cancelLongFrameTrail === 'function') cancelLongFrameTrail(true); } catch (e) {}

    // Clear raster layers
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    bgCtxSingle.clearRect(0, 0, bgCanvasSingle.width, bgCanvasSingle.height);
    tplCtx.clearRect(0, 0, tplCanvas.width, tplCanvas.height);
    frameSheetCtx.clearRect(0, 0, frameSheetCanvas.width, frameSheetCanvas.height);
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

    // Reset stored ImageData / caches
    state.bgDrawing = null;
    state.bgDrawingSingle = null;
    state.templateDrawing = null;
    state.frameDrawings = {};
    state.frameSheetDrawing = null;

    // Reset sheet layout so it will be rebuilt with the new tile dims
    state.frameSheetCols = 0;
    state.frameSheetRows = 0;
    state.frameSheetTileW = 0;
    state.frameSheetTileH = 0;

    // Clear undo stack
    if (Array.isArray(drawUndoStack)) drawUndoStack.length = 0;

    // Ensure UI stays consistent
    requestComposite();
    updateInfoPanel();
  }


  // Load recent colors from localStorage
  try {
    const saved = JSON.parse(localStorage.getItem('fg_recentColors') || '[]');
    if (Array.isArray(saved)) state.recentColors = saved.slice(0, 5);
  } catch (e) {}

  function renderRecentColors() {
    const row = document.getElementById('recentColorsRow');
    if (!row) return;
    row.innerHTML = '';
    state.recentColors.forEach(c => {
      const swatch = document.createElement('div');
      swatch.style.cssText = `background:${c};width:20px;height:20px;border-radius:50%;cursor:pointer;border:2px solid rgba(255,255,255,0.15);flex-shrink:0;touch-action:manipulation;`;
      // ontouchstart: immediate pick, no 300ms delay, no double-fire with onclick
      swatch.ontouchstart = (e) => { e.preventDefault(); e.stopPropagation(); setDrawColor(c); };
      swatch.onclick = () => setDrawColor(c);
      row.appendChild(swatch);
    });
  }

  // Eyedropper: pick color from canvas
  const drawEyedropperBtn = document.getElementById('drawEyedropper');
  let eyedropperActive = false;
  if (drawEyedropperBtn) {
    drawEyedropperBtn.onclick = () => {
      eyedropperActive = !eyedropperActive;
      drawEyedropperBtn.classList.toggle('active', eyedropperActive);
      drawCanvas.style.cursor = eyedropperActive ? 'crosshair' : (state.drawEraser ? 'cell' : 'default');
    };
  }

  // Video palette: extract dominant colors from video frames using k-means
  function generateVideoPalette() {
    if (!state.frames.length) return;
    const sampleCount = Math.min(8, state.frames.length);
    const step = Math.max(1, Math.floor(state.frames.length / sampleCount));
    const pixels = [];
    const sCanvas = document.createElement('canvas');
    const sCtx = sCanvas.getContext('2d', { willReadFrequently: true });
    sCanvas.width = 32; sCanvas.height = 32; // small sample

    for (let i = 0; i < state.frames.length; i += step) {
      const img = new Image();
      img.src = state.frames[i].dataUrl;
      try {
        sCtx.drawImage(img, 0, 0, 32, 32);
        const data = sCtx.getImageData(0, 0, 32, 32).data;
        for (let p = 0; p < data.length; p += 16) { // sample every 4th pixel
          pixels.push([data[p], data[p+1], data[p+2]]);
        }
      } catch (e) {}
    }
    if (!pixels.length) return;

    // Simple k-means clustering
    const k = 10;
    let centers = [];
    for (let i = 0; i < k; i++) centers.push(pixels[Math.floor(Math.random() * pixels.length)].slice());
    
    for (let iter = 0; iter < 15; iter++) {
      const clusters = Array.from({length: k}, () => []);
      pixels.forEach(px => {
        let minD = Infinity, best = 0;
        centers.forEach((c, ci) => {
          const d = (px[0]-c[0])**2 + (px[1]-c[1])**2 + (px[2]-c[2])**2;
          if (d < minD) { minD = d; best = ci; }
        });
        clusters[best].push(px);
      });
      centers = clusters.map((cl, ci) => {
        if (!cl.length) return centers[ci];
        const avg = [0,0,0];
        cl.forEach(p => { avg[0]+=p[0]; avg[1]+=p[1]; avg[2]+=p[2]; });
        return avg.map(v => Math.round(v / cl.length));
      });
    }

    // Sort by luminance, filter out near-duplicates
    const colors = centers
      .map(c => ({ r: c[0], g: c[1], b: c[2], lum: c[0]*0.299 + c[1]*0.587 + c[2]*0.114 }))
      .sort((a, b) => a.lum - b.lum)
      .filter((c, i, arr) => {
        if (i === 0) return true;
        const prev = arr[i-1];
        return Math.abs(c.lum - prev.lum) > 15 || Math.abs(c.r - prev.r) + Math.abs(c.g - prev.g) + Math.abs(c.b - prev.b) > 40;
      });

    state.videoPalette = colors.slice(0, 5).map(c => `#${[c.r,c.g,c.b].map(v => v.toString(16).padStart(2,'0')).join('')}`);
    renderVideoPalette();
  }

  
  function generateVideoPaletteFromCurrentFrame() {
    if (!state.frames.length) return;

    const n = state.frames.length | 0;

    function getPaletteSourceFrameIdx() {
      try {
        // Prefer the frame you are actively drawing on
        if (state.drawMode && state.drawTarget === 'frame') {
          if (typeof holdStampLastFrame === 'number' && holdStampLastFrame >= 0) return holdStampLastFrame % n;
          if (activeFrameStroke && typeof activeFrameStroke.frameIdx === 'number' && activeFrameStroke.frameIdx >= 0) return activeFrameStroke.frameIdx % n;
        }
      } catch (e) {}
      const t = Number.isFinite(state.currentTick) ? (state.currentTick | 0) : 0;
      return ((t % n) + n) % n;
    }

    const idx = getPaletteSourceFrameIdx();
    const src = state.frames[idx] && state.frames[idx].dataUrl;
    if (!src) return;

    const img = new Image();
    img.src = src;

    const sCanvas = document.createElement('canvas');
    const sCtx = sCanvas.getContext('2d', { willReadFrequently: true });
    sCanvas.width = 64; sCanvas.height = 64;

    function rgbToHsv(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const d = max - min;
      let h = 0;
      if (d !== 0) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h /= 6;
        if (h < 0) h += 1;
      }
      const s = max === 0 ? 0 : d / max;
      const v = max;
      return { h, s, v };
    }

    const run = () => {
      try {
        sCtx.clearRect(0, 0, sCanvas.width, sCanvas.height);
        sCtx.drawImage(img, 0, 0, sCanvas.width, sCanvas.height);
        const data = sCtx.getImageData(0, 0, sCanvas.width, sCanvas.height).data;

        // Quantize (5 bits/channel) + count
        const counts = new Map();
        const step = 4; // bytes per pixel, 4 = every pixel
        for (let i = 0; i < data.length; i += step) {
          const r = data[i] >> 3;
          const g = data[i + 1] >> 3;
          const b = data[i + 2] >> 3;
          const key = (r << 10) | (g << 5) | b;
          counts.set(key, (counts.get(key) || 0) + 1);
        }

        const bins = [];
        for (const [key, cnt] of counts.entries()) {
          const r5 = (key >> 10) & 31;
          const g5 = (key >> 5) & 31;
          const b5 = key & 31;
          const rgb = { r: (r5 << 3) + 4, g: (g5 << 3) + 4, b: (b5 << 3) + 4 };
          const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
          bins.push({
            key,
            cnt,
            r: rgb.r, g: rgb.g, b: rgb.b,
            h: hsv.h,
            s: hsv.s,
            v: hsv.v,
            vivid: hsv.s * hsv.v,
          });
        }

        // Sort pools
        const byFreq = bins.slice().sort((a, b) => b.cnt - a.cnt);
        const byVivid = bins.slice().sort((a, b) => (b.vivid - a.vivid) || (b.v - a.v) || (b.cnt - a.cnt));
        const byBright = bins.slice().sort((a, b) => (b.v - a.v) || (b.s - a.s) || (b.cnt - a.cnt));

        function hsvDist(a, b) {
          const dh0 = Math.abs((a.h || 0) - (b.h || 0));
          const dh = Math.min(dh0, 1 - dh0) * 2; // 0..1
          const ds = Math.abs((a.s || 0) - (b.s || 0));
          const dv = Math.abs((a.v || 0) - (b.v || 0));
          return (dh * 0.62) + (ds * 0.25) + (dv * 0.13);
        }

        function rgbDist(a, b) {
          return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
        }

        function isDistinct(c, chosen) {
          // Two guards: coarse RGB and perceptual-ish HSV
          const MIN_RGB = 52;
          const MIN_HSV = 0.22;
          for (const p of chosen) {
            if (c.key === p.key) return false;
            if (rgbDist(c, p) < MIN_RGB) return false;
            if (hsvDist(c, p) < MIN_HSV) return false;
          }
          return true;
        }

        // Build candidate pool from multiple rankings to avoid "all the same"
        const cand = [];
        const seen = new Set();
        const addCand = (arr, limit) => {
          let n = 0;
          for (const c of arr) {
            if (n >= limit) break;
            if (!c || c.cnt < 1) continue;
            if (seen.has(c.key)) continue;
            seen.add(c.key);
            cand.push(c);
            n++;
          }
        };
        addCand(byFreq, 140);
        addCand(byVivid, 100);
        addCand(byBright, 100);

        const out = [];

        const pushIfDistinct = (c) => {
          if (!c) return false;
          if (!isDistinct(c, out)) return false;
          out.push(c);
          return true;
        };

        // Seed 1-3: frequency bases
        for (const c of byFreq) {
          if (c.cnt < 2) continue;
          if (pushIfDistinct(c) && out.length >= 3) break;
        }

        // Seed 4: vivid accent (rare but saturated)
        for (const c of byVivid) {
          if (c.vivid < 0.18) continue;
          if (c.cnt < 1) continue;
          if (pushIfDistinct(c)) break;
        }

        // Seed 5: bright accent (rare but bright)
        for (const c of byBright) {
          if (c.v < 0.82) continue;
          if (c.cnt < 1) continue;
          if (pushIfDistinct(c)) break;
        }

        // Fill remaining slots using farthest-point selection for diversity
        while (out.length < 5) {
          let best = null;
          let bestScore = -1;
          for (const c of cand) {
            if (!isDistinct(c, out)) continue;
            let minD = 1e9;
            for (const p of out) minD = Math.min(minD, hsvDist(c, p));
            // Small relevance bias so we don't pick pure noise
            const bias = Math.min(0.22, Math.log10(1 + c.cnt) / 10);
            const score = minD + bias;
            if (score > bestScore) { bestScore = score; best = c; }
          }
          if (!best) break;
          out.push(best);
        }

        // Last resort fill (lower distinctness slightly)
        if (out.length < 5) {
          for (const c of byFreq) {
            if (out.length >= 5) break;
            if (out.some(p => p.key === c.key)) continue;
            out.push(c);
          }
        }

        const hex = (v) => v.toString(16).padStart(2, '0');
        state.videoPalette = out.slice(0, 5).map(c => `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`);
        renderVideoPalette();
      } catch (e) {}
    };

    if (img.complete) run();
    else img.onload = run;
  }

function renderVideoPalette() {
    const row = document.getElementById('videoPaletteRow');
    if (!row) return;
    row.innerHTML = '';
    row.style.display = state.videoPalette.length ? 'flex' : 'none';
    state.videoPalette.forEach(c => {
      const swatch = document.createElement('div');
      swatch.className = 'draw-color';
      swatch.style.cssText = `background:${c};width:20px;height:20px;border-radius:3px;cursor:pointer;border:1px solid rgba(255,255,255,0.2);touch-action:manipulation;`;
      swatch.ontouchstart = (e) => { e.preventDefault(); e.stopPropagation(); setDrawColor(c); };
      swatch.onclick = () => setDrawColor(c);
      row.appendChild(swatch);
    });
  }

  // Video palette auto-generates when frames are loaded
  renderRecentColors();
  const genVideoPaletteBtn = document.getElementById('genVideoPalette');
  if (genVideoPaletteBtn) genVideoPaletteBtn.onclick = generateVideoPaletteFromCurrentFrame;
  
  function setDrawTarget(target) {
    // Persist current layer before switching
    if (state.drawMode) saveCurrentLayer();

    state.drawTarget = target;
    drawTargetBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.target === target);
    });

    // Template target shows the template frame window
    if (target === 'template') {
      ensureTplCanvasSized();
      showTemplateFrame(true);
    }
  }
  
  // Palette controls
  qDraw.onclick = () => {
    // If palette was hidden (P or button), clicking Draw should reopen it first.
    if (state.drawMode && !drawPalette.classList.contains('visible')) {
      drawPalette.classList.add('visible');
      return;
    }
    toggleDrawMode();
  };
  drawToggle.onclick = () => {
    if (state.drawMode && !drawPalette.classList.contains('visible')) {
      drawPalette.classList.add('visible');
      return;
    }
    toggleDrawMode();
  };

  if (drawPaletteToggleBtn) {
    drawPaletteToggleBtn.onclick = () => {
      // Hide the floating palette but keep Draw mode active.
      drawPalette.classList.remove('visible');
      syncBrushPanelToggleUI();
    };
  }

  if (drawBrushLockBtn) {
    drawBrushLockBtn.onclick = () => toggleBrushLocked();
  }

  // Sync "Brush Panel" toggle in side menu with floating palette visibility
  function syncBrushPanelToggleUI() {
    if (!toggleBrushPanel || !drawPalette) return;
    const isVisible = drawPalette.classList.contains('visible');
    toggleBrushPanel.classList.toggle('active', isVisible);
  }

  if (toggleBrushPanel) {
    toggleBrushPanel.onclick = () => {
      togglePalette(); // (P) behavior, but available on touch devices
      syncBrushPanelToggleUI();
    };
  }

  function syncBgAboveDrawingsUI() {
    if (!toggleBgAboveDrawings) return;
    toggleBgAboveDrawings.classList.toggle('active', !!state.bgLayerAboveDrawings);
  }

  if (toggleBgAboveDrawings) {
    toggleBgAboveDrawings.onclick = () => {
      state.bgLayerAboveDrawings = !state.bgLayerAboveDrawings;
      syncBgAboveDrawingsUI();
      compositeAllLayers();
      requestAnimationFrame(() => compositeAllLayers());
    };
  }

  // Initial sync
  syncBrushPanelToggleUI();
  syncBgAboveDrawingsUI();


  function updateTemplateVisibilityUI() {
    if (!toggleTemplateVisibilityBtn) return;
    toggleTemplateVisibilityBtn.classList.toggle('active', !!state.showTemplateDrawing);
  }

  function toggleTemplateVisibility() {
    state.showTemplateDrawing = !state.showTemplateDrawing;
    updateTemplateVisibilityUI();
    compositeAllLayers();
  }

  if (toggleTemplateVisibilityBtn) {
    toggleTemplateVisibilityBtn.onclick = () => {
      toggleTemplateVisibility();
    };
  }

  updateTemplateVisibilityUI();

  // --- Ref Frame (Reference Frame overlay) ---

  function updateRefFrameUI() {
    const hasRef = !!state.refFrameSource;
    if (refFrameSection) {
      // Keep the section visible so the user can load a reference at any time.
      refFrameSection.style.display = 'block';
    }
    if (toggleRefFrameVisible) {
      toggleRefFrameVisible.classList.toggle('active', !!state.refFrameVisible);
    }
    if (toggleRefFrameFollow) {
      toggleRefFrameFollow.classList.toggle('active', !!state.refFrameFollowFrameTransform);
      toggleRefFrameFollow.style.pointerEvents = hasRef ? 'auto' : 'none';
      toggleRefFrameFollow.style.opacity = hasRef ? '1' : '0.35';
    }
    if (toggleRefFrameAbove) {
      toggleRefFrameAbove.classList.toggle('active', !!state.refFrameAboveDrawings);
      toggleRefFrameAbove.style.pointerEvents = hasRef ? 'auto' : 'none';
      toggleRefFrameAbove.style.opacity = hasRef ? '1' : '0.35';
    }
    if (refFrameOpacitySlider) refFrameOpacitySlider.value = String(state.refFrameOpacity !== undefined ? state.refFrameOpacity : 1);
    if (refFrameOpacityNum) refFrameOpacityNum.value = (state.refFrameOpacity !== undefined ? state.refFrameOpacity : 1).toFixed(2);
    if (refFrameOffXSlider) refFrameOffXSlider.value = String(Number(state.refFrameOffX) || 0);
    if (refFrameOffXNum) refFrameOffXNum.value = String(Number(state.refFrameOffX) || 0);
    if (refFrameOffYSlider) refFrameOffYSlider.value = String(Number(state.refFrameOffY) || 0);
    if (refFrameOffYNum) refFrameOffYNum.value = String(Number(state.refFrameOffY) || 0);
    if (refFrameScaleSliderX) refFrameScaleSliderX.value = String(Number(state.refFrameScaleX) || 1);
    if (refFrameScaleNumX) refFrameScaleNumX.value = (Number(state.refFrameScaleX) || 1).toFixed(2);
    if (refFrameScaleSliderY) refFrameScaleSliderY.value = String(Number(state.refFrameScaleY) || 1);
    if (refFrameScaleNumY) refFrameScaleNumY.value = (Number(state.refFrameScaleY) || 1).toFixed(2);
    if (toggleRefScaleLink) toggleRefScaleLink.classList.toggle('active', !!state.refFrameScaleLink);
if (toggleExportRefFrame) {
      toggleExportRefFrame.classList.toggle('active', !!state.refFrameIncludeInExport);
      toggleExportRefFrame.style.pointerEvents = hasRef ? 'auto' : 'none';
      toggleExportRefFrame.style.opacity = hasRef ? '1' : '0.35';
    }

    // Enable/disable controls based on whether a ref frame is loaded
    if (refFrameClearBtn) refFrameClearBtn.disabled = !hasRef;
    if (refFrameResetTransformBtn) refFrameResetTransformBtn.disabled = !hasRef;
    if (refFrameOpacitySlider) refFrameOpacitySlider.disabled = !hasRef;
if (refFrameOffXSlider) refFrameOffXSlider.disabled = !hasRef;
    if (refFrameOffYSlider) refFrameOffYSlider.disabled = !hasRef;
    if (refFrameScaleSliderX) refFrameScaleSliderX.disabled = !hasRef;
    if (refFrameScaleSliderY) refFrameScaleSliderY.disabled = !hasRef;

    if (refFrameOffXNum) refFrameOffXNum.disabled = !hasRef;
    if (refFrameOffYNum) refFrameOffYNum.disabled = !hasRef;
    if (refFrameScaleNumX) refFrameScaleNumX.disabled = !hasRef;
    if (refFrameScaleNumY) refFrameScaleNumY.disabled = !hasRef;
    if (toggleRefFrameVisible) {
      toggleRefFrameVisible.style.pointerEvents = hasRef ? 'auto' : 'none';
      toggleRefFrameVisible.style.opacity = hasRef ? '1' : '0.35';
    }

    if (refFrameLoadBtn) {
      // Load is always available
      refFrameLoadBtn.disabled = false;
    }

    // When nothing is loaded, keep UI values readable but ensure toggles look off
    if (!hasRef && toggleRefFrameVisible) {
      toggleRefFrameVisible.classList.remove('active');
    }
    if (!hasRef && toggleRefFrameAbove) {
      toggleRefFrameAbove.classList.remove('active');
    }
  }

  function toggleRefFrameVisibility() {
    if (!state.refFrameSource) return;
    state.refFrameVisible = !state.refFrameVisible;
    updateRefFrameUI();
    compositeAllLayers();
  }

  function toggleRefFrameFollowFrameTransform() {
    state.refFrameFollowFrameTransform = !state.refFrameFollowFrameTransform;
    updateRefFrameUI();
    // When enabled, ref should respond immediately to current frame transform
    compositeAllLayers();
  }

  function resetRefFrameTransform() {
    if (!state.refFrameSource) return;
    state.refFrameOffX = 0;
    state.refFrameOffY = 0;
    state.refFrameScaleX = 1;
    state.refFrameScaleY = 1;
    state.refFrameRot = 0;
    updateRefFrameUI();
    compositeAllLayers();
  }

  function clearRefFrame() {
    // Dispose previous bitmap to free memory (safe no-op for HTMLImageElement)
    const prev = state.refFrameSource; if (prev && typeof prev.close === "function") prev.close();
    state.refFrameSource = null;
    state.refFrameVisible = true;
    resizeDrawCanvas();
      compositeAllLayers();
  }

    async function loadRefFrameFromFile(file) {
    if (!file) return;

    // Dispose previous bitmap before replacing
    const prev = state.refFrameSource; if (prev && typeof prev.close === "function") prev.close();

    // Reset first to avoid stale UI
    state.refFrameSource = null;
    state.refFrameVisible = true;

    

    const url = URL.createObjectURL(file);
    try {
      if (window.createImageBitmap) {
        try {
          const bmp = await createImageBitmap(file);
          state.refFrameSource = bmp;
          
        } catch (e) {
          // Some browsers fail createImageBitmap(file) for certain formats or large images.
          
          state.refFrameSource = null;
        }
      }

      if (!state.refFrameSource) {
        const img = new Image();
        img.decoding = 'async';

        const pLoad = new Promise((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Image load error'));
        });

        img.src = url;

        if (img.decode) {
          try {
            await img.decode();
          } catch (e) {
            // decode() can reject even when onload succeeds, fallback to load event
            await pLoad;
          }
        } else {
          await pLoad;
        }

        state.refFrameSource = img;
        const iw = img.naturalWidth || img.width || 0;
        const ih = img.naturalHeight || img.height || 0;
        
      }
    } catch (e) {
      
      
      state.refFrameSource = null;
    } finally {
      if (url) URL.revokeObjectURL(url);
    }

    // Defaults on successful load
    if (state.refFrameSource) {
      state.refFrameOpacity = 1;
      state.refFrameOffX = 0;
      state.refFrameOffY = 0;
      state.refFrameScaleX = 1;
      state.refFrameScaleY = 1;
      
    } else {
      
    }

    updateRefFrameUI();
    resizeDrawCanvas();
    compositeAllLayers();
  }

  if (refFrameLoadBtn && refFrameInput) {
    refFrameLoadBtn.onclick = () => {
      
      refFrameInput.click();
    };
  }
  if (refFrameInput) {
    refFrameInput.onchange = () => {
      const f = refFrameInput.files && refFrameInput.files[0];
      
      if (f) loadRefFrameFromFile(f);
      refFrameInput.value = '';
    };
  }
  if (refFrameClearBtn) {
    refFrameClearBtn.onclick = () => clearRefFrame();
  }
  if (refFrameResetTransformBtn) {
    refFrameResetTransformBtn.onclick = () => resetRefFrameTransform();
  }
  if (toggleRefFrameVisible) {
    toggleRefFrameVisible.onclick = () => {
      toggleRefFrameVisibility();
    };
  }
  if (toggleRefFrameFollow) {
    toggleRefFrameFollow.onclick = () => {
      toggleRefFrameFollowFrameTransform();
    };
  }
  if (toggleRefFrameAbove) {
    toggleRefFrameAbove.onclick = () => {
      if (!state.refFrameSource) return;
      state.refFrameAboveDrawings = !state.refFrameAboveDrawings;
      updateRefFrameUI();
      compositeAllLayers();
    };
  }
      if (toggleRefScaleLink) {
    toggleRefScaleLink.onclick = () => {
      if (!state.refFrameSource) return;
      state.refFrameScaleLink = !state.refFrameScaleLink;
      toggleRefScaleLink.classList.toggle('active', state.refFrameScaleLink);
      if (state.refFrameScaleLink) {
        state.refFrameScaleY = state.refFrameScaleX;
        if (refFrameScaleSliderY) refFrameScaleSliderY.value = String(state.refFrameScaleY);
        if (refFrameScaleNumY) refFrameScaleNumY.value = state.refFrameScaleY.toFixed(2);
        compositeAllLayers();
      }
    };
  }

  const syncRefScaleY = (val) => {
    if (state.refFrameScaleLink) {
      state.refFrameScaleY = val;
      if (refFrameScaleSliderY) refFrameScaleSliderY.value = String(val);
      if (refFrameScaleNumY) refFrameScaleNumY.value = val.toFixed(2);
    }
  };
  const syncRefScaleX = (val) => {
    if (state.refFrameScaleLink) {
      state.refFrameScaleX = val;
      if (refFrameScaleSliderX) refFrameScaleSliderX.value = String(val);
      if (refFrameScaleNumX) refFrameScaleNumX.value = val.toFixed(2);
    }
  };

  bindDualInput('refFrameScaleX', refFrameScaleSliderX, refFrameScaleNumX, 0.1, 4.0, 2, compositeAllLayers, syncRefScaleY);
  bindDualInput('refFrameScaleY', refFrameScaleSliderY, refFrameScaleNumY, 0.1, 4.0, 2, compositeAllLayers, syncRefScaleX);
  bindDualInput('refFrameOffX', refFrameOffXSlider, refFrameOffXNum, -50, 50, 0, compositeAllLayers);
  bindDualInput('refFrameOffY', refFrameOffYSlider, refFrameOffYNum, -50, 50, 0, compositeAllLayers);
  bindDualInput('refFrameRot', refFrameRotSlider, refFrameRotNum, -360, 360, 1, compositeAllLayers);
  bindDualInput('refFrameOpacity', refFrameOpacitySlider, refFrameOpacityNum, 0, 1, 2, compositeAllLayers);

  if (toggleExportRefFrame) {
    toggleExportRefFrame.onclick = () => {
      state.refFrameIncludeInExport = !state.refFrameIncludeInExport;
      toggleExportRefFrame.classList.toggle('active', state.refFrameIncludeInExport);
    };
  }

  updateRefFrameUI();

  
  drawEraserBtn.onclick = () => {
    state.drawEraser = !state.drawEraser;
    drawEraserBtn.classList.toggle('active', state.drawEraser);
    drawCanvas.style.cursor = state.drawEraser ? 'cell' : 'crosshair';
    brushCursor.classList.toggle('eraser', state.drawEraser);
  };
  
  drawClear.onclick = () => {
    cancelLongStrokeTrail(true);
    // Undo snapshot (best-effort)
    if (state.drawTarget === 'frame') beginUndoCaptureForDrawTarget({ fullSheet: true });
    else beginUndoCaptureForDrawTarget();
    // Clear only current target
    if (state.drawTarget === 'background') {
      const cnv = getActiveBgCanvas();
      const ctx = getActiveBgCtx();
      ctx.clearRect(0, 0, cnv.width, cnv.height);
      setActiveBgDrawing(null);
      
    } else if (state.drawTarget === 'template') {
      tplCtx.clearRect(0, 0, tplCanvas.width, tplCanvas.height);
      state.templateDrawing = null;
      renderTemplateFramePreview();
      
    } else if (state.drawTarget === 'frame') {
      frameSheetCtx.clearRect(0, 0, frameSheetCanvas.width, frameSheetCanvas.height);
      state.frameDrawings = {};
      state.frameSheetDrawing = null;
      
    }
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    requestComposite();
  };

  function pushUndoSnapshotNow() {
    try {
      drawUndoStack.push({
        bgTarget: isSingleView() ? 'single' : 'grid',
      bg: (() => {
        const _bgC = getActiveBgCanvas();
        const _bgD = getActiveBgDrawing();
        if (!_bgD || !canSnapshotCanvas(_bgC)) return null;
        return _isCoarsePointer ? _bgD : new ImageData(new Uint8ClampedArray(_bgD.data), _bgD.width, _bgD.height);
      })(),
        tpl: (state.templateDrawing && canSnapshotCanvas(tplCanvas)) ? (_isCoarsePointer ? state.templateDrawing : new ImageData(new Uint8ClampedArray(state.templateDrawing.data), state.templateDrawing.width, state.templateDrawing.height)) : null,
        sheet: (!_isCoarsePointer && canSnapshotCanvas(frameSheetCanvas)) ? frameSheetCtx.getImageData(0, 0, frameSheetCanvas.width, frameSheetCanvas.height) : null
      });
      if (drawUndoStack.length > DRAW_UNDO_MAX) drawUndoStack.shift();
    } catch (e) {}
  }

  function applyTemplateToFrames() {
    // Bake TEMPLATE layer into per-frame sheet, then clear TEMPLATE
    ensureTplCanvasSized();
    ensureFrameSheet();

    if (!tplCanvas || !tplCanvas.width || !tplCanvas.height) return;
    if (!frameSheetCanvas || !frameSheetCanvas.width || !frameSheetCanvas.height) return;

    // If template is empty, this is effectively a no-op, but still safe.
    pushUndoSnapshotNow();

    const tw = state.frameSheetTileW || tplCanvas.width || 1;
    const th = state.frameSheetTileH || tplCanvas.height || 1;
    const cols = state.frameSheetCols || 1;

    // Copy template into every frame tile
    for (let f = 0; f < state.frames.length; f++) {
      const ox = (f % cols) * tw;
      const oy = Math.floor(f / cols) * th;
      frameSheetCtx.drawImage(tplCanvas, 0, 0, tplCanvas.width, tplCanvas.height, ox, oy, tw, th);
    }

    // Clear template
    tplCtx.clearRect(0, 0, tplCanvas.width, tplCanvas.height);
    state.templateDrawing = null;

    // Keep the template window consistent if it's open
    try { if (typeof renderTemplateFramePreview === 'function') renderTemplateFramePreview(); } catch (e) {}

    requestComposite();
  }

  if (applyTemplateToFramesBtn) {
    applyTemplateToFramesBtn.onclick = () => {
      applyTemplateToFrames();
    };
  }

  
  drawUndo.onclick = () => {
    cancelLongStrokeTrail(true);
    if (!drawUndoStack.length) return;
    const prev = drawUndoStack.pop();
    restoreUndoEntry(prev);
  };
  
  drawOnionBtn.onclick = toggleOnionSkin;
  function toggleLongStroke() {
    state.drawLongStroke = !state.drawLongStroke;
    drawLongStrokeBtn.classList.toggle('active', state.drawLongStroke);
    if (!state.drawLongStroke) {
      cancelLongStrokeTrail(true);
      requestComposite();
    }
  }
  
  drawLongStrokeBtn.onclick = toggleLongStroke;
  if (drawOneFrameBtn) {
    drawOneFrameBtn.onclick = () => {
      state.drawOneFrame = !state.drawOneFrame;
      drawOneFrameBtn.classList.toggle('active', state.drawOneFrame);
    };
  }
  
  drawColorInput.oninput = () => {}; // preview only
    drawColorInput.onchange = () => setDrawColor(drawColorInput.value);
    drawSizeSlider.oninput = () => {
    setDrawSize(parseInt(drawSizeSlider.value));
  };
  drawSizeSlider.oninput();
  
  // Opacity controls
  const drawOpacitySlider = $('drawOpacitySlider');
  const drawOpacityMinus = $('drawOpacityMinus'), drawOpacityPlus = $('drawOpacityPlus');
  
  function updateOpacity(val) {
    state.drawOpacity = Math.max(0.05, Math.min(1, val));
    updateDrawOpacityUI();
  }
  
  if (drawOpacitySlider) {
    drawOpacitySlider.oninput = () => updateOpacity(parseInt(drawOpacitySlider.value) / 100);
  }
  if (drawOpacityMinus) drawOpacityMinus.onclick = () => updateOpacity((state.drawOpacity || 1) - 0.1);
  if (drawOpacityPlus) drawOpacityPlus.onclick = () => updateOpacity((state.drawOpacity || 1) + 0.1);

  // Edge softness controls (falloff)
  const edgeSoftnessSlider = $('edgeSoftnessSlider');
  const edgeSoftnessLabel = $('edgeSoftnessLabel');
    const edgeSoftnessMinus = $('edgeSoftnessMinus');
    const edgeSoftnessPlus = $('edgeSoftnessPlus');
function updateEdgeSoftness(val) {
    state.edgeSoftness = Math.max(0, Math.min(1, val));
    updateEdgeSoftnessUI();
  }
  if (edgeSoftnessSlider) {
    edgeSoftnessSlider.oninput = () => updateEdgeSoftness(parseInt(edgeSoftnessSlider.value) / 100);
    edgeSoftnessSlider.oninput();
  } else {
    updateEdgeSoftnessUI();
  }

  
  
  if (edgeSoftnessMinus) edgeSoftnessMinus.onclick = () => updateEdgeSoftness((state.edgeSoftness || 0) - 0.05);
  if (edgeSoftnessPlus) edgeSoftnessPlus.onclick = () => updateEdgeSoftness((state.edgeSoftness || 0) + 0.05);
// Trail frames +/- buttons
  const trailMinus = $('trailMinus'), trailPlus = $('trailPlus');
  
  function updateTrailFrames(val) {
    state.longStrokeFade = Math.max(0, Math.min(50, Math.round(val)));
    if (longStrokeFadeInput) longStrokeFadeInput.value = state.longStrokeFade;
  }
  
  if (trailMinus) trailMinus.onclick = () => updateTrailFrames((state.longStrokeFade || 8) - 1);
  if (trailPlus) trailPlus.onclick = () => updateTrailFrames((state.longStrokeFade || 8) + 1);
  if (longStrokeFadeInput) longStrokeFadeInput.onchange = () => updateTrailFrames(parseInt(longStrokeFadeInput.value) || 8);
  
  drawColors.forEach(el => {
    el.style.touchAction = 'manipulation';
    el.ontouchstart = (e) => { e.preventDefault(); e.stopPropagation(); setDrawColor(el.dataset.color); };
    el.onclick = () => setDrawColor(el.dataset.color);
  });
  
  drawTargetBtns.forEach(btn => {
    btn.onclick = () => setDrawTarget(btn.dataset.target);
  });

  // Template frame window behavior
  if (templateFrameClose) templateFrameClose.onclick = () => showTemplateFrame(false);

  // Drag template frame by header
  let tplDrag = { active: false, ox: 0, oy: 0, baseLeft: 0, baseTop: 0, scale: 1 };
  if (templateFrameHeader && templateFrame) {
    templateFrameHeader.onmousedown = e => {
      if (e.button !== 0) return;
      tplDrag.active = true;
      const rect = templateFrame.getBoundingClientRect();
      tplDrag.ox = e.clientX - rect.left;
      tplDrag.oy = e.clientY - rect.top;

      // Capture current base (first frame) so manual moves become a stable GRID-space offset.
      const base = getTemplateBaseRect();
      const headerH = (base && base.headerH) ? base.headerH : 24;
      if (base && base.ok) {
        tplDrag.baseLeft = base.frameRect.left;
        tplDrag.baseTop = base.frameRect.top - headerH;
      } else {
        tplDrag.baseLeft = rect.left;
        tplDrag.baseTop = rect.top;
      }
      tplDrag.scale = Number.isFinite(state.scale) ? state.scale : 1;
      e.preventDefault();
    };
    document.addEventListener('mousemove', e => {
      if (!tplDrag.active) return;
      const newLeft = (e.clientX - tplDrag.ox);
      const newTop = (e.clientY - tplDrag.oy);
      templateFrame.style.left = newLeft + 'px';
      templateFrame.style.top = newTop + 'px';

      const s = tplDrag.scale || 1;
      tplFollow.dxWorld = (newLeft - tplDrag.baseLeft) / s;
      tplFollow.dyWorld = (newTop - tplDrag.baseTop) / s;
    });
    document.addEventListener('mouseup', () => { tplDrag.active = false; });
  }

  // Proportional resize for template frame
  const templateFrameResize = $('templateFrameResize');
  let tplResize = { active: false, startW: 0, startH: 0, startX: 0, aspect: 16/9 };
  if (templateFrameResize && templateFrame) {
    templateFrameResize.onmousedown = e => {
      if (e.button !== 0) return;
      tplResize.active = true;
      const rect = templateFrame.getBoundingClientRect();
      tplResize.startW = rect.width;
      tplResize.startH = rect.height;
      tplResize.startX = e.clientX;
      tplResize.aspect = getEffectiveFrameAspect();
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('mousemove', e => {
      if (!tplResize.active) return;
      const delta = e.clientX - tplResize.startX;
      const newW = Math.max(200, tplResize.startW + delta);
      const headerH = 24;
      const newH = (newW / tplResize.aspect) + headerH;
      templateFrame.style.width = newW + 'px';
      templateFrame.style.height = newH + 'px';
    });
    document.addEventListener('mouseup', () => { tplResize.active = false; });
  }

  // Draw directly on template frame canvas (maps to tplCanvas)
  (function bindTemplateFrameDrawing() {
    if (!templateFrameCanvas || !templateFrameCtx) return;
    let tDrawing = false;
    let tLast = null;

    function mapPoint(ev) {
      const r = templateFrameCanvas.getBoundingClientRect();
      const cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      const cy = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top;
      const x = cx * (templateFrameCanvas.width / Math.max(1, r.width));
      const y = cy * (templateFrameCanvas.height / Math.max(1, r.height));
      return { x, y };
    }

    function getTemplateFrameBrushSize() {
      const r = templateFrameCanvas.getBoundingClientRect();
      const pxPerX = templateFrameCanvas.width / Math.max(1, r.width);
      const pxPerY = templateFrameCanvas.height / Math.max(1, r.height);
      const pxPer = (pxPerX + pxPerY) / 2;
      const sc = Number.isFinite(state.scale) ? state.scale : 1;
      // Brush cursor is sized in screen px as drawSize * scale.
      // Convert that into canvas pixels for the template frame.
      return (state.drawSize * sc) * pxPer;
    }

    templateFrameCanvas.onmousedown = ev => {
      if (!state.drawMode) return;
    if (brushLocked) return;
      state.drawTarget = 'template';
      drawTargetBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.target === 'template'));
      beginUndoCaptureForDrawTarget('template');
      tDrawing = true;
      tLast = mapPoint(ev);
      drawDot(tplCtx, tLast, state.drawColor, getTemplateFrameBrushSize(), state.drawEraser);
      saveCurrentLayer();
      compositeAllLayers();
      ev.preventDefault();
    };
    templateFrameCanvas.onmousemove = ev => {
      if (!tDrawing || !tLast) return;
      const p = mapPoint(ev);
      drawSmoothLine(tplCtx, tLast, p, state.drawColor, getTemplateFrameBrushSize(), state.drawEraser);
      tLast = p;
      saveCurrentLayer();
      compositeAllLayers();
    };
    templateFrameCanvas.onmouseup = () => { tDrawing = false; tLast = null; saveCurrentLayer(); };
    templateFrameCanvas.onmouseleave = () => { tDrawing = false; tLast = null; saveCurrentLayer(); };

    templateFrameCanvas.ontouchstart = ev => {
      if (!state.drawMode) return;
    if (brushLocked) return;
      state.drawTarget = 'template';
      drawTargetBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.target === 'template'));
      beginUndoCaptureForDrawTarget('template');
      tDrawing = true;
      tLast = mapPoint(ev);
      drawDot(tplCtx, tLast, state.drawColor, getTemplateFrameBrushSize(), state.drawEraser);
      saveCurrentLayer();
      compositeAllLayers();
      ev.preventDefault();
    };
    templateFrameCanvas.ontouchmove = ev => {
      if (!tDrawing || !tLast) return;
      const p = mapPoint(ev);
      drawSmoothLine(tplCtx, tLast, p, state.drawColor, getTemplateFrameBrushSize(), state.drawEraser);
      tLast = p;
      saveCurrentLayer();
      compositeAllLayers();
      ev.preventDefault();
    };
    templateFrameCanvas.ontouchend = () => { tDrawing = false; tLast = null; saveCurrentLayer(); };
  })();

  
  if (toggleExportDraw) {
    toggleExportDraw.onclick = () => {
      state.exportDrawings = !state.exportDrawings;
      toggleExportDraw.classList.toggle('active', state.exportDrawings);
      // If drawings are disabled, alpha-export mode makes no sense, so reset it.
      if (!state.exportDrawings) {
        state.exportAlphaDrawings = false;
        if (typeof toggleExportAlphaDraw !== 'undefined' && toggleExportAlphaDraw) {
          toggleExportAlphaDraw.classList.remove('active');
        }
      }
    };
  }

  if (typeof toggleExportBg !== 'undefined' && toggleExportBg) {
    toggleExportBg.onclick = () => {
      state.exportBgLayer = !state.exportBgLayer;
      toggleExportBg.classList.toggle('active', state.exportBgLayer);
      syncExportPaddingUI();
    }
  if (toggleExportAudioLayer) {
    toggleExportAudioLayer.onclick = () => {
      state.exportAudioLayer = !state.exportAudioLayer;
      toggleExportAudioLayer.classList.toggle('active', !!state.exportAudioLayer);
    };
    toggleExportAudioLayer.classList.toggle('active', !!state.exportAudioLayer);
  }

;
    toggleExportBg.classList.toggle('active', state.exportBgLayer);
  }



  if (toggleExportGuides) {
    toggleExportGuides.onclick = () => {
      state.showExportGuides = !state.showExportGuides;
      toggleExportGuides.classList.toggle('active', state.showExportGuides);
      updateExportGuidesOverlay();
    };
    toggleExportGuides.classList.toggle('active', state.showExportGuides);
  }



function clampExportPaddingPx(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(800, Math.round(n)));
}

function syncExportPaddingUI() {
  const enabled = !!state.exportBgLayer;
  const v = clampExportPaddingPx(state.exportPaddingPx || 0);
  state.exportPaddingPx = v;

  if (exportPaddingRange) {
    exportPaddingRange.value = String(v);
    exportPaddingRange.disabled = false;
  }
  if (exportPaddingNum) {
    exportPaddingNum.value = String(v);
    exportPaddingNum.disabled = false;
  }
  updateExportGuidesOverlay();
}

if (exportPaddingRange) {
  exportPaddingRange.oninput = () => {
    state.exportPaddingPx = clampExportPaddingPx(exportPaddingRange.value);
    syncExportPaddingUI();
  };
}
if (exportPaddingNum) {
  exportPaddingNum.oninput = () => {
    state.exportPaddingPx = clampExportPaddingPx(exportPaddingNum.value);
    syncExportPaddingUI();
  };
}

syncExportPaddingUI();



  if (typeof toggleExportAlphaDraw !== 'undefined' && toggleExportAlphaDraw) {
    toggleExportAlphaDraw.onclick = () => {
      // Alpha drawings implies drawings export is enabled.
      if (!state.exportDrawings) {
        state.exportDrawings = true;
        if (toggleExportDraw) toggleExportDraw.classList.add('active');
      }
      state.exportAlphaDrawings = !state.exportAlphaDrawings;
      toggleExportAlphaDraw.classList.toggle('active', state.exportAlphaDrawings);
    };
    toggleExportAlphaDraw.classList.toggle('active', state.exportAlphaDrawings);
  }

  if (toggleExportMetadata) {
    toggleExportMetadata.onclick = () => {
      state.exportShowMetadata = !state.exportShowMetadata;
      toggleExportMetadata.classList.toggle('active', state.exportShowMetadata);
    };
    toggleExportMetadata.classList.toggle('active', state.exportShowMetadata);
  }
  
  // Resize draw canvas when grid changes
  // renderGrid draw canvas resize now integrated directly

  function loadScript(src, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let timeout;

      script.src = src;
      script.onload = () => {
        clearTimeout(timeout);
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(`Failed to load ${src}`));
      };

      timeout = setTimeout(() => {
        script.onerror = null;
        script.onload = null;
        script.remove();
        reject(new Error(`Timeout loading ${src} after ${timeoutMs}ms`));
      }, timeoutMs);

      document.head.appendChild(script);
    });
  }

// Export resampled video with original audio (experimental).
// - Output duration matches the source video duration.
// - Visuals are "stretched" across time using the current animation sequence.
// - Uses MediaRecorder (likely outputs WebM on desktop Chrome).
function pickBestMediaRecorderMime() {
  const candidates = [
    // Prefer MP4 with audio when supported (H.264 + AAC)
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',

    // Fallbacks
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];
  for (const c of candidates) {
    try { if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c; } catch (e) {}
  }
  return '';
}

function getOrCreateAudioStreamForRecorder(videoEl) {
  // Prefer captureStream if available
  try {
    if (videoEl && videoEl.captureStream) {
      const s = videoEl.captureStream();
      const a = s && s.getAudioTracks ? s.getAudioTracks() : [];
      if (a && a.length) return { stream: s, track: a[0], kind: 'captureStream' };
    }
  } catch (e) {}

  // Fallback: WebAudio capture
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (state._resampleAudio && state._resampleAudio.track) return state._resampleAudio;

    const ac = new AudioCtx();
    const src = ac.createMediaElementSource(videoEl);
    const dest = ac.createMediaStreamDestination();
    const gain = ac.createGain();
    gain.gain.value = 0; // keep playback silent during export
    src.connect(gain);
    gain.connect(ac.destination);
    src.connect(dest);

    const track = dest.stream.getAudioTracks()[0] || null;
    const pack = { ac, src, dest, track, kind: 'webaudio' };
    state._resampleAudio = pack;
    return pack;
  } catch (e) {
    return null;
  }
}

async function exportResampledVideo(forceMode = null) {
  window._exportKind = "mp4";
  window._exportVariant = "rsmpl";

  try {
    if (!state.frames.length) return;
    if (!videoElement || !Number.isFinite(videoElement.duration) || videoElement.duration <= 0) {
      alert('Resampled export requires a loaded video with a valid duration.');
      return;
    }
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      alert('Resampled export requires MediaRecorder + canvas.captureStream support (desktop Chrome/Edge recommended).');
      return;
    }

    const mode = (forceMode === 'grid' || forceMode === 'single') ? forceMode : ((state.viewMode === 'grid') ? 'grid' : 'single');
    const drawingsOnly = false;

    const saved = {
      t: videoElement.currentTime,
      paused: videoElement.paused,
      playbackRate: videoElement.playbackRate,
      loop: videoElement.loop,
    };

    const audioPack = getOrCreateAudioStreamForRecorder(videoElement);
    if (audioPack && audioPack.ac && audioPack.ac.state === 'suspended') {
      try { await audioPack.ac.resume(); } catch (e) {}
    }

    const frameAspect = getEffectiveFrameAspect();
    const cellCount = Math.ceil(getEffectiveFrameTargetCount() / Math.max(1, state.cellSize || 1));
    const total = cellCount + (0);
    const rows = Math.ceil(total / state.gridCols);

    const videoLayout = getDeterministicVideoExportLayout(mode, rows);
    const canvasW = videoLayout.canvasW;
    const canvasH = videoLayout.canvasH;
    const layout = videoLayout.layout;

    loadingOverlay.classList.add('visible');
    loadingProgress.textContent = 'Preparing resampled export...';
    const frameImages = await loadFrameImagesWithProgress('Loading frames');

    let sequence = [];
    const frameCount = state.frames.length;
    if (state.animDirection === 'forward') {
      for (let i = 0; i < frameCount; i++) sequence.push(i);
    } else if (state.animDirection === 'backward') {
      for (let i = frameCount - 1; i >= 0; i--) sequence.push(i);
    } else {
      for (let i = 0; i < frameCount; i++) sequence.push(i);
      for (let i = frameCount - 2; i > 0; i--) sequence.push(i);
    }

    const cellOrder = (mode === 'grid') ? generateCellOrder(cellCount, state.gridCols) : null;
    const r = parseInt(state.tcBgColor.slice(1,3), 16);
    const g = parseInt(state.tcBgColor.slice(3,5), 16);
    const b = parseInt(state.tcBgColor.slice(5,7), 16);

    const exportFps = Math.max(1, Number(state.animFps) || 14);
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvasW;
    exportCanvas.height = canvasH;
    const ectx = exportCanvas.getContext('2d');

    const vStream = exportCanvas.captureStream(exportFps);
    const tracks = [];
    const vTrack = vStream.getVideoTracks()[0];
    if (vTrack) tracks.push(vTrack);
    const aTrack = audioPack && audioPack.track ? audioPack.track : null;
    if (aTrack) tracks.push(aTrack);
    const stream = new MediaStream(tracks);

    const requestedMime = pickBestMediaRecorderMime();
    const videoBits = EXPORT_CONF.MR_BITS[state.exportQuality] || 6000000;

    let recorder;
    try {
      recorder = new MediaRecorder(stream, requestedMime ? { mimeType: requestedMime, videoBitsPerSecond: videoBits } : { videoBitsPerSecond: videoBits });
    } catch (e) {
      recorder = new MediaRecorder(stream);
    }

    const mimeType = (recorder && recorder.mimeType) ? recorder.mimeType : (requestedMime || '');
    const ext = (mimeType && mimeType.includes('mp4')) ? 'mp4' : 'webm';
    const chunks = [];
    recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };

    const T = videoElement.duration;
    let stopping = false;
    const drawFrame = () => {
      if (stopping) return;
      const t = Math.max(0, Math.min(T, videoElement.currentTime || 0));
      const p = (T > 0) ? (t / T) : 0;
      const tick = Math.max(0, Math.min(sequence.length - 1, Math.floor(p * sequence.length)));

      try {
        const pct = Math.max(0, Math.min(100, Math.round(p * 100)));
        loadingProgress.textContent = (aTrack ? 'Recording resampled video (with audio)... ' : 'Recording resampled video (no audio track)... ') + pct + '%';
      } catch (e) {}

      const { first: exportLogoIndices, last: exportLogoIndices2 } = getLogoActiveIndicesForTick(tick);
      ectx.save();
      ectx.globalAlpha = 1;
      ectx.globalCompositeOperation = 'source-over';
      ectx.fillStyle = state.bgColor || '#000';
      ectx.fillRect(0, 0, canvasW, canvasH);
      ectx.restore();

      if (mode === 'grid') renderMp4GridFrame(ectx, canvasW, canvasH, frameImages, tick, cellOrder, rows, frameAspect, r, g, b, layout, drawingsOnly);
      else {
        const frameIdx = sequence[tick] ?? 0;
        renderMp4SingleFrame(ectx, canvasW, canvasH, frameImages, frameIdx, r, g, b, layout, drawingsOnly, tick);
      }

      requestAnimationFrame(drawFrame);
    };

    loadingProgress.textContent = aTrack ? 'Recording resampled video (with audio)...' : 'Recording resampled video (no audio track)...';
    recorder.start(1000);
    videoElement.loop = false;
    videoElement.playbackRate = 1;
    videoElement.currentTime = 0;
    try { await videoElement.play(); } catch (e) {}
    drawFrame();

    await new Promise(resolve => {
      const onEnd = () => resolve();
      videoElement.addEventListener('ended', onEnd, { once: true });
      setTimeout(onEnd, Math.ceil((T + 1) * 1000));
    });

    stopping = true;
    try { videoElement.pause(); } catch (e) {}

    await new Promise(resolve => {
      recorder.onstop = resolve;
      try { recorder.stop(); } catch (e) { resolve(); }
    });

    const blob = new Blob(chunks, { type: (mimeType || ('video/' + ext)) });
    const filename = makeExportFilename({ mode: 'resampled', ext, frames: state.frames.length, fps: state.animFps, extra: aTrack ? 'audio' : 'silent' });

    loadingOverlay.classList.remove('visible');
    await saveBlob(blob, filename, blob.type);

    try {
      videoElement.loop = saved.loop;
      videoElement.playbackRate = saved.playbackRate;
      videoElement.currentTime = saved.t;
      if (!saved.paused) { videoElement.play().catch(() => {}); }
    } catch (e) {}
  } catch (err) {
    loadingOverlay.classList.remove('visible');
    console.error(err);
    alert('Resampled export failed. See console for details.');
  }
}


  // MP4 Export using mp4-muxer for true MP4 (H.264)

  async function exportMp4(mode, opts = {}) {
  window._exportKind = "mp4";
  window._exportVariant = state.exportAudioLayer ? "av" : "";

    const drawingsOnly = !!(opts && opts.drawingsOnly);
    if (!state.frames.length) return;

    if (state.exportResetPlay) {
       state.currentTick = 0;
       updateLogoFromTick();
       updateAllCells();
    }

    const { first: exportLogoIndices, last: exportLogoIndices2 } = getLogoActiveIndicesForTick(state.currentTick);
    loadingOverlay.classList.add('visible');
    loadingProgress.textContent = 'Loading MP4 encoder...';

    // mp4-muxer is now inlined in the HTML.
    if (!window.Mp4Muxer) {
      loadingOverlay.classList.remove('visible');
      alert("MP4 encoder library not found.");
      return;
    }

    const frameAspect = getEffectiveFrameAspect();
    const cellCount = Math.ceil(getEffectiveFrameTargetCount() / Math.max(1, state.cellSize || 1));
    const total = cellCount + (0);
    const rows = Math.ceil(total / state.gridCols);
    const gapBase = Math.max(0, Number(state.spacing) || 0);
    const padPx = state.exportBgLayer ? clampExportPaddingPx(state.exportPaddingPx || 0) : 0;
    const qualityCap = EXPORT_CONF.RES[state.exportQuality] || 1080;

    let logicalCanvasW = 0;
    let logicalCanvasH = 0;
    let layout = { mode, padPx, headerH: 0, baseHeaderH: 0, gap: gapBase, frameW: 0, frameH: 0, gridW: 0, gridH: 0, dx: 0, dy: 0, logicalW: 0, logicalH: 0, scaleX: 1, scaleY: 1 };

    if (mode === 'grid') {
      const dims = getTargetFrameOutputDims();
      const frameW = Math.max(2, Math.round(dims.w));
      const frameH = Math.max(2, Math.round(dims.h));
      const gridW = state.gridCols * frameW + Math.max(0, state.gridCols - 1) * gapBase;
      const gridH = rows * frameH + Math.max(0, rows - 1) * gapBase;

      const rawHeader = getExportHeaderHeight('grid', gridW);
      const baseHeaderH = state.exportShowMetadata ? rawHeader : 0;
      let headerH = baseHeaderH;

      const placement = getStillExportPlacement('grid', gridW, gridH, headerH, padPx);
      logicalCanvasW = placement.canvasW;
      logicalCanvasH = placement.canvasH;

      if (state.exportShowMetadata && baseHeaderH > 0) {
        const measureCanvas = document.createElement('canvas');
        const mctx = measureCanvas.getContext('2d');
        const metaTextLocal = buildExportMetaText({ mode: 'grid', cols: state.gridCols, frameW, frameH, frames: state.frames.length, fps: state.animFps, srcW: state.videoWidth, srcH: state.videoHeight, duration: state.videoDuration, date: state.videoDate });
        const newHeaderH = computeExportMetadataHeaderH(mctx, logicalCanvasW, baseHeaderH, metaTextLocal);
        if (newHeaderH > headerH) {
          logicalCanvasH += (newHeaderH - headerH);
          headerH = newHeaderH;
        }
      }

      layout = { mode, padPx, headerH, baseHeaderH, gap: gapBase, frameW, frameH, gridW, gridH, dx: placement.dx, dy: placement.dy, logicalW: logicalCanvasW, logicalH: logicalCanvasH, scaleX: 1, scaleY: 1 };
      computeExportBgCrop('grid');
    } else {
      const dims = getTargetFrameOutputDims();
      const frameW = Math.max(2, Math.round(dims.w));
      const frameH = Math.max(2, Math.round(dims.h));

      const rawHeader = getExportHeaderHeight('single', frameW);
      const baseHeaderH = state.exportShowMetadata ? rawHeader : 0;
      let headerH = baseHeaderH;

      const placement = getStillExportPlacement('single', frameW, frameH, headerH, padPx);
      logicalCanvasW = placement.canvasW;
      logicalCanvasH = placement.canvasH;

      if (state.exportShowMetadata && baseHeaderH > 0) {
        const measureCanvas = document.createElement('canvas');
        const mctx = measureCanvas.getContext('2d');
        const idx = getPrimaryPreviewFrameIndex();
        const fr = state.frames[idx];
        const metaTextLocal = buildExportMetaText({ mode: 'single', frameW, frameH, frames: state.frames.length, fps: state.animFps, frameIdx: idx, time: fr?.time || 0, srcW: state.videoWidth, srcH: state.videoHeight, duration: state.videoDuration, date: state.videoDate });
        const newHeaderH = computeExportMetadataHeaderH(mctx, logicalCanvasW, baseHeaderH, metaTextLocal);
        if (newHeaderH > headerH) {
          logicalCanvasH += (newHeaderH - headerH);
          headerH = newHeaderH;
        }
      }

      layout = { mode, padPx, headerH, baseHeaderH, gap: 0, frameW, frameH, gridW: frameW, gridH: frameH, dx: placement.dx, dy: placement.dy, logicalW: logicalCanvasW, logicalH: logicalCanvasH, scaleX: 1, scaleY: 1 };
      computeExportBgCrop('single');
    }

    loadingProgress.textContent = drawingsOnly ? 'Preparing drawings export...' : 'Loading frames...';
    const frameImages = drawingsOnly ? null : await loadFrameImagesWithProgress('Loading frames');

    const frameCount = state.frames.length;
    const cycleLen = getAnimDirectionCycleLength(frameCount, state.animDirection);
    // If loopAfterN is active, one export loop = loopAfterN ticks (not full cycle)
    const _loopN = (state.loopAfterN > 0 && state.loopAfterN < frameCount) ? state.loopAfterN : null;
    const totalTicks = _loopN
      ? _loopN * Math.max(1, state.exportLoops)
      : cycleLen * Math.max(1, state.exportLoops);

    const cellOrder = generateCellOrder(cellCount, state.gridCols);
    const r = parseInt(state.tcBgColor.slice(1,3), 16);
    const g = parseInt(state.tcBgColor.slice(3,5), 16);
    const b = parseInt(state.tcBgColor.slice(5,7), 16);

    if (typeof VideoEncoder === 'undefined') {
      loadingOverlay.classList.remove('visible');
      alert(`MP4 export requires a modern browser with VideoEncoder support.

Try Chrome 94+, Edge 94+, or Safari 16.4+.

Alternatively, use PNG sequence export.`);
      return;
    }

    loadingProgress.textContent = 'Initializing encoder...';
    const even = (n) => Math.max(2, Math.floor(n / 2) * 2);
    let desiredW = logicalCanvasW;
    let desiredH = logicalCanvasH;
    if (Number.isFinite(qualityCap) && qualityCap > 0) {
      const qScale = Math.min(1, qualityCap / Math.max(logicalCanvasW, logicalCanvasH));
      desiredW = Math.max(2, Math.round(logicalCanvasW * qScale));
      desiredH = Math.max(2, Math.round(logicalCanvasH * qScale));
    }
    desiredW = even(desiredW);
    desiredH = even(desiredH);

    const sizeFactors = [1, 0.9, 0.8, 0.75, 0.67, 0.5, 0.4, 0.33, 0.25];
    const bitrateCaps = { low: 8000000, medium: 12000000, hd: 18000000, high: 25000000, max: 30000000 };
    const bitrateMins = { low: 6000000, medium: 8000000, hd: 10000000, high: 15000000, max: 20000000 };
    const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
    const calcBitrate = (w, h) => {
      const fps = Math.max(1, Number(state.animFps) || Number(state.videoFps) || 14);
      const raw = w * h * fps * 0.25;
      const cap = bitrateCaps[state.exportQuality] ?? 18000000;
      const min = bitrateMins[state.exportQuality] ?? 8000000;
      return Math.round(clamp(raw, min, cap));
    };
    const codecTemplates = [
      { codec: 'avc1.640033', scale: 1.00 },
      { codec: 'avc1.640028', scale: 0.92 },
      { codec: 'avc1.64001f', scale: 0.90 },
      { codec: 'avc1.4d0033', scale: 0.86 },
      { codec: 'avc1.4d001f', scale: 0.80 },
      { codec: 'avc1.4D401E', scale: 0.78 },
      { codec: 'avc1.42E01E', scale: 0.76 },
      { codec: 'avc1.42001f', scale: 0.75 },
      { codec: 'avc1.42001e', scale: 0.72 },
    ];

    let chosenConfig = null;
    let chosenW = desiredW;
    let chosenH = desiredH;
    for (const sf of sizeFactors) {
      const testW = even(Math.round(desiredW * sf));
      const testH = even(Math.round(desiredH * sf));
      for (const tmpl of codecTemplates) {
        const config = { codec: tmpl.codec, width: testW, height: testH, bitrate: Math.round(calcBitrate(testW, testH) * (tmpl.scale || 1)), framerate: state.animFps };
        try {
          const support = await VideoEncoder.isConfigSupported(config);
          if (support.supported) {
            chosenConfig = config;
            chosenW = testW;
            chosenH = testH;
            break;
          }
        } catch (e) {
          console.warn('Codec check failed:', config.codec, e);
        }
      }
      if (chosenConfig) break;
    }

    if (!chosenConfig) {
      loadingOverlay.classList.remove('visible');
      alert('No supported video codec found for this resolution. Try a lower quality setting or a different browser.');
      return;
    }

    layout.scaleX = chosenW / Math.max(1, logicalCanvasW);
    layout.scaleY = chosenH / Math.max(1, logicalCanvasH);
    layout.logicalW = logicalCanvasW;
    layout.logicalH = logicalCanvasH;

    const canvasW = chosenW;
    const canvasH = chosenH;
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: 'avc', width: canvasW, height: canvasH }, fastStart: 'in-memory' });
    const frameDuration = 1000000 / state.animFps;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => { muxer.addVideoChunk(chunk, meta); },
      error: (e) => {
        console.error('Encoder error:', e);
        loadingOverlay.classList.remove('visible');
        alert('Encoding error: ' + e.message);
      }
    });

    try {
      await encoder.configure(chosenConfig);
    } catch (e) {
      loadingOverlay.classList.remove('visible');
      alert('Failed to configure encoder. Try a lower quality setting.');
      return;
    }

    audioExportReset();
    state._audioExportDoTrigger = false;

    for (let tick = 0; tick < totalTicks; tick++) {
      loadingProgress.textContent = `Encoding MP4... ${tick + 1}/${totalTicks}`;
      ctx.fillStyle = state.bgColor;
      ctx.fillRect(0, 0, canvasW, canvasH);
      if (mode === 'grid') {
        renderMp4GridFrame(ctx, canvasW, canvasH, frameImages, tick, cellOrder, rows, frameAspect, r, g, b, layout, drawingsOnly);
      } else {
        ensureAnimDirShuffle(frameCount);
        const singleFrameIdx = resolveDirectionFrame(tick, 0, frameCount, state.animDirection, state.animDirShuffle);
        renderMp4SingleFrame(ctx, canvasW, canvasH, frameImages, singleFrameIdx, r, g, b, layout, drawingsOnly, tick);
      }
      const videoFrame = new VideoFrame(canvas, { timestamp: tick * frameDuration, duration: frameDuration });
      encoder.encode(videoFrame, { keyFrame: tick % 30 === 0 });
      videoFrame.close();
      if (tick % 5 === 0) await new Promise(r => queueMicrotask(r));
    }

    loadingProgress.textContent = 'Finalizing MP4...';
    await encoder.flush();
    muxer.finalize();

    const mp4Data = muxer.target.buffer;
    const blob = new Blob([mp4Data], { type: 'video/mp4' });
    loadingOverlay.classList.remove('visible');
    const link = document.createElement('a');
    link.download = makeExportFilename({ mode, ext: 'mp4', frames: state.frames.length, fps: state.animFps, extra: (drawingsOnly ? 'drawings' : '') });
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

function renderMp4GridFrame(ctx, w, h, frameImages, tick, cellOrder, rows, frameAspect, r, g, b, layout, drawingsOnly = false) {
    const headerHLogical = (layout && Number.isFinite(layout.headerH)) ? layout.headerH : (window._fgState.exportShowMetadata ? 48 : 0);
    const sx = (layout && Number.isFinite(layout.scaleX)) ? layout.scaleX : 1;
    const sy = (layout && Number.isFinite(layout.scaleY)) ? layout.scaleY : 1;
    const gap = (layout && Number.isFinite(layout.gap)) ? layout.gap : window._fgState.spacing;
    const frameWLogical = (layout && Number.isFinite(layout.frameW) && layout.frameW > 1) ? layout.frameW : 100;
    const frameHLogical = (layout && Number.isFinite(layout.frameH) && layout.frameH > 1) ? layout.frameH : Math.max(2, frameWLogical / Math.max(0.01, frameAspect));
    const dxLogical = (layout && Number.isFinite(layout.dx)) ? layout.dx : 0;
    const dyLogical = (layout && Number.isFinite(layout.dy)) ? layout.dy : 0;
    const outHeaderH = Math.round(headerHLogical * sy);
    const bodyH = Math.max(0, h - outHeaderH);
    const offsetX = dxLogical * sx;
    const offsetY = outHeaderH + dyLogical * sy;
    const frameW = frameWLogical * sx;
    const frameH = frameHLogical * sy;
    const gapX = gap * sx;
    const gapY = gap * sy;
    const cellCount = getEffectiveGridCellCount(window._fgState.frames.length);
    const frameCount = window._fgState.frames.length;
    const cellOrderMap = new Map();
    if (Array.isArray(cellOrder)) cellOrder.forEach((cell, idx) => cellOrderMap.set(cell, idx));
    if (window._fgState.animPattern === 'random') ensureAnimRandomStarts(cellCount);
    ensureAnimDirShuffle(frameCount);

    if (window._fgState.exportShowMetadata && outHeaderH > 0) {
      const metaText = buildExportMetaText({ mode: 'grid', cols: window._fgState.gridCols, frameW: frameWLogical, frameH: frameHLogical, frames: frameCount, fps: window._fgState.animFps, srcW: window._fgState.videoWidth, srcH: window._fgState.videoHeight, duration: window._fgState.videoDuration, date: window._fgState.videoDate });
      const _dynLogoResult = typeof getLogoActiveIndicesForTick === 'function' ? getLogoActiveIndicesForTick(tick) : { first: exportLogoIndices, last: [] };
      const dynamicLogoIdx  = Array.isArray(_dynLogoResult) ? _dynLogoResult : (_dynLogoResult.first || []);
      const dynamicLogoIdx2 = Array.isArray(_dynLogoResult) ? [] : (_dynLogoResult.last  || []);
      drawExportMetadataBar(ctx, w, outHeaderH, metaText, { activeIndices: dynamicLogoIdx, activeIndices2: dynamicLogoIdx2 });
    }

    if (!window._fgState.bgLayerAboveDrawings) drawExportBgLayer(ctx, 0, outHeaderH, w, bodyH, 'grid');
    drawExportBgPattern(ctx, 0, outHeaderH, w, bodyH, 'grid');

    const _cells = [];
    coloramaSetCellCount(cellCount);
    for (let c = 0; c < cellCount; c++) {
      const col = c % window._fgState.gridCols;
      const row = Math.floor(c / window._fgState.gridCols);

      const exactX1 = Math.floor(offsetX + col * (frameW + gapX));
      const exactY1 = Math.floor(offsetY + row * (frameH + gapY));
      const exactX2 = Math.floor(offsetX + (col + 1) * frameW + col * gapX);
      const exactY2 = Math.floor(offsetY + (row + 1) * frameH + row * gapY);

      const x = exactX1;
      const y = exactY1;
      const cellDrawW = (gapX > 0) ? Math.ceil(frameW) : (exactX2 - exactX1 + 1);
      const cellDrawH = (gapY > 0) ? Math.ceil(frameH) : (exactY2 - exactY1 + 1);

      const uiC = c + (0);
      const cellInfo = getFrameCellInfo(c, tick, {
        cellCount,
        cellOrderIdx: cellOrderMap.get(c),
        shuffle: window._fgState.animDirShuffle,
        skipEnsureShuffle: true
      });
      const baseOffset = cellInfo.baseOffset;
      const animFrameIdx = cellInfo.frameIdx;
      const frame = window._fgState.frames[animFrameIdx];
      const img = frameImages ? frameImages[animFrameIdx] : null;

      if (!drawingsOnly && img) {
        // Actually, just passing the exact integer dimensions completely solves it!
        drawFrameCell(ctx, img, x, y, cellDrawW, cellDrawH);
        const _st = window._fgState;
        const _gIdx = buildChronoGhostIndicesRaw(tick, baseOffset, frameCount,
          _st.animDirection, _st.animDirShuffle,
          _st.chronoDepth||3, Math.max(1,_st.chronoStride||1),
          !!_st.chronoCleanLoop, _st.frames.length);
        const _seamInfo = getChronoSeamForCell(c, tick, {
          frameCount,
          cellCount,
          cellOrderIdx: cellOrderMap.get(c),
          shuffle: window._fgState.animDirShuffle,
          dir: _st.animDirection,
          mode: 'grid',
          skipEnsureShuffle: true
        });
        drawChronophotoStack(ctx, _gIdx, x, y, cellDrawW, cellDrawH, {
          opacityScale: getChronoCurrentOpacityScale(_seamInfo)
        });
        drawFrameDiffStack(ctx, x, y, cellDrawW, cellDrawH, frameImages);
        applyColoramaToCanvas(ctx, x, y, cellDrawW, cellDrawH, img, coloramaFilterId(c));
        drawChronoSeamBlend(ctx, _seamInfo, x, y, cellDrawW, cellDrawH, frameImages, coloramaFilterId(c));
      }
      _cells.push({ c, uiC, x, y, frameW: cellDrawW, frameH: cellDrawH, animFrameIdx, frame });
    }

    try { audioExportSimFromCells(_cells, tick); } catch (e) {}

    for (const cell of _cells) {
      const { x, y, frameW, frameH, animFrameIdx } = cell;
      if (window._fgState.refFrameAboveDrawings) {
        drawExportDrawings(ctx, x, y, frameW, frameH, animFrameIdx);
        drawExportRefFrame(ctx, x, y, frameW, frameH);
      } else {
        drawExportRefFrame(ctx, x, y, frameW, frameH);
        drawExportDrawings(ctx, x, y, frameW, frameH, animFrameIdx);
      }
    }

    if (window._fgState.bgLayerAboveDrawings) drawExportBgLayer(ctx, 0, outHeaderH, w, bodyH, 'grid');

    for (const cell of _cells) {
      const { x, y, frameW, frameH, animFrameIdx, frame } = cell;
      if (computeShowTimecode() && frame) drawTimecodeOverlay(ctx, x, y, frameW, frameH, frame, getDerivedIndexFromFrameIdx(animFrameIdx), cellCount, animFrameIdx);
      try { drawExportAudioLayerCell(ctx, cell, tick, window._fgState.animFps); } catch (e) {}
    }
  }

function drawExportBgPattern(ctx, dstX, dstY, dstW, dstH, mode = 'grid', visualScale = 1) {
    if (!state.bgGridShow || dstW <= 0 || dstH <= 0) return;

    const baseStep = Math.max(2, Number(state.bgGridSize) || 24);
    const normScale = Math.max(0.001, Number(visualScale) || 1);
    const step = Math.max(2, baseStep / normScale);
    const color = hexToRgba(state.bgGridColor || '#ffffff', Math.max(0, Math.min(1, Number(state.bgGridOpacity) || 0)));
    const startX = dstX;
    const startY = dstY;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1;

    if ((state.bgGridType || 'lines') === 'dots') {
      const radius = Math.max(0.75, step * 0.08);
      for (let y = startY + step * 0.5; y <= dstY + dstH + step; y += step) {
        for (let x = startX + step * 0.5; x <= dstX + dstW + step; x += step) {
          if (x < dstX - radius || y < dstY - radius) continue;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      ctx.beginPath();
      for (let x = startX; x <= dstX + dstW + step; x += step) {
        ctx.moveTo(Math.round(x) + 0.5, dstY);
        ctx.lineTo(Math.round(x) + 0.5, dstY + dstH);
      }
      for (let y = startY; y <= dstY + dstH + step; y += step) {
        ctx.moveTo(dstX, Math.round(y) + 0.5);
        ctx.lineTo(dstX + dstW, Math.round(y) + 0.5);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

function drawExportBgLayer(ctx, dstX, dstY, dstW, dstH, mode = 'grid') {
    if (!state.exportBgLayer) return;
    const cnv = (mode === 'single') ? bgCanvasSingle : bgCanvas;
    if (!cnv || !cnv.width || !cnv.height) return;

    const crop = (mode === 'single') ? state._exportBgCropSingle : state._exportBgCropGrid;

    try {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      if (crop && Number.isFinite(crop.sx) && Number.isFinite(crop.sy) && Number.isFinite(crop.sw) && Number.isFinite(crop.sh) && crop.sw > 1 && crop.sh > 1) {
        // Draw only the relevant part of BG canvas (keeps margins/padding consistent)
        const sx = Math.max(0, Math.min(cnv.width - 1, crop.sx));
        const sy = Math.max(0, Math.min(cnv.height - 1, crop.sy));
        const sw = Math.max(1, Math.min(cnv.width - sx, crop.sw));
        const sh = Math.max(1, Math.min(cnv.height - sy, crop.sh));
        ctx.drawImage(cnv, sx, sy, sw, sh, dstX, dstY, dstW, dstH);
      } else {
        // Fallback: stretch full BG canvas
        ctx.drawImage(cnv, 0, 0, cnv.width, cnv.height, dstX, dstY, dstW, dstH);
      }

      ctx.restore();
    } catch (e) {}
  }


  function drawExportDrawings(ctx, x, y, w, h, frameIdx) {
    if (!state.exportDrawings) return;

    // Template layer (same for every frame)
    if (tplCanvas && tplCanvas.width && tplCanvas.height) {
      ctx.drawImage(tplCanvas, x, y, w, h);
    }

    // Per-frame layer (frame sheet)
    if (frameSheetCanvas && frameSheetCanvas.width && frameSheetCanvas.height) {
      const tw = state.frameSheetTileW || 1;
      const th = state.frameSheetTileH || 1;
      const cols = state.frameSheetCols || 1;
      if (tw > 0 && th > 0 && cols > 0 && Number.isFinite(frameIdx)) {
        const sx = (frameIdx % cols) * tw;
        const sy = Math.floor(frameIdx / cols) * th;
        ctx.drawImage(frameSheetCanvas, sx, sy, tw, th, x, y, w, h);
      }
    }
  }

  
  // ==================== EXPORT: AUDIO LAYER (VISUAL) ====================
  

  function audioExportReset() {
    state._audioExportLastByCell = {};
    state._audioExportHitByCell = {};
  }

  function audioExportSimFromCells(cells, tick) {
    // Updates export hit-state and optionally triggers audio for AV recording.
    if (!state.audioSeq) return;
    const playheads = state.audioSeq.playheads || [];
    if (!playheads.length) return;
    const frameMap = state.audioSeq.frameMap || {};
    const lastBy = state._audioExportLastByCell || (state._audioExportLastByCell = {});
    const hitBy = state._audioExportHitByCell || (state._audioExportHitByCell = {});

    // Build quick lookup cellIdx -> cell
    const byIdx = {};
    for (let i = 0; i < cells.length; i++) {
      const k = (typeof cells[i].uiC === 'number') ? cells[i].uiC : cells[i].c;
      byIdx[k] = cells[i];
    }

    for (let i = 0; i < playheads.length; i++) {
      const cellIdx = playheads[i];
      const cell = byIdx[cellIdx];
      if (!cell) continue;

      const frameIdx = cell.animFrameIdx;
      const last = lastBy[cellIdx];
      if (last === frameIdx) continue;
      lastBy[cellIdx] = frameIdx;

      const m = frameMap[String(frameIdx)];
      if (!m) continue;

      const slot = Math.max(0, Math.min(3, m.slot|0));
      const vel = Number.isFinite(m.vel) ? clamp01(m.vel) : 1;

      // store hit for visual pulse
      hitBy[cellIdx] = { tick, slot };

      // optional audio trigger during WebM recording
      if (state._audioExportDoTrigger) {
        audioTriggerSlot(slot, vel);
      }
    }
  }

  function drawExportAudioLayerCell(ctx, cell, tick, fps) {
    // Export toggle is global, but AudioSeq visibility toggles control what is drawn inside the layer.
    if (!state.exportAudioLayer) return;
    if (!state.audioSeq) return;

    const playheads = state.audioSeq.playheads || [];
    if (!playheads.length) return;

    const cellIdx = (typeof cell.uiC === 'number') ? cell.uiC : cell.c;
    if (playheads.indexOf(cellIdx) < 0) return;

    const x = cell.x, y = cell.y, w = cell.frameW, h = cell.frameH;

    const phOn = (state.audioSeq.previewShowPlayhead !== false);
    const flOn = (state.audioSeq.previewShowFlash !== false);
    const lbOn = (state.audioSeq.previewShowLabels !== false);

    // Play cell frame (white, consistent)
    if (phOn) {
      ctx.save();
      ctx.lineWidth = Math.max(2, Math.round(Math.min(w, h) * 0.012));
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      const inset = Math.max(6, Math.round(Math.min(w, h) * 0.06));
      ctx.strokeRect(x + inset, y + inset, w - inset*2, h - inset*2);
      ctx.restore();
    }

    // Flash pulse (sample color)
    if (flOn) {
      const hit = state._audioExportHitByCell ? state._audioExportHitByCell[cellIdx] : null;
      if (hit && Number.isFinite(hit.tick)) {
        const pulseFrames = Math.max(1, Math.round((0.16) * (fps || state.animFps || 12)));
        const age = tick - hit.tick;
        if (age >= 0 && age <= pulseFrames) {
          const k = 1 - (age / pulseFrames);
          const inten = (state.audioSeq && typeof state.audioSeq.flashIntensity === 'number')
            ? Math.max(0, Math.min(1, state.audioSeq.flashIntensity))
            : 0.85;
          const a = (0.85 * inten) * k;
          const c = (state.audioSeq.colors && state.audioSeq.colors[hit.slot]) ? state.audioSeq.colors[hit.slot] : '#ffffff';
          ctx.save();
          ctx.fillStyle = hexToRgba(c, a);
          ctx.fillRect(x, y, w, h);
          ctx.restore();
        }
      }
    }

    // Labels for mapped frames
    if (lbOn) {
      const m = state.audioSeq.frameMap ? state.audioSeq.frameMap[String(cell.animFrameIdx)] : null;
      if (m && Number.isFinite(m.slot)) {
        const slot = Math.max(0, Math.min(3, m.slot|0));
        const label = 'S' + (slot + 1);
        const c = (state.audioSeq.colors && state.audioSeq.colors[slot]) ? state.audioSeq.colors[slot] : '#ffffff';
        const fs = Math.max(10, Math.round(Math.min(w, h) * 0.11));
        const pad = Math.max(3, Math.round(fs * 0.25));
        ctx.save();
        ctx.font = `600 ${Math.round(fs * 0.55)}px system-ui, -apple-system, Segoe UI, sans-serif`;
        const tw = ctx.measureText(label).width;
        const bw = tw + pad*2 + 6;
        const bh = Math.round(fs * 0.75) + pad*2;
        const bx = x + w - bw - 6;
        const by = y + h - bh - 6;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText(label, bx + pad + 6, by + bh - pad - 3);
        ctx.fillStyle = hexToRgba(c, 0.95);
        ctx.fillRect(bx, by, 4, bh);
        ctx.restore();
      }
    }
  }


  // Renders a stack of Chronophoto overlays for a specific base frame
  // drawChronophotoStack → top-level

function buildCCFilter() {
  var cc = (window._fgState || {}).cc;
  if (!cc || !cc.enabled) return 'none';
  var b = isFinite(cc.brightness) ? cc.brightness : 1;
  var c = isFinite(cc.contrast)   ? cc.contrast   : 1;
  var s = isFinite(cc.saturation) ? cc.saturation : 1;
  var h = isFinite(cc.hue)        ? cc.hue        : 0;
  var parts = ['brightness(' + b + ')', 'contrast(' + c + ')', 'saturate(' + s + ')', 'hue-rotate(' + h + 'deg)'];
  if (cc.invert) parts.push('invert(1)');
  return parts.join(' ');
}

// Update SVG gradient map tableValues from 3 color stops + lightness offset

// ── COLORAMA ENGINE ──────────────────────────────────────────────────────────

function coloramaHexToRgb(hex) {
  return [
    parseInt(hex.slice(1,3),16)/255,
    parseInt(hex.slice(3,5),16)/255,
    parseInt(hex.slice(5,7),16)/255
  ];
}

// Build N-point LUT for one offset value
function coloramaBuildLUT(colorA, colorB, colorC, offset) {
  var N = 32;
  var rVals = [], gVals = [], bVals = [];
  var A = coloramaHexToRgb(colorA);
  var B = coloramaHexToRgb(colorB);
  var C = coloramaHexToRgb(colorC);
  for (var i = 0; i < N; i++) {
    var t = ((i / (N - 1)) + offset + 4) % 1;
    var r, g, b;
    if (t < 0.5) {
      var u = t / 0.5;
      r = A[0]+(B[0]-A[0])*u; g = A[1]+(B[1]-A[1])*u; b = A[2]+(B[2]-A[2])*u;
    } else {
      var u = (t-0.5)/0.5;
      r = B[0]+(C[0]-B[0])*u; g = B[1]+(C[1]-B[1])*u; b = B[2]+(C[2]-B[2])*u;
    }
    rVals.push(Math.max(0,Math.min(1,r)).toFixed(4));
    gVals.push(Math.max(0,Math.min(1,g)).toFixed(4));
    bVals.push(Math.max(0,Math.min(1,b)).toFixed(4));
  }
  return { r: rVals.join(' '), g: gVals.join(' '), b: bVals.join(' ') };
}

// Build one SVG <filter> string for a given id and offset
function coloramaBuildFilterSVG(id, lut, opacity, blendMode) {
  // feFuncA slope controls opacity of the mapped layer
  // feBlend merges mapped layer over SourceGraphic with the chosen mode
  var opSlope = Math.max(0, Math.min(1, isFinite(opacity) ? opacity : 1)).toFixed(4);
  var svgBlend = blendMode || 'normal';
  return '<filter id="' + id + '" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">' +
    '<feColorMatrix type="matrix" ' +
      'values="0.2126 0.7152 0.0722 0 0 ' +
              '0.2126 0.7152 0.0722 0 0 ' +
              '0.2126 0.7152 0.0722 0 0 ' +
              '0      0      0      1 0" result="gray"/>' +
    '<feComponentTransfer in="gray" result="colored">' +
      '<feFuncR type="table" tableValues="' + lut.r + '"/>' +
      '<feFuncG type="table" tableValues="' + lut.g + '"/>' +
      '<feFuncB type="table" tableValues="' + lut.b + '"/>' +
    '</feComponentTransfer>' +
    '<feComponentTransfer in="colored" result="faded">' +
      '<feFuncA type="linear" slope="' + opSlope + '" intercept="0"/>' +
    '</feComponentTransfer>' +
    '<feBlend in="SourceGraphic" in2="faded" mode="' + svgBlend + '"/>' +
    '</filter>';
}

// Master update: rebuild all needed SVG filters
// Filters: #fgColorama-{i} for i = 0..totalCells-1 (cascade)
//          #fgColorama (single, no cascade)
function updateColoramaSVG() {
  var defs = document.getElementById('coloramaDefs');
  if (!defs) return;
  var ca = (window._fgState || {}).colorama;
  if (!ca) return;

  var opacity   = isFinite(ca.opacity) ? ca.opacity : 1;
  var blend     = ca.blend    || 'normal';
  var baseOff   = ca.offset   || 0;
  var cascade   = !!ca.cascade;
  var cascadeAmt = isFinite(ca.cascadeAmt) ? ca.cascadeAmt : 1;
  var colorA    = ca.colorA   || '#0a0a2e';
  var colorB    = ca.colorB   || '#ff4400';
  var colorC    = ca.colorC   || '#ffee00';

  // Count cells
  var totalCells = (window._fgCellCount) || 1;

  var html = '';

  if (!cascade) {
    // Single shared filter
    var lut = coloramaBuildLUT(colorA, colorB, colorC, baseOff);
    html = coloramaBuildFilterSVG('fgColorama', lut, opacity, blend);
  } else {
    // Per-cell filters with offset spread over cascadeAmt
    for (var i = 0; i < totalCells; i++) {
      var cellOffset = baseOff + (totalCells > 1 ? (i / (totalCells - 1)) * cascadeAmt : 0);
      var lut = coloramaBuildLUT(colorA, colorB, colorC, cellOffset);
      html += coloramaBuildFilterSVG('fgColorama-' + i, lut, opacity, blend);
    }
    // Also build base filter for export (uses index 0)
    var lut0 = coloramaBuildLUT(colorA, colorB, colorC, baseOff);
    html += coloramaBuildFilterSVG('fgColorama', lut0, opacity, blend);
  }

  defs.innerHTML = html;
  updateColoramaBar();
}

// Return correct filter id for a given cell index
function coloramaFilterId(cellIdx) {
  var ca = (window._fgState || {}).colorama;
  if (!ca || !ca.cascade) return 'fgColorama';
  return 'fgColorama-' + cellIdx;
}

// Expose cell count so updateColoramaSVG knows how many filters to build
function coloramaSetCellCount(n) {
  window._fgCellCount = Math.max(1, n);
}

// Update the gradient preview bar
function updateColoramaBar() {
  var bar = document.getElementById('coloramaBar');
  if (!bar) return;
  var ca = (window._fgState || {}).colorama;
  if (!ca) return;
  var ctx = bar.getContext('2d');
  var W = bar.width;
  ctx.clearRect(0, 0, W, bar.height);
  var grd = ctx.createLinearGradient(0, 0, W, 0);
  var N = 32;
  for (var i = 0; i <= N; i++) {
    var t = i / N;
    var tOff = ((t + (ca.offset||0)) + 4) % 1;
    var A = coloramaHexToRgb(ca.colorA||'#0a0a2e');
    var B = coloramaHexToRgb(ca.colorB||'#ff4400');
    var C = coloramaHexToRgb(ca.colorC||'#ffee00');
    var r, g, b;
    if (tOff < 0.5) {
      var u = tOff/0.5; r=A[0]+(B[0]-A[0])*u; g=A[1]+(B[1]-A[1])*u; b=A[2]+(B[2]-A[2])*u;
    } else {
      var u=(tOff-0.5)/0.5; r=B[0]+(C[0]-B[0])*u; g=B[1]+(C[1]-B[1])*u; b=B[2]+(C[2]-B[2])*u;
    }
    grd.addColorStop(t,'rgb('+Math.round(r*255)+','+Math.round(g*255)+','+Math.round(b*255)+')');
  }
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, bar.height);
}

// Apply colorama to canvas for export (single frame, given cell offset)
function applyColoramaToCanvas(ctx, x, y, w, h, srcImg, filterId) {
  var ca = (window._fgState || {}).colorama;
  if (!ca || !ca.enabled || !srcImg) return;
  var fid = filterId || 'fgColorama';
  var blend   = ca.blend   || 'normal';
  var opacity = isFinite(ca.opacity) ? ca.opacity : 1;
  ctx.save();
  // Opacity + blend handled inside SVG filter via feBlend + feFuncA
  // So here we draw at full alpha
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.filter = 'url(#' + fid + ')';
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  var st = window._fgState;
  var sx = st.frameImgScaleX !== undefined ? Number(st.frameImgScaleX) : (Number(st.frameImgScale)||1);
  var sy = st.frameImgScaleY !== undefined ? Number(st.frameImgScaleY) : (Number(st.frameImgScale)||1);
  var ox = (Number(st.frameImgOffX)||0)*0.01*w;
  var oy = (Number(st.frameImgOffY)||0)*0.01*h;
  var srcW = srcImg.videoWidth||srcImg.naturalWidth||srcImg.width||1;
  var srcH = srcImg.videoHeight||srcImg.naturalHeight||srcImg.height||1;
  var contain = Math.min(w/Math.max(1,srcW), h/Math.max(1,srcH));
  var dw = srcW*contain*sx, dh = srcH*contain*sy;
  var dx = x+w/2-dw/2+ox, dy = y+h/2-dh/2+oy;
  ctx.translate(dx+dw/2, dy+dh/2);
  ctx.rotate((Number(st.frameImgRot)||0)*Math.PI/180);
  ctx.drawImage(srcImg, -dw/2, -dh/2, dw, dh);
  ctx.filter = 'none';
  ctx.restore();
}


// Ghost indices for STILL exports (JPEG/PNG): direct frame index offset.
// No direction logic — ghost = "N frames earlier in the source clip"
function buildChronoGhostIndicesStill(frameIdx, n) {
  var _st = window._fgState;
  var depth     = _st.chronoDepth  || 3;
  var stride    = Math.max(1, _st.chronoStride || 1);
  var cleanLoop = !!_st.chronoCleanLoop;
  var indices   = [];
  for (var step = 1; step <= depth; step++) {
    var raw = frameIdx - step * stride;
    if (cleanLoop && raw < 0) {
      indices.push(null);
    } else {
      indices.push(((raw % n) + n) % n);
    }
  }
  return indices;
}

// Top-level ghost index builder for canvas render (no closure needed)

function _fgNormalizeTick(tick, frameCount, dir) {
  if (tick >= 0) return tick;
  let cycle = frameCount;
  if (dir === 'pingpong' || dir === 'bounce-offset') {
    cycle = frameCount > 1 ? (frameCount - 1) * 2 : 1;
  } else if (dir === 'stutter' || dir === 'holdskip') {
    cycle = frameCount * 2;
  } else if (dir === 'shuffleloop') {
    cycle = frameCount * frameCount;
  }
  // Make positive by adding a large enough multiple of the cycle
  const multiples = Math.ceil(-tick / cycle);
  return tick + multiples * cycle;
}

function buildChronoGhostIndicesRaw(tick, baseOffset, frameCount, dir, shuffle, depth, stride, cleanLoop, n) {
  var indices = [];
  var resolve = window._fgResolveFrame;
  for (var step = 1; step <= depth; step++) {
    var ghostTick = tick - step * stride;
    if (cleanLoop && ghostTick < 0) {
      indices.push(null);
    } else {
      // Normalize negative ticks to maintain true looping history across all direction modes
      var normGhost = typeof _fgNormalizeTick === 'function' ? _fgNormalizeTick(ghostTick, frameCount, dir) : Math.max(0, ghostTick);
      var ghostFrame;
      if (resolve) {
        ghostFrame = resolve(normGhost, baseOffset, frameCount, dir, shuffle);
      } else {
        // Fallback: forward only
        ghostFrame = ((normGhost + baseOffset) % n + n) % n;
      }
      indices.push(Math.min(ghostFrame, n - 1));
    }
  }
  return indices;
}


function drawChronophotoStack(ctx, ghostIndices, x, y, w, h, opts = {}) {
  if (!window._fgState.chronoEnabled || !window._fgState.frames.length) return;
  if (!ghostIndices || !ghostIndices.length) return;

  const blendMode = window._fgState.chronoBlend  || 'screen';
  const alphaBase = (window._fgState.chronoOpacity !== undefined) ? window._fgState.chronoOpacity : 1.0;
  const opacityScale = Number.isFinite(Number(opts.opacityScale)) ? Math.max(0, Math.min(1, Number(opts.opacityScale))) : 1;
  if (opacityScale <= 0) return;
  const depth     = ghostIndices.length;
  const frameImages = opts.frameImages || null;
  const filterId = opts.filterId || 'fgColorama';

  ctx.save();
  ctx.globalCompositeOperation = blendMode;

  for (let step = 0; step < depth; step++) {
    const ghostFrameIdx = ghostIndices[step];
    if (ghostFrameIdx === null) continue;

    const frame = window._fgState.frames[ghostFrameIdx];
    if (!frame) continue;

    let img = frameImages && frameImages[ghostFrameIdx] ? frameImages[ghostFrameIdx] : null;
    if (!img) {
      const src = getFrameDataUrl(frame);
      if (!src) continue;
      img = frame.img || (frame.img = new Image());
      if (img.src !== src) img.src = src;
    }
    if (!img.naturalWidth && !img.videoWidth && !img.width) continue;

    let finalOpacity = alphaBase;
    if (window._fgState.chronoCascade) {
      finalOpacity = computeCascadeOpacity(step, depth, alphaBase);
    }
    ctx.globalAlpha = finalOpacity * opacityScale;

    const _st = window._fgState;
    const sx = _st.frameImgScaleX !== undefined ? Number(_st.frameImgScaleX) : (Number(_st.frameImgScale) || 1);
    const sy = _st.frameImgScaleY !== undefined ? Number(_st.frameImgScaleY) : (Number(_st.frameImgScale) || 1);
    const ox = (Number(_st.frameImgOffX) || 0) * 0.01 * w;
    const oy = (Number(_st.frameImgOffY) || 0) * 0.01 * h;
    const srcW = img.videoWidth || img.naturalWidth || img.width || 1;
    const srcH = img.videoHeight || img.naturalHeight || img.height || 1;
    const contain = Math.min(w / Math.max(1, srcW), h / Math.max(1, srcH));
    const dw = srcW * contain * sx;
    const dh = srcH * contain * sy;
    const dx = x + w/2 - dw/2 + ox;
    const dy = y + h/2 - dh/2 + oy;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(dx + dw/2, dy + dh/2);
    ctx.rotate((Number(_st.frameImgRot) || 0) * Math.PI / 180);

    const _ccf3 = (_st.cc && _st.cc.enabled) ? buildCCFilter() : 'none';
    const _caf3 = (_st.colorama && _st.colorama.enabled) ? ' url(#' + filterId + ')' : '';
    ctx.filter = (_ccf3 === 'none' && !_caf3) ? 'none' : (_ccf3 === 'none' ? _caf3.trim() : _ccf3 + _caf3);
    ctx.drawImage(img, -dw/2, -dh/2, dw, dh);
    ctx.filter = 'none';
    ctx.restore();
  }
  ctx.restore();
}


function drawFrameDiffStack(ctx, x, y, w, h, frameImages) {
  if (!window._fgState.frameDiffEnabled || !window._fgState.frames.length) return;

  const n      = window._fgState.frames.length;
  const pIdx   = Math.max(0, Math.min(n - 1, window._fgState.frameDiffPlateIdx || 0));
  const blend  = window._fgState.frameDiffBlend   || 'difference';
  const alpha  = (window._fgState.frameDiffOpacity !== undefined) ? window._fgState.frameDiffOpacity : 1.0;
  const frame  = window._fgState.frames[pIdx];
  if (!frame) return;

  var img;
  if (frameImages && frameImages[pIdx]) {
    img = frameImages[pIdx];
    if (!img.naturalWidth && !img.videoWidth && !img.width) return;
  } else {
    var src = getFrameDataUrl(frame);
    if (!src) return;
    img = frame._diffImg || (frame._diffImg = new Image());
    if (img.src !== src) img.src = src;
    if (!img.naturalWidth) return;
  }

  const sx = window._fgState.frameImgScaleX !== undefined ? Number(window._fgState.frameImgScaleX) : (Number(window._fgState.frameImgScale) || 1);
  const sy = window._fgState.frameImgScaleY !== undefined ? Number(window._fgState.frameImgScaleY) : (Number(window._fgState.frameImgScale) || 1);
  const ox = (Number(window._fgState.frameImgOffX) || 0) * 0.01 * w;
  const oy = (Number(window._fgState.frameImgOffY) || 0) * 0.01 * h;

  const srcW = img.videoWidth || img.naturalWidth || img.width || 1;
  const srcH = img.videoHeight || img.naturalHeight || img.height || 1;

  const contain = Math.min(w / Math.max(1, srcW), h / Math.max(1, srcH));
  const dw = srcW * contain * sx;
  const dh = srcH * contain * sy;
  const dx = x + w / 2 - dw / 2 + ox;
  const dy = y + h / 2 - dh / 2 + oy;

  ctx.save();
  ctx.globalCompositeOperation = blend;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(dx + dw / 2, dy + dh / 2);
  ctx.rotate((Number(window._fgState.frameImgRot) || 0) * Math.PI / 180);
  var _st2 = window._fgState;
  var _ccf2 = (_st2 && _st2.cc && _st2.cc.enabled) ? buildCCFilter() : 'none';
  var _caf2 = (_st2 && _st2.colorama && _st2.colorama.enabled) ? ' url(#fgColorama)' : '';
  ctx.filter = (_ccf2 === 'none' && !_caf2) ? 'none' : (_ccf2 === 'none' ? _caf2.trim() : _ccf2 + _caf2);
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.filter = 'none';
  ctx.restore();
}

function drawFrameCell(ctx, img, x, y, w, h) {
    if (!img) return;

    const sx = window._fgState.frameImgScaleX !== undefined ? Number(window._fgState.frameImgScaleX) : (Number(window._fgState.frameImgScale) || 1);
    const sy = window._fgState.frameImgScaleY !== undefined ? Number(window._fgState.frameImgScaleY) : (Number(window._fgState.frameImgScale) || 1);
    const ox = (Number(window._fgState.frameImgOffX) || 0) * 0.01 * w;
    const oy = (Number(window._fgState.frameImgOffY) || 0) * 0.01 * h;

    let srcW = 0;
    let srcH = 0;

    // Best-effort media dims
    if (img.videoWidth && img.videoHeight) {
      srcW = img.videoWidth;
      srcH = img.videoHeight;
    } else if (img.naturalWidth && img.naturalHeight) {
      srcW = img.naturalWidth;
      srcH = img.naturalHeight;
    } else if (img.width && img.height) {
      srcW = img.width;
      srcH = img.height;
    } else {
      srcW = Number(window._fgState.videoWidth) || 1;
      srcH = Number(window._fgState.videoHeight) || 1;
    }

    srcW = Math.max(1, Number(srcW) || 1);
    srcH = Math.max(1, Number(srcH) || 1);

    // Match UI behavior: object-fit contain, then apply Scale + Offset.
    const contain = Math.min(w / srcW, h / srcH);
    const dw = srcW * contain * sx;
    const dh = srcH * contain * sy;
    const dx = x + (w - dw) / 2 + ox;
    const dy = y + (h - dh) / 2 + oy;

    ctx.save();
    const op = window._fgState.frameBgOpacity !== undefined ? window._fgState.frameBgOpacity : 1;
    ctx.fillStyle = hexToRgba(window._fgState.frameBgColor || '#000000', op);
    if (op > 0) ctx.fillRect(x, y, w, h);
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const _smPrev = ctx.imageSmoothingEnabled;

    const cx = dx + dw / 2;
    const cy = dy + dh / 2;
    ctx.translate(cx, cy);
    ctx.rotate((Number(window._fgState.frameImgRot) || 0) * Math.PI / 180);
    ctx.globalAlpha = window._fgState.frameImgOpacity !== undefined ? Number(window._fgState.frameImgOpacity) : 1;
    const _ccf = buildCCFilter();
    ctx.filter = _ccf;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;

    ctx.imageSmoothingEnabled = _smPrev;
    ctx.restore();
  }

function getFrameImageForCanvas(frameIdx, frameImages) {
    const n = window._fgState.frames.length;
    if (!n) return null;
    const idx = normalizeFrameIndex(frameIdx, n);
    if (frameImages && frameImages[idx]) return frameImages[idx];
    const frame = window._fgState.frames[idx];
    if (!frame) return null;
    const src = getFrameDataUrl(frame);
    if (!src) return null;
    const img = frame.img || (frame.img = new Image());
    if (img.src !== src) img.src = src;
    return img;
  }

function drawFrameImageOverlay(ctx, img, x, y, w, h, alpha = 1, filterId = 'fgColorama') {
    if (!img || alpha <= 0) return;

    let srcW = 0;
    let srcH = 0;
    if (img.videoWidth && img.videoHeight) {
      srcW = img.videoWidth;
      srcH = img.videoHeight;
    } else if (img.naturalWidth && img.naturalHeight) {
      srcW = img.naturalWidth;
      srcH = img.naturalHeight;
    } else if (img.width && img.height) {
      srcW = img.width;
      srcH = img.height;
    } else {
      srcW = Number(window._fgState.videoWidth) || 1;
      srcH = Number(window._fgState.videoHeight) || 1;
    }

    srcW = Math.max(1, Number(srcW) || 1);
    srcH = Math.max(1, Number(srcH) || 1);

    const sx = window._fgState.frameImgScaleX !== undefined ? Number(window._fgState.frameImgScaleX) : (Number(window._fgState.frameImgScale) || 1);
    const sy = window._fgState.frameImgScaleY !== undefined ? Number(window._fgState.frameImgScaleY) : (Number(window._fgState.frameImgScale) || 1);
    const ox = (Number(window._fgState.frameImgOffX) || 0) * 0.01 * w;
    const oy = (Number(window._fgState.frameImgOffY) || 0) * 0.01 * h;

    const contain = Math.min(w / srcW, h / srcH);
    const dw = srcW * contain * sx;
    const dh = srcH * contain * sy;
    const dx = x + (w - dw) / 2 + ox;
    const dy = y + (h - dh) / 2 + oy;

    const frameOpacity = window._fgState.frameImgOpacity !== undefined ? Number(window._fgState.frameImgOpacity) : 1;
    const drawAlpha = Math.max(0, Math.min(1, alpha * Math.max(0, Math.min(1, frameOpacity))));
    if (drawAlpha <= 0) return;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = drawAlpha;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(dx + dw / 2, dy + dh / 2);
    ctx.rotate((Number(window._fgState.frameImgRot) || 0) * Math.PI / 180);

    const st = window._fgState;
    const ccf = buildCCFilter();
    const caf = (st.colorama && st.colorama.enabled) ? ' url(#' + (filterId || 'fgColorama') + ')' : '';
    ctx.filter = (ccf === 'none' && !caf) ? 'none' : (ccf === 'none' ? caf.trim() : ccf + caf);
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.filter = 'none';
    ctx.restore();
  }

function drawChronoSeamBlend(ctx, seamInfo, x, y, w, h, frameImages = null, filterId = 'fgColorama') {
    if (!window._fgState.chronoSeamBlend || !seamInfo) return;
    const alpha = Number.isFinite(Number(seamInfo.alpha)) ? Math.max(0, Math.min(1, Number(seamInfo.alpha))) : 0;
    if (alpha <= 0) return;

    const baseOpacity = getChronoSeamBaseOpacity(seamInfo);
    if (baseOpacity > 0) {
      const baseImg = getFrameImageForCanvas(seamInfo.targetFrameIdx, frameImages);
      if (baseImg && (baseImg.naturalWidth || baseImg.videoWidth || baseImg.width)) {
        drawFrameImageOverlay(ctx, baseImg, x, y, w, h, baseOpacity, filterId);
      }
    }

    const ghostOpacityScale = getChronoSeamGhostOpacityScale(seamInfo);
    if (window._fgState.chronoEnabled && ghostOpacityScale > 0 && seamInfo.targetGhostIndices && seamInfo.targetGhostIndices.length) {
      drawChronophotoStack(ctx, seamInfo.targetGhostIndices, x, y, w, h, {
        opacityScale: ghostOpacityScale,
        frameImages,
        filterId
      });
    }
  }

  function drawExportRefFrame(ctx, x, y, w, h) {
    if (!state.refFrameSource) return;
    if (!state.refFrameVisible) return;
    if (!state.refFrameIncludeInExport) return;

    const src = state.refFrameSource;
    let srcW = 1, srcH = 1;
    if (src.videoWidth && src.videoHeight) { srcW = src.videoWidth; srcH = src.videoHeight; }
    else if (src.naturalWidth && src.naturalHeight) { srcW = src.naturalWidth; srcH = src.naturalHeight; }
    else if (src.width && src.height) { srcW = src.width; srcH = src.height; }
    srcW = Math.max(1, Number(srcW) || 1);
    srcH = Math.max(1, Number(srcH) || 1);

    const follow = !!state.refFrameFollowFrameTransform;
    const mainScaleX = follow ? (Number(state.frameImgScaleX) || Number(state.frameImgScale) || 1) : 1;
    const mainScaleY = follow ? (Number(state.frameImgScaleY) || Number(state.frameImgScale) || 1) : 1;
    const mainOffXPct = follow ? (Number(state.frameImgOffX) || 0) : 0;
    const mainOffYPct = follow ? (Number(state.frameImgOffY) || 0) : 0;
    const mainRot = follow ? (Number(state.frameImgRot) || 0) : 0;

    const sx = (Number(state.refFrameScaleX) || Number(state.refFrameScale) || 1) * mainScaleX;
    const sy = (Number(state.refFrameScaleY) || Number(state.refFrameScale) || 1) * mainScaleY;
    const rot = (Number(state.refFrameRot) || 0) + mainRot;
    const alpha = Math.max(0, Math.min(1, Number(state.refFrameOpacity) || 0));

    const contain = Math.min(w / srcW, h / srcH);
    const dw = srcW * contain * sx;
    const dh = srcH * contain * sy;
    const ox = ((Number(state.refFrameOffX) || 0) + mainOffXPct) * 0.01 * w;
    const oy = ((Number(state.refFrameOffY) || 0) + mainOffYPct) * 0.01 * h;
    const dx = x + (w - dw) / 2 + ox;
    const dy = y + (h - dh) / 2 + oy;

    const cx = dx + dw / 2;
    const cy = dy + dh / 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    ctx.translate(cx, cy);
    ctx.rotate(rot * Math.PI / 180);
    ctx.drawImage(src, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }


function renderMp4SingleFrame(ctx, w, h, frameImages, frameIdx, r, g, b, layout, drawingsOnly = false, animTick = null) {
    const headerHLogical = (layout && Number.isFinite(layout.headerH)) ? layout.headerH : (window._fgState.exportShowMetadata ? 36 : 0);
    const sx = (layout && Number.isFinite(layout.scaleX)) ? layout.scaleX : 1;
    const sy = (layout && Number.isFinite(layout.scaleY)) ? layout.scaleY : 1;
    const dxLogical = (layout && Number.isFinite(layout.dx)) ? layout.dx : 0;
    const dyLogical = (layout && Number.isFinite(layout.dy)) ? layout.dy : 0;
    const frameWLogical = (layout && Number.isFinite(layout.frameW)) ? layout.frameW : Math.max(2, w);
    const frameHLogical = (layout && Number.isFinite(layout.frameH)) ? layout.frameH : Math.max(2, h - headerHLogical);
    const outHeaderH = Math.round(headerHLogical * sy);
    const bodyH = Math.max(0, h - outHeaderH);
    const innerX = dxLogical * sx;
    const innerY = outHeaderH + dyLogical * sy;
    const innerW = frameWLogical * sx;
    const innerH = frameHLogical * sy;

    const frame = window._fgState.frames[frameIdx];
    const img = frameImages ? frameImages[frameIdx] : null;
    const frameCount = window._fgState.frames.length;

    if (window._fgState.exportShowMetadata && outHeaderH > 0) {
      const metaText = buildExportMetaText({ mode: 'single', frameW: frameWLogical, frameH: frameHLogical, frames: frameCount, fps: window._fgState.animFps, frameIdx, time: frame?.time || 0, srcW: window._fgState.videoWidth, srcH: window._fgState.videoHeight, duration: window._fgState.videoDuration, date: window._fgState.videoDate });
      drawExportMetadataBar(ctx, w, outHeaderH, metaText, { activeIndices: exportLogoIndices, activeIndices2: exportLogoIndices2 || [] });
    }
    if (!window._fgState.bgLayerAboveDrawings) drawExportBgLayer(ctx, 0, outHeaderH, w, bodyH, 'single');
    drawExportBgPattern(ctx, 0, outHeaderH, w, bodyH, 'single');
    if (!drawingsOnly && img) {
      drawFrameCell(ctx, img, innerX, innerY, innerW, innerH);
      const _st2 = window._fgState;
        const _gIdx2 = buildChronoGhostIndicesRaw(animTick !== null ? animTick : frameIdx, 0, window._fgState.frames.length,
          window._fgState.animDirection, window._fgState.animDirShuffle,
          _st2.chronoDepth||3, Math.max(1,_st2.chronoStride||1),
          !!_st2.chronoCleanLoop, _st2.frames.length);
      const _singleTick = animTick !== null ? animTick : frameIdx;
      const _seamInfoSingle = getChronoSeamForCell(0, _singleTick, {
        frameCount,
        cellCount: 1,
        cellOrderIdx: 0,
        shuffle: window._fgState.animDirShuffle,
        dir: window._fgState.animDirection,
        mode: 'single',
        skipEnsureShuffle: true
      });
      drawChronophotoStack(ctx, _gIdx2, innerX, innerY, innerW, innerH, {
        opacityScale: getChronoCurrentOpacityScale(_seamInfoSingle)
      });
      drawFrameDiffStack(ctx, innerX, innerY, innerW, innerH, frameImages);
      applyColoramaToCanvas(ctx, innerX, innerY, innerW, innerH, img, coloramaFilterId(0));
      drawChronoSeamBlend(ctx, _seamInfoSingle, innerX, innerY, innerW, innerH, frameImages, coloramaFilterId(0));
    }

    if (window._fgState.refFrameAboveDrawings) {
      drawExportDrawings(ctx, innerX, innerY, innerW, innerH, frameIdx);
      drawExportRefFrame(ctx, innerX, innerY, innerW, innerH);
    } else {
      drawExportRefFrame(ctx, innerX, innerY, innerW, innerH);
      drawExportDrawings(ctx, innerX, innerY, innerW, innerH, frameIdx);
    }

    if (window._fgState.bgLayerAboveDrawings) drawExportBgLayer(ctx, 0, outHeaderH, w, bodyH, 'single');
    if (computeShowTimecode() && frame) drawTimecodeOverlay(ctx, innerX, innerY, innerW, innerH, frame, getDerivedIndexFromFrameIdx(frameIdx), Math.ceil(window._fgState.frames.length / Math.max(1, Number(window._fgState.cellSize) || 1)), frameIdx);
  }

  // EXPORT
  // Export PNG sequence at original resolution.
  // If "Drawings in Export" is ON, PNGs are composited (video/image + drawings).
  // If OFF, PNGs contain only the base video/image frames.
async function recordAudioSeqAV(mode = 'grid') {
  window._exportKind = 'mp4';
  window._exportVariant = 'av';
  try {
    if (!state.frames.length) return;
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      alert('AV recording requires MediaRecorder + canvas.captureStream support.');
      return;
    }

    const wasPlaying = !!state.isPlaying;
    if (wasPlaying) { togglePlay(); }

    // Auto-reset tick if enabled
    if (state.exportResetPlay) {
       state.currentTick = 0;
       updateLogoFromTick();
       updateAllCells();
    }

    audioEnsureCtx();
    if (!state._audioCtx) {
      alert('AudioContext not available.');
      return;
    }

    if (!state._audioRecordDest) {
      try {
        state._audioRecordDest = state._audioCtx.createMediaStreamDestination();
        if (state._audioMasterGain) state._audioMasterGain.connect(state._audioRecordDest);
      } catch (e) {}
    }

    let sequence = [];
    const frameCount = state.frames.length;
    if (state.animDirection === 'forward') {
      for (let i = 0; i < frameCount; i++) sequence.push(i);
    } else if (state.animDirection === 'backward') {
      for (let i = frameCount - 1; i >= 0; i--) sequence.push(i);
    } else {
      for (let i = 0; i < frameCount; i++) sequence.push(i);
      for (let i = frameCount - 2; i > 0; i--) sequence.push(i);
    }
    const singleLoop = [...sequence];
    for (let loop = 1; loop < (state.exportLoops || 1); loop++) sequence = sequence.concat(singleLoop);

    const frameAspect = getEffectiveFrameAspect();
    const cellCount = Math.ceil(getEffectiveFrameTargetCount() / Math.max(1, state.cellSize || 1));
    const total = cellCount + (0);
    const rows = Math.ceil(total / state.gridCols);
    const videoLayout = getDeterministicVideoExportLayout(mode, rows);
    const canvasW = videoLayout.canvasW;
    const canvasH = videoLayout.canvasH;
    const layout = videoLayout.layout;

    loadingOverlay.classList.add('visible');
    loadingProgress.textContent = 'Preparing AV recording...';
    const frameImages = await loadFrameImagesWithProgress('Loading frames');

    const cellOrder = generateCellOrder(cellCount, state.gridCols);
    const r = parseInt(state.tcBgColor.slice(1,3), 16);
    const g = parseInt(state.tcBgColor.slice(3,5), 16);
    const b = parseInt(state.tcBgColor.slice(5,7), 16);

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');

    const vStream = canvas.captureStream(state.animFps || 12);
    const vTrack = vStream.getVideoTracks()[0];

    let aTrack = null;
    try {
      const aTracks = state._audioRecordDest && state._audioRecordDest.stream ? state._audioRecordDest.stream.getAudioTracks() : [];
      if (aTracks && aTracks.length) aTrack = aTracks[0];
    } catch (e) {}

    const stream = new MediaStream([vTrack].concat(aTrack ? [aTrack] : []));
    const mime = pickBestMediaRecorderMime();

    const fps = state.animFps || 12;
    const mpix = (canvasW * canvasH) / 1e6;
    let videoBps = Math.round(mpix * fps * 520000);
    videoBps = Math.max(6000000, Math.min(80000000, videoBps));
    if (mime && mime.indexOf('webm') >= 0) videoBps = Math.max(3000000, Math.min(80000000, videoBps * 2));
    const audioBps = 320000;

    let recorder = null;
    try {
      const opts = mime ? { mimeType: mime } : {};
      opts.videoBitsPerSecond = videoBps;
      opts.audioBitsPerSecond = audioBps;
      opts.bitsPerSecond = videoBps + audioBps;
      recorder = new MediaRecorder(stream, opts);
    } catch (e) {
      try { recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
      catch (e2) { recorder = new MediaRecorder(stream); }
    }

    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

    const mimeType = (recorder && recorder.mimeType) ? recorder.mimeType : (mime || '');
    const ext = (mimeType && mimeType.indexOf('mp4') >= 0) ? 'mp4' : 'webm';
    const filename = makeExportFilename({ mode: (mode === 'grid' ? 'grid' : 'single'), ext, frames: state.frames.length, fps: state.animFps, extra: 'AV_AudioSeq' });

    audioExportReset();
    state._audioExportDoTrigger = true;

    try {
      if (state.audioSeq && state.audioSeq.playheads && state.audioSeq.playheads.length) {
        state._audioExportDoTrigger = false;
        ctx.fillStyle = state.bgColor;
        ctx.fillRect(0, 0, canvasW, canvasH);
        if (mode === 'grid') renderMp4GridFrame(ctx, canvasW, canvasH, frameImages, 0, cellOrder, rows, frameAspect, r, g, b, layout, false);
        else renderMp4SingleFrame(ctx, canvasW, canvasH, frameImages, sequence[0], r, g, b, layout, false);
        state._audioExportDoTrigger = true;
      }
    } catch (e) {}

    loadingProgress.textContent = aTrack ? `Recording AV (AudioSeq)... (${Math.round(videoBps/1e6)} Mbps)` : `Recording AV (no audio track)... (${Math.round(videoBps/1e6)} Mbps)`;
    recorder.start(250);

    const stepMs = 1000 / fps;
    let tick = 0;
    const totalTicks = sequence.length;
    const _audioSeqPlayheads = (state.audioSeq && Array.isArray(state.audioSeq.playheads)) ? state.audioSeq.playheads.slice() : [];
    const _audioSeqOffsets = _audioSeqPlayheads.map(cellIdx => {
      const cellOrderIdx = cellOrder.indexOf(cellIdx);
      const rawOffset = (cellOrderIdx >= 0) ? cellOrderIdx : 0;
      const off = getCellBaseFrameOffset(rawOffset, cellCount, frameCount);
      return { cellIdx, off };
    });

    await new Promise((resolve) => {
      const timer = setInterval(() => {
        try {
          if (tick >= totalTicks) {
            clearInterval(timer);
            recorder.stop();
            return;
          }

          ctx.fillStyle = state.bgColor;
          ctx.fillRect(0, 0, canvasW, canvasH);

          if (mode === 'grid') {
            renderMp4GridFrame(ctx, canvasW, canvasH, frameImages, tick, cellOrder, rows, frameAspect, r, g, b, layout, false);
          } else {
            renderMp4SingleFrame(ctx, canvasW, canvasH, frameImages, sequence[tick], r, g, b, layout, false, tick);
            if (_audioSeqOffsets && _audioSeqOffsets.length) {
              try {
                const base = sequence[tick % sequence.length];
                const _cells = _audioSeqOffsets.map(o => ({ uiC: o.cellIdx, animFrameIdx: (base + o.off) % frameCount }));
                audioExportSimFromCells(_cells, tick);
              } catch (e) {}
            }
          }

          tick++;
          loadingProgress.textContent = `Recording ${tick}/${totalTicks}`;
        } catch (e) {
          clearInterval(timer);
          try { recorder.stop(); } catch (e) {}
          resolve();
        }
      }, stepMs);

      recorder.onstop = () => resolve();
    });

    const blob = new Blob(chunks, { type: mimeType || mime || 'video/webm' });
    downloadBlob(blob, filename);

    state._audioExportDoTrigger = false;
    loadingOverlay.classList.remove('visible');
    if (wasPlaying) { togglePlay(); }

  } catch (e) {
    if (state) state._audioExportDoTrigger = false;
    loadingOverlay.classList.remove('visible');
    alert('AV recording failed: ' + (e && e.message ? e.message : e));
  }
}

async function exportPngSeqDrawings() {

    if (!state.frames.length) return;

    loadingOverlay.classList.add('visible');
    loadingProgress.textContent = 'Preparing PNG export...';

    const frameCount = state.frames.length;

    // Output at original source resolution
    const outDims = getTargetFrameOutputDims();
    const outW = outDims.w;
    const outH = outDims.h;

    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = outW;
    tmpCanvas.height = outH;
    const tmpCtx = tmpCanvas.getContext('2d');

    const splitAlpha = !!(state.exportDrawings && state.exportAlphaDrawings);

    // When splitAlpha is enabled, we export two sequences:
    // 1) base frames (video/image) without drawings
    // 2) drawings only, with transparency (alpha)
    let drawCanvas = null;
    let drawCtx = null;
    if (splitAlpha) {
      drawCanvas = document.createElement('canvas');
      drawCanvas.width = outW;
      drawCanvas.height = outH;
      drawCtx = drawCanvas.getContext('2d');
    }

    // Pause playback during export (seeking is used)
    const wasPlaying = !!state.isPlaying;
    if (wasPlaying) {
      state.isPlaying = false;
      try { videoElement && videoElement.pause && videoElement.pause(); } catch (e) {}
      updatePlayButton();
    }

    // Helpers
    const loadImgCached = (() => {
      const cache = new Map();
      return async (url) => {
        if (!url) return null;
        if (cache.has(url)) return cache.get(url);
        const img = new Image();
        img.decoding = 'async';
        img.crossOrigin = 'anonymous';
        const p = new Promise((resolve) => {
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
        });
        img.src = url;
        const res = await p;
        cache.set(url, res);
        return res;
      };
    })();

    const clampTime = (t) => {
      const v = videoElement;
      if (!v) return 0;
      if (!isFinite(t)) return 0;
      if (v.duration && isFinite(v.duration)) {
        // Keep epsilon away from the end to avoid iOS black frames.
        return Math.min(Math.max(t, 0), Math.max(0, v.duration - 0.001));
      }
      return Math.max(t, 0);
    };

    const seekVideo = (t) => {
      const v = videoElement;
      return new Promise((resolve) => {
        if (!v) return resolve(false);
        const target = clampTime(t);
        let done = false;

        const finish = (ok) => {
          if (done) return;
          done = true;
          resolve(ok);
        };

        const onSeeked = () => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => finish(true));
          });
        };

        try {
          v.addEventListener('seeked', onSeeked, { once: true });
          // Fallback in case 'seeked' never fires (iOS edge cases).
          setTimeout(() => finish(true), 300);

          if (Math.abs(v.currentTime - target) < 1e-4) onSeeked();
          else v.currentTime = target;
        } catch (e) {
          finish(false);
        }
      });
    };

    const pngs = [];

    // Pre-load Frame Diff plate image once for whole sequence
    if (state.frameDiffEnabled && state.frames.length) {
      const _dpIdx = Math.max(0, Math.min(state.frames.length - 1, state.frameDiffPlateIdx || 0));
      const _dpFrame = state.frames[_dpIdx];
      if (_dpFrame) {
        const _dpSrc = _dpFrame.dataUrl || getFrameDataUrl(_dpFrame);
        if (_dpSrc) {
          const _dpImg = _dpFrame._diffImg || (_dpFrame._diffImg = new Image());
          if (_dpImg.src !== _dpSrc) _dpImg.src = _dpSrc;
          if (!_dpImg.naturalWidth) await new Promise(r => { _dpImg.onload = r; _dpImg.onerror = r; });
        }
      }
    }
    ensureAnimDirShuffle(frameCount);

    for (let i = 0; i < frameCount; i++) {
      tmpCtx.clearRect(0, 0, outW, outH);
      const _seamInfoPng = getChronoSeamForCell(0, i, {
        frameCount,
        cellCount: 1,
        cellOrderIdx: 0,
        shuffle: state.animDirShuffle,
        dir: state.animDirection,
        mode: 'single',
        skipEnsureShuffle: true
      });
      const _seamCurrentScalePng = getChronoCurrentOpacityScale(_seamInfoPng);

      if (state.isSingleImage) {
        const url = state.frames[i]?.dataUrl || '';
        const img = await loadImgCached(url);
        if (img) drawFrameCell(tmpCtx, img, 0, 0, outW, outH);
        const _gIdxP = buildChronoGhostIndicesStill(i, window._fgState.frames.length);
        drawChronophotoStack(tmpCtx, _gIdxP, 0, 0, outW, outH, {
          opacityScale: _seamCurrentScalePng
        });
        drawFrameDiffStack(tmpCtx, 0, 0, outW, outH, null);
      } else {
        const time = state.frames[i]?.time || 0;
        await seekVideo(time);

        // Always export the base frame. Drawings are optional overlay.
        try {
          drawFrameCell(tmpCtx, videoElement, 0, 0, outW, outH);
          const _gIdxP2 = buildChronoGhostIndicesStill(i, window._fgState.frames.length);
          drawChronophotoStack(tmpCtx, _gIdxP2, 0, 0, outW, outH, {
            opacityScale: _seamCurrentScalePng
          });
          drawFrameDiffStack(tmpCtx, 0, 0, outW, outH, null);
        } catch (e) {
          // If drawImage fails (rare on iOS), leave frame blank.
        }
      }

      await ensureChronoSeamBlendImagesReady(_seamInfoPng);
      drawChronoSeamBlend(tmpCtx, _seamInfoPng, 0, 0, outW, outH, null, coloramaFilterId(0));

      // Optional drawings overlay (composited)
      if (state.exportDrawings && !splitAlpha) {
        drawExportDrawings(tmpCtx, 0, 0, outW, outH, i);
      }

      const blob = await new Promise(r => tmpCanvas.toBlob(r, 'image/png'));
      const fileName = splitAlpha
        ? `frames/frame_${String(i).padStart(4, '0')}.png`
        : `frame_${String(i).padStart(4, '0')}.png`;
      pngs.push({ name: fileName, blob });

      // Drawings-only PNG with alpha (optional)
      if (splitAlpha && drawCtx) {
        drawCtx.clearRect(0, 0, outW, outH);
        drawExportDrawings(drawCtx, 0, 0, outW, outH, i);
        const dBlob = await new Promise(r => drawCanvas.toBlob(r, 'image/png'));
        pngs.push({ name: `drawings/frame_${String(i).padStart(4, '0')}.png`, blob: dBlob });
      }

      loadingProgress.textContent = `Frame ${i + 1}/${frameCount}`;
    }

    // Optional BG layer export as separate PNG files (for annotations)
    if (state.exportBgLayer) {
      // Keep legacy name for GRID BG
      if (bgCanvas && bgCanvas.width > 1 && bgCanvas.height > 1) {
        try {
          const bgBlob = await new Promise(r => bgCanvas.toBlob(r, 'image/png'));
          if (bgBlob) pngs.push({ name: 'bg_layer.png', blob: bgBlob });
        } catch (e) {}
      }
      // Add SINGLE BG if present
      if (bgCanvasSingle && bgCanvasSingle.width > 1 && bgCanvasSingle.height > 1) {
        try {
          const bgBlob2 = await new Promise(r => bgCanvasSingle.toBlob(r, 'image/png'));
          if (bgBlob2) pngs.push({ name: 'bg_layer_single.png', blob: bgBlob2 });
        } catch (e) {}
      }
    }


    // Add metadata bar image into ZIP (requested)
    // This does not affect frames, it only adds a standalone PNG file into the archive.
    if (pngs.length > 1) {
      try {
        const baseHeaderH = 48;
        const metaW = Math.max(2, Math.round(outW));
        const measureCanvas = document.createElement('canvas');
        const mctx = measureCanvas.getContext('2d');
        const metaTextLocal = buildExportMetaText({
          mode: 'sequence',
          frameW: outW,
          frameH: outH,
          frames: frameCount,
          fps: state.animFps,
          srcW: state.videoWidth,
          srcH: state.videoHeight,
          duration: state.videoDuration,
          date: state.videoDate
        });
        const metaH = computeExportMetadataHeaderH(mctx, metaW, baseHeaderH, metaTextLocal);
        const metaCanvas = document.createElement('canvas');
        metaCanvas.width = metaW;
        metaCanvas.height = Math.max(1, metaH);
        const metaCtx = metaCanvas.getContext('2d');
        drawExportMetadataBar(metaCtx, metaW, metaH, metaTextLocal, { activeIndices: exportLogoIndices, activeIndices2: exportLogoIndices2 || [] });
        const metaBlob = await new Promise(r => metaCanvas.toBlob(r, 'image/png'));
        if (metaBlob) pngs.push({ name: 'metadata.png', blob: metaBlob });
      } catch (e) {}
    }


    // Restore playback state
    if (wasPlaying) {
      state.isPlaying = true;
      try { videoElement && videoElement.play && videoElement.play(); } catch (e) {}
      updatePlayButton();
    }

    // If only 1 frame, download directly
    if (pngs.length === 1) {
      const url = URL.createObjectURL(pngs[0].blob);
      const a = document.createElement('a');
      a.href = url;
      const base = state.videoFile?.name?.replace(/\.[^.]+$/, '') || (state.imageFiles?.[0]?.name?.replace(/\.[^.]+$/, '') || 'timegrid');
      a.download = makeExportFilename({ mode: 'assets', ext: 'png', frames: state.frames.length, fps: state.animFps, extra: pngs[0].name.replace(/\.png$/i,'') });
      a.click();
      URL.revokeObjectURL(url);
      loadingOverlay.classList.remove('visible');
      return;
    }

    // Multiple frames: create ZIP
    loadingProgress.textContent = 'Creating ZIP...';

    // Minimal ZIP builder (no external library)
    function createZip(files) {
      const encoder = new TextEncoder();
      const parts = [];
      const centralDir = [];
      let offset = 0;

      for (const file of files) {
        const name = encoder.encode(file.name);
        const data = new Uint8Array(file.data);

        // Local file header
        const header = new Uint8Array(30 + name.length);
        const hv = new DataView(header.buffer);
        hv.setUint32(0, 0x04034b50, true); // sig
        hv.setUint16(4, 20, true); // version needed
        hv.setUint16(6, 0, true); // flags
        hv.setUint16(8, 0, true); // compression: store
        hv.setUint16(10, 0, true); // mod time
        hv.setUint16(12, 0, true); // mod date
        hv.setUint32(14, file.crc, true); // crc32
        hv.setUint32(18, data.length, true); // compressed size
        hv.setUint32(22, data.length, true); // uncompressed size
        hv.setUint16(26, name.length, true); // name length
        header.set(name, 30);

        // Central directory entry
        const cde = new Uint8Array(46 + name.length);
        const cv = new DataView(cde.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint16(8, 0, true);
        cv.setUint16(10, 0, true);
        cv.setUint16(12, 0, true);
        cv.setUint16(14, 0, true);
        cv.setUint32(16, file.crc, true);
        cv.setUint32(20, data.length, true);
        cv.setUint32(24, data.length, true);
        cv.setUint16(28, name.length, true);
        cv.setUint32(42, offset, true); // local header offset
        cde.set(name, 46);

        parts.push(header, data);
        centralDir.push(cde);
        offset += header.length + data.length;
      }

      const cdOffset = offset;
      let cdSize = 0;
      centralDir.forEach(c => cdSize += c.length);

      // End of central directory
      const eocd = new Uint8Array(22);
      const ev = new DataView(eocd.buffer);
      ev.setUint32(0, 0x06054b50, true);
      ev.setUint16(8, files.length, true);
      ev.setUint16(10, files.length, true);
      ev.setUint32(12, cdSize, true);
      ev.setUint32(16, cdOffset, true);

      return new Blob([...parts, ...centralDir, eocd], { type: 'application/zip' });
    }

    // CRC32 table
    const crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c;
    }
    function crc32(data) {
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    const zipFiles = [];
    for (let i = 0; i < pngs.length; i++) {
      const ab = await pngs[i].blob.arrayBuffer();
      const data = new Uint8Array(ab);
      zipFiles.push({ name: pngs[i].name, data, crc: crc32(data) });
    }

    const zipBlob = createZip(zipFiles);

    const baseName =
      state.videoFile?.name?.replace(/\.[^.]+$/, '') ||
      (state.imageFiles?.[0]?.name?.replace(/\.[^.]+$/, '') || 'timegrid');

    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    let tag = '';
    if (state.exportDrawings) tag = (splitAlpha ? '_frames_and_alpha' : '_withDrawing');
    if (state.exportBgLayer) tag += '_bg';
    a.download = makeExportFilename({ mode: 'seq', ext: 'zip', frames: frameCount, fps: state.animFps, extra: ('png' + tag) });
    a.click();
    URL.revokeObjectURL(url);

    loadingOverlay.classList.remove('visible');
  }


  
async function saveBlob(blob, filename, mime = '') {
  // Always download directly (uses browser Downloads settings)
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  } catch (e) {
    return false;
  }
}

function downloadBlob(blob, filename, mime = '') {
  // Alias kept for compatibility with older export helpers
  return saveBlob(blob, filename, mime);
}



// ==============================
// EXPORT METADATA HELPERS (stage2)
// ==============================
function getAccentColor() {
  return state.fgAccentColor || '#35f2a3';
}

function getAccent2Color() {
  return state.accent2Color || '#f28c35';
}

function drawFGLogoCanvas(ctx, x, y, size, activeIndices = [0], activeIndices2 = []) {
  const arr  = Array.isArray(activeIndices)  ? activeIndices  : [activeIndices];
  const arr2 = Array.isArray(activeIndices2) ? activeIndices2 : [];
  // Match CSS proportions: cell=8, gap=1, radius=2
  // Total width = 8*3 + 1*2 = 26 units.
  const unit = size / 26;
  const cell = unit * 8;
  const gap = unit * 1;
  const r_logo = unit * 2;

  const iconW = size;
  const ox = x;
  const oy = y;

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      const cx = ox + c * (cell + gap);
      const cy = oy + r * (cell + gap);
      ctx.fillStyle = arr.includes(idx)
        ? getAccentColor()
        : (arr2.includes(idx) ? getAccent2Color() : 'rgba(255,255,255,0.22)');

      ctx.beginPath();
      if (ctx.roundRect) {
         ctx.roundRect(cx, cy, cell, cell, r_logo);
      } else {
         // Fallback
         ctx.rect(cx, cy, cell, cell);
      }
      ctx.fill();
    }
  }
}



function getMetaBaseName() {
  const v = String(state.filenameOverride || '').trim();
  const raw = v || (state.videoFile && state.videoFile.name) || 'video';
  // Пользователь попросил оставлять расширение (.mov и т.д.)
  return raw || 'video';
}




function padFrameNumber(value, total) {
  const n = Math.max(1, Math.round(Number(value) || 1));
  const t = Math.max(1, Math.round(Number(total) || n));
  const digits = Math.max(3, String(t).length);
  return String(n).padStart(digits, '0');
}

function ellipsizeRight(ctx, text, maxWidth) {
  const raw = String(text || '');
  if (!raw) return '';
  if (ctx.measureText(raw).width <= maxWidth) return raw;
  const ell = '...';
  let lo = 0;
  let hi = raw.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const test = raw.slice(0, mid).replace(/\s+$/, '') + ell;
    if (ctx.measureText(test).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return raw.slice(0, lo).replace(/\s+$/, '') + ell;
}

function getAudioOverlayCounts() {
  const seq = state.audioSeq || {};
  const sampleCount = Array.isArray(seq.samples) ? seq.samples.filter(Boolean).length : 0;
  const playCount = Array.isArray(seq.playheads) ? seq.playheads.length : 0;
  return { sampleCount, playCount };
}

function buildExportMetaText(opts = {}) {
  const mode = String(opts.mode || 'single').trim().toLowerCase();
  const exportKind = String(opts.exportKind || window._exportKind || 'still').trim().toLowerCase();
  let variant = String(opts.variant || window._exportVariant || '').trim().toLowerCase();

  const baseName = String(opts.baseName || (typeof getMetaBaseName === 'function' ? getMetaBaseName() : '')).trim();
  const cols = Math.max(1, Math.round(Number(opts.cols) || state.gridCols || 1));
  const frameCount = Math.max(0, Math.round(Number(opts.frames) || state.frames?.length || 0));
  const rows = Math.max(1, Math.round(Number(opts.rows) || Math.ceil(Math.max(1, frameCount) / cols)));

  const frameW = Math.max(0, Math.round(Number(opts.frameW) || 0));
  const frameH = Math.max(0, Math.round(Number(opts.frameH) || 0));
  const gap = Math.max(0, Number(state.spacing) || 0);

  const fallbackSrcFrames = typeof getApproxSourceFrameCount === 'function' ? getApproxSourceFrameCount() : frameCount;
  const srcFrames = Math.max(0, Math.round(Number(opts.srcFrames) || fallbackSrcFrames));
  const frameIdx = Math.max(0, Math.round(Number(opts.frameIdx) || 0));
  const fps = Math.max(0, Math.round(Number(opts.fps) || 0));

  const { sampleCount, playCount } = getAudioOverlayCounts();

  const fmt = (n) => String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');

  let wCell = frameW;
  let hCell = frameH;
  if (typeof getFrameTileDims === 'function') {
    const d = getFrameTileDims();
    if (d && d.tw && d.th) {
      wCell = Math.round(d.tw);
      hCell = Math.round(d.th);
    }
  }

  const gridW = mode === 'grid' ? (wCell * cols + Math.max(0, cols - 1) * gap) : wCell;
  const gridH = mode === 'grid' ? (hCell * rows + Math.max(0, rows - 1) * gap) : hCell;

  const topParts = [];
  if (mode === 'grid') {
    const ptn = String(state.animPattern || 'sequential').toLowerCase();
    const dir = String(state.animDirection || 'forward').toLowerCase();

    topParts.push(`${fmt(frameCount)}f`);

    const cs = Math.max(1, Number(state.cellSize) || 1);
    const lp = Math.max(1, Number(state.gridLoops) || 1);
    if (cs > 1) topParts.push(`/${cs}`);
    if (lp > 1) topParts.push(`x${lp}`);

    topParts.push(`from`);
    topParts.push(`${fmt(srcFrames)}`);
    topParts.push(`total`);

    topParts.push(`c${cols} r${rows}`);
    topParts.push(dir);
    let outPtn = ptn;
    if (state.flipPatternX && state.flipPatternY) outPtn += ' flipXY';
    else if (state.flipPatternX) outPtn += ' flipX';
    else if (state.flipPatternY) outPtn += ' flipY';
    topParts.push(outPtn);
  } else {
    topParts.push(`f${padFrameNumber(frameIdx + 1, srcFrames)}`);
    topParts.push(`of`);
    topParts.push(`${fmt(srcFrames)}`);
    topParts.push(`total`);
  }

  if (variant === 'av') topParts.push('av');

  const bottomParts = [];
  if (wCell > 0 && hCell > 0) {
    bottomParts.push(`${fmt(wCell)}`);
    bottomParts.push(`×`);
    bottomParts.push(`${fmt(hCell)}`);
    if (mode === 'grid' && gridW > 0 && gridH > 0) {
      bottomParts.push(`grid`);
      bottomParts.push(`${fmt(gridW)}`);
      bottomParts.push(`×`);
      bottomParts.push(`${fmt(gridH)}`);
    }
  }

  if (exportKind === 'mp4' && fps > 0) {
    bottomParts.push(`${fps}fps`);
  }

  if (variant === 'av') {
    if (sampleCount > 0) bottomParts.push(`s${sampleCount}`);
    if (playCount > 0) bottomParts.push(`p${playCount}`);
  } else if (variant === 'rsmpl') {
    // В новой спеке вместо rsmpl пишем audio
    bottomParts.push('audio');
  }

  return {
    topLeft: baseName,
    topRight: topParts.join('  '),
    bottom: bottomParts.join('  ')
  };
}
function getExportMetadataLayout(ctx, w, headerH, metaInput) {
  const h = Number.isFinite(headerH) ? Math.max(0, headerH) : 0;
  if (!h) return { headerH: 0, padX: 0, iconSize: 0, textGap: 0, fontSize: 0, textX: 0, textW: 0, meta: { topLeft: '', topRight: '', bottom: '' } };

  const meta = (metaInput && typeof metaInput === 'object') ? metaInput : { topLeft: '', topRight: '', bottom: '' };

  // Логика охранного поля:
  // Логотип состоит из 3x3 "квадратиков". Отступ со всех сторон должен быть равен 1 квадратику.
  // Итого по вертикали: 1 (отступ) + 3 (лого) + 1 (отступ) = 5 частей.
  const cell = h / 5;
  const padX = cell;
  const iconSize = cell * 3;
  const textGap = cell; // Отступ от лого до текста тоже равен 1 квадратику
  const textX = padX + iconSize + textGap;
  const textW = w - textX - padX;

  // Шрифт на 20% меньше (было 0.48 * iconSize, стало ~0.38)
  let fontSize = iconSize * 0.38;
  const family = 'system-ui, -apple-system, Segoe UI, Roboto, Arial';

  const topRight = String(meta.topRight || '');
  const topLeft = String(meta.topLeft || '');
  const bottom = String(meta.bottom || '');

  ctx.font = `600 ${fontSize}px ${family}`;
  let rightW = topRight ? ctx.measureText(topRight).width : 0;
  let gap = topRight ? fontSize * 1.5 : 0;
  let leftW = textW - rightW - gap;

  // Если нижняя строка слишком длинная, слегка сжимаем шрифт
  const bottomW = ctx.measureText(bottom).width;
  if (bottomW > textW && textW > 0) {
      fontSize = fontSize * (textW / bottomW) * 0.95; 
      ctx.font = `600 ${fontSize}px ${family}`;
  }

  rightW = topRight ? ctx.measureText(topRight).width : 0;
  gap = topRight ? fontSize * 1.5 : 0;
  leftW = textW - rightW - gap;

  return { headerH: h, padX, iconSize, textGap, fontSize, textX, textW, meta };
}

function computeExportMetadataHeaderH(ctx, w, baseHeaderH, metaText) {
  return baseHeaderH;
}

function drawExportMetadataBar(ctx, w, headerH, metaInput, opts = {}) {
  const layout = getExportMetadataLayout(ctx, w, headerH, metaInput);
  const meta = layout.meta || { topLeft: '', topRight: '', bottom: '' };
  if (!layout.headerH) return;

  ctx.save();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  // Round bottom corners slightly, like the logo
  const r_meta = Math.max(2, layout.headerH * 0.08);
  ctx.roundRect(0, 0, w, layout.headerH, [0, 0, r_meta, r_meta]);
  ctx.fill();

  const iconX = layout.padX;
  const iconY = (layout.headerH - layout.iconSize) / 2;
  drawFGLogoCanvas(ctx, iconX, iconY, layout.iconSize, opts.activeIndices || [0], opts.activeIndices2 || []);

  const textX = layout.textX;
  const textW = layout.textW;
  const family = 'system-ui, -apple-system, Segoe UI, Roboto, Arial';
  const topRight = String(meta.topRight || '');
  const topLeft = String(meta.topLeft || '');
  const bottom = String(meta.bottom || '');

  const topY = iconY;
  const bottomY = iconY + layout.iconSize - 2;

  ctx.font = `600 ${layout.fontSize}px ${family}`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';

  function drawJustifiedBlocks(ctx, blocks, x, y, maxW) {
    if (!blocks || blocks.length === 0) return;
    if (blocks.length === 1) {
      ctx.textAlign = 'left';
      ctx.fillText(ellipsizeRight(ctx, blocks[0], maxW), x, y);
      return;
    }

    let totalW = 0;
    const widths = blocks.map(b => {
      const cw = ctx.measureText(b).width;
      totalW += cw;
      return cw;
    });

    const minGap = ctx.measureText(' ').width * 2;
    const gap = Math.max(minGap, (maxW - totalW) / (blocks.length - 1));

    let cx = x;
    ctx.textAlign = 'left';
    for (let i = 0; i < blocks.length; i++) {
      ctx.fillText(blocks[i], cx, y);
      cx += widths[i] + gap;
    }
  }

  // --- ВЕРХНЯЯ СТРОКА ---
  ctx.textBaseline = 'top';
  const topWords = [];
  if (topLeft) topWords.push(topLeft);
  if (topRight) {
    topWords.push(...topRight.split('  ').filter(Boolean));
  }
  drawJustifiedBlocks(ctx, topWords, textX, topY, textW);

  // --- НИЖНЯЯ СТРОКА ---
  ctx.textBaseline = 'alphabetic'; 
  const bottomWords = bottom.split('  ').filter(Boolean);

  // Пользователь попросил всегда растягивать (justify) нижнюю строку для теста:
  drawJustifiedBlocks(ctx, bottomWords, textX, bottomY, textW);

  ctx.restore();
}




	// ==============================
	// EXPORT METADATA LAYOUT
	// ==============================
	

	


// [FIX] removed stray brace that broke parsing



function getStillExportMaxSize(explicitMaxSize = null) {
  const uiCap = EXPORT_CONF.RES[state.exportQuality] || 1080;
  const argCap = Number.isFinite(explicitMaxSize) && explicitMaxSize > 0 ? explicitMaxSize : Infinity;
  const cap = Math.min(uiCap, argCap);
  return Number.isFinite(cap) ? Math.max(2, Math.round(cap)) : Infinity;
}


async function exportImage(format, maxSize) {
  if (!state.frames.length) return;

  // Export padding is only meaningful when BG layer is included
  const padBase = state.exportBgLayer ? Math.max(0, Math.round(Number(state.exportPaddingPx) || 0)) : 0;

  

  const { first: exportLogoIndices, last: exportLogoIndices2 } = getLogoActiveIndicesForTick(state.currentTick);
  let metaText = '';

  const dims = getTargetFrameOutputDims();
  let baseFrameW = Math.max(2, Math.round(dims.w));
  let baseFrameH = Math.max(2, Math.round(dims.h));

  const frameAspect = baseFrameW / baseFrameH;
  const cellCount = Math.ceil(getEffectiveFrameTargetCount() / Math.max(1, state.cellSize || 1));
  const total = cellCount + (0);
  const rows = Math.ceil(total / state.gridCols);
  const gap = getExportScaledGap(baseFrameW);
  const rawGridW = state.gridCols * baseFrameW + Math.max(0, state.gridCols - 1) * gap;
  const rawGridH = rows * baseFrameH + Math.max(0, rows - 1) * gap;
  const rawHeader = getExportHeaderHeight('grid', rawGridW);
  const rawBaseHeaderH = state.exportShowMetadata ? rawHeader : 0;

  const rawPlacement = getStillExportPlacement('grid', rawGridW, rawGridH, rawBaseHeaderH, padBase);
  const rawCanvasW = rawPlacement.canvasW;
  const rawCanvasH = rawPlacement.canvasH;

  // Compute exactly how MP4 does it: scale the base measurements BEFORE creating the canvas!
  const cap = getStillExportMaxSize(maxSize);
  const longSide = Math.max(rawCanvasW, rawCanvasH);
  const globalScale = (Number.isFinite(cap) && longSide > cap) ? (cap / Math.max(1, longSide)) : 1;

  const sFrameW = Math.round(baseFrameW * globalScale);
  const sFrameH = Math.round(baseFrameH * globalScale);
  const sGap = Math.round(gap * globalScale);
  const sPadX = Math.round(padBase * globalScale);
  const sPadY = Math.round(padBase * globalScale);

  const sGridW = state.gridCols * sFrameW + Math.max(0, state.gridCols - 1) * sGap;
  const sGridH = rows * sFrameH + Math.max(0, rows - 1) * sGap;

  let baseHeaderH = rawBaseHeaderH * globalScale;
  let headerH = baseHeaderH;
  let sHeaderH = headerH;

  let stillPlacement = getStillExportPlacement('grid', sGridW, sGridH, sHeaderH, sPadX);

  // Final output canvas size (includes header + padding)
  let canvasW = Math.round(stillPlacement.canvasW);
  let canvasH = Math.round(stillPlacement.canvasH);

  // Prepare BG crop regions so BG export matches what you see (including padding)
  computeExportBgCrop('grid');
  computeExportBgCrop('single');

  // Auto-expand metadata header (no ellipsis: switch to 2 lines and grow header)
  if (state.exportShowMetadata && baseHeaderH > 0) {
    metaText = buildExportMetaText({
      mode: 'grid',
      cols: state.gridCols,
      frameW: sFrameW,
      frameH: sFrameH,
      frames: state.frames.length,
      fps: state.animFps,
      srcW: state.videoWidth,
      srcH: state.videoHeight,
      duration: state.videoDuration,
      date: state.videoDate
    });

    const measureCanvas = document.createElement('canvas');
    const mctx = measureCanvas.getContext('2d');
    const newHeaderH = computeExportMetadataHeaderH(mctx, canvasW, baseHeaderH, metaText);

    if (newHeaderH > headerH) {
      const dH = newHeaderH - headerH;
      headerH = newHeaderH;
      sHeaderH = headerH;
      canvasH += dH;
    }
  }

const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');

  // Background fill (JPEG needs opaque anyway; PNG becomes easier to read)
  ctx.fillStyle = state.bgColor || '#000';
  ctx.fillRect(0, 0, canvasW, canvasH);

  drawExportBgLayer(ctx, 0, sHeaderH, canvasW, canvasH - sHeaderH, 'grid');
  const stillCapGrid = getStillExportMaxSize(maxSize);
  const stillScaleGrid = Number.isFinite(stillCapGrid) ? Math.min(1, stillCapGrid / Math.max(1, Math.max(canvasW, canvasH))) : 1;
  drawExportBgPattern(ctx, 0, sHeaderH, canvasW, canvasH - sHeaderH, 'grid', stillScaleGrid);

  // Draw frames
  const offset = 0;
  const __exportCells = [];
  const previewItems = framesGrid ? framesGrid.querySelectorAll('.frame-item') : null;
  const stillCellOrder = generateCellOrder(cellCount, state.gridCols);
  const stillCellOrderMap = new Map();
  stillCellOrder.forEach((cell, idx) => stillCellOrderMap.set(cell, idx));
  ensureAnimDirShuffle(state.frames.length);

  // Pre-load Frame Diff plate image
  if (state.frameDiffEnabled && state.frames.length) {
    const _dpIdx = Math.max(0, Math.min(state.frames.length - 1, state.frameDiffPlateIdx || 0));
    const _dpFrame = state.frames[_dpIdx];
    if (_dpFrame) {
      const _dpSrc = _dpFrame.dataUrl || getFrameDataUrl(_dpFrame);
      if (_dpSrc) {
        const _dpImg = _dpFrame._diffImg || (_dpFrame._diffImg = new Image());
        if (_dpImg.src !== _dpSrc) _dpImg.src = _dpSrc;
        if (!_dpImg.naturalWidth) await new Promise(r => { _dpImg.onload = r; _dpImg.onerror = r; });
      }
    }
  }

  // Pass 1: base frames only
  for (let i = 0; i < total; i++) {
    if ((i % 24) === 0) { await new Promise(r => queueMicrotask(r)); }
    const row = Math.floor(i / state.gridCols);
    const col = i % state.gridCols;

    const exactX1 = Math.floor(stillPlacement.dx + col * (sFrameW + sGap));
    const exactY1 = Math.floor(sHeaderH + stillPlacement.dy + row * (sFrameH + sGap));
    const exactX2 = Math.floor(stillPlacement.dx + (col + 1) * sFrameW + col * sGap);
    const exactY2 = Math.floor(sHeaderH + stillPlacement.dy + (row + 1) * sFrameH + row * sGap);

    const x = exactX1;
    const y = exactY1;
    const cellDrawW = (sGap > 0) ? Math.ceil(sFrameW) : (exactX2 - exactX1 + 1);
    const cellDrawH = (sGap > 0) ? Math.ceil(sFrameH) : (exactY2 - exactY1 + 1);

    if (i === 0 && state.showInfoCard) {
      // Info card cell
      drawInfoCardCell(ctx, x, y, cellDrawW, cellDrawH);
      continue;
    }

    const cellIdx = i - offset;
    const cellOrderIdx = stillCellOrderMap.get(cellIdx);
    const stillCellInfo = getFrameCellInfo(cellIdx, state.currentTick, {
      frameCount: state.frames.length,
      cellCount,
      cellOrderIdx,
      shuffle: state.animDirShuffle,
      skipEnsureShuffle: true
    });

    // WYSIWYG export: take the currently displayed frame per cell when possible
    let frameIdx = NaN;
    try {
      const item = previewItems && previewItems[i];
      const di = item && item.dataset ? parseInt(item.dataset.frameIdx, 10) : NaN;
      if (Number.isFinite(di)) frameIdx = di;
    } catch (e) {}

    // Fallback: exact match to UI preview distribution
    if (!Number.isFinite(frameIdx)) {
      frameIdx = stillCellInfo.frameIdx;
    }

    frameIdx = normalizeFrameIndex(frameIdx, state.frames.length);

    const frame = state.frames[frameIdx];
    if (!frame) continue;

    // Base video frame (or blank)
    const src = getFrameDataUrl(frame);
    if (src) {
      const img = frame.img || (frame.img = new Image());
      if (img.src !== src) img.src = src;
      if (!(img.complete && img.naturalWidth)) {
        await ensureImageReady(img);
      }
      if (img.naturalWidth) {
        drawFrameCell(ctx, img, x, y, cellDrawW, cellDrawH);
        const _gIdx2 = state.chronoEnabled
          ? buildChronoGhostIndices(state.currentTick, stillCellInfo.baseOffset, state.frames.length, state.animDirection, state.animDirShuffle)
          : [];
        const _seamInfoStill = getChronoSeamForCell(cellIdx, state.currentTick, {
          frameCount: state.frames.length,
          cellCount,
          cellOrderIdx,
          shuffle: state.animDirShuffle,
          dir: state.animDirection,
          mode: 'grid',
          skipEnsureShuffle: true
        });
        drawChronophotoStack(ctx, _gIdx2, x, y, cellDrawW, cellDrawH, {
          opacityScale: getChronoCurrentOpacityScale(_seamInfoStill)
        });
        drawFrameDiffStack(ctx, x, y, cellDrawW, cellDrawH, null);
        await ensureChronoSeamBlendImagesReady(_seamInfoStill);
        drawChronoSeamBlend(ctx, _seamInfoStill, x, y, cellDrawW, cellDrawH, null, coloramaFilterId(cellIdx));
      } else {
        // Best-effort: draw placeholder
        ctx.fillStyle = '#111';
        ctx.fillRect(x, y, cellDrawW, cellDrawH);
      }
    } else {
      ctx.fillStyle = '#111';
      ctx.fillRect(x, y, cellDrawW, cellDrawH);
    }

        __exportCells.push({ i, x, y, w: cellDrawW, h: cellDrawH, frameIdx, frame });

  }

  // Pass 2: ref/template drawings overlays
  for (const cell of __exportCells) {
    const { x, y, w, h, frameIdx } = cell;

    if (state.refFrameAboveDrawings) {
      drawExportDrawings(ctx, x, y, w, h, frameIdx);
      drawExportRefFrame(ctx, x, y, w, h);
    } else {
      drawExportRefFrame(ctx, x, y, w, h);
      drawExportDrawings(ctx, x, y, w, h, frameIdx);
    }
  }

  if (state.bgLayerAboveDrawings) {
    drawExportBgLayer(ctx, 0, sHeaderH, canvasW, canvasH - sHeaderH, 'grid');
  }

  // The canvas is already native output size now, no finalize step needed!
  const outCanvas = canvas;
  const outCtx = ctx;
  const sx = 1;
  const sy = 1;

  if (state.exportShowMetadata && metaText) {
    drawExportMetadataBar(outCtx, outCanvas.width, Math.max(1, Math.round(sHeaderH * sy)), metaText, { activeIndices: exportLogoIndices, activeIndices2: exportLogoIndices2 || [], baseHeaderH: Math.max(1, Math.round(baseHeaderH * sy)) });
  }

  for (const cell of __exportCells) {
    const x = cell.x * sx;
    const y = cell.y * sy;
    const w = cell.w * sx;
    const h = cell.h * sy;
    const frameIdx = cell.frameIdx;
    const frame = cell.frame;

    if (computeShowTimecode()) {
      drawTimecodeOverlay(outCtx, x, y, w, h, frame, getDerivedIndexFromFrameIdx(frameIdx), cellCount, frameIdx);
    }

  }
  const mime = (format === 'png') ? 'image/png' : 'image/jpeg';
  const quality = (format === 'png') ? undefined : 0.92;

  const blob = await new Promise(resolve => {
    outCanvas.toBlob(b => resolve(b), mime, quality);
  });
  if (!blob) return;

  const filename = makeExportFilename({ mode: 'grid', ext: format, frames: state.frames.length, fps: state.animFps });

  await saveBlob(blob, filename, mime);
}


  // UTILS
  // File name helper: keeps exports readable and filesystem-safe
  function makeSafeName(name) {
    const raw = String(name || 'timegrid');
    const base = raw.replace(/\.[^/.]+$/, '') || 'timegrid'; // drop extension
    const safe = base
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    return (safe || 'timegrid').slice(0, 80);
  }

  // ISO week helper (week number + year) for export naming
  function getISOWeekYear(date = new Date()) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7; // 1..7 (Mon..Sun)
    d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Thursday decides the ISO year
    const year = d.getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return { week, year };
  }

  function getExportBaseName() {
    const override = (state.filenameOverride && String(state.filenameOverride).trim()) ? String(state.filenameOverride).trim() : '';
    const raw = override || state.videoFile?.name || state.imageFiles?.[0]?.name || 'timegrid';
    return makeSafeName(raw);
  }

  // Global frame-source loader used by MP4/WebM/PNG export.
  // This simply loads original frame images.
  // Universal naming:
  // <base>_FG_<mode>[_<extra>]_24f_30fps_W3_2026.<ext>
  function makeExportFilename({ mode = 'grid', ext = 'png', frames = null, fps = null, week = null, year = null, extra = '', frameNo = null } = {}) {
    const base = getExportBaseName();
    const stamp = getISOWeekYear(new Date());
    const W = (week ?? stamp.week);
    const Y = (year ?? stamp.year);
    const fCount = (frames ?? state.frames.length);
    const fFps = (fps ?? state.animFps);

    let modePart = String(mode || 'grid');
    if (frameNo != null && (modePart === 'single' || modePart === 'frame')) {
      modePart = `${modePart}_F${frameNo}`;
    }

    const extraClean = String(extra || '').trim().replace(/^_+/, '').replace(/\s+/g, '_');
    const extraPart = extraClean ? `_${extraClean}` : '';

    return `${base}_FG_${modePart}${extraPart}_${fCount}f_${fFps}fps_W${W}_${Y}.${ext}`;
  }


  function getFrameDataUrl(frame) {
    if (!frame) return '';
    return frame.dataUrl || (frame.data && (frame.data.dataUrl || frame.data.dataURL || frame.data.url)) || frame.url || '';
  }


  // Which frame is currently visible in the PRIMARY preview cell (top-left).
  // In GRID view: we export just one frame, using cell 0 at the current tick.
  // In SINGLE view: the app also shows cell 0 only, so this matches what you see.
  function getPrimaryPreviewFrameIndex() {
    const n = state.frames ? state.frames.length : 0;
    if (!n) return 0;
    const tick = Number.isFinite(state.currentTick) ? state.currentTick : 0;
    try {
      if (typeof getFrameForCell === 'function') {
        const idx = getFrameForCell(0, tick);
        return (Number.isFinite(idx) ? (idx % n + n) % n : 0);
      }
    } catch (e) {}
    return 0;
  }

  function ensureImageReady(img) {
    if (!img) return Promise.resolve(false);
    if (img.complete && img.naturalWidth) return Promise.resolve(true);
    if (typeof img.decode === 'function') {
      return img.decode().then(() => true).catch(() => false);
    }
    return new Promise(resolve => {
      const onDone = ok => {
        img.removeEventListener('load', onLoad);
        img.removeEventListener('error', onErr);
        resolve(ok);
      };
      const onLoad = () => onDone(true);
      const onErr = () => onDone(false);
      img.addEventListener('load', onLoad, { once: true });
      img.addEventListener('error', onErr, { once: true });
    });
  }

  async function ensureChronoSeamBlendImagesReady(seamInfo) {
    if (!seamInfo || !seamInfo.alpha || seamInfo.alpha <= 0 || !state.frames.length) return;
    const ids = [];
    if (getChronoSeamBaseOpacity(seamInfo) > 0 && Number.isFinite(Number(seamInfo.targetFrameIdx))) {
      ids.push(seamInfo.targetFrameIdx);
    }
    if (state.chronoEnabled && Array.isArray(seamInfo.targetGhostIndices)) {
      seamInfo.targetGhostIndices.forEach(idx => {
        if (idx !== null && Number.isFinite(Number(idx))) ids.push(idx);
      });
    }

    const seen = new Set();
    for (const rawIdx of ids) {
      const idx = normalizeFrameIndex(rawIdx, state.frames.length);
      if (seen.has(idx)) continue;
      seen.add(idx);
      const frame = state.frames[idx];
      if (!frame) continue;
      const src = getFrameDataUrl(frame);
      if (!src) continue;
      const img = frame.img || (frame.img = new Image());
      if (img.src !== src) img.src = src;
      await ensureImageReady(img);
    }
  }

  function formatTime(s) { return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`; }

  // Export current frame (Single) as still image (PNG/JPEG)
  async function exportSingleStill(format = 'png', maxSize = EXPORT_CONF.STILL_PREV) {
    if (!state.frames.length) return;

    

  const { first: exportLogoIndices, last: exportLogoIndices2 } = getLogoActiveIndicesForTick(state.currentTick);
// Export padding is only meaningful when BG layer is included
    const padBase = state.exportBgLayer ? Math.max(0, Math.round(Number(state.exportPaddingPx) || 0)) : 0;

    let metaText = '';

    const dims = getTargetFrameOutputDims();
    let baseW = Math.max(2, Math.round(dims.w));
    let baseH = Math.max(2, Math.round(dims.h));

    const rawHeader = getExportHeaderHeight('single', baseW);
    const rawBaseHeaderH = state.exportShowMetadata ? rawHeader : 0;
    const rawPlacement = getStillExportPlacement('single', baseW, baseH, rawBaseHeaderH, padBase);

    const cap = getStillExportMaxSize(maxSize);
    const longSide = Math.max(rawPlacement.canvasW, rawPlacement.canvasH);
    const globalScale = (Number.isFinite(cap) && longSide > cap) ? (cap / Math.max(1, longSide)) : 1;

    const sPadX = padBase * globalScale;
    const sPadY = padBase * globalScale;

    const frameW = baseW * globalScale;
    const frameH = baseH * globalScale;

    let baseHeaderH = rawBaseHeaderH * globalScale;
    let headerH = baseHeaderH;
    let sHeaderH = headerH;

    let stillPlacement = getStillExportPlacement('single', frameW, frameH, sHeaderH, sPadX);
    let canvasW = Math.round(stillPlacement.canvasW);
    let canvasH = Math.round(stillPlacement.canvasH);

    // Ensure BG crop is up to date for single view (includes padding)
    computeExportBgCrop('single');

    // Auto-expand metadata header (no ellipsis: switch to 2 lines and grow header)
    if (state.exportShowMetadata && baseHeaderH > 0) {
      const idx = getPrimaryPreviewFrameIndex();
      const fr = state.frames[idx];
      metaText = buildExportMetaText({
        mode: 'single',
        frameW,
        frameH,
        frames: state.frames.length,
        fps: state.animFps,
        frameIdx: idx,
        time: fr?.time || 0,
        srcW: state.videoWidth,
        srcH: state.videoHeight,
        duration: state.videoDuration,
        date: state.videoDate
      });

      const measureCanvas = document.createElement('canvas');
      const mctx = measureCanvas.getContext('2d');
      const newHeaderH = computeExportMetadataHeaderH(mctx, canvasW, baseHeaderH, metaText);

      if (newHeaderH > headerH) {
        headerH = newHeaderH;
        sHeaderH = headerH;
        stillPlacement = getStillExportPlacement('single', frameW, frameH, sHeaderH, sPadX);
        canvasW = stillPlacement.canvasW;
        canvasH = stillPlacement.canvasH;
      }
    }

const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');

    // Background fill
    ctx.fillStyle = state.bgColor || '#000';
    ctx.fillRect(0, 0, canvasW, canvasH);

    drawExportBgLayer(ctx, 0, headerH, canvasW, Math.max(1, canvasH - headerH), 'single');
    const stillCapSingle = getStillExportMaxSize(maxSize);
    const stillScaleSingle = Number.isFinite(stillCapSingle) ? Math.min(1, stillCapSingle / Math.max(1, Math.max(canvasW, canvasH))) : 1;
    drawExportBgPattern(ctx, 0, headerH, canvasW, Math.max(1, canvasH - headerH), 'single', stillScaleSingle);

// Compose target rect inside preview-matched padding
    const dx = stillPlacement.dx;
    const dy = headerH + stillPlacement.dy;

    const frameIdx = getPrimaryPreviewFrameIndex();
    const frame = state.frames[frameIdx];

    // Pre-load Frame Diff plate image
    if (state.frameDiffEnabled && state.frames.length) {
      const _dpIdx = Math.max(0, Math.min(state.frames.length - 1, state.frameDiffPlateIdx || 0));
      const _dpFrame = state.frames[_dpIdx];
      if (_dpFrame) {
        const _dpSrc = _dpFrame.dataUrl || getFrameDataUrl(_dpFrame);
        if (_dpSrc) {
          const _dpImg = _dpFrame._diffImg || (_dpFrame._diffImg = new Image());
          if (_dpImg.src !== _dpSrc) _dpImg.src = _dpSrc;
          if (!_dpImg.naturalWidth) await new Promise(r => { _dpImg.onload = r; _dpImg.onerror = r; });
        }
      }
    }

    // Video frame
    const src = getFrameDataUrl(frame);
    if (src) {
      const img = frame.img || (frame.img = new Image());
      if (img.src !== src) img.src = src;
      if (!(img.complete && img.naturalWidth)) {
        await ensureImageReady(img);
      }
      if (img.naturalWidth) {
        drawFrameCell(ctx, img, dx, dy, frameW, frameH);
        ensureAnimDirShuffle(state.frames.length);
        const _singleStillInfo = getFrameCellInfo(0, state.currentTick, {
          frameCount: state.frames.length,
          cellCount: 1,
          cellOrderIdx: 0,
          shuffle: state.animDirShuffle,
          skipEnsureShuffle: true
        });
        const _gIdx2 = state.chronoEnabled
          ? buildChronoGhostIndices(state.currentTick, _singleStillInfo.baseOffset, state.frames.length, state.animDirection, state.animDirShuffle)
          : [];
        const _seamInfoSingleStill = getChronoSeamForCell(0, state.currentTick, {
          frameCount: state.frames.length,
          cellCount: 1,
          cellOrderIdx: 0,
          shuffle: state.animDirShuffle,
          dir: state.animDirection,
          mode: 'single',
          skipEnsureShuffle: true
        });
        drawChronophotoStack(ctx, _gIdx2, dx, dy, frameW, frameH, {
          opacityScale: getChronoCurrentOpacityScale(_seamInfoSingleStill)
        });
        drawFrameDiffStack(ctx, dx, dy, frameW, frameH, null);
        await ensureChronoSeamBlendImagesReady(_seamInfoSingleStill);
        drawChronoSeamBlend(ctx, _seamInfoSingleStill, dx, dy, frameW, frameH, null, coloramaFilterId(0));
      } else {
        ctx.fillStyle = '#111';
        ctx.fillRect(dx, dy, frameW, frameH);
      }
    } else {
      ctx.fillStyle = '#111';
      ctx.fillRect(dx, dy, frameW, frameH);
    }

    // Ref + drawings
    if (state.refFrameAboveDrawings) {
      drawExportDrawings(ctx, dx, dy, frameW, frameH, frameIdx);
      drawExportRefFrame(ctx, dx, dy, frameW, frameH);
    } else {
      drawExportRefFrame(ctx, dx, dy, frameW, frameH);
      drawExportDrawings(ctx, dx, dy, frameW, frameH, frameIdx);
    }

    if (state.bgLayerAboveDrawings) {
      drawExportBgLayer(ctx, 0, headerH, canvasW, Math.max(1, canvasH - headerH), 'single');
    }

    const outCanvas = canvas;
    const outCtx = ctx;
    const sx = 1;
    const sy = 1;

    if (state.exportShowMetadata && metaText) {
      drawExportMetadataBar(outCtx, outCanvas.width, Math.max(1, Math.round(headerH * sy)), metaText, { activeIndices: exportLogoIndices, activeIndices2: exportLogoIndices2 || [], baseHeaderH: Math.max(1, Math.round(baseHeaderH * sy)) });
    }

    if (computeShowTimecode()) {
      drawTimecodeOverlay(outCtx, dx * sx, dy * sy, frameW * sx, frameH * sy, frame, getDerivedIndexFromFrameIdx(frameIdx), Math.ceil(state.frames.length / Math.max(1, Number(state.cellSize) || 1)), frameIdx);
    }
    const mime = (format === 'png') ? 'image/png' : 'image/jpeg';
    const quality = (format === 'png') ? undefined : 0.92;

    const blob = await new Promise(resolve => {
      outCanvas.toBlob(b => resolve(b), mime, quality);
    });
    if (!blob) return;

    const frameIdxForName = getPrimaryPreviewFrameIndex();
    const filename = makeExportFilename({ mode: 'single', ext: format, frames: state.frames.length, fps: state.animFps, frameNo: frameIdxForName + 1 });
    await saveBlob(blob, filename, mime);
  }

  
  // Modular timecode format: #cell | time | frameNumber
  function getTimecodeFramePadWidth() {
    const n = state.frames ? state.frames.length : 0;
    if (!n) return 2;

    // Cheap cache key: length + last frameNumber.
    const lastFn = Number(state.frames[n - 1] && state.frames[n - 1].frameNumber);
    const key = `${n}:${Number.isFinite(lastFn) ? Math.floor(lastFn) : 0}`;

    if (Number.isFinite(state._tcPadWidth) && state._tcPadWidthKey === key) {
      return state._tcPadWidth;
    }

    let maxFn = 0;
    for (let i = 0; i < n; i++) {
      const fn = Number(state.frames[i] && state.frames[i].frameNumber);
      if (Number.isFinite(fn) && fn > maxFn) maxFn = fn;
    }

    const width = Math.max(2, String(Math.max(0, Math.floor(maxFn)) + 1).length);
    state._tcPadWidth = width;
    state._tcPadWidthKey = key;
    return width;
  }

  function getTimecodeIndexPadWidth(totalFrames) {
    const n = Number.isFinite(Number(totalFrames)) ? Math.max(1, Math.floor(Number(totalFrames))) : 0;
    const w = Math.max(2, String(Math.max(1, n)).length);
    return w;
  }

  function getDerivedIndexFromFrameIdx(frameIdx) {
    const step = Math.max(1, Number(state.cellSize) || 1);
    const fi = Number.isFinite(Number(frameIdx)) ? Math.max(0, Math.floor(Number(frameIdx))) : 0;
    return Math.floor(fi / step);
  }

  function cleanFrameFilename(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    const parts = raw.split(/[\\/]/);
    return (parts[parts.length - 1] || raw).trim();
  }

  function getFrameFilename(frame, frameIdx) {
    const direct = cleanFrameFilename(frame && (frame.sourceName || frame.fileName || frame.filename || frame.name));
    if (direct) return direct;

    if (state.isSingleImage && Array.isArray(state.imageFiles) && state.imageFiles.length) {
      let idx = Number(frame && frame.sourceIndex);
      if (!Number.isFinite(idx)) idx = Number(frameIdx);
      idx = Math.max(0, Math.min(state.imageFiles.length - 1, Math.floor(idx || 0)));
      const fromFile = cleanFrameFilename(state.imageFiles[idx] && state.imageFiles[idx].name);
      if (fromFile) return fromFile;
    }

    return cleanFrameFilename(state.videoFile && state.videoFile.name);
  }

  function getDisplayFilename() {
    const override = cleanFrameFilename(state.filenameOverride);
    if (override) return override;

    if (state.isSingleImage && Array.isArray(state.imageFiles) && state.imageFiles.length > 1) {
      return `${state.imageFiles.length} images`;
    }

    return cleanFrameFilename(state.videoFile && state.videoFile.name);
  }

  function formatFilenameLabel(name) {
    if (!name) return '';
    const tail = Math.max(0, Math.min(300, Math.round(Number(state.tcFilenameTail) || 0)));
    if (tail > 0 && name.length > tail) return name.slice(-tail);
    return name;
  }

  function formatFrameFilename(frame, frameIdx) {
    return formatFilenameLabel(getFrameFilename(frame, frameIdx));
  }

  function formatDisplayFilename() {
    return formatFilenameLabel(getDisplayFilename());
  }

  function formatTimecode(frame, derivedIndex, totalFrames, frameIdx) {
    const parts = [];

    const idx0 = Number.isFinite(Number(derivedIndex)) ? Math.max(0, Math.floor(Number(derivedIndex))) : 0;
    const idxVal = idx0 + 1;

    const idxW = getTimecodeIndexPadWidth(totalFrames);
    const frameW = getTimecodeFramePadWidth();

    // Original source frame number (from captured video), 1-based.
    const srcFn0 = Number(frame && frame.frameNumber);
    const srcVal = Number.isFinite(srcFn0) ? (Math.floor(srcFn0) + 1)
      : (Number.isFinite(Number(frameIdx)) ? (Math.floor(Number(frameIdx)) + 1) : idxVal);

    if (state.tcShowIndex) {
      parts.push(String(Math.max(0, idxVal)).padStart(idxW, '0'));
    }
    if (state.tcShowTime) {
      const t = Number(frame && frame.time);
      if (Number.isFinite(t)) {
        const totalSec = Math.floor(t);
        const ms = Math.round((t - totalSec) * 100);
        const h  = Math.floor(totalSec / 3600);
        const m  = Math.floor((totalSec % 3600) / 60);
        const s  = totalSec % 60;
        let timeStr;
        if (h > 0) {
          timeStr = `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        } else if (m > 0) {
          timeStr = `${m}:${String(s).padStart(2,'0')}`;
        } else {
          timeStr = `${s}.${String(ms).padStart(2,'0')}`;
        }
        parts.push(timeStr);
      }
    }
    if (state.tcShowFrame) {
      parts.push(`F${String(Math.max(0, srcVal)).padStart(frameW, '0')}`);
    }
    if (state.tcShowText) {
      const txt = String(state.tcCustomText || '').trim();
      if (txt) parts.push(txt);
    }
    if (state.tcShowDisplayName) {
      const displayName = formatDisplayFilename();
      if (displayName) parts.push(displayName);
    }
    if (state.tcShowFilename) {
      const filename = formatFrameFilename(frame, frameIdx);
      if (filename) parts.push(filename);
    }
    return parts.join(' ');
  }
  function formatDate(d) { return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }

  // INIT
  updateIntervalUI();
  if (bgColorInput) bgColorInput.value = state.bgColor;
  if ($('fgAccentColor')) {
    $('fgAccentColor').value = state.fgAccentColor || '#35f2a3';
    document.documentElement.style.setProperty('--fg-accent', state.fgAccentColor || '#35f2a3');
  }
  if (toggleBgGrid) toggleBgGrid.classList.toggle('active', !!state.bgGridShow);
  if (bgGridTypeSelect) bgGridTypeSelect.value = state.bgGridType || 'lines';
  if (bgGridColorInput) bgGridColorInput.value = state.bgGridColor || '#ffffff';
  if (bgGridOpacitySlider) bgGridOpacitySlider.value = String(Math.round((state.bgGridOpacity || 0) * 100));
  if (bgGridOpacityValue) bgGridOpacityValue.textContent = `${Math.round((state.bgGridOpacity || 0) * 100)}%`;
  if (bgGridSizeSlider) bgGridSizeSlider.value = String(state.bgGridSize || 24);
  if (bgGridSizeValue) bgGridSizeValue.textContent = `${state.bgGridSize || 24}px`;
  if (toggleBgAboveDrawings) toggleBgAboveDrawings.classList.toggle('active', !!state.bgLayerAboveDrawings);
  updateBgAppearance();
  fontSizeValue.textContent = `${state.fontSize}px`;

  framesGrid.classList.toggle('seamless', Number(state.spacing) === 0);
  framesGrid.style.setProperty('--meta-font-size', `${state.fontSize}px`);

  // Frame image transform defaults
  if (frameImgScaleSliderX) frameImgScaleSliderX.value = String(state.frameImgScaleX !== undefined ? state.frameImgScaleX : state.frameImgScale);
  if (frameImgScaleNumX) frameImgScaleNumX.value = (state.frameImgScaleX !== undefined ? state.frameImgScaleX : state.frameImgScale).toFixed(2);
  if (frameImgScaleSliderY) frameImgScaleSliderY.value = String(state.frameImgScaleY !== undefined ? state.frameImgScaleY : state.frameImgScale);
  if (frameImgScaleNumY) frameImgScaleNumY.value = (state.frameImgScaleY !== undefined ? state.frameImgScaleY : state.frameImgScale).toFixed(2);
  if (frameImgRotSlider) frameImgRotSlider.value = String(state.frameImgRot);
  if (frameImgRotNum) frameImgRotNum.value = state.frameImgRot.toFixed(1);
      if (frameImgOffXSlider) frameImgOffXSlider.value = String(state.frameImgOffX);
  if (frameImgOffXNum) frameImgOffXNum.value = String(state.frameImgOffX);
      if (frameImgOffYSlider) frameImgOffYSlider.value = String(state.frameImgOffY);
  if (frameImgOffYNum) frameImgOffYNum.value = String(state.frameImgOffY);
      if (frameBgColorInput) frameBgColorInput.value = String(state.frameBgColor || '#000000');
  if (frameBgOpacitySlider) {
    let op = state.frameBgOpacity !== undefined ? state.frameBgOpacity : 1;
    frameBgOpacitySlider.value = op;
    if (frameBgOpacityLabel) frameBgOpacityLabel.value = op.toFixed(2);
  }
  framesGrid.style.setProperty('--img-scale', String(state.frameImgScale));
  framesGrid.style.setProperty('--img-off-x', `${state.frameImgOffX}%`);
  framesGrid.style.setProperty('--img-off-y', `${state.frameImgOffY}%`);

  
  function isTypingContext(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      const t = (el.type || '').toLowerCase();
      return ['text','search','email','url','tel','password','number'].includes(t);
    }
    if (tag === 'select') return true;
    return false;
  }

  function shouldLetFormHandleKey(e) {
    const el = e.target;
    const tag = (el && el.tagName ? el.tagName.toLowerCase() : '');
    if (tag === 'textarea') return true;

    if (tag === 'input') {
      const t = (el.type || '').toLowerCase();
      const k = e.key;

      // Always allow navigation/edit keys inside inputs
      if (['Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Tab','Enter'].includes(k)) return true;

      if (t === 'number') {
        // Allow only numeric editing chars for number inputs. Everything else can be a hotkey.
        if ((k >= '0' && k <= '9') || k === '.' || k === '-' ) return true;
        return false;
      }

      // For text-like inputs, allow normal typing
      if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) return true;
      return false;
    }

    if (tag === 'select') {
      // Let selects keep their usual behavior for arrows/enter/space.
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Tab','Enter',' '].includes(e.key)) return true;
      return false;
    }

    return false;
  }

  
  // fgMenuAutoBlurFix: keep hotkeys responsive after editing menu controls.
  // We only blur on "change"/pointerup so typing in text fields is still possible.
  if (sideMenu) {
    sideMenu.addEventListener('change', (e) => {
      const el = e && e.target ? e.target : null;
      if (!el || !el.tagName) return;
      const tag = el.tagName.toLowerCase();
      if (tag === 'select') { if (el) el.blur(); }
      if (tag === 'input') {
        const t = (el.type || '').toLowerCase();
        // blur range/checkbox to restore hotkeys, keep text-like inputs focused
        if (t === 'range' || t === 'checkbox' || t === 'color') { if (el) el.blur(); }
      }
    }, true);

    sideMenu.addEventListener('pointerup', (e) => {
      const el = e && e.target ? e.target : null;
      if (!el || !el.tagName) return;
      const tag = el.tagName.toLowerCase();
      if (tag === 'input') {
        const t = (el.type || '').toLowerCase();
        if (t === 'range') { if (el) el.blur(); }
      }
    }, true);
  }

// Hotkeys should work even after clicking the menu, so we listen in capture phase.
  // In this build, UI actions are mostly wired as button clicks. We provide small wrappers so hotkeys stay stable.
  function togglePlay() {
    if (state.isPlaying) stopAnimation();
    else startAnimation();
  }
  function prevFrame() { stepFrame(-1); }
  function nextFrame() { stepFrame(1); }
  function resetToEnd() {
    if (!state.frames.length) return;
    if (state.isPlaying) stopAnimation();
    state.currentTick = Math.max(0, state.frames.length - 1);
    updateLogoFromTick();
    updateAllCells();
  }

  function setDrawMode(on) {
    const desired = !!on;
    if (!!state.drawMode !== desired) toggleDrawMode();
  }
  function toggleEraser() {
    if (typeof drawEraserBtn !== 'undefined' && drawEraserBtn) drawEraserBtn.click();
  }
  function undoDraw() {
    if (typeof drawUndo !== 'undefined' && drawUndo) drawUndo.click();
  }
  function clearDrawTarget() {
    if (typeof drawClear !== 'undefined' && drawClear) drawClear.click();
  }
  function togglePalette() {
    // Palette visibility only, does not change draw mode.
    if (typeof drawPalette !== 'undefined' && drawPalette) {
      drawPalette.classList.toggle('visible');
      // Keep side menu toggle in sync
      if (typeof syncBrushPanelToggleUI === 'function') syncBrushPanelToggleUI();
    }
  }

  function swapCurrentAndPreviousColor() {
    const prev = state.prevDrawColor;
    if (!prev) return;
    const cur = state.drawColor;
    state._skipPrevCapture = true;
    setDrawColor(prev);
    state.prevDrawColor = cur;
  }

  function cycleRecentColors() {
    const list = Array.isArray(state.recentColors) ? state.recentColors : [];
    if (!list.length) return;
    const cur = (state.drawColor || '').toLowerCase();
    const idx = list.findIndex(c => (c || '').toLowerCase() === cur);
    const next = list[(idx + 1 + list.length) % list.length] || list[0];
    state._skipRecentCapture = true;
    setDrawColor(next);
  }
  function cycleVideoPaletteColors() {
    const list = Array.isArray(state.videoPalette) ? state.videoPalette : [];
    if (!list.length) return;
    const cur = (state.drawColor || '').toLowerCase();
    const idx = list.findIndex(c => (c || '').toLowerCase() === cur);
    const next = list[(idx + 1 + list.length) % list.length] || list[0];
    state._skipRecentCapture = true;
    setDrawColor(next);
  }



    function toggleAllSections() {
    if (!sideMenu) return;
    const sections = Array.from(sideMenu.querySelectorAll('.menu-section'));
    const aboutWrap = $('aboutHeader') ? $('aboutHeader').parentElement : null;
    const anyOpen = sections.some(s => !s.classList.contains('collapsed')) ||
                    (aboutWrap && !aboutWrap.classList.contains('collapsed'));
    if (anyOpen) {
      // Collapse all
      sections.forEach(s => s.classList.add('collapsed'));
      if (aboutWrap) aboutWrap.classList.add('collapsed');
    } else {
      // Expand only Grid Layout and Animation Preview
      const pinned = ['Grid Layout', 'Animation Preview'];
      sections.forEach(s => {
        const title = s.querySelector('.menu-section-title');
        const isPinned = title && pinned.includes(title.textContent.trim());
        s.classList.toggle('collapsed', !isPinned);
      });
      if (aboutWrap) aboutWrap.classList.add('collapsed');
    }
    const btn = $('menuCollapseBtn');
    if (btn) btn.textContent = anyOpen ? '▶' : '◀';
  }

  

window.addEventListener('keydown', (e) => {
    const code = e.code; // Physical key (works with any language)

    // Allow Cmd/Ctrl+Z for draw undo. Also use Ctrl/Cmd + [ ] for opacity.
    // Everything else with modifiers stays with OS/browser.
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      if (code === 'KeyZ') {
        e.preventDefault();
        undoDraw();
        return;
      }
      if (code === 'BracketLeft' || code === 'BracketRight') {
        e.preventDefault();
        const dir = (code === 'BracketLeft') ? -1 : 1;
        state.drawOpacity = Math.max(0.05, Math.min(1, (state.drawOpacity || 1) + dir * 0.1));
        updateDrawOpacityUI();
        return;
      }
      if (code === 'Equal' || code === 'NumpadAdd' || code === 'Minus' || code === 'NumpadSubtract') {
         e.preventDefault();
         const dir = (code === 'Minus' || code === 'NumpadSubtract') ? -1 : 1;
         const step = e.shiftKey ? 10 : 5; // In Ctrl block, e.shiftKey means Ctrl+Shift
         state.animFps = Math.max(1, Math.min(60, (state.animFps || 14) + (dir * step)));
         if (animFpsInput) animFpsInput.value = state.animFps;
         if (state.isPlaying) restartAnimation();
         updateMetaAnimFps();
         return;
      }
      if (code === 'ArrowUp') {
         e.preventDefault();
         // Ctrl/Cmd + Up = Cycle Direction Prev
         cycleSelectOption('animDirection', -1);
         return;
      }
      if (code === 'ArrowDown') {
         e.preventDefault();
         // Ctrl/Cmd + Down = Cycle Direction Next
         cycleSelectOption('animDirection', 1);
         return;
      }
      if (code === 'ArrowLeft') {
         e.preventDefault();
         // Ctrl/Cmd + Left = HIDE Minus
         const btn = document.getElementById('cellMinus'); if (btn) btn.click();
         return;
      }
      if (code === 'ArrowRight') {
         e.preventDefault();
         // Ctrl/Cmd + Right = HIDE Plus
         const btn = document.getElementById('cellPlus'); if (btn) btn.click();
         return;
      }
      return;
    }
    if (e.altKey) return;

// Escape should always work
    if (code === 'Escape') {
      e.preventDefault();
      if (typeof closeAllPopups === 'function') closeAllPopups();
      if (state.drawMode) setDrawMode(false);
      return;
    }

    // If user is actively typing in a text field, don't steal their characters.
    if (isTypingContext(e.target) && shouldLetFormHandleKey(e)) return;

    // Use physical key codes - works with ANY keyboard layout (Russian, English, etc.)
    if (code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (code === 'KeyG') { e.preventDefault(); setViewMode(state.viewMode === 'grid' ? 'single' : 'grid'); }
    else if (code === 'KeyF') { e.preventDefault(); fitActiveView(); }
    else if (code === 'KeyM') { e.preventDefault(); toggleMenu(); }
    else if (code === 'KeyN') {
      e.preventDefault();
      if (sideMenu && sideMenu.classList.contains('open')) toggleAllSections();
    }
    else if (code === 'KeyB') {
      e.preventDefault();
      // Toggle timecode frame display quickly (TC: Fr)
      const t = $('toggleTcFrame');
      if (t) t.click();
    }

    else if (code === 'NumpadAdd' || code === 'Equal') {
      e.preventDefault();
      const step = e.shiftKey ? 5 : 1;
      state.animFps = Math.min(60, (state.animFps || 14) + step);
      if (animFpsInput) animFpsInput.value = state.animFps;
      if (state.isPlaying) restartAnimation(); updateMetaAnimFps();
    }
    else if (code === 'NumpadSubtract' || code === 'Minus') {
      e.preventDefault();
      const step = e.shiftKey ? 5 : 1;
      state.animFps = Math.max(1, (state.animFps || 14) - step);
      if (animFpsInput) animFpsInput.value = state.animFps;
      if (state.isPlaying) restartAnimation(); updateMetaAnimFps();
    }

    else if (code === 'KeyD') { e.preventDefault(); setDrawMode(!state.drawMode); }
    else if (code === 'KeyQ') { e.preventDefault(); if (!state.drawMode) setDrawMode(true); setDrawTarget('background'); }
    else if (code === 'KeyW') { e.preventDefault(); if (!state.drawMode) setDrawMode(true); setDrawTarget('template'); }
    else if (code === 'KeyE') { e.preventDefault(); if (!state.drawMode) setDrawMode(true); setDrawTarget('frame'); }
    else if (code === 'KeyZ') { e.preventDefault(); undoDraw(); }
    else if (code === 'KeyC') { e.preventDefault(); clearDrawTarget(); }
    else if (code === 'KeyA') {
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable);
      if (!typing) { e.preventDefault(); toggleBrushLocked(); }
    }
    else if (code === 'KeyP') { e.preventDefault(); togglePalette(); }
    else if (code === 'KeyL') { e.preventDefault(); toggleLongStroke(); }
    else if (code === 'KeyT') { e.preventDefault(); toggleTemplateVisibility(); }
    else if (code === 'KeyH') { e.preventDefault(); toggleRefFrameVisibility(); }
    else if (code === 'Digit0' || code === 'Numpad0') {
      e.preventDefault();
      if (state.exportAudioLayer || (state.audioSeq && state.audioSeq.enabled)) {
        recordAudioSeqAV(state.viewMode === 'grid' ? 'grid' : 'single');
      } else {
        if (state.exportAudioLayer || (state.audioSeq && state.audioSeq.enabled)) {
        recordAudioSeqAV(state.viewMode === 'grid' ? 'grid' : 'single');
      } else {
        exportMp4(state.viewMode === 'grid' ? 'grid' : 'single');
      }
      }
    }
    else if (code === 'Digit9' || code === 'Numpad9') {
      e.preventDefault();
      if (state.viewMode === 'grid') exportImage('jpeg', EXPORT_CONF.STILL_PREV).catch(e => console.error(e));
      else exportSingleStill('jpeg', EXPORT_CONF.STILL_PREV).catch(e => console.error(e));
    }
    else if (code === 'Digit1' || code === 'Numpad1') {
      e.preventDefault();
      if (!state.drawMode) setDrawMode(true);
      if (state.drawEraser) drawEraserBtn.click();
      const b1 = document.querySelector('.draw-brush-btn[data-brush="round"]');
      if (b1) b1.click();
    }
    else if (code === 'Digit2' || code === 'Numpad2') {
      e.preventDefault();
      if (!state.drawMode) setDrawMode(true);
      if (state.drawEraser) drawEraserBtn.click();
      const b2 = document.querySelector('.draw-brush-btn[data-brush="spray"]');
      if (b2) b2.click();
    }
    else if (code === 'Digit3' || code === 'Numpad3') {
      e.preventDefault();
      if (!state.drawMode) setDrawMode(true);
      if (!state.drawEraser) drawEraserBtn.click();
    }
    else if (code === 'Digit4' || code === 'Numpad4') {
      e.preventDefault();
      if (!state.drawMode) setDrawMode(true);
      // Activate eyedropper directly — avoid toggle via btn.click() which can deactivate it
      eyedropperActive = true;
      if (drawEyedropperBtn) drawEyedropperBtn.classList.add('active');
      drawCanvas.style.cursor = 'crosshair';
    }
    else if (code === 'KeyX') {
      e.preventDefault();
      if (!state.drawMode) setDrawMode(true);
      if (e.shiftKey) swapCurrentAndPreviousColor();
      else cycleRecentColors();
    }
    else if (code === 'KeyV') {
      e.preventDefault();
      if (!state.drawMode) setDrawMode(true);
      if (e.shiftKey) generateVideoPaletteFromCurrentFrame();
      else cycleVideoPaletteColors();
    }
    else if (code === 'BracketLeft') { 
      e.preventDefault(); 
      if (e.shiftKey) {
        // Shift+[ = decrease edge softness
        state.edgeSoftness = Math.max(0, Math.min(1, (state.edgeSoftness || 0) - 0.05));
        updateEdgeSoftnessUI();
      } else {
        setDrawSize((state.drawSize|0) - 4);
      }
    }
    else if (code === 'BracketRight') { 
      e.preventDefault(); 
      if (e.shiftKey) {
        // Shift+] = increase edge softness
        state.edgeSoftness = Math.max(0, Math.min(1, (state.edgeSoftness || 0) + 0.05));
        updateEdgeSoftnessUI();
      } else {
        setDrawSize((state.drawSize|0) + 4);
      }
    }
    else if (code === 'ArrowUp') {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+ArrowUp: Plus columns
        const btn = document.getElementById('colsPlus'); if (btn) btn.click();
      } else {
        // ArrowUp: Cycle Pattern Prev
        cycleSelectOption('animPattern', -1);
      }
    }
    else if (code === 'ArrowDown') {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+ArrowDown: Minus columns
        const btn = document.getElementById('colsMinus'); if (btn) btn.click();
      } else {
        // ArrowDown: Cycle Pattern Next
        cycleSelectOption('animPattern', 1);
      }
    }
    else if (code === 'ArrowLeft') { 
      e.preventDefault(); 
      if (e.shiftKey) {
         // Shift+Left: Loop Phases Minus
         const btn = document.getElementById('loopMinus'); if (btn) btn.click();
      } else {
         prevFrame(); 
      }
    }
    else if (code === 'ArrowRight') { 
      e.preventDefault();
      if (e.shiftKey) {
         // Shift+Right: Loop Phases Plus
         const btn = document.getElementById('loopPlus'); if (btn) btn.click();
      } else {
         nextFrame(); 
      }
    }

    else if (code === 'Home') { e.preventDefault(); resetToStart(); }
    else if (code === 'End') { e.preventDefault(); resetToEnd(); }
}, true);


  // Viewport changes (resize/orientation) - stabilize layout on iPad/Safari/Chrome
  let viewportTimeout;
  function onViewportChanged() {
    clearTimeout(viewportTimeout);
    viewportTimeout = setTimeout(() => {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

      // Rebuild grid if needed, then re-fit.
      // When the viewport is changing rapidly (for example opening DevTools), layout metrics can be transient.
      // Defer the auto-cols decision to the next frame so measurements are stable.
      if (state.autoFit && state.frames.length) {
        if (!isIOS && state.canvasAspect === 'auto') {
          requestAnimationFrame(() => {
            const cellCount = Math.ceil(getEffectiveFrameTargetCount() / Math.max(1, state.cellSize || 1));
            const newCols = calculateOptimalColumns(cellCount);
            if (newCols !== state.gridCols) {
              state.gridCols = newCols;
              gridColsInput.value = state.gridCols;
              renderGrid();
            }
            updateGridHint();
            fitActiveView();
          });
        } else {
          fitActiveView();
        }
      }

      // Keep draw overlay in sync with new geometry (also deferred).
      if (state.drawMode) {
        requestAnimationFrame(() => {
          resizeDrawCanvas();
          requestComposite();
        });
      }
    }, 240);
  }

  window.addEventListener('resize', onViewportChanged, { passive: true });
  window.addEventListener('orientationchange', onViewportChanged, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onViewportChanged, { passive: true });
    window.visualViewport.addEventListener('scroll', onViewportChanged, { passive: true });
  }


  // Brush cursor
  const brushCursor = document.createElement('div');
  brushCursor.className = 'brush-cursor';
  document.body.appendChild(brushCursor);
  
  function updateBrushCursor(e) {
    if (!state.drawMode) {
      brushCursor.classList.remove('visible');
      return;
    }
    brushCursor.classList.add('visible');
    brushCursor.classList.toggle('eraser', state.drawEraser);
    brushCursor.style.left = e.clientX + 'px';
    brushCursor.style.top = e.clientY + 'px';
    // drawSize is in canvas coords, multiply by scale to get screen size
    const screenSize = state.drawSize * state.scale;
    brushCursor.style.width = screenSize + 'px';
    brushCursor.style.height = screenSize + 'px';
  }
  
  document.addEventListener('mousemove', updateBrushCursor);

  // iPad: show cursor for Pencil / pointer events (mouse is not always emitted)
  document.addEventListener('pointermove', e => {
    if (!state.drawMode) return;
    if (brushLocked) return;
    // Show for pen and mouse, avoid noisy finger cursor
    if (e.pointerType === 'pen' || e.pointerType === 'mouse') updateBrushCursor(e);
  }, { passive: true });

  // Touch fallback: update cursor position while drawing
  drawCanvas.addEventListener('touchmove', e => {
    if (!state.drawMode || !e.touches || e.touches.length !== 1) return;
    const t = e.touches[0];
    updateBrushCursor({ clientX: t.clientX, clientY: t.clientY });
  }, { passive: true });

  
  // toggleDrawMode brush cursor logic now integrated directly

  // ==================== AUDIO COLLISION SEQ (MVP UI FIX) ====================
  // Frames move (by animation), playheads stay (static cells). If a NEW frame enters a playhead cell, it triggers the frame's assigned sample.

  state.audioSeq = state.audioSeq || {
    enabled: false,
    mode: 'off',   // 'off' | 'assign' | 'playhead'
    slot: 0,       // 0..3
    vel: 0.85,     // 0..1
    velSteps: [0.25, 0.5, 0.75, 1],
    master: 0.9,   // 0..1
    slotGains: [1, 1, 1, 1], // per-slot volume 0..1
    playheads: [], // cellIdx[]
    frameMap: {},  // frameIdx(string) -> { slot, vel, prob }
    samples: [null, null, null, null], // slot -> { buffer, name }
    slotTrims: [[0,1],[0,1],[0,1],[0,1]], // per-slot [trimIn, trimOut] normalized 0..1
    colors: ['#35f2a3', '#ff4fd8', '#ffd54a', '#4aa3ff'] // slot -> hex
  };

  // Backward compat: ensure colors exist
  if (typeof state.audioSeq.previewShowPlayhead !== 'boolean') state.audioSeq.previewShowPlayhead = true;
  if (typeof state.audioSeq.previewShowFlash !== 'boolean') state.audioSeq.previewShowFlash = true;
  if (typeof state.audioSeq.previewShowLabels !== 'boolean') state.audioSeq.previewShowLabels = true;
  if (typeof state.audioSeq.flashIntensity !== 'number') state.audioSeq.flashIntensity = 0.85;
  if (!state.audioSeq.velSteps || !Array.isArray(state.audioSeq.velSteps) || state.audioSeq.velSteps.length < 2) state.audioSeq.velSteps = [0.25, 0.5, 0.75, 1];
  if (!state.audioSeq.colors || !Array.isArray(state.audioSeq.colors) || state.audioSeq.colors.length < 4) {
    state.audioSeq.colors = ['#35f2a3', '#ff4fd8', '#ffd54a', '#4aa3ff'];
  }

  function audioColorForSlot(slot) {
    const s = Math.max(0, Math.min(3, slot|0));
    const c = state.audioSeq.colors && state.audioSeq.colors[s] ? state.audioSeq.colors[s] : '#ffffff';
    return c;
  }

  state._audioLastByCell = state._audioLastByCell || {};
  state._audioCtx = state._audioCtx || null;
  state._audioMasterGain = state._audioMasterGain || null;

  function audioSetStatus(msg) {
    const el = document.getElementById('audioStatus');
    if (el) el.textContent = msg || '';
  }

  function audioEnsureCtx() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      audioSetStatus('Web Audio not supported');
      return null;
    }
    if (!state._audioCtx) {
      state._audioCtx = new AudioCtx();
      state._audioMasterGain = state._audioCtx.createGain();
      state._audioMasterGain.gain.value = clamp01(state.audioSeq.master);
      state._audioMasterGain.connect(state._audioCtx.destination);
    }
    try {
      if (state._audioCtx.state === 'suspended') state._audioCtx.resume();
    } catch (e) {}
    return state._audioCtx;
  }

  function clamp01(v) {
    v = parseFloat(v);
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
  }

  
  // ── Grab from Video ──────────────────────────────────────────────────────
  async function audioGrabVideoSlot(slot, startSec, lengthSec) {
    const ac = audioEnsureCtx();
    if (!ac) { audioSetStatus('Web Audio not supported'); return; }

    // Need raw video file bytes to decode audio independently of <video> element
    const file = state.videoFile;
    if (!file) { audioSetStatus('No video loaded'); return; }

    audioSetStatus(`Grabbing S${slot+1}…`);
    try {
      const ab = await file.arrayBuffer();
      const fullBuf = await ac.decodeAudioData(ab);

      const sr = fullBuf.sampleRate;
      const nCh = fullBuf.numberOfChannels;
      const startFrame = Math.floor(startSec * sr);
      const lenFrames = Math.min(Math.floor(lengthSec * sr), fullBuf.length - startFrame);

      if (lenFrames <= 0) { audioSetStatus('Start beyond audio end'); return; }

      // Create a new AudioBuffer with just the slice
      const slice = ac.createBuffer(nCh, lenFrames, sr);
      for (let ch = 0; ch < nCh; ch++) {
        const src = fullBuf.getChannelData(ch);
        const dst = slice.getChannelData(ch);
        for (let i = 0; i < lenFrames; i++) {
          dst[i] = src[startFrame + i];
        }
      }

      const dur = (lenFrames / sr).toFixed(2);
      state.audioSeq.samples[slot] = { buffer: slice, name: `vid ${startSec.toFixed(1)}s–${(startSec + Number(dur)).toFixed(1)}s` };
      audioUpdateFileNames();
      audioUpdateCurrentSlotName();
      audioUpdateRecButtons();
      audioSetStatus(`S${slot+1}: ${dur}s from video`);
    } catch (e) {
      audioSetStatus('Grab failed: ' + (e.message || e));
    }
  }


  
  function audioTrimInitUI() {
    if (!state.audioSeq.slotTrims) {
      state.audioSeq.slotTrims = [[0,1],[0,1],[0,1],[0,1]];
    }
    for (let i = 0; i < 4; i++) {
      const n = i + 1;
      const inEl  = document.getElementById('audioTrimIn'  + n);
      const outEl = document.getElementById('audioTrimOut' + n);
      const inNum  = document.getElementById('audioTrimIn'  + n + 'Num');
      const outNum = document.getElementById('audioTrimOut' + n + 'Num');
      if (!inEl || !outEl) continue;

      const syncUI = (a, b) => {
        inEl.value  = a;
        outEl.value = b;
        if (inNum)  { inNum.value  = Math.round(a * 1000) / 10; }
        if (outNum) { outNum.value = Math.round(b * 1000) / 10; }
      };
      syncUI(state.audioSeq.slotTrims[i][0], state.audioSeq.slotTrims[i][1]);

      inEl.oninput = () => {
        let v = parseFloat(inEl.value);
        const out = state.audioSeq.slotTrims[i][1];
        if (v >= out) v = Math.max(0, out - 0.001);
        state.audioSeq.slotTrims[i][0] = v;
        syncUI(v, state.audioSeq.slotTrims[i][1]);
      };
      outEl.oninput = () => {
        let v = parseFloat(outEl.value);
        const inn = state.audioSeq.slotTrims[i][0];
        if (v <= inn) v = Math.min(1, inn + 0.001);
        state.audioSeq.slotTrims[i][1] = v;
        syncUI(state.audioSeq.slotTrims[i][0], v);
      };
      if (inNum) {
        inNum.onchange = () => {
          inEl.value = Math.max(0, Math.min(99.9, parseFloat(inNum.value)||0)) / 100;
          inEl.oninput();
        };
        inNum.oninput = inNum.onchange;
      }
      if (outNum) {
        outNum.onchange = () => {
          outEl.value = Math.max(0.001, Math.min(100, parseFloat(outNum.value)||100)) / 100;
          outEl.oninput();
        };
        outNum.oninput = outNum.onchange;
      }
    }
  }


  function audioQuickInitUI() {
    const slotBtns = [1,2,3,4].map(n => document.getElementById('audioQuickSlot' + n));
    const syncSlotUI = () => {
      const cur = Math.max(0, Math.min(3, state.audioSeq && typeof state.audioSeq.slot === 'number' ? state.audioSeq.slot : 0));
      slotBtns.forEach((btn, i) => { if (btn) btn.classList.toggle('active', i === cur); });
    };
    const setSlot = (slot) => {
      if (!state.audioSeq) return;
      state.audioSeq.slot = slot;
      audioUpdateCurrentSlotName && audioUpdateCurrentSlotName();
      audioSetStatus && audioSetStatus('Slot S' + (slot+1));
      syncSlotUI();
    };
    slotBtns.forEach((btn, i) => {
      if (btn) btn.onclick = () => setSlot(i);
    });
    syncSlotUI();
  }
  function audioGrabInitUI() {
    const lenEl     = document.getElementById('audioGrabLen');
    const startEls  = [1,2,3,4].map(i => document.getElementById('audioGrabStart' + i));
    const grabBtns  = [1,2,3,4].map(i => document.getElementById('audioGrab' + i));
    const grabAllBtn = document.getElementById('audioGrabAll');

    grabBtns.forEach((btn, i) => {
      if (!btn) return;
      btn.onclick = () => {
        const start = parseFloat((startEls[i] && startEls[i].value) || 0) || 0;
        const len   = parseFloat((lenEl && lenEl.value) || 2) || 2;
        audioGrabVideoSlot(i, start, len);
      };
    });

    if (grabAllBtn) {
      grabAllBtn.onclick = () => {
        const len = parseFloat((lenEl && lenEl.value) || 2) || 2;
        for (let i = 0; i < 4; i++) {
          const start = parseFloat((startEls[i] && startEls[i].value) || 0) || 0;
          audioGrabVideoSlot(i, start, len);
        }
      };
    }
  }

async function audioLoadSlot(slot, file) {
    if (!file) return;
    const ac = audioEnsureCtx();
    if (!ac) return;
    try {
      const ab = await file.arrayBuffer();
      const buf = await ac.decodeAudioData(ab.slice(0));
      state.audioSeq.samples[slot] = { buffer: buf, name: file.name };
      audioUpdateFileNames();
    audioUpdateRecButtons();
    audioUpdateCurrentSlotName();
    audioApplyPreviewToggles();
      audioUpdateCurrentSlotName();
      audioSetStatus(`Loaded S${slot+1}`);
    } catch (e) {
      audioSetStatus('Load failed');
    }
  }

  function audioTriggerSlot(slot, vel01) {
    if (!state.audioSeq.enabled) return;
    const ac = audioEnsureCtx();
    if (!ac) return;
    const pack = state.audioSeq.samples[slot];
    if (!pack || !pack.buffer) return;

    const src = ac.createBufferSource();
    src.buffer = pack.buffer;

    const g = ac.createGain();
    const v = clamp01(vel01);
    const m = clamp01(state.audioSeq.master);
    const sg = clamp01((state.audioSeq.slotGains && state.audioSeq.slotGains[slot] != null) ? state.audioSeq.slotGains[slot] : 1);
    g.gain.value = v * m * sg;

    src.connect(g);
    g.connect(state._audioMasterGain || ac.destination);

    // Apply trim in/out
    const trims = state.audioSeq.slotTrims && state.audioSeq.slotTrims[slot];
    const trimIn  = trims ? Math.max(0, Math.min(1, trims[0] || 0)) : 0;
    const trimOut = trims ? Math.max(trimIn, Math.min(1, trims[1] != null ? trims[1] : 1)) : 1;
    const dur = pack.buffer.duration;
    const offsetSec   = trimIn  * dur;
    const durationSec = (trimOut - trimIn) * dur;
    try { src.start(0, offsetSec, durationSec > 0.001 ? durationSec : undefined); } catch (e) {}
  }

  
  function audioGetSlotName(slot) {
    const s = Math.max(0, Math.min(3, slot|0));
    const pack = state.audioSeq.samples ? state.audioSeq.samples[s] : null;
    if (!pack || !pack.name) return 'no sample';
    const name = String(pack.name);
    return name.length > 32 ? (name.slice(0, 29) + '…') : name;
  }

  function audioUpdateCurrentSlotName() {
    const el = document.getElementById('audioCurrentSlotName');
    if (!el) return;
    el.textContent = audioGetSlotName(state.audioSeq.slot|0);
  }

function audioUpdateFileNames() {
    for (let i = 0; i < 4; i++) {
      const n = i + 1;
      const el = document.getElementById('audioName' + n);
      if (el) {
        const pack = state.audioSeq.samples[i];
        el.textContent = pack && pack.name ? pack.name : 'no file';
      }
      // Reset trim to 0/1 when new sample loaded
      if (state.audioSeq.slotTrims && state.audioSeq.samples[i]) {
        // only reset if sample just changed (name changed)
        // we track this by checking if trim was already set — don't auto-reset, let user keep trims
      }
      // Sync trim UI labels
      const inEl  = document.getElementById('audioTrimIn'  + n);
      const outEl = document.getElementById('audioTrimOut' + n);
      const inV   = document.getElementById('audioTrimIn'  + n + 'Num');
      const outV  = document.getElementById('audioTrimOut' + n + 'Num');
      if (inEl && state.audioSeq.slotTrims) {
        inEl.value  = state.audioSeq.slotTrims[i][0];
        outEl.value = state.audioSeq.slotTrims[i][1];
        if (inV)  inV.value = Math.round(state.audioSeq.slotTrims[i][0] * 1000) / 10;
        if (outV) outV.value = Math.round(state.audioSeq.slotTrims[i][1] * 1000) / 10;
      }
    }
  }


  function audioTogglePlayhead(cellIdx) {
    const arr = state.audioSeq.playheads || (state.audioSeq.playheads = []);
    const i = arr.indexOf(cellIdx);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(cellIdx);
    arr.sort((a, b) => a - b);
    audioSyncPlayheads();
    audioPrimePlayheads(); // keep "entry only" behavior stable
    audioSetStatus(`Playheads: ${arr.length}`);
  }

  function audioSyncPlayheads() {
    if (!framesGrid) return;
    const set = new Set(state.audioSeq.playheads || []);
    const items = framesGrid.querySelectorAll('.frame-item[data-cell-idx]');
    items.forEach(it => {
      const cellIdx = parseInt(it.dataset.cellIdx, 10);
      if (!Number.isFinite(cellIdx)) return;
      it.classList.toggle('fg-playhead', set.has(cellIdx));
    try { audioApplyPreviewToggles(); } catch (e) {}
  });
  }

  
  function audioApplyPreviewToggles() {
    if (!framesGrid || !state.audioSeq) return;
    try {
      const phOn = (state.audioSeq.previewShowPlayhead !== false);
      const lbOn = (state.audioSeq.previewShowLabels !== false);
      framesGrid.style.setProperty('--fg-ph-opacity', phOn ? '0.95' : '0');
      framesGrid.style.setProperty('--fg-chip-opacity', lbOn ? '0.95' : '0');
    } catch (e) {}
  }

function audioFlashPlayhead(cellIdx, slot) {
    if (state.audioSeq && state.audioSeq.previewShowFlash === false) return;
    const el = framesGrid ? framesGrid.querySelector(`.frame-item[data-cell-idx="${cellIdx}"]`) : null;
    if (!el) return;
    const c = audioColorForSlot(slot);
    const inten = (typeof state.audioSeq.flashIntensity === 'number') ? clamp01(state.audioSeq.flashIntensity) : 0.85;
    const peak = Math.max(0, Math.min(1, 0.10 + 0.90 * inten));
    try { 
      el.style.setProperty('--fg-hit-color', c); 
      el.style.setProperty('--fg-hit-peak', String(peak));
    } catch (e) {}
    el.classList.add('fg-playhead-hit');
    setTimeout(() => { try { el.classList.remove('fg-playhead-hit'); } catch (e) {} }, 160);
  }

  function audioUpdateChips() {
    if (!framesGrid) return;
    const map = state.audioSeq.frameMap || {};
    const items = framesGrid.querySelectorAll('.frame-item[data-cell-idx]');
    items.forEach(it => {
      const frameIdx = parseInt(it.dataset.frameIdx, 10);
      const wrap = it.querySelector('.frame-image-wrap');
      if (!wrap) return;

      const key = String(frameIdx);
      const m = map[key];

      let chip = wrap.querySelector('.fg-audio-chip');
      if (m && Number.isFinite(m.slot)) {
        const label = 'S' + (Math.max(0, Math.min(3, m.slot|0)) + 1);
        if (!chip) {
          chip = document.createElement('div');
          chip.className = 'fg-audio-chip';
          wrap.appendChild(chip);
        }
        const vv = (typeof m.vel === 'number') ? m.vel : 1;
        const pp = (typeof m.prob === 'number') ? m.prob : 1;
        chip.textContent = `${label} v${vv.toFixed(2)} p${pp.toFixed(2)}`;
        try { chip.style.setProperty('--fg-chip-color', audioColorForSlot(m.slot)); } catch (e) {}
      } else {
        if (chip) chip.remove();
      }
    });
  }

  function audioPrimePlayheads() {
    // Fill lastByCell with current frames so playback doesn't fire instantly on start.
    if (!framesGrid) return;
    const playheads = state.audioSeq.playheads || [];
    for (let i = 0; i < playheads.length; i++) {
      const cellIdx = playheads[i];
      const cellEl = framesGrid.querySelector(`.frame-item[data-cell-idx="${cellIdx}"]`);
      if (!cellEl) continue;
      const frameIdx = parseInt(cellEl.dataset.frameIdx, 10);
      if (!Number.isFinite(frameIdx)) continue;
      state._audioLastByCell[cellIdx] = frameIdx;
    }
  }

  function audioSeqTick() {
    if (!state.isPlaying) return;
    if (!state.audioSeq.enabled) return;
    const playheads = state.audioSeq.playheads || [];
    if (!playheads.length) return;
    if (!framesGrid) return;

    for (let k = 0; k < playheads.length; k++) {
      const cellIdx = playheads[k];
      const cellEl = framesGrid.querySelector(`.frame-item[data-cell-idx="${cellIdx}"]`);
      if (!cellEl) continue;

      const frameIdx = parseInt(cellEl.dataset.frameIdx, 10);
      if (!Number.isFinite(frameIdx)) continue;

      const last = state._audioLastByCell[cellIdx];
      if (last === frameIdx) continue;

      state._audioLastByCell[cellIdx] = frameIdx;

      const m = state.audioSeq.frameMap ? state.audioSeq.frameMap[String(frameIdx)] : null;
      if (!m) continue;

      const slot = Math.max(0, Math.min(3, m.slot|0));
      const vel = Number.isFinite(m.vel) ? clamp01(m.vel) : 1;

      audioTriggerSlot(slot, vel);
      audioFlashPlayhead(cellIdx, slot);
    }
  }

  
  function audioGetNextVel(cur) {
    const steps = (state.audioSeq && Array.isArray(state.audioSeq.velSteps)) ? state.audioSeq.velSteps : [0.25, 0.5, 0.75, 1];
    const c = clamp01(Number(cur));
    // find nearest step
    let idx = 0;
    let best = Infinity;
    for (let i = 0; i < steps.length; i++) {
      const d = Math.abs(c - steps[i]);
      if (d < best) { best = d; idx = i; }
    }
    const next = steps[(idx + 1) % steps.length];
    return clamp01(next);
  }

  function audioCycleFrameVel(frameIdx) {
    if (!state.audioSeq.frameMap) state.audioSeq.frameMap = {};
    const k = String(frameIdx);
    const m = state.audioSeq.frameMap[k];
    if (!m) {
      // if no mapping, create one using current slot and default vel (first step)
      const steps = (state.audioSeq && Array.isArray(state.audioSeq.velSteps)) ? state.audioSeq.velSteps : [0.25, 0.5, 0.75, 1];
      const vel = clamp01(steps[0] || 1);
      state.audioSeq.frameMap[k] = { slot: Math.max(0, Math.min(3, state.audioSeq.slot|0)), vel };
      audioUpdateChips();
      audioSetStatus(`Vel ${vel}`);
      return;
    }
    m.vel = audioGetNextVel(m.vel);
    audioUpdateChips();
    audioSetStatus(`Vel ${m.vel}`);
  }

function audioAssignFrame(frameIdx) {
    const slot = Math.max(0, Math.min(3, state.audioSeq.slot|0));
    const vel = clamp01(state.audioSeq.vel);
    state.audioSeq.frameMap[String(frameIdx)] = { slot, vel, prob: 1 };
    audioUpdateChips();
    audioSetStatus(`Mapped frame ${frameIdx} -> S${slot+1}`);
  }

  function audioClearFrame(frameIdx) {
    if (!state.audioSeq.frameMap) return;
    delete state.audioSeq.frameMap[String(frameIdx)];
    audioUpdateChips();
    audioSetStatus(`Cleared frame ${frameIdx}`);
  }

  
  // AudioSeq: mic record to slot (max 10s). Uses WebAudio ScriptProcessor for broad decode compatibility.
  state._audioRec = state._audioRec || { isRecording: false, requesting: false, holdActive: false, cancelRequested: false, slot: 0, stream: null, src: null, proc: null, chunks: [], sampleRate: 0, maxSec: 10 };

  
  async function audioGetMicStream() {
    const rec = state._audioRec || (state._audioRec = { isRecording:false, requesting:false, holdActive:false, cancelRequested:false, slot:0, stream:null, src:null, proc:null, chunks:[], sampleRate:0, maxSec:10, micStream:null });
    // Reuse an existing live stream to avoid repeated permission prompts.
    if (rec.micStream) {
      try {
        const tracks = rec.micStream.getAudioTracks ? rec.micStream.getAudioTracks() : [];
        const live = tracks.some(t => t && t.readyState === 'live');
        if (live) return rec.micStream;
      } catch (e) {}
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    rec.micStream = stream;
    return stream;
  }

  function audioReleaseMic() {
    try {
      const rec = state._audioRec;
      if (!rec || !rec.micStream) return;
      try { rec.micStream.getTracks().forEach(tr => { try { tr.stop(); } catch (e) {} }); } catch (e) {}
      rec.micStream = null;
    } catch (e) {}
  }

  window.addEventListener('beforeunload', () => { audioReleaseMic(); });

async function audioStartRecord(slotIdx) {
    try {
      const ac = audioEnsureCtx();
      if (!ac) { audioSetStatus('AudioContext unavailable'); return; }

      // If already recording, stop first
      if (state._audioRec && state._audioRec.isRecording) {
        await audioStopRecord(true);
      }

      const stream = await audioGetMicStream();
      // If the user released the button while the permission prompt was open, cancel.
      try {
        const holdOk = !!(state._audioRec && state._audioRec.holdActive) && ((state._audioRec.slot|0) === (slotIdx|0)) && !(state._audioRec.cancelRequested);
        if (!holdOk) {
          return;
        }
      } catch (e) {}
      const srcNode = ac.createMediaStreamSource(stream);

      // ScriptProcessor (deprecated but stable for this use-case)
      const bufSize = 4096;
      const proc = ac.createScriptProcessor(bufSize, 1, 1);

      const chunks = [];
      const sr = ac.sampleRate;
      const maxSamples = Math.floor((state._audioRec.maxSec || 10) * sr);
      let total = 0;

      proc.onaudioprocess = (e) => {
        if (!state._audioRec.isRecording) return;
        const input = e.inputBuffer.getChannelData(0);
        // copy
        const remain = maxSamples - total;
        const take = Math.min(remain, input.length);
        if (take <= 0) {
          audioStopRecord();
          return;
        }
        const copy = new Float32Array(take);
        copy.set(input.subarray(0, take));
        chunks.push(copy);
        total += take;

        if (total >= maxSamples) {
          audioStopRecord();
        }
      };

      // keep graph alive but silent
      srcNode.connect(proc);
      proc.connect(ac.destination);

      state._audioRec = {
        isRecording: true,
        slot: slotIdx|0,
        stream,
        src: srcNode,
        proc,
        chunks,
        sampleRate: sr,
        startedAt: performance.now(),
        maxSec: state._audioRec.maxSec || 10
      };

      audioUpdateRecButtons();
      audioSetStatus(`REC S${slotIdx+1}... (max ${state._audioRec.maxSec}s)`);
    } catch (e) {
      audioSetStatus('Mic record blocked');
    } finally {
      try { if (state._audioRec) state._audioRec.requesting = false; } catch (e) {}
    }
  }

  async function audioStopRecord(silent = false) {
    try {
      if (!state._audioRec || !state._audioRec.isRecording) return;

      const rec = state._audioRec;
      rec.isRecording = false;

      // cleanup graph
      try { if (rec.proc) rec.proc.disconnect(); } catch (e) {}
      try { if (rec.src) rec.src.disconnect(); } catch (e) {}
      try { if (rec.proc) rec.proc.onaudioprocess = null; } catch (e) {}
      // keep mic stream alive to avoid repeated permission prompts
      // build buffer
      const ac = audioEnsureCtx();
      if (!ac) return;

      const chunks = rec.chunks || [];
      let total = 0;
      for (const c of chunks) total += c.length;

      if (total < 256) {
        state._audioRec = { isRecording: false, requesting: false, holdActive: false, cancelRequested: false, slot: 0, stream: null, src: null, proc: null, chunks: [], sampleRate: ac.sampleRate, maxSec: rec.maxSec };
        audioUpdateRecButtons();
        if (!silent) audioSetStatus('REC too short');
        return;
      }

      const buf = ac.createBuffer(1, total, rec.sampleRate || ac.sampleRate);
      const ch0 = buf.getChannelData(0);
      let off = 0;
      for (const c of chunks) {
        ch0.set(c, off);
        off += c.length;
      }

      // simple trim: remove leading/trailing near-silence (cheap)
      const thr = 0.003;
      let a = 0;
      while (a < ch0.length && Math.abs(ch0[a]) < thr) a++;
      let b = ch0.length - 1;
      while (b > a && Math.abs(ch0[b]) < thr) b--;
      const trimmedLen = Math.max(1, b - a + 1);
      const out = ac.createBuffer(1, trimmedLen, rec.sampleRate || ac.sampleRate);
      out.getChannelData(0).set(ch0.subarray(a, b + 1));

      const slot = rec.slot|0;
      const stamp = new Date();
      const name = `REC_${String(stamp.getHours()).padStart(2,'0')}${String(stamp.getMinutes()).padStart(2,'0')}${String(stamp.getSeconds()).padStart(2,'0')}_${Math.round(trimmedLen/(rec.sampleRate||ac.sampleRate)*10)/10}s`;

      state.audioSeq.samples[slot] = { buffer: out, name };
      audioUpdateFileNames();
      audioUpdateCurrentSlotName();

      state._audioRec = { isRecording: false, requesting: false, holdActive: false, cancelRequested: false, slot: 0, stream: null, src: null, proc: null, chunks: [], sampleRate: ac.sampleRate, maxSec: rec.maxSec };
      audioUpdateRecButtons();
      if (!silent) audioSetStatus(`REC saved to S${slot+1}`);
    } catch (e) {
      try {
        // keep mic alive on errors as well; user can release manually by disabling AudioSeq

      } catch (e) {}
      state._audioRec = { isRecording: false, requesting: false, holdActive: false, cancelRequested: false, slot: 0, stream: null, src: null, proc: null, chunks: [], sampleRate: 0, maxSec: 10 };
      audioUpdateRecButtons();
      if (!silent) audioSetStatus('REC failed');
    }
  }

  function audioUpdateRecButtons() {
    const btns = [
      document.getElementById('audioRec1'),
      document.getElementById('audioRec2'),
      document.getElementById('audioRec3'),
      document.getElementById('audioRec4')
    ];
    const isRec = !!(state._audioRec && state._audioRec.isRecording);
    const slot = isRec ? (state._audioRec.slot|0) : -1;
    btns.forEach((b, i) => {
      if (!b) return;
      const on = isRec && i === slot;
      b.classList.toggle('fg-rec-active', on);
    });
  }

function audioInitUI() {
    const enableEl = document.getElementById('audioSeqEnable');
    const prevPhEl = document.getElementById('audioPrevShowPh');
    const prevFlashEl = document.getElementById('audioPrevShowFlash');
    const prevLabelsEl = document.getElementById('audioPrevShowLabels');
    const flashI = document.getElementById('audioFlashIntensity');
    const flashINum = document.getElementById('audioFlashIntensityNum');
    const modeSel = document.getElementById('audioEditMode');
    const slotSel = document.getElementById('audioSlotSelect');

    const editBtns = [
      document.getElementById('audioEditOff'),
      document.getElementById('audioEditAssign'),
      document.getElementById('audioEditPlayhead')
    ];
    const syncEditButtons = () => {
      const mode = state.audioSeq.mode || 'off';
      editBtns.forEach(btn => {
        if (!btn) return;
        btn.classList.toggle('active-toggle', btn.dataset.mode === mode);
      });
    };


    if (state.exportAudioLayer === undefined) state.exportAudioLayer = !!(state.audioSeq && state.audioSeq.enabled);
    const syncExportAudioLayerUI = () => {
      const el = document.getElementById('toggleExportAudioLayer');
      if (el) el.classList.toggle('active', !!state.exportAudioLayer);
    };
  const vel = document.getElementById('audioVel');
    const velNum = document.getElementById('audioVelNum');
    const master = document.getElementById('audioMaster');
    const masterNum = document.getElementById('audioMasterNum');

    const volR = [1,2,3,4].map(i => document.getElementById('audioVol' + i));
    const volN = [1,2,3,4].map(i => document.getElementById('audioVol' + i + 'Num'));

    const loadBtns = [
      document.getElementById('audioLoad1'),
      document.getElementById('audioLoad2'),
      document.getElementById('audioLoad3'),
      document.getElementById('audioLoad4')
    ];
    const testBtns = [
      document.getElementById('audioTest1'),
      document.getElementById('audioTest2'),
      document.getElementById('audioTest3'),
      document.getElementById('audioTest4')
    ];
    const inputs = [
      document.getElementById('audioInput1'),
      document.getElementById('audioInput2'),
      document.getElementById('audioInput3'),
      document.getElementById('audioInput4')
    ];

    const colorPickers = [
      document.getElementById('audioColor1'),
      document.getElementById('audioColor2'),
      document.getElementById('audioColor3'),
      document.getElementById('audioColor4')
    ];

    const clearPlayheads = document.getElementById('audioClearPlayheads');
    const clearMap = document.getElementById('audioClearMap');
    const clearSlotBtns = [
      document.getElementById('audioClearSlot1'),
      document.getElementById('audioClearSlot2'),
      document.getElementById('audioClearSlot3'),
      document.getElementById('audioClearSlot4')
    ];



    // enable toggle styling matches existing switch: "active"
    if (enableEl) {
      enableEl.classList.toggle('active', !!state.audioSeq.enabled);
      syncExportAudioLayerUI();
      enableEl.addEventListener('click', () => {
        state.audioSeq.enabled = !state.audioSeq.enabled;
      state.exportAudioLayer = !!state.audioSeq.enabled;
        enableEl.classList.toggle('active', !!state.audioSeq.enabled);
      syncExportAudioLayerUI();
        if (state.audioSeq.enabled) {
          audioEnsureCtx();
          audioPrimePlayheads();
          audioSetStatus('enabled');
        } else {
          audioReleaseMic();
          audioSetStatus('disabled');
        }
      });
    }

    // Preview toggles
    if (prevPhEl) {
      prevPhEl.classList.toggle('active', state.audioSeq.previewShowPlayhead !== false);
      prevPhEl.addEventListener('click', () => {
        state.audioSeq.previewShowPlayhead = !(state.audioSeq.previewShowPlayhead !== false);
        prevPhEl.classList.toggle('active', state.audioSeq.previewShowPlayhead !== false);
        audioApplyPreviewToggles();
      });
    }

    if (prevFlashEl) {
      prevFlashEl.classList.toggle('active', state.audioSeq.previewShowFlash !== false);
      prevFlashEl.addEventListener('click', () => {
        state.audioSeq.previewShowFlash = !(state.audioSeq.previewShowFlash !== false);
        prevFlashEl.classList.toggle('active', state.audioSeq.previewShowFlash !== false);
      });
    }

    if (prevLabelsEl) {
      prevLabelsEl.classList.toggle('active', state.audioSeq.previewShowLabels !== false);
      prevLabelsEl.addEventListener('click', () => {
        state.audioSeq.previewShowLabels = !(state.audioSeq.previewShowLabels !== false);
        prevLabelsEl.classList.toggle('active', state.audioSeq.previewShowLabels !== false);
        audioApplyPreviewToggles();
      });
    }

    const setMode = (mode) => {
      state.audioSeq.mode = mode;
      if (modeSel) modeSel.value = mode;
      syncEditButtons();
      audioSetStatus(`mode: ${mode}`);
    };
    if (modeSel) {
      modeSel.value = state.audioSeq.mode || 'off';
      modeSel.addEventListener('change', () => setMode(modeSel.value));
    }
    editBtns.forEach(btn => {
      if (btn) btn.onclick = () => setMode(btn.dataset.mode || 'off');
    });
    syncEditButtons();

    if (slotSel) {
      slotSel.value = String(state.audioSeq.slot|0);
      slotSel.addEventListener('change', () => {
        state.audioSeq.slot = parseInt(slotSel.value, 10) || 0;
        audioUpdateCurrentSlotName();
      });
    }

    function bindSliderPair(r, n, key) {
      if (!r || !n) return;
      const fromR = () => {
        const v = clamp01(r.value);
        state.audioSeq[key] = v;
        n.value = String(v);
        if (key === 'master' && state._audioMasterGain) state._audioMasterGain.gain.value = v;
      };
      const fromN = () => {
        const v = clamp01(n.value);
        state.audioSeq[key] = v;
        r.value = String(v);
        if (key === 'master' && state._audioMasterGain) state._audioMasterGain.gain.value = v;
      };
      r.addEventListener('input', fromR);
      n.addEventListener('change', fromN);
      r.value = String(state.audioSeq[key]);
      n.value = String(state.audioSeq[key]);
    }

    bindSliderPair(vel, velNum, 'vel');
    bindSliderPair(master, masterNum, 'master');

    function bindSlotVolPair(r, n, idx) {
      if (!r || !n) return;
      const fromR = () => {
        const v = clamp01(r.value);
        state.audioSeq.slotGains[idx] = v;
        n.value = String(v);
      };
      const fromN = () => {
        const v = clamp01(n.value);
        state.audioSeq.slotGains[idx] = v;
        r.value = String(v);
      };
      r.addEventListener('input', fromR);
      n.addEventListener('change', fromN);
      const initV = clamp01((state.audioSeq.slotGains && state.audioSeq.slotGains[idx] != null) ? state.audioSeq.slotGains[idx] : 1);
      r.value = String(initV);
      n.value = String(initV);
    }

    volR.forEach((r, idx) => bindSlotVolPair(r, volN[idx], idx));


    // Flash intensity 0..1
    bindSliderPair(flashI, flashINum, 'flashIntensity');

    loadBtns.forEach((btn, i) => {
      if (!btn || !inputs[i]) return;
      btn.addEventListener('click', () => inputs[i].click());
    });

    inputs.forEach((inp, i) => {
      if (!inp) return;
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0] ? inp.files[0] : null;
        if (f) audioLoadSlot(i, f);
      });
    });

    testBtns.forEach((btn, i) => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        audioTriggerSlot(i, 1);
        audioSetStatus(`Test S${i+1}`);
      });

    // Color pickers for slots
    if (colorPickers && colorPickers.length) {
      colorPickers.forEach((cp, i) => {
        if (!cp) return;
        // init from state
        cp.value = audioColorForSlot(i);
        cp.addEventListener('input', () => {
          state.audioSeq.colors[i] = cp.value;
          audioUpdateChips();
          audioSetStatus(`S${i+1} color`);
        });
      });
    }
    const recBtns = [
      document.getElementById('audioRec1'),
      document.getElementById('audioRec2'),
      document.getElementById('audioRec3'),
      document.getElementById('audioRec4')
    ];

    recBtns.forEach((btn, i) => {
      if (!btn) return;
      if (btn.dataset && btn.dataset.recBound === '1') return;
      if (btn.dataset) btn.dataset.recBound = '1';
      const startHold = async (e) => {
        if(e && e.preventDefault) { e.preventDefault(); e.stopPropagation(); }
        if (!state._audioRec) state._audioRec = { isRecording: false, requesting: false, holdActive: false, cancelRequested: false, slot: 0, stream: null, src: null, proc: null, chunks: [], sampleRate: 0, maxSec: 10 };
        state._audioRec.holdActive = true;
        state._audioRec.cancelRequested = false;
        state._audioRec.slot = i;
        try { if (btn.setPointerCapture && e.pointerId != null) btn.setPointerCapture(e.pointerId); } catch (e) {}
        await audioStartRecord(i);
      };

      const endHold = async (e) => {
        if(e && e.preventDefault) { e.preventDefault(); e.stopPropagation(); }
        if (!state._audioRec) return;
        state._audioRec.holdActive = false;
        if (state._audioRec.requesting && !state._audioRec.isRecording) state._audioRec.cancelRequested = true;
        if (state._audioRec.isRecording && (state._audioRec.slot|0) === i) {
          await audioStopRecord();
        }
      };

      btn.addEventListener('pointerdown', startHold);
      btn.addEventListener('pointerup', endHold);
      btn.addEventListener('pointercancel', endHold);
      btn.addEventListener('pointerleave', (e) => { if (e && e.buttons) endHold(e); });

      // Safety: stop on window blur
      window.addEventListener('blur', () => {
        try {
          if (state._audioRec && state._audioRec.isRecording && (state._audioRec.slot|0) === i) audioStopRecord(true);
          if (state._audioRec) { state._audioRec.holdActive = false; state._audioRec.cancelRequested = true; }
        } catch (e) {}
      });
});



    });

    if (clearPlayheads) {
      clearPlayheads.addEventListener('click', () => {
        state.audioSeq.playheads = [];
        state._audioLastByCell = {};
        audioSyncPlayheads();
        audioSetStatus('Playheads cleared');
      });
    }

    if (clearMap) {
      clearMap.addEventListener('click', () => {
        state.audioSeq.frameMap = {};
        audioUpdateChips();
        audioSetStatus('Map cleared');
      });
    }

    // Clear individual slots (sample + mappings)
    if (clearSlotBtns && clearSlotBtns.length) {
      clearSlotBtns.forEach((btn, i) => {
        if (!btn) return;
        if (btn.dataset && btn.dataset.clearBound === '1') return;
        if (btn.dataset) btn.dataset.clearBound = '1';

        btn.addEventListener('click', () => {
          if (!state.audioSeq) return;

          // clear only mappings pointing to this slot
          const map = state.audioSeq.frameMap || {};
          Object.keys(map).forEach(k => {
            const mm = map[k];
            if (mm && Number.isFinite(mm.slot) && (mm.slot|0) === (i|0)) delete map[k];
          });
          state.audioSeq.frameMap = map;

          audioUpdateChips();
          audioSetStatus(`S${i+1} mappings cleared`);
        });
      });
    }


    // Grid click mapping, only when mode != off
    if (framesGrid) {
      framesGrid.addEventListener('click', (e) => {
        if (!state.audioSeq) return;
        if (!state.audioSeq.mode || state.audioSeq.mode === 'off') return;

        const item = e.target && e.target.closest ? e.target.closest('.frame-item') : null;
        if (!item || !item.dataset) return;

        const cellIdx = parseInt(item.dataset.cellIdx, 10);
        const frameIdx = parseInt(item.dataset.frameIdx, 10);
        if (!Number.isFinite(cellIdx) || !Number.isFinite(frameIdx)) return;

        if (state.audioSeq.mode === 'playhead') {
          audioTogglePlayhead(cellIdx);
        } else if (state.audioSeq.mode === 'assign') {
          if (e.altKey) audioClearFrame(frameIdx);
          else if (e.shiftKey) audioCycleFrameVel(frameIdx);
          else audioAssignFrame(frameIdx);
        }
      });
    }

    audioUpdateFileNames();
    audioSyncPlayheads();
    audioUpdateChips();
    audioSetStatus(state.audioSeq.enabled ? 'enabled' : 'disabled');
  }

  // Keep playhead outlines and chips consistent after any grid rebuild or motion update.
  const _fgOrigRenderGrid = renderGrid;
  renderGrid = function() {
    _fgOrigRenderGrid();
    try { audioSyncPlayheads(); } catch (e) {}
    audioUpdateChips();
    try { syncBgUnderlayPreview(); } catch (e) {}
  };

  const _fgOrigUpdateAllCells = updateAllCells;
  updateAllCells = function() {
    _fgOrigUpdateAllCells();
    audioUpdateChips();
    try { audioSeqTick(); } catch (e) {}
  };

  const _fgOrigStartAnimation = startAnimation;
  startAnimation = function() {
    // prime to avoid instant trigger, then run
    try { audioPrimePlayheads(); } catch (e) {}
    _fgOrigStartAnimation();
  };

  try { audioInitUI(); } catch (e) {}
  try { audioQuickInitUI(); } catch (e) {}
  try { audioGrabInitUI(); } catch (e) {}
  try { audioTrimInitUI(); } catch (e) {}


// logging now integrated into original functions


  // PERF METER: UI FPS + composite cost (Info panel)
  // Uses rAF cadence as a proxy for overall UI smoothness.
  (function startPerfMeter() {
    let frames = 0;
    let t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    function tick(t) {
      frames++;
      const now = (typeof t === 'number') ? t : ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
      const dt = now - t0;

      if (dt >= 500) {
        state._uiFps = Math.round((frames * 1000) / dt);
        frames = 0;
        t0 = now;

        // Update just the perf rows, keep it lightweight.
        const elFps = document.getElementById('infoUiFps');
        if (elFps) elFps.textContent = (typeof state._uiFps === 'number' && state._uiFps > 0) ? String(state._uiFps) : '—';

        const elComp = document.getElementById('infoCompositeMs');
        if (elComp) elComp.textContent = (typeof state._compAvgMs === 'number' && state._compAvgMs > 0) ? `${state._compAvgMs.toFixed(1)} ms` : '—';
      }

      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  })();


  // Hold-to-repeat and Ctrl-to-multiply for +/- buttons
  let _btnRepeatTimer = null;
  let _btnRepeatInterval = null;

  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.menu-input-btn');
    if (!btn) return;

    const isCtrl = e.ctrlKey || e.metaKey;

    if (isCtrl) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (btn.id === 'cellMinus' || btn.id === 'cellPlus') return;
      const isPlus = btn.id.endsWith('Plus') || btn.textContent.includes('+');
      const isMinus = btn.id.endsWith('Minus') || btn.textContent.includes('−') || btn.textContent.includes('-');
      if (!isPlus && !isMinus) return;
      const group = btn.closest('.menu-input-group');
      if (group) {
        const input = group.querySelector('input[type="number"], input[type="text"]');
        if (input) {
          let val = parseInt(input.value, 10);
          if (!isNaN(val) && val > 0) {
            if (isPlus) val *= 2;
            else val = Math.max(1, Math.floor(val / 2));
            if (input.max) val = Math.min(parseInt(input.max, 10), val);
            if (input.min) val = Math.max(parseInt(input.min, 10), val);
            input.value = val;
            if (typeof input.onchange === 'function') input.onchange();
            else input.dispatchEvent(new Event('change'));
          }
        }
      }
      return;
    }

    _btnRepeatTimer = setTimeout(() => {
      _btnRepeatInterval = setInterval(() => {
        btn.click();
      }, 120);
    }, 400);
  });

  const stopBtnRepeat = () => {
    if (_btnRepeatTimer) clearTimeout(_btnRepeatTimer);
    if (_btnRepeatInterval) clearInterval(_btnRepeatInterval);
    _btnRepeatTimer = null;
    _btnRepeatInterval = null;
  };

  document.addEventListener('click', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.target.closest('.menu-input-btn')) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('pointerup', stopBtnRepeat);
  document.addEventListener('pointerleave', stopBtnRepeat, true);
  document.addEventListener('pointercancel', stopBtnRepeat);
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.menu-input-btn')) {
      e.preventDefault();
      stopBtnRepeat();
    }
  });

  // ── Meta tap-to-pick popup (Direction & Pattern) ──────────────────────────
  let _metaPickPopup = null;
  function closeMetaPick() {
    if (_metaPickPopup) { _metaPickPopup.remove(); _metaPickPopup = null; }
    document.querySelectorAll('.meta-cycle.open').forEach(el => el.classList.remove('open'));
  }
  function openMetaPick(cycleEl, selId) {
    closeMetaPick();
    const sel = document.getElementById(selId);
    if (!sel) return;
    cycleEl.classList.add('open');
    const popup = document.createElement('div');
    popup.className = 'meta-pick-popup';
    Array.from(sel.options).forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.textContent = opt.text;
      if (i === sel.selectedIndex) btn.classList.add('active');
      btn.ontouchstart = btn.onmousedown = (e) => {
        e.preventDefault(); e.stopPropagation();
        sel.selectedIndex = i;
        sel.dispatchEvent(new Event('change'));
        closeMetaPick();
      };
      popup.appendChild(btn);
    });
    document.body.appendChild(popup);
    _metaPickPopup = popup;
    // Position: above the tapped element, aligned left
    const rect = cycleEl.getBoundingClientRect();
    const ph = popup.offsetHeight || (sel.options.length * 36 + 8);
    let top = rect.top - ph - 6;
    let left = rect.left;
    if (top < 8) top = rect.bottom + 6;
    if (left + 160 > window.innerWidth) left = window.innerWidth - 164;
    popup.style.top  = `${top}px`;
    popup.style.left = `${left}px`;
  }
  document.addEventListener('pointerdown', (e) => {
    if (_metaPickPopup && !_metaPickPopup.contains(e.target)) closeMetaPick();
  }, true);

  function cycleSelect(selId, dir) {
    const sel = document.getElementById(selId);
    if (!sel || !sel.options.length) return;
    let idx = sel.selectedIndex + dir;
    if (idx < 0) idx = sel.options.length - 1;
    if (idx >= sel.options.length) idx = 0;
    sel.selectedIndex = idx;
    sel.dispatchEvent(new Event('change'));
  }
  const metaDirCycle = document.getElementById('metaDirCycle');
  const metaPtnCycle = document.getElementById('metaPtnCycle');
  if (metaDirCycle) metaDirCycle.onclick = () => openMetaPick(metaDirCycle, 'animDirection');
  if (metaPtnCycle) metaPtnCycle.onclick = () => openMetaPick(metaPtnCycle, 'animPattern');
  // ────────────────────────────────────────────────────────────────────────────

  // ── Loop Offset controls ────────────────────────────────────────────────────
  const loopOffsetInput  = $('loopOffsetInput');
  const loopOffsetMinus  = $('loopOffsetMinus');
  const loopOffsetPlus   = $('loopOffsetPlus');
  const loopOffsetRow    = $('loopOffsetRow');

  function _updateLoopOffsetRowVis() {
    if (loopOffsetRow) loopOffsetRow.style.display = state.loopAfterN >= 2 ? '' : 'none';
  }
  _updateLoopOffsetRowVis();

  if (loopOffsetInput) {
    loopOffsetInput.onchange = () => {
      state.loopOffset = Math.max(0, parseInt(loopOffsetInput.value) || 0);
      loopOffsetInput.value = state.loopOffset;
      updateAllCells();
    };
    loopOffsetMinus.onclick = () => {
      if (state.loopOffset > 0) {
        state.loopOffset--;
        loopOffsetInput.value = state.loopOffset;
        updateAllCells();
      }
    };
    loopOffsetPlus.onclick = () => {
      state.loopOffset = (state.loopOffset || 0) + 1;
      loopOffsetInput.value = state.loopOffset;
      updateAllCells();
    };
  }
  // ────────────────────────────────────────────────────────────────────────────

  // ── Save Points ─────────────────────────────────────────────────────────────
  (function() {
    function _spBtn(id) { return document.getElementById(id); }

    function _updateLoadBtn(idx) {
      const btn = _spBtn('savePointLoad' + (idx + 1));
      if (!btn) return;
      const hasData = !!(state.savePoints[idx]);
      btn.style.opacity = hasData ? '1' : '0.35';
      btn.title = hasData ? 'Load drawing from slot ' + (idx + 1) : 'Slot ' + (idx + 1) + ' empty';
    }

    async function savePoint(idx) {
      const sp = {};
      // frameSheet — PNG blob (~10x smaller than raw ImageData)
      if (frameSheetCanvas && frameSheetCanvas.width > 0 && frameSheetCanvas.height > 0) {
        sp.frameSheetBlob = await new Promise(r => frameSheetCanvas.toBlob(r, 'image/png'));
        sp.frameSheetW = frameSheetCanvas.width;
        sp.frameSheetH = frameSheetCanvas.height;
      }
      // bg layers
      if (state.bgDrawing)       sp.bgDrawing       = _cloneImageDataSafe(state.bgDrawing);
      if (state.bgDrawingSingle) sp.bgDrawingSingle = _cloneImageDataSafe(state.bgDrawingSingle);
      // template
      if (state.templateDrawing) sp.templateDrawing = _cloneImageDataSafe(state.templateDrawing);

      state.savePoints[idx] = sp;
      _updateLoadBtn(idx);

      // Flash the save button green
      const btn = _spBtn('savePointSave' + (idx + 1));
      if (btn) {
        btn.style.background = 'rgba(80,200,80,0.35)';
        setTimeout(() => { btn.style.background = ''; }, 600);
      }
    }

    async function loadPoint(idx) {
      const sp = state.savePoints[idx];
      if (!sp) return;

      // frameSheet
      if (sp.frameSheetBlob) {
        try {
          const bitmap = await createImageBitmap(sp.frameSheetBlob);
          ensureFrameSheet();
          frameSheetCtx.clearRect(0, 0, frameSheetCanvas.width, frameSheetCanvas.height);
          frameSheetCtx.drawImage(bitmap, 0, 0);
          bitmap.close();
          // sync state.frameSheetDrawing
          try {
            state.frameSheetDrawing = frameSheetCtx.getImageData(0, 0, frameSheetCanvas.width, frameSheetCanvas.height);
          } catch(e) {}
        } catch(e) {}
      } else {
        // slot was saved with empty frameSheet — clear it
        if (frameSheetCanvas) frameSheetCtx.clearRect(0, 0, frameSheetCanvas.width, frameSheetCanvas.height);
        state.frameSheetDrawing = null;
      }

      // bg layers
      if (sp.bgDrawing && bgCtx && bgCanvas) {
        state.bgDrawing = _cloneImageDataSafe(sp.bgDrawing);
        bgCtx.putImageData(state.bgDrawing, 0, 0);
      }
      if (sp.bgDrawingSingle && bgCtxSingle && bgCanvasSingle) {
        state.bgDrawingSingle = _cloneImageDataSafe(sp.bgDrawingSingle);
        bgCtxSingle.putImageData(state.bgDrawingSingle, 0, 0);
      }

      // template
      if (sp.templateDrawing && tplCtx && tplCanvas) {
        state.templateDrawing = _cloneImageDataSafe(sp.templateDrawing);
        tplCtx.putImageData(state.templateDrawing, 0, 0);
      }

      requestComposite();

      // Flash the load button
      const btn = _spBtn('savePointLoad' + (idx + 1));
      if (btn) {
        btn.style.background = 'rgba(80,160,255,0.35)';
        setTimeout(() => { btn.style.background = ''; }, 600);
      }
    }

    // Wire buttons
    for (let i = 0; i < 3; i++) {
      const si = i; // closure
      const sBtn = _spBtn('savePointSave' + (i + 1));
      const lBtn = _spBtn('savePointLoad' + (i + 1));
      if (sBtn) sBtn.onclick = () => savePoint(si);
      if (lBtn) lBtn.onclick = () => loadPoint(si);
      _updateLoadBtn(i);
    }
  })();
  // ────────────────────────────────────────────────────────────────────────────

  // ── TC Align button group ──────────────────────────────────────────────────
  const tcAlignGroup = document.getElementById('tcAlignGroup');
  const tcPositionGroup = document.getElementById('tcPositionGroup');
  // tcAlignSelect and tcPositionSelect already declared above via $()

  function initTcBtnGroup(groupEl, selectEl, stateKey) {
    if (!groupEl || !selectEl) return;
    groupEl.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        groupEl.querySelectorAll('button').forEach(b => b.classList.remove('active-toggle'));
        btn.classList.add('active-toggle');
        selectEl.value = btn.dataset.val;
        state[stateKey] = btn.dataset.val;
        selectEl.dispatchEvent(new Event('change'));
      };
    });
  }
  initTcBtnGroup(tcAlignGroup,    tcAlignSelect,    'tcAlign');
  initTcBtnGroup(tcPositionGroup, tcPositionSelect, 'tcPosition');

  // ── TC Color buttons — sync background ────────────────────────────────────
  function syncColorBtn(btnId, inputId) {
    const btn   = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;
    const sync = () => { btn.style.background = input.value; };
    input.addEventListener('input',  sync);
    input.addEventListener('change', sync);
    sync();
  }
  syncColorBtn('tcTextColorBtn', 'tcTextColor');
  syncColorBtn('tcBgColorBtn',   'tcBgColor');
  // ────────────────────────────────────────────────────────────────────────────

  // ── Reset Memory & Grid ────────────────────────────────────────────────────

  const menuCollapseBtn = $('menuCollapseBtn');
  if (menuCollapseBtn) menuCollapseBtn.onclick = () => toggleAllSections();

  const resetMemoryBtn = $('resetMemoryBtn');
  if (resetMemoryBtn) {
    resetMemoryBtn.onclick = () => {
      if (!confirm('Clear all drawings and reload the grid? Frame data is kept.')) return;
      // 1. Stop animation
      if (state.isPlaying) stopAnimation();
      // 2. Clear drawing layers
      state.bgDrawing = null;
      state.bgDrawingSingle = null;
      state.templateDrawing = null;
      state.frameDrawings = {};
      state.frameSheetDrawing = null;
      state.frameSheetCols = 0;
      state.frameSheetRows = 0;
      // 3. Clear draw canvases
      try {
        if (typeof drawCtx !== 'undefined' && drawCtx && drawCanvas) {
          drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        }
        if (typeof tplCtx !== 'undefined' && tplCtx && tplCanvas) {
          tplCtx.clearRect(0, 0, tplCanvas.width, tplCanvas.height);
        }
        if (typeof frameSheetCanvas !== 'undefined' && frameSheetCanvas) {
          const fsc = frameSheetCanvas;
          fsc.getContext('2d').clearRect(0, 0, fsc.width, fsc.height);
        }
      } catch(e) {}
      // 4. Revoke any blob/object URLs from frames to free GPU texture memory
      if (state.frames && state.frames.length) {
        state.frames.forEach(f => {
          if (f && f.objectUrl) { try { URL.revokeObjectURL(f.objectUrl); } catch(e) {} }
        });
      }
      // 5. Invalidate DOM/cell caches
      invalidateCellCaches();
      // 6. Re-render grid (DOM rebuild, fresh canvases)
      if (state.frames && state.frames.length) {
        renderGrid();
        updateGridHint();
        fitActiveView();
      }
      resetMemoryBtn.textContent = 'Done ✓';
      setTimeout(() => { resetMemoryBtn.textContent = 'Reset Memory & Grid'; }, 2000);
    };
  }
  // ────────────────────────────────────────────────────────────────────────────

})();
