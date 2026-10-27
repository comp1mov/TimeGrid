// Dark, keyboard-accessible presentation for the existing select controls.
// Native values/change events stay the single source of truth.
export function createDarkSelects(root = document) {
  const entries = [];
  let open = null;
  const popup = document.createElement('div');
  popup.className = 'select-popup';
  popup.hidden = true;
  popup.setAttribute('role', 'listbox');
  popup.id = 'drawing-select-options';
  document.body.append(popup);
  function close(focus = false) {
    if (!open) return;
    const button = open.button;
    open = null;
    popup.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (focus) button.focus({ preventScroll: true });
  }
  function show(entry) {
    close();
    open = entry;
    popup.replaceChildren();
    const { select, button } = entry;
    for (const option of select.options) {
      const item = document.createElement('button');
      item.type = 'button';
      item.textContent = option.textContent;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.selected));
      item.disabled = option.disabled;
      item.onclick = () => {
        select.value = option.value;
        close(true);
        select.dispatchEvent(new Event('change', { bubbles: true }));
        sync();
      };
      popup.append(item);
    }
    const r = button.getBoundingClientRect();
    popup.style.minWidth = Math.max(112, r.width) + 'px';
    popup.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    const height = Math.min(popup.scrollHeight, window.innerHeight - 16);
    popup.style.top =
      Math.max(
        8,
        r.bottom + height > window.innerHeight - 8
          ? r.top - height
          : r.bottom + 4,
      ) + 'px';
    popup.style.left =
      Math.max(8, Math.min(r.left, window.innerWidth - popup.offsetWidth - 8)) +
      'px';
    (
      popup.querySelector('[aria-selected="true"]') || popup.firstElementChild
    )?.focus();
  }
  for (const select of root.querySelectorAll('select')) {
    if (select.closest('[hidden]')) continue;
    const wrapper = document.createElement('span');
    wrapper.className = 'dark-select';
    select.before(wrapper);
    wrapper.append(select);
    const button = document.createElement('button');
    button.type = 'button';
    button.id = select.id + '-trigger';
    button.className = 'select-trigger';
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-controls', popup.id);
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute(
      'aria-label',
      select
        .closest('label')
        ?.textContent.trim()
        .replace(/\s+/g, ' ')
        .slice(0, 90) || select.id,
    );
    select.classList.add('select-source');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    wrapper.append(button);
    const entry = { select, button };
    entries.push(entry);
    button.onclick = (e) => {
      e.preventDefault();
      open === entry ? close() : show(entry);
    };
    button.addEventListener('keydown', (e) => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.code)) {
        e.preventDefault();
        e.stopPropagation();
        show(entry);
      }
    });
    select.addEventListener('change', sync);
  }
  document.addEventListener('pointerdown', (e) => {
    if (open && !popup.contains(e.target) && !open.button.contains(e.target))
      close();
  });
  window.addEventListener('resize', () => close());
  window.addEventListener(
    'keydown',
    (e) => {
      if (!open) return;
      e.stopImmediatePropagation();
      if (e.code === 'Escape' || e.code === 'Tab') {
        if (e.code === 'Escape') e.preventDefault();
        close(true);
        return;
      }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.code)) {
        e.preventDefault();
        const options = [...popup.querySelectorAll('button:not(:disabled)')];
        const index = options.indexOf(document.activeElement);
        options[
          e.code === 'Home'
            ? 0
            : e.code === 'End'
              ? options.length - 1
              : (index + (e.code === 'ArrowDown' ? 1 : -1) + options.length) %
                options.length
        ]?.focus();
      }
    },
    true,
  );
  function sync() {
    for (const { select, button } of entries) {
      button.textContent =
        (select.selectedOptions[0]?.textContent || '') + ' ▾';
      button.disabled = select.disabled;
    }
  }
  sync();
  return { sync };
}
