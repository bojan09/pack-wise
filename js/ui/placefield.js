// Destination autocomplete: an accessible combobox (ARIA 1.2 pattern) over a plain text input.
// Suggestions come from OpenStreetMap via Photon (js/online.js), only while the "place suggestions" preference is on,
// from 3 letters and after a short pause; a newer keystroke cancels the older request. Offline it stays quiet and
// the field works as an ordinary text box. With suggestions off, a "Look up" button does the same search once, on a tap.
import { h, domId } from '../dom.js';
import { button } from './components.js';

const DEBOUNCE_MS = 350;

/**
 * @param {{input: HTMLInputElement, picked?: string, enabled: () => boolean, onPick: (place: object) => void, onClear: () => void, load?: () => Promise<any>}} opts
 * @returns {HTMLElement} wrapper holding the input, the list and a live status line
 */
export function placeField({ input, picked = '', enabled, onPick, onClear, load = () => import('../online.js') }) {
  const listId = domId('place-list');
  const list = h('ul', { class: 'place-suggest', id: listId, role: 'listbox', 'aria-label': 'Suggested places', hidden: true });
  const status = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const note = h('p', { class: 'muted small place-note' }); // visible feedback for the tap-to-look-up path
  const manual = !enabled();
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', listId);
  input.setAttribute('autocomplete', 'off');

  let items = [];
  let active = -1;
  let timer = null;
  let ctl = null;

  const close = () => {
    list.hidden = true;
    list.replaceChildren();
    items = [];
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };

  const setActive = (i) => {
    active = i;
    [...list.children].forEach((li, n) => li.setAttribute('aria-selected', n === i ? 'true' : 'false'));
    if (i >= 0 && list.children[i]) {
      input.setAttribute('aria-activedescendant', list.children[i].id);
      list.children[i].scrollIntoView?.({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  };

  const pick = (p) => {
    picked = p.text;
    input.value = p.text;
    close();
    status.textContent = `Picked ${p.label}`;
    note.textContent = '';
    onPick(p);
  };

  const render = (found) => {
    items = found;
    list.replaceChildren(...found.map((p, i) => h('li', { id: `${listId}-${i}`, role: 'option', class: 'place-option', 'aria-selected': 'false', onMousedown: (e) => e.preventDefault(), onClick: () => pick(p) },
      h('strong', { text: p.name }), h('span', { class: 'muted small', text: p.label.slice(p.name.length).replace(/^,\s*/, '') || (p.large ? 'Country or region' : '') }))));
    list.hidden = found.length === 0;
    input.setAttribute('aria-expanded', found.length ? 'true' : 'false');
    active = -1;
    status.textContent = found.length ? `${found.length} suggested place${found.length === 1 ? '' : 's'}. Use the arrow keys to choose.` : 'No suggested places.';
  };

  async function lookup(q, tapped = false) {
    ctl?.abort();
    ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const mine = ctl;
    try {
      const { suggestPlaces } = await load();
      const found = await suggestPlaces(q, { signal: mine?.signal });
      if (mine !== ctl || input.value.trim() !== q) return; // the user kept typing
      render(found.map((p) => ({ ...p, text: p.country && p.country !== p.name ? `${p.name}, ${p.country}` : p.name })));
      if (tapped) note.textContent = found.length ? 'Pick the right place from the list.' : 'No matching places. Check the spelling or try a larger town nearby.';
      if (tapped && found.length) input.focus(); // arrow keys work from the input
    } catch (e) {
      if (e?.code === 'cancelled' || mine !== ctl) return;
      close();
      status.textContent = e?.code === 'offline' ? 'Place suggestions need a connection.' : '';
      if (tapped) note.textContent = e?.code === 'offline' ? 'Looking up a place needs a connection.' : 'The place search is not answering right now. Try again later.';
    }
  }

  input.addEventListener('input', () => {
    note.textContent = '';
    if (input.value !== picked && picked) { picked = ''; onClear(); }
    clearTimeout(timer);
    const q = input.value.trim();
    if (!enabled() || q.length < 3) { ctl?.abort(); close(); return; }
    timer = setTimeout(() => lookup(q), DEBOUNCE_MS);
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden || !items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((active + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active <= 0 ? items.length - 1 : active - 1); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(items[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  input.addEventListener('blur', () => setTimeout(close, 150));

  const lookUp = () => {
    const q = input.value.trim();
    if (q.length < 3) { note.textContent = 'Type at least 3 letters, then tap Look up.'; input.focus(); return; }
    note.textContent = 'Looking up…';
    lookup(q, true);
  };
  return h('div', { class: 'place-field' },
    h('div', { class: 'place-row' }, input, manual ? button({ label: 'Look up', icon: 'search', variant: 'secondary', className: 'place-lookup', onClick: lookUp }) : null, list),
    status, note);
}
