import { createDarkSelects } from './drawing-select.mjs';
// Presentation only. Existing drawing controls remain the source of truth.
export function createDrawingPanel({ change, finish }) {
  const $ = (id) => document.getElementById(id);
  const targets = ['frm', 'tpl', 'bg'];
  const selects = createDarkSelects();
  const swatches = [...document.querySelectorAll('[data-color-slot]')];
  const colors = [$('color').value, '#e6392e', '#111111'];
  let selectedColor = 0;
  let lastState = '';
  const setMenu = (open) => {
    $('settingsDrawer').hidden = !open;
    $('settingsToggle').setAttribute('aria-expanded', String(open));
    if (!open) $('settingsToggle').focus({ preventScroll: true });
  };
  $('settingsToggle').onclick = () => setMenu($('settingsDrawer').hidden);
  $('settingsClose').onclick = () => setMenu(false);
  // Close the menu first; Escape on the canvas keeps its existing Brush Off action.
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.code === 'Escape' && !$('settingsDrawer').hidden) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setMenu(false);
      }
    },
    true,
  );
  $('targetCycle').onclick = () =>
    change(
      'target',
      targets[(targets.indexOf($('target').value) + 1) % targets.length],
    );
  $('eraserToggle').onclick = () => {
    if ($('brushType').value === 'fill') change('brushType', 'round');
    change('brushOff', false);
    change('tool', $('tool').value === 'erase' ? 'pen' : 'erase');
  };
  $('drawEnabled').onclick = () => {
    const off = $('brushOff').checked || $('tool').value === 'pan';
    if ($('brushType').value === 'fill') change('brushType', 'round');
    change('tool', 'pen');
    change('brushOff', !off);
  };
  $('parameter').onchange = sync;
  for (const id of ['opacity', 'softness']) {
    const number = $(id + 'Number');
    number.oninput = () => {
      if (number.value === '' || !number.validity.valid) return;
      $(id).value = number.value;
      $(id).dispatchEvent(new Event('input'));
    };
    number.onchange = () => {
      const value = Math.max(
        Number($(id).min),
        Math.min(Number($(id).max), Number(number.value) || 0),
      );
      number.value = value;
      $(id).value = value;
      $(id).dispatchEvent(new Event('input'));
    };
  }
  swatches.forEach((button, index) => {
    button.onclick = () => {
      finish();
      selectedColor = index;
      $('color').value = colors[index];
      sync();
    };
  });
  $('color').addEventListener('input', () => {
    colors[selectedColor] = $('color').value;
    sync();
  });
  function sync() {
    selects.sync();
    const state =
      [
        'target',
        'tool',
        'brushType',
        'brushOff',
        'longStroke',
        'trail',
        'view',
        'parameter',
        'opacity',
        'softness',
        'color',
      ]
        .map((id) => ($(id).type === 'checkbox' ? $(id).checked : $(id).value))
        .join('|') +
      '|' +
      selectedColor;
    if (state === lastState) return;
    lastState = state;
    const target = $('target').value;
    $('targetCycle').textContent = target.toUpperCase();
    $('targetCycle').setAttribute(
      'aria-label',
      'Drawing target: ' + target.toUpperCase(),
    );
    $('targetCycle').title =
      'Drawing target: ' +
      target.toUpperCase() +
      '. Click: FRM → TPL → BG. Q/W/E also select targets.';
    $('eraserToggle').setAttribute(
      'aria-pressed',
      String($('tool').value === 'erase'),
    );
    const enabled = !$('brushOff').checked && $('tool').value !== 'pan';
    $('drawEnabled').setAttribute('aria-pressed', String(enabled));
    $('drawEnabled').textContent = enabled ? 'Draw' : 'Off';
    $('longLabel').textContent = $('longStroke').checked
      ? 'Long ' + $('trail').value
      : 'Long';
    $('trail').closest('label').hidden = !$('longStroke').checked;
    $('bgAbove').closest('label').hidden = target !== 'bg';
    $('bake').hidden = target !== 'tpl';
    const clearScope =
      target === 'frm'
        ? 'all 96 frame drawings'
        : target === 'tpl'
          ? 'the template drawing'
          : 'the ' + $('view').value + ' background drawing';
    $('clear').title = 'Clear ' + clearScope + '. Undo restores it.';
    $('clear').setAttribute('aria-label', 'Clear ' + clearScope);
    $('clearHint').textContent =
      'Clear on the brush panel removes ' + clearScope + '. Undo restores it.';
    document
      .querySelectorAll('[data-parameter]')
      .forEach(
        (el) => (el.hidden = el.dataset.parameter !== $('parameter').value),
      );
    for (const id of ['opacity', 'softness']) {
      if (document.activeElement !== $(id + 'Number'))
        $(id + 'Number').value = $(id).value;
    }
    colors[selectedColor] = $('color').value;
    swatches.forEach((button, index) => {
      button.firstElementChild.style.backgroundColor = colors[index];
      button.setAttribute(
        'aria-label',
        'Color ' + (index + 1) + ': ' + colors[index],
      );
      button.setAttribute('aria-pressed', String(index === selectedColor));
    });
  }
  return { sync };
}
