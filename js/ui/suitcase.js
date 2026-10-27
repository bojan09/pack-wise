// Pseudo-3D suitcase stage built from layered HTML/CSS with perspective transforms
// (no WebGL, no dependencies). Purely a *view* of store data: nothing here ever writes
// to the store, and every animation is cosmetic and cancellable, so rapid taps, bag
// switches and navigation can never leave the saved checklist in a wrong state.
import { h } from '../dom.js';
import { categoryKey } from '../models.js';
import { itemArt } from './itemart.js';

export const SLOTS = 24; // tokens drawn in the case; the rest are summarised as "+N"
const COLS = 6;
export const TRAY_MAX = 14;

export const VIEWS = [
  { id: 'front', label: 'Front', yaw: 0, tilt: 58 },
  { id: 'left', label: 'Left', yaw: -34, tilt: 58 },
  { id: 'right', label: 'Right', yaw: 34, tilt: 58 },
  { id: 'top', label: 'Top', yaw: 0, tilt: 80 },
];
export const ZOOMS = [1, 1.25, 1.5];

/** Small picture of the item itself (see itemart.js), tinted with its category color. Used in the case, tray and tiles. */
export function tokenFace(item, { size = 'md' } = {}) {
  const cat = categoryKey(item.category);
  const face = h('span', { class: `tok tok-${size}`, 'data-cat': cat, 'aria-hidden': 'true' }, itemArt(item.name, cat));
  if (item.target > 1) face.append(h('span', { class: 'tok-count', text: `×${item.target}` }));
  return face;
}

/**
 * @param {{motion: () => 'reduced'|'standard'|'enhanced', onSelect: (id: string) => void, onPackTray: (id: string) => void}} opts
 */
export function createStage({ motion, onSelect, onPackTray }) {
  const flights = new Map(); // itemId -> { finish() }
  const caseEls = new Map(); // itemId -> element in the case
  const slots = new Map(); // itemId -> slot index
  const trayEls = new Map(); // itemId -> tray button
  let lidOpen = true;
  let selectedId = '';
  let disposed = false;
  const trayRef = { host: null, more: null };

  const tokensLayer = h('div', { class: 'tokens3d' });
  const lid = h('div', { class: 'lid' }, h('div', { class: 'lid-in' }, h('span', { class: 'lid-pocket' }), h('span', { class: 'lid-strap' })), h('div', { class: 'lid-out' }, h('span', { class: 'sticker sticker-a' }), h('span', { class: 'sticker sticker-b' }), h('span', { class: 'lid-strap-out' }), h('span', { class: 'lid-latch' })));
  const case3d = h(
    'div',
    { class: 'case3d' },
    h('div', { class: 'face floor' }),
    h('div', { class: 'face wall wall-back' }),
    h('div', { class: 'face wall wall-front' }, h('span', { class: 'handle' })),
    h('div', { class: 'face wall wall-left' }),
    h('div', { class: 'face wall wall-right' }),
    tokensLayer,
    lid,
  );
  const more = h('p', { class: 'stage-more', hidden: true });
  const world = h('div', { class: 'world' }, h('div', { class: 'spin' }, case3d));
  const view = h('div', { class: 'stage-view' }, h('div', { class: 'ground-shadow' }), world);
  const el = h('div', { class: 'stage', tabindex: '0', role: 'group' }, view, more);
  el.dataset.lid = 'open';

  // ------------------------------------------------------------------ camera
  const cam = { yaw: 0, tilt: 58, zoom: 1 };
  function applyCamera() {
    el.style.setProperty('--yaw', `${cam.yaw}deg`);
    el.style.setProperty('--tilt', `${cam.tilt}deg`);
    el.style.setProperty('--zoom', String(cam.zoom));
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function setCamera(next) {
    cam.yaw = clamp(next.yaw ?? cam.yaw, -70, 70);
    cam.tilt = clamp(next.tilt ?? cam.tilt, 40, 82);
    cam.zoom = clamp(next.zoom ?? cam.zoom, 0.8, 2);
    applyCamera();
  }
  applyCamera();

  const ro = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => el.style.setProperty('--fit', String(clamp(Math.min(el.clientWidth / 440, el.clientHeight / 500), 0.45, 1.35))))
    : null;
  ro?.observe(el);
  el.style.setProperty('--fit', '0.7');

  // --------------------------------------------------------------- lid state
  function setLid(open) {
    lidOpen = open;
    el.dataset.lid = open ? 'open' : 'closed';
  }

  // ----------------------------------------------------------------- tokens
  const slotPos = (i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    return { x: 26 + col * 46 + (row % 2) * 9, y: 66 + row * 40 };
  };

  function caseToken(item) {
    const idx = slots.get(item.id);
    const { x, y } = slotPos(idx);
    const b = h('button', { type: 'button', class: 'token3d', tabindex: '-1', 'aria-hidden': 'true', style: { left: `${x - 23}px`, top: `${y - 46}px` }, onClick: () => { if (!el.dataset.dragged) onSelect(item.id); } }, tokenFace(item));
    b.dataset.id = item.id;
    return b;
  }

  function trayToken(item) {
    const b = h('button', { type: 'button', class: 'tray-token', 'data-cat': categoryKey(item.category), 'data-id': item.id, 'aria-label': `Pack ${item.name}${item.target > 1 ? ` (${item.packed} of ${item.target})` : ''}`, onClick: () => onPackTray(item.id) }, tokenFace(item), h('span', { class: 'tray-name', text: item.name }));
    if (item.packed > 0 && item.packed < item.target) b.append(h('span', { class: 'tray-partial', text: `${item.packed}/${item.target}` }));
    return b;
  }

  function endFlight(id) {
    flights.get(id)?.finish();
  }

  function fly(id, fromRect, toRect, reveal, kind) {
    const level = motion();
    if (level === 'reduced' || !fromRect || !toRect || !el.isConnected) { reveal(); return; }
    const ghost = h('span', { class: 'ghost' }, tokenFace(kind.item, { size: 'md' }));
    ghost.style.left = `${fromRect.left}px`;
    ghost.style.top = `${fromRect.top}px`;
    ghost.style.width = `${fromRect.width}px`;
    ghost.style.height = `${fromRect.height}px`;
    document.body.append(ghost);
    const dx = toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2);
    const dy = toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2);
    const scale = Math.max(0.35, Math.min(1.2, toRect.width / Math.max(1, fromRect.width)));
    const lift = level === 'enhanced' ? -70 : -36;
    const spin = level === 'enhanced' ? (kind.pack ? 14 : -14) : 0;
    const duration = level === 'enhanced' ? 640 : 420;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      flights.delete(id);
      try { anim.cancel(); } catch { /* already finished */ }
      ghost.remove();
      reveal();
    };
    const anim = ghost.animate(
      [
        { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1, offset: 0 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 + lift}px) scale(${(1 + scale) / 2 + 0.1}) rotate(${spin}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(0deg)`, opacity: 0.95, offset: 1 },
      ],
      { duration, easing: 'cubic-bezier(0.22, 0.8, 0.28, 1)', fill: 'forwards' },
    );
    anim.onfinish = finish;
    anim.oncancel = finish;
    flights.set(id, { finish });
  }

  /**
   * Make the stage match the data. Elements are reused by item id, so unchanged items are
   * never rebuilt. Items that moved between tray and case get a flight animation.
   * @param {{tray: object[], inCase: object[], selectedId?: string, reset?: boolean}} data
   */
  function sync({ tray, inCase, selectedId: sel = '', reset = false }) {
    if (disposed) return;
    if (reset) {
      for (const id of [...flights.keys()]) endFlight(id);
      caseEls.clear();
      slots.clear();
      trayEls.clear();
      tokensLayer.replaceChildren();
      trayRef.host?.replaceChildren();
    }
    selectedId = sel;
    const wantCase = new Map(inCase.map((i) => [i.id, i]));
    const wantTray = new Map(tray.map((i) => [i.id, i]));
    const animate = !reset && lidOpen;

    // --- leaving the case (unpack): remember where each token was, free its slot
    const leaving = [];
    for (const [id, node] of [...caseEls]) {
      if (wantCase.has(id)) continue;
      endFlight(id);
      if (animate && wantTray.has(id)) leaving.push([id, node.getBoundingClientRect()]);
      node.remove();
      caseEls.delete(id);
      slots.delete(id);
    }
    // --- leaving the tray (pack)
    const packing = [];
    for (const [id, node] of [...trayEls]) {
      if (wantTray.has(id)) continue;
      endFlight(id);
      if (animate && wantCase.has(id)) packing.push([id, node.getBoundingClientRect()]);
      node.remove();
      trayEls.delete(id);
    }

    // --- case: add new tokens at the lowest free slot
    const used = new Set(slots.values());
    for (const item of inCase) {
      const existing = caseEls.get(item.id);
      if (existing) continue;
      let idx = 0;
      while (used.has(idx) && idx < SLOTS) idx += 1;
      if (idx >= SLOTS) continue; // overflow: summarised by the "+N more" label
      used.add(idx);
      slots.set(item.id, idx);
      const node = caseToken(item);
      caseEls.set(item.id, node);
      tokensLayer.append(node);
    }
    for (const [id, node] of caseEls) node.classList.toggle('is-selected', id === selectedId);
    const hidden = Math.max(0, inCase.length - caseEls.size);
    more.hidden = hidden === 0;
    more.textContent = hidden ? `+${hidden} more packed` : '';

    // --- tray: add / refresh
    const trayHost = trayRef.host;
    if (trayHost) {
      const shown = tray.slice(0, TRAY_MAX);
      for (const item of shown) {
        const old = trayEls.get(item.id);
        const label = `Pack ${item.name}${item.target > 1 ? ` (${item.packed} of ${item.target})` : ''}`;
        if (old && old.getAttribute('aria-label') === label && old.querySelector('.tok-count')?.textContent === (item.target > 1 ? `×${item.target}` : undefined)) continue;
        const node = trayToken(item);
        node.classList.toggle('is-selected', item.id === selectedId);
        if (old) old.replaceWith(node);
        trayEls.set(item.id, node);
      }
      for (const [id, node] of [...trayEls]) if (!shown.some((i) => i.id === id)) { node.remove(); trayEls.delete(id); }
      // keep DOM order = data order
      let prev = null;
      for (const item of shown) {
        const node = trayEls.get(item.id);
        if (!node) continue;
        if (!node.parentElement) trayHost.append(node);
        if (prev && prev.nextElementSibling !== node) prev.after(node);
        else if (!prev && trayHost.firstElementChild !== node) trayHost.prepend(node);
        prev = node;
      }
      for (const [id, node] of trayEls) node.classList.toggle('is-selected', id === selectedId);
      if (trayRef.more) {
        const rest = tray.length - shown.length;
        trayRef.more.hidden = rest <= 0;
        trayRef.more.textContent = rest > 0 ? `+${rest} more in the list below` : '';
      }
    }

    // --- flights (positions are measured after the DOM is in its final state)
    for (const [id, from] of packing) {
      const node = caseEls.get(id);
      if (!node) continue;
      node.style.visibility = 'hidden';
      const item = wantCase.get(id);
      fly(id, from, node.getBoundingClientRect(), () => { node.style.visibility = ''; node.classList.add('settle'); setTimeout(() => node.classList.remove('settle'), 500); }, { pack: true, item });
    }
    for (const [id, from] of leaving) {
      const node = trayEls.get(id);
      if (!node) continue;
      node.style.visibility = 'hidden';
      const item = wantTray.get(id);
      fly(id, from, node.getBoundingClientRect(), () => { node.style.visibility = ''; }, { pack: false, item });
    }
  }

  function destroy() {
    disposed = true;
    for (const id of [...flights.keys()]) endFlight(id);
    ro?.disconnect();
  }

  return {
    el,
    sync,
    setCamera,
    getCamera: () => ({ ...cam }),
    setLid,
    isOpen: () => lidOpen,
    attachTray(host, moreLabel) {
      trayRef.host = host;
      trayRef.more = moreLabel;
    },
    describe(text) {
      el.setAttribute('aria-label', text);
    },
    destroy,
  };
}
