// Packing Studio: a pseudo-3D suitcase synchronized with the real checklist. The stage is a
// view of store data; every pack/unpack goes through the same store actions as the list.
import { h, rerender } from '../dom.js';
import { icon } from '../ui/icons.js';
import { button, chip, iconButton, progressBar } from '../ui/components.js';
import { companion } from '../ui/art.js';
import { companionBubble } from '../ui/bubble.js';
import { VIEWS, ZOOMS, createStage, tokenFace } from '../ui/suitcase.js';
import { CATEGORY_PRESETS, BAG_KINDS, categoryKey, categoryMeta } from '../models.js';
import { essentialsLeft, isItemPacked, sumQty } from '../progress.js';
import { companionMessage } from '../companion.js';
import { effectiveMotion, getPrefs } from '../prefs.js';
import { getTrip, tripBags, tripItems, tripTasks } from '../selectors.js';
import { plural } from '../format.js';
import { pageHeader, tripSubtitle } from './shared.js';
import { itemDialog, manageBags } from './checklist.js';

const TILE_LIMIT = 60;
const camMemory = { view: 0, zoomIdx: 0, yaw: 0, tilt: 58, zoom: 1 }; // survives navigation within a session

export function StudioScreen(ctx) {
  const { store, navigate, params } = ctx;
  const tripId = params.id;
  if (!getTrip(store.state, tripId)) return { redirect: '/trips', title: 'Trip not found', build: () => h('div') };
  ctx.setLastTrip(tripId);

  let bagId = '';
  let lastBag = null;
  let catTab = 'all';
  let showAll = false;
  let selectedId = '';
  let lastPacked = null;
  let unsubscribe = null;
  let reactTimer = null;

  const stage = createStage({
    motion: effectiveMotion,
    onSelect: (id) => { selectedId = selectedId === id ? '' : id; update(); },
    onPackTray: (id) => store.togglePacked(id),
  });
  stage.setCamera({ yaw: camMemory.yaw, tilt: camMemory.tilt, zoom: camMemory.zoom });

  // ---------------------------------------------------------------- persistent nodes
  const trayHost = h('div', { class: 'tray', role: 'group', 'aria-label': 'Items still to pack' });
  const trayMore = h('p', { class: 'muted small', hidden: true });
  stage.attachTray(trayHost, trayMore);
  const bagSelect = h('select', { name: 'bag', 'aria-label': 'Choose bag', 'data-key': 'studio-bag', onChange: (e) => { bagId = e.target.value; selectedId = ''; catTab = 'all'; showAll = false; update(); } });
  const progressHost = h('div', { class: 'studio-progress' });
  const bubbleHost = h('div', { class: 'stage-bubble' });
  const mascotHost = h('div', { class: 'stage-mascot-wrap' });
  const infoHost = h('div', { class: 'studio-info' });
  const catHost = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by category' });
  const tilesHost = h('div', { class: 'tile-grid' });
  const sideHost = h('aside', { class: 'studio-side', 'aria-label': 'Bags and essentials' });
  const trayCount = h('span', { class: 'muted small' });
  const viewLabel = h('span', { class: 'ctl-state' });
  const zoomLabel = h('span', { class: 'ctl-state' });
  const lidLabel = h('span', { text: 'Close lid' });
  const live = h('p', { class: 'sr-only', 'aria-live': 'polite' });

  // ---------------------------------------------------------------- camera controls
  const remember = () => { Object.assign(camMemory, stage.getCamera()); };
  function setView(i) {
    camMemory.view = ((i % VIEWS.length) + VIEWS.length) % VIEWS.length;
    const v = VIEWS[camMemory.view];
    stage.setCamera({ yaw: v.yaw, tilt: v.tilt });
    remember();
    labels();
  }
  function setZoomIdx(i) {
    camMemory.zoomIdx = ((i % ZOOMS.length) + ZOOMS.length) % ZOOMS.length;
    stage.setCamera({ zoom: ZOOMS[camMemory.zoomIdx] });
    remember();
    labels();
  }
  function toggleLid() {
    stage.setLid(!stage.isOpen());
    labels();
  }
  function labels() {
    const cam = stage.getCamera();
    viewLabel.textContent = VIEWS[camMemory.view].yaw === Math.round(cam.yaw) && VIEWS[camMemory.view].tilt === Math.round(cam.tilt) ? VIEWS[camMemory.view].label : 'Custom';
    zoomLabel.textContent = `${Math.round(cam.zoom * 100)}%`;
    lidLabel.textContent = stage.isOpen() ? 'Close lid' : 'Open lid';
    lidBtn.setAttribute('aria-pressed', stage.isOpen() ? 'false' : 'true');
  }
  const rotateBtn = h('button', { type: 'button', class: 'btn btn-secondary ctl', 'data-key': 'ctl-rotate', onClick: () => setView(camMemory.view + 1), 'aria-label': 'Rotate view' }, icon('refresh', { size: 18 }), h('span', { text: 'Rotate' }), viewLabel);
  const zoomBtn = h('button', { type: 'button', class: 'btn btn-secondary ctl', 'data-key': 'ctl-zoom', onClick: () => setZoomIdx(camMemory.zoomIdx + 1), 'aria-label': 'Zoom' }, icon('search', { size: 18 }), h('span', { text: 'Zoom' }), zoomLabel);
  const lidBtn = h('button', { type: 'button', class: 'btn btn-secondary ctl', 'data-key': 'ctl-lid', onClick: toggleLid, 'aria-pressed': 'false' }, icon('suitcase', { size: 18 }), lidLabel);

  // pointer drag to rotate; ctrl+wheel / keyboard to zoom. Vertical page scrolling still works on touch.
  let drag = null;
  stage.el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.stage-more')) return;
    drag = { x: e.clientX, y: e.clientY, yaw: stage.getCamera().yaw, tilt: stage.getCamera().tilt, moved: false, touch: e.pointerType === 'touch' };
    delete stage.el.dataset.dragged;
  });
  stage.el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
    if (drag.touch && Math.abs(dy) > Math.abs(dx) * 1.5 && !drag.moved) { drag = null; return; } // let the page scroll
    drag.moved = true;
    stage.el.dataset.dragged = '1';
    stage.el.dataset.dragging = '1';
    stage.el.setPointerCapture?.(e.pointerId);
    stage.setCamera({ yaw: drag.yaw + dx * 0.35, tilt: drag.touch ? drag.tilt : drag.tilt - dy * 0.2 });
    labels();
  });
  const endDrag = () => { delete stage.el.dataset.dragging; if (drag?.moved) { remember(); setTimeout(() => delete stage.el.dataset.dragged, 0); } drag = null; };
  stage.el.addEventListener('pointerup', endDrag);
  stage.el.addEventListener('pointercancel', endDrag);
  stage.el.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    stage.setCamera({ zoom: stage.getCamera().zoom - e.deltaY * 0.004 });
    remember();
    labels();
  }, { passive: false });
  stage.el.addEventListener('keydown', (e) => {
    const cam = stage.getCamera();
    const map = { ArrowLeft: () => stage.setCamera({ yaw: cam.yaw - 8 }), ArrowRight: () => stage.setCamera({ yaw: cam.yaw + 8 }), ArrowUp: () => stage.setCamera({ tilt: cam.tilt + 4 }), ArrowDown: () => stage.setCamera({ tilt: cam.tilt - 4 }), '+': () => stage.setCamera({ zoom: cam.zoom + 0.1 }), '=': () => stage.setCamera({ zoom: cam.zoom + 0.1 }), '-': () => stage.setCamera({ zoom: cam.zoom - 0.1 }), ' ': toggleLid, Enter: toggleLid, Home: () => { setView(0); setZoomIdx(0); } };
    const fn = map[e.key];
    if (!fn) return;
    e.preventDefault();
    fn();
    remember();
    labels();
  });

  // ---------------------------------------------------------------------- rendering
  function renderProgress(bag, q) {
    progressHost.replaceChildren(h('div', { class: 'row-between' }, h('strong', { text: `${q.packed} / ${q.target} items` }), h('strong', { class: 'pct', text: `${q.percent}%` })), progressBar(q.percent, { label: `${bag?.name || 'Bag'} progress` }));
  }

  function renderInfo(item, bag) {
    rerender(infoHost, () => {
      if (!item) return h('div');
      const done = isItemPacked(item);
      return h(
        'section',
        { class: 'card info-card', 'aria-label': `Details for ${item.name}` },
        tokenFace(item, { size: 'lg' }),
        h('div', { class: 'info-text' }, h('strong', { text: item.name }), h('span', { class: 'muted small', text: `${categoryMeta(item.category).label} · ${bag?.name || ''} · ${item.packed}/${item.target} packed${item.notes ? ` · ${item.notes}` : ''}` })),
        h('div', { class: 'btn-row' }, button({ label: done ? 'Unpack' : 'Pack', variant: 'primary', key: 'info-toggle', onClick: () => store.togglePacked(item.id) }), button({ label: 'Edit', variant: 'secondary', key: 'info-edit', onClick: () => itemDialog({ store, tripId, item }) }), iconButton({ icon: 'x', label: 'Close details', key: 'info-close', onClick: () => { selectedId = ''; update(); } })),
      );
    });
  }

  function renderTiles(bagItems) {
    const present = [...new Set(bagItems.map((i) => i.category))];
    const order = [...CATEGORY_PRESETS.map((c) => c.id).filter((c) => present.includes(c)), ...present.filter((c) => !CATEGORY_PRESETS.some((p) => p.id === c)).sort()];
    if (catTab !== 'all' && !order.includes(catTab)) catTab = 'all';
    rerender(catHost, () => h('div', { class: 'chips-inner' }, chip({ label: 'All', count: bagItems.length, active: catTab === 'all', key: 'cat-all', onClick: () => { catTab = 'all'; showAll = false; update(); } }), order.map((c) => chip({ label: categoryMeta(c).label, count: bagItems.filter((i) => i.category === c).length, active: catTab === c, key: `cat-${c}`, cat: categoryKey(c), onClick: () => { catTab = c; showAll = false; update(); } }))));
    const list = bagItems.filter((i) => catTab === 'all' || i.category === catTab);
    const shown = showAll ? list : list.slice(0, TILE_LIMIT);
    rerender(tilesHost, () => h(
      'div',
      { class: 'tile-wrap' },
      h(
        'ul',
        { class: 'tile-list' },
        shown.map((i) => {
          const done = isItemPacked(i);
          return h(
            'li',
            { class: `tile-item${done ? ' is-packed' : ''}${i.id === selectedId ? ' is-selected' : ''}`, 'data-cat': categoryKey(i.category) },
            h('button', { type: 'button', class: 'tile-main', 'data-key': `tile-${i.id}`, 'aria-pressed': done ? 'true' : 'false', 'aria-label': `${i.name}: ${i.packed} of ${i.target} packed. ${done ? 'Unpack' : 'Pack'}`, onClick: () => store.togglePacked(i.id) }, tokenFace(i), h('span', { class: 'tile-name', text: i.name }), h('span', { class: 'tile-qty muted', text: `${i.packed}/${i.target}` }), done ? h('span', { class: 'tile-check' }, icon('check', { size: 12 })) : null),
            h('button', { type: 'button', class: 'tile-info', 'data-key': `info-${i.id}`, 'aria-label': `Details for ${i.name}`, onClick: () => { selectedId = selectedId === i.id ? '' : i.id; update(); } }, icon('info', { size: 14 })),
          );
        }),
        h('li', { class: 'tile-item tile-add' }, h('button', { type: 'button', class: 'tile-main', 'data-key': 'tile-add', 'aria-label': 'Add item', onClick: () => itemDialog({ store, tripId, defaultCategory: catTab === 'all' ? undefined : catTab }) }, icon('plus', { size: 22 }), h('span', { class: 'tile-name', text: 'Add item' }))),
      ),
      !showAll && list.length > TILE_LIMIT ? button({ label: `Show all ${list.length} items`, variant: 'secondary', key: 'tiles-all', onClick: () => { showAll = true; update(); } }) : null,
    ));
  }

  function renderSide(bags, allItems) {
    rerender(sideHost, () => {
      const left = essentialsLeft(allItems);
      return h(
        'div',
        { class: 'side-stack' },
        h(
          'section',
          { class: 'card panel-card' },
          h('div', { class: 'row-between' }, h('h2', { class: 'card-title', text: 'Bags' }), h('button', { type: 'button', class: 'link-btn', text: 'Manage', onClick: () => manageBags(store, tripId) })),
          h('ul', { class: 'bag-cards' }, bags.map((b) => {
            const p = sumQty(allItems.filter((i) => i.bagId === b.id));
            return h('li', {}, h('button', { type: 'button', class: `bag-card${b.id === bagId ? ' is-active' : ''}`, 'aria-pressed': b.id === bagId ? 'true' : 'false', 'data-key': `bagcard-${b.id}`, onClick: () => { bagId = b.id; selectedId = ''; catTab = 'all'; showAll = false; update(); } }, icon(BAG_KINDS.find((k) => k.id === b.kind)?.icon || 'box', { size: 20 }), h('span', { class: 'bag-card-text' }, h('strong', { text: b.name }), h('span', { class: 'muted small', text: `${p.packed}/${p.target} items · ${p.percent}%` })), progressBar(p.percent, { label: `${b.name} progress` })));
          })),
          h('button', { type: 'button', class: 'add-inline', 'data-key': 'side-add-bag', onClick: () => manageBags(store, tripId) }, icon('plus', { size: 16 }), 'Add new bag'),
        ),
        h('section', { class: 'card panel-card' }, h('h2', { class: 'card-title', text: 'Essentials left' }), left.length ? h('ul', { class: 'mini-list' }, left.slice(0, 5).map((i) => h('li', {}, h('button', { type: 'button', class: 'mini-item', 'data-key': `sess-${i.id}`, 'aria-label': `Select ${i.name}`, onClick: () => { bagId = i.bagId; selectedId = i.id; update(); } }, icon('star', { size: 14 }), h('span', { text: i.name }))))) : h('p', { class: 'muted small', text: 'No essentials left. Nice!' })),
      );
    });
  }

  function update() {
    const state = store.state;
    const trip = getTrip(state, tripId);
    if (!trip) { navigate('/trips'); return; }
    const bags = tripBags(state, tripId);
    if (!bags.some((b) => b.id === bagId)) bagId = bags[0]?.id || '';
    const bag = bags.find((b) => b.id === bagId);
    const allItems = tripItems(state, tripId);
    const bagItems = allItems.filter((i) => i.bagId === bagId).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    const inCase = bagItems.filter(isItemPacked);
    const tray = bagItems.filter((i) => !isItemPacked(i));
    const q = sumQty(bagItems);
    if (selectedId && !bagItems.some((i) => i.id === selectedId)) selectedId = '';

    stage.sync({ tray, inCase, selectedId, reset: bagId !== lastBag });
    lastBag = bagId;
    stage.describe(`Suitcase view of ${bag?.name || 'bag'}: ${q.packed} of ${q.target} items packed. Use arrow keys to rotate, plus and minus to zoom, space to open or close the lid.`);

    // select options
    if (bagSelect.options.length !== bags.length || [...bagSelect.options].some((o, i) => o.value !== bags[i].id || o.textContent !== bags[i].name)) {
      bagSelect.replaceChildren(...bags.map((b) => h('option', { value: b.id, text: b.name })));
    }
    bagSelect.value = bagId;
    bagSelect.hidden = bags.length < 2;
    renderProgress(bag, q);
    trayCount.textContent = tray.length ? `${plural(tray.length, 'item')} to pack` : 'Everything in this bag is packed';
    renderInfo(bagItems.find((i) => i.id === selectedId) || null, bag);
    renderTiles(bagItems);
    renderSide(bags, allItems);

    // companion
    const msg = companionMessage({ screen: 'studio', trip, items: allItems, tasks: tripTasks(state, tripId), tripCount: state.trips.length, dismissed: getPrefs().dismissed });
    const bubble = companionBubble(msg, { onDismiss: update, className: 'stage-tip' });
    bubbleHost.replaceChildren(...(bubble ? [bubble] : []));
    mascotHost.hidden = !getPrefs().companion;
    if (mascotHost.firstChild === null || mascotHost.dataset.mood !== (msg?.mood || 'happy')) {
      mascotHost.dataset.mood = msg?.mood || 'happy';
      mascotHost.replaceChildren(companion({ mood: msg?.mood || 'happy', className: 'stage-mascot' }));
    }
    const packedNow = sumQty(allItems).packed;
    if (lastPacked !== null && packedNow > lastPacked && effectiveMotion() !== 'reduced') {
      mascotHost.classList.add('react');
      clearTimeout(reactTimer);
      reactTimer = setTimeout(() => mascotHost.classList.remove('react'), 700);
    }
    if (lastPacked !== null && packedNow !== lastPacked) live.textContent = `${packedNow} of ${sumQty(allItems).target} items packed in total.`;
    lastPacked = packedNow;
    labels();
  }

  return {
    title: 'Packing Studio',
    static: true,
    build() {
      const trip = getTrip(store.state, tripId);
      const root = h(
        'div',
        { class: 'screen studio' },
        pageHeader({ title: 'Packing Studio', subtitle: `${trip.name}${tripSubtitle(trip) ? ` · ${tripSubtitle(trip)}` : ''}`, back: { href: `#/trip/${tripId}`, label: 'Back to packing list' }, actions: [iconButton({ icon: 'pack', label: 'Open checklist', href: `#/trip/${tripId}` })] }),
        h(
          'div',
          { class: 'studio-grid' },
          h(
            'div',
            { class: 'studio-main' },
            h('div', { class: 'studio-top' }, bagSelect, progressHost),
            h('div', { class: 'stage-wrap' }, stage.el, bubbleHost, mascotHost),
            h('div', { class: 'stage-controls' }, rotateBtn, zoomBtn, lidBtn),
            h('section', { class: 'tray-section', 'aria-label': 'To pack' }, h('div', { class: 'row-between' }, h('h2', { class: 'section-title', text: 'To pack' }), trayCount), trayHost, trayMore),
            infoHost,
            h('section', { class: 'items-section', 'aria-label': 'All items in this bag' }, h('h2', { class: 'section-title', text: 'Items' }), catHost, tilesHost),
          ),
          sideHost,
        ),
        live,
      );
      queueMicrotask(() => update()); // after the node is attached, so the stage can measure itself
      unsubscribe = store.subscribe(() => update());
      return root;
    },
    destroy() {
      unsubscribe?.();
      clearTimeout(reactTimer);
      stage.destroy();
      remember();
    },
  };
}
