import { createDarkSelects } from './drawing-select.mjs';
export function mountTimeGridDrawingPanel({
  state,
  engine,
  commands,
  isLocked,
}) {
  const $ = (id) => document.getElementById(id),
    panel = $('drawPalette'),
    selects = createDarkSelects(panel);
  const colors = ['#ffffff', '#e6392e', '#111111'];
  let selected = 0,
    drag = null;
  const parameters = {
    size: {
      key: 'drawSize',
      min: 1,
      max: 120,
      step: 1,
      scale: 1,
      set: commands.size,
    },
    opacity: {
      key: 'drawOpacity',
      min: 5,
      max: 100,
      step: 1,
      scale: 100,
      set: (v) => commands.opacity(v / 100),
    },
    edge: {
      key: 'edgeSoftness',
      min: 0,
      max: 100,
      step: 1,
      scale: 100,
      set: (v) => commands.edge(v / 100),
    },
  };
  const act = (id, fn) => {
    $(id).onclick = () => {
      try {
        engine.finish();
        fn();
        sync();
      } catch (e) {
        commands.report(e.message);
      }
    };
  };
  act('drawTargetCycle', () => {
    const targets = ['frame', 'template', 'background'];
    commands.target(targets[(targets.indexOf(state.drawTarget) + 1) % 3]);
  });
  $('drawBrushType').onchange = () => {
    engine.finish();
    state.brushType = $('drawBrushType').value;
    state.drawEraser = false;
    sync();
  };
  act('drawEraser', () => {
    state.drawEraser = !state.drawEraser;
    if (state.brushType === 'fill') state.brushType = 'round';
  });
  act('drawBrushLock', commands.lock);
  act('drawUndo', () => engine.undo());
  act('drawRedo', () => engine.redo());
  act('drawClear', () => engine.clearTarget());
  act('drawOneFrameBtn', () => (state.drawOneFrame = !state.drawOneFrame));
  act('drawLongStroke', commands.long);
  act('drawOnion', commands.onion);
  act('toggleTemplateVisibility', commands.templateVisible);
  act('applyTemplateToFrames', () => engine.bake());
  act('toggleBgAboveDrawings', () => {
    state.bgLayerAboveDrawings = !state.bgLayerAboveDrawings;
    commands.render();
  });
  act('toggleBrushPanel', commands.palette);
  act('drawSave', () => {
    if (matchMedia('(max-width: 600px)').matches)
      $('drawSavePopover').hidden = !$('drawSavePopover').hidden;
    else engine.save();
  });
  act('drawSaveFile', () => {
    engine.save();
    $('drawSavePopover').hidden = true;
  });
  act('drawOpen', () => $('drawOpenFile').click());
  $('drawOpenFile').onchange = async (e) => {
    try {
      await engine.openFile(e.target.files[0]);
    } catch (err) {
      commands.report(err.message);
    }
    e.target.value = '';
    sync();
  };
  for (let i = 1; i <= 3; i++)
    for (const prefix of ['', 'Mobile']) {
      act('savePoint' + prefix + 'Save' + i, () => engine.saveSlot(i - 1));
      act('savePoint' + prefix + 'Load' + i, () => {
        engine.loadSlot(i - 1);
        $('drawSavePopover').hidden = true;
      });
    }
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('#drawSavePopover,#drawSave'))
      $('drawSavePopover').hidden = true;
  });
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.code === 'Escape' && !$('drawSavePopover').hidden) {
        $('drawSavePopover').hidden = true;
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  panel.querySelectorAll('[data-quick-color]').forEach(
    (el, i) =>
      (el.onclick = () => {
        engine.finish();
        selected = i;
        commands.color(colors[i]);
        sync();
      }),
  );
  $('drawColorInput').oninput = () => {
    engine.finish();
    colors[selected] = $('drawColorInput').value;
    commands.color(colors[selected]);
    sync();
  };
  $('drawParameter').onchange = sync;
  const parameterChange = (v) => {
    engine.finish();
    parameters[$('drawParameter').value].set(v);
    sync();
  };
  $('drawParameterSlider').oninput = (e) =>
    parameterChange(Number(e.target.value));
  $('drawParameterNumber').onchange = (e) =>
    parameterChange(Number(e.target.value));
  act('drawParameterMinus', () => {
    const p = parameters[$('drawParameter').value];
    parameterChange(Math.round(state[p.key] * p.scale) - p.step);
  });
  act('drawParameterPlus', () => {
    const p = parameters[$('drawParameter').value];
    parameterChange(Math.round(state[p.key] * p.scale) + p.step);
  });
  for (const [id, key, scale, min, max] of [
    ['drawSizeSlider', 'drawSize', 1, 1, 120],
    ['drawOpacitySlider', 'drawOpacity', 100, 5, 100],
    ['edgeSoftnessSlider', 'edgeSoftness', 100, 0, 100],
    ['drawStabilizer', 'drawStabilizer', 100, 0, 100],
    ['drawSmoothing', 'drawSmoothing', 100, 0, 100],
    ['sprayScatterSlider', 'sprayScatter', 100, 5, 300],
    ['sprayDotScaleSlider', 'sprayDotScale', 100, 5, 300],
    ['sprayDensitySlider', 'sprayDensity', 100, 10, 300],
  ]) {
    $(id).oninput = (e) => {
      engine.finish();
      const value =
        Math.max(min, Math.min(max, Number(e.target.value))) / scale;
      if (key === 'drawSize') commands.size(value);
      else if (key === 'drawOpacity') commands.opacity(value);
      else if (key === 'edgeSoftness') commands.edge(value);
      else state[key] = value;
      sync();
    };
  }
  for (const id of ['drawPressure', 'drawSpeed', 'drawWithFinger'])
    act(id, () => (state[id] = !state[id]));
  $('longStrokeFade').onchange = (e) => {
    engine.finish();
    const n = Number(e.target.value);
    state.longStrokeFade = Number.isFinite(n)
      ? Math.max(0, Math.min(100, Math.round(n)))
      : 8;
    sync();
  };
  $('genVideoPalette').onclick = commands.videoPalette;
  $('genFramePalette').onclick = commands.framePalette;
  function clamp() {
    const r = panel.getBoundingClientRect();
    if (!r.width) return;
    panel.style.left =
      Math.max(
        4,
        Math.min(parseFloat(panel.style.left) || 16, innerWidth - r.width - 4),
      ) + 'px';
    panel.style.top =
      Math.max(
        4,
        Math.min(
          parseFloat(panel.style.top) || 100,
          innerHeight - r.height - 4,
        ),
      ) + 'px';
  }
  const handle = $('drawDragHandle');
  handle.onpointerdown = (e) => {
    if (e.button !== 0) return;
    const r = panel.getBoundingClientRect();
    drag = { x: e.clientX, y: e.clientY, l: r.left, t: r.top };
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  };
  handle.onpointermove = (e) => {
    if (!drag) return;
    panel.style.left = drag.l + e.clientX - drag.x + 'px';
    panel.style.top = drag.t + e.clientY - drag.y + 'px';
    clamp();
  };
  handle.onpointerup = handle.onpointercancel = () => (drag = null);
  window.addEventListener('resize', () => {
    clamp();
    $('drawSavePopover').hidden = true;
  });
  panel.style.left = '16px';
  panel.style.top = matchMedia('(max-width: 600px)').matches
    ? Math.max(100, innerHeight - 200) + 'px'
    : '100px';
  function pressed(id, on) {
    const el = $(id);
    el.classList.toggle('active', !!on);
    el.setAttribute('aria-pressed', String(!!on));
  }
  function sync() {
    $('drawTargetCycle').textContent =
      { frame: 'FRM', template: 'TPL', background: 'BG' }[state.drawTarget] ||
      'FRM';
    $('drawBrushType').value = state.brushType;
    selects.sync();
    colors[selected] = state.drawColor;
    $('drawColorInput').value = state.drawColor;
    panel.querySelectorAll('[data-quick-color]').forEach((el, i) => {
      el.style.background = colors[i];
      el.classList.toggle('selected', i === selected);
      el.setAttribute('aria-pressed', String(i === selected));
    });
    const p = parameters[$('drawParameter').value],
      value = Math.round(state[p.key] * p.scale);
    for (const id of ['drawParameterSlider', 'drawParameterNumber'])
      Object.assign($(id), { min: p.min, max: p.max, step: p.step, value });
    $('drawParameterNumber').setAttribute(
      'aria-label',
      $('drawParameter').selectedOptions[0].textContent,
    );
    for (const [id, key, scale] of [
      ['drawSizeSlider', 'drawSize', 1],
      ['drawOpacitySlider', 'drawOpacity', 100],
      ['edgeSoftnessSlider', 'edgeSoftness', 100],
      ['drawStabilizer', 'drawStabilizer', 100],
      ['drawSmoothing', 'drawSmoothing', 100],
      ['sprayScatterSlider', 'sprayScatter', 100],
      ['sprayDotScaleSlider', 'sprayDotScale', 100],
      ['sprayDensitySlider', 'sprayDensity', 100],
    ]) {
      const v = Math.round(state[key] * scale);
      $(id).value = v;
      $(id + 'Value').textContent = v + (scale === 100 ? '%' : '');
    }
    for (const [id, on] of [
      ['drawEraser', state.drawEraser],
      ['drawOneFrameBtn', state.drawOneFrame],
      ['drawLongStroke', state.drawLongStroke],
      ['drawOnion', state.drawOnion],
      ['toggleTemplateVisibility', state.showTemplateDrawing],
      ['toggleBgAboveDrawings', state.bgLayerAboveDrawings],
      ['toggleBrushPanel', panel.classList.contains('visible')],
      ['drawBrushLock', !isLocked()],
      ['drawPressure', state.drawPressure],
      ['drawSpeed', state.drawSpeed],
      ['drawWithFinger', state.drawWithFinger],
    ])
      pressed(id, on);
    $('drawBrushLock').textContent = isLocked() ? 'Off' : 'Draw';
    $('drawLongStroke').title =
      'Long Stroke (L) · Trail ' + state.longStrokeFade;
    $('longStrokeFade').value = state.longStrokeFade;
    $('drawUndo').disabled = !engine.document.undoStack.length;
    $('drawRedo').disabled = !engine.document.redoStack.length;
    for (let i = 1; i <= 3; i++)
      for (const prefix of ['', 'Mobile'])
        $('savePoint' + prefix + 'Load' + i).disabled = !engine.slots[i - 1];
    clamp();
  }
  sync();
  return { sync, clamp };
}
