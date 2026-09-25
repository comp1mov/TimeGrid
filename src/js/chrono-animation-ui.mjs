import { createChronoKeys, normalizeChronoKeys, evaluateChronoPercent } from './chrono-animation.mjs';

export function mountChronoAnimation({ state, onChange, currentFrame, seekFrame }) {
  const panel = document.getElementById('chronoAnimationPanel');
  const toggle = document.getElementById('toggleChronoAnimation');
  const disclosure = document.getElementById('chronoAnimationDisclosure');
  const body = document.getElementById('chronoAnimationBody');
  const rows = document.getElementById('chronoAnimationRows');
  const add = document.getElementById('chronoAnimationAdd');
  const curve = document.getElementById('chronoAnimationCurve');
  const marker = document.getElementById('chronoAnimationMarker');
  const interpolation = document.getElementById('chronoAnimationInterpolation');
  const status = document.getElementById('chronoAnimationStatus');
  const animation = state.chronoAnimation;
  let knownCount = -1;

  function open() {
    body.hidden = false;
    disclosure.setAttribute('aria-expanded', 'true');
  }
  function focusKey(frame) {
    const input = rows.querySelector(`[data-frame="${frame}"] input[data-field="percent"]`);
    input?.focus();
    input?.select();
  }
  function drawCurve() {
    const n = state.frames.length;
    const points = Array.from({ length: 201 }, (_, i) => {
      const percent = evaluateChronoPercent(animation.keys, i / 200 * Math.max(0, n - 1), animation.interpolation);
      return `${i},${48 - percent * 0.44}`;
    });
    curve.setAttribute('points', points.join(' '));
  }
  function render() {
    toggle.classList.toggle('active', animation.enabled);
    toggle.setAttribute('aria-checked', String(animation.enabled));
    interpolation.value = animation.interpolation;
    document.getElementById('chronoAnimationCount').textContent = animation.initialized ? ` · ${animation.keys.length}` : '';
    rows.replaceChildren();
    for (const key of animation.keys) {
      const row = document.createElement('div');
      row.className = 'chrono-key-row';
      row.dataset.frame = key.frame;
      for (const field of ['frame', 'percent']) {
        const input = document.createElement('input');
        input.className = 'menu-input';
        input.type = 'number';
        input.dataset.field = field;
        input.min = field === 'frame' ? '1' : '0';
        input.max = field === 'frame' ? String(state.frames.length) : '100';
        input.step = field === 'frame' ? '1' : 'any';
        input.value = field === 'percent' ? Number(key.percent.toFixed(4)) : key.frame;
        input.setAttribute('aria-label', field === 'frame' ? `Key frame ${key.frame}` : `Copies percent at frame ${key.frame}`);
        input.addEventListener('change', () => {
          if (!input.value.trim() || !Number.isFinite(Number(input.value))) { input.value = key[field]; return; }
          const value = Math.max(Number(input.min), Math.min(Number(input.max), Number(input.value)));
          if (field === 'frame') {
            const frame = Math.round(value);
            if (animation.keys.some(other => other !== key && other.frame === frame)) {
              input.value = key.frame;
              status.textContent = `Frame ${frame} already has a key.`;
              focusKey(frame);
              return;
            }
            key.frame = frame;
          } else key.percent = value;
          commit();
        });
        row.append(input);
      }
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'menu-input-btn';
      go.textContent = '▸';
      go.title = `Go to frame ${key.frame}`;
      go.setAttribute('aria-label', go.title);
      go.disabled = key.frame > state.frames.length;
      go.onclick = () => {
        status.textContent = seekFrame(key.frame - 1) ? '' : 'This frame is skipped by the current playback pattern.';
      };
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'menu-input-btn';
      remove.textContent = '×';
      remove.title = `Delete key at frame ${key.frame}`;
      remove.setAttribute('aria-label', remove.title);
      remove.onclick = () => {
        animation.keys = animation.keys.filter(other => other !== key);
        commit();
      };
      row.append(go, remove);
      rows.append(row);
    }
    const outside = animation.keys.filter(key => key.frame > state.frames.length).length;
    status.textContent = !state.frames.length ? 'Load frames to add keys.'
      : !animation.keys.length && animation.initialized ? 'No keys — using Frame Depth.'
      : outside ? `${outside} key${outside === 1 ? '' : 's'} beyond this clip. Edit their frame numbers if needed.` : '';
    drawCurve();
  }
  function commit() {
    animation.keys = normalizeChronoKeys(animation.keys);
    render();
    onChange();
  }
  disclosure.onclick = () => {
    body.hidden = !body.hidden;
    disclosure.setAttribute('aria-expanded', String(!body.hidden));
  };
  toggle.onclick = () => {
    animation.enabled = !animation.enabled;
    if (animation.enabled) {
      if (!animation.initialized && state.frames.length) {
        animation.keys = createChronoKeys(state.frames.length);
        animation.initialized = true;
      }
      open();
    }
    render();
    onChange();
  };
  add.onclick = () => {
    if (!state.frames.length) return;
    const frame = currentFrame() + 1;
    if (!animation.keys.some(key => key.frame === frame)) {
      const percent = evaluateChronoPercent(animation.keys, frame - 1, animation.interpolation);
      animation.keys.push({ frame, percent });
      animation.initialized = true;
      commit();
    }
    open();
    focusKey(frame);
  };
  interpolation.onchange = () => {
    animation.interpolation = interpolation.value;
    commit();
  };
  // Do not let playback shortcuts intercept key editing.
  panel.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Enter' && event.target.tagName === 'INPUT') event.target.blur();
  });

  function sync() {
    const n = state.frames.length;
    if (knownCount !== n) {
      knownCount = n;
      if (n && animation.enabled && !animation.initialized) {
        animation.keys = createChronoKeys(n);
        animation.initialized = true;
      }
      toggle.disabled = !n;
      add.disabled = !n;
      render();
    }
    if (!body.hidden && n) {
      const x = currentFrame() / Math.max(1, n - 1) * 200;
      marker.setAttribute('x1', x);
      marker.setAttribute('x2', x);
    }
  }
  sync();
  return { sync };
}
