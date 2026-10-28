// My Trip Guide: everything saved from Explore and Taste, arranged by interest or by day, with an
// optional draft day plan and optional packing suggestions. Nothing here edits the packing list unless
// the user taps "Add to packing list". Day plans have no times, routes or durations.
import { h } from '../dom.js';
import { icon } from '../ui/icons.js';
import { button, chip, emptyState, iconButton } from '../ui/components.js';
import { companionBubble } from '../ui/bubble.js';
import { toast } from '../ui/toast.js';
import { ADMISSION, googleCoordUrl, googleMapsUrl, osmCoordUrl, osmObjectUrl, wikipediaPageUrl } from '../guide.js';
import { GUIDE_FOOT, dayCount, draftPlan, groupByDay, groupByInterest, guideFilename, guideModel, guideToText, packHints, planned, resolveGuide } from '../plan.js';
import { downloadFile } from '../backup.js';
import { customPlaceDialog } from './customPlace.js';
import { guideMessage } from '../companion.js';
import { getPrefs, setPrefs } from '../prefs.js';
import { getTrip, tripEntries, tripItems } from '../selectors.js';
import { plural } from '../format.js';
import { guideTabs, pageHeader, tripSubtitle } from './shared.js';

export function GuideScreen(ctx) {
  const { store, params } = ctx;
  const tripId = params.id;
  if (!getTrip(store.state, tripId)) return { redirect: '/trips', title: 'Trip not found', build: () => h('div') };
  ctx.setLastTrip(tripId);

  let view = 'interest'; // 'interest' | 'day'

  // Earlier builds kept hidden packing ideas in device preferences; move them onto the trip (so backups carry them).
  const legacy = getPrefs().dismissed.filter((d) => d.startsWith(`hint:${tripId}:`));
  if (legacy.length) {
    for (const d of legacy) store.setHintHidden(tripId, d.slice(`hint:${tripId}:`.length), true);
    setPrefs({ dismissed: getPrefs().dismissed.filter((d) => !legacy.includes(d)) });
  }

  // ------------------------------------------------------------------ actions
  function remove(row) {
    if (row.kind === 'custom' || row.kind === 'web') {
      const gone = store.removeEntry(tripId, row.kind, row.entry.refId);
      if (gone) toast(`Removed “${row.title}”`, { action: { label: 'Undo', run: () => store.restoreEntry(gone) } });
      return;
    }
    const prev = { day: row.entry.day, order: row.entry.order };
    store.setSaved(tripId, row.kind, row.entry.refId, false);
    toast(`Removed “${row.title}”`, { action: { label: 'Undo', run: () => { store.setSaved(tripId, row.kind, row.entry.refId, true); store.setPlan(tripId, [{ kind: row.kind, refId: row.entry.refId, ...prev }]); } } });
  }

  function suggestPlan(rows, days) {
    const draft = draftPlan(rows, days);
    if (!draft.length) { toast('Everything already has a day.'); return; }
    const before = store.setPlan(tripId, draft);
    view = 'day';
    toast(`Draft plan: ${plural(draft.length, 'item')} placed. Rearrange freely.`, { tone: 'success', action: { label: 'Undo', run: () => store.setPlan(tripId, before) } });
  }

  function clearPlan(rows) {
    const had = rows.filter((r) => r.entry.day);
    const before = store.setPlan(tripId, had.map((r) => ({ kind: r.kind, refId: r.entry.refId, day: null, order: 0 })));
    toast('Day plan cleared. Your saved items are untouched.', { action: { label: 'Undo', run: () => store.setPlan(tripId, before) } });
  }

  // ---- drag reorder (within a day); buttons and Alt+Arrow remain the keyboard path
  function startDrag(e, li, ul, rows) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    li.classList.add('is-dragging');
    const onMove = (ev) => {
      const rest = [...ul.children].filter((x) => x !== li);
      const before = rest.find((sib) => { const r = sib.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
      if ((before || null) !== li.nextElementSibling) ul.insertBefore(li, before || null);
    };
    const finish = (commit) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      li.classList.remove('is-dragging');
      if (!commit) { ctx.refresh(); return; }
      const byKey = new Map(rows.map((r) => [r.key, r]));
      const next = [...ul.children].map((x, order) => { const r = byKey.get(x.dataset.ref); return r ? { kind: r.kind, refId: r.entry.refId, day: r.entry.day, order } : null; }).filter(Boolean);
      if (next.some((a, i) => rows[i]?.key !== `${a.kind}:${a.refId}`)) store.setPlan(tripId, next);
      else ctx.refresh();
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
  }

  function modelNow() {
    const trip = getTrip(store.state, tripId);
    const rows = resolveGuide(tripEntries(store.state, tripId));
    return { trip, model: guideModel(trip, rows, dayCount(trip, rows)) };
  }
  async function copyText() {
    try { await navigator.clipboard.writeText(guideToText(modelNow().model)); toast('Guide copied. Paste it into any app.', { tone: 'success' }); } catch { toast('Copying was blocked by the browser. Use “Save as .txt” instead.', { tone: 'error' }); }
  }
  function saveText() {
    const { trip, model } = modelNow();
    downloadFile(guideFilename(trip), guideToText(model), 'text/plain');
    toast('Guide saved as a text file.', { tone: 'success' });
  }

  function addHint(hint) {
    const item = store.addItem(tripId, { name: hint.add.name, category: hint.add.category, target: 1, notes: 'Suggested by My Guide' });
    if (item) toast(`Added “${item.name}” to your packing list`, { tone: 'success', action: { label: 'Undo', run: () => store.deleteItem(item.id) } });
  }

  // -------------------------------------------------------------------- rows
  function dayPicker(row, days) {
    const sel = h('select', { class: 'input day-select', 'aria-label': `Day for ${row.title}`, 'data-key': `day-${row.key}`, onChange: (ev) => store.planEntry(tripId, row.kind, row.entry.refId, ev.target.value ? Number(ev.target.value) : null) },
      h('option', { value: '', text: 'Unplanned', selected: !row.entry.day }),
      Array.from({ length: days }, (_, i) => h('option', { value: String(i + 1), text: `Day ${i + 1}`, selected: row.entry.day === i + 1 })));
    return sel;
  }

  function guideRow(row, { days, canMove, first, last, dayRows, tripPlace }) {
    const tags = [];
    if (row.kind === 'place' && row.place) tags.push(h('span', { class: `tag adm-tag adm-tag-${row.place.admission}`, text: ADMISSION[row.place.admission].label }));
    if (row.kind === 'food') tags.push(h('span', { class: 'tag', text: 'Food & drink' }));
    if (row.kind === 'custom') tags.push(h('span', { class: 'tag', text: 'My place' }));
    if (row.kind === 'web') tags.push(h('span', { class: 'tag', text: row.entry.osm ? 'From OpenStreetMap' : 'From Wikipedia' }), h('span', { class: `tag adm-tag ${row.entry.fee === 'no' ? 'adm-tag-free' : row.entry.fee === 'yes' ? 'adm-tag-paid' : 'adm-tag-check'}`, text: row.entry.fee === 'no' ? 'Free per OSM' : row.entry.fee === 'yes' ? 'Ticketed per OSM' : 'Check admission' }));
    if (row.kind === 'food' && row.entry.tried) tags.push(h('span', { class: 'tag tag-family', text: 'Tried' }));
    return h(
      'li',
      { class: `guide-row${row.missing ? ' is-missing' : ''}`, 'data-ref': row.key },
      h('span', { class: `guide-row-icon kind-${row.place?.kind || ''} ${row.dish ? `cat-${row.dish.category}` : ''}`, 'aria-hidden': 'true' }, icon(row.kind === 'food' ? 'utensils' : 'pin', { size: 18 })),
      h('div', { class: 'guide-row-main' },
        h('strong', { text: row.title }),
        h('span', { class: 'muted small', text: row.sub }),
        tags.length ? h('div', { class: 'place-tags' }, tags) : null,
        row.entry.note ? h('span', { class: 'small guide-note', text: `Note: ${row.entry.note}` }) : null,
        row.kind === 'web' ? h('div', { class: 'web-links' },
          row.entry.hours ? h('span', { class: 'small web-hours' }, h('strong', { text: 'Hours (OpenStreetMap, may be outdated): ' }), row.entry.hours) : null,
          row.entry.wheelchair ? h('span', { class: 'small' }, h('strong', { text: 'Wheelchair access (OpenStreetMap): ' }), row.entry.wheelchair) : null,
          row.entry.lat !== null ? h('span', { class: 'muted small coords', text: `${row.entry.lat.toFixed(5)}, ${row.entry.lon.toFixed(5)} (${row.entry.osm ? 'from OpenStreetMap' : 'from Wikidata'})` }) : null,
          row.entry.lat !== null ? h('a', { class: 'link small', href: googleCoordUrl(row.entry.lat, row.entry.lon), target: '_blank', rel: 'noopener noreferrer' }, icon('external', { size: 13 }), 'Google Maps', h('span', { class: 'sr-only', text: ` at the coordinates of ${row.title} (opens in a new tab)` })) : null,
          row.entry.lat !== null ? h('a', { class: 'link small', href: osmCoordUrl(row.entry.lat, row.entry.lon), target: '_blank', rel: 'noopener noreferrer' }, icon('pin', { size: 13 }), 'OpenStreetMap', h('span', { class: 'sr-only', text: ` at the coordinates of ${row.title} (opens in a new tab)` })) : null,
          row.entry.osm ? h('a', { class: 'link small', href: osmObjectUrl(row.entry.osm), target: '_blank', rel: 'noopener noreferrer' }, icon('external', { size: 13 }), 'Map entry', h('span', { class: 'sr-only', text: ` for ${row.title} on OpenStreetMap (opens in a new tab)` })) : null,
          row.entry.site ? h('a', { class: 'link small', href: row.entry.site, target: '_blank', rel: 'noopener noreferrer' }, icon('external', { size: 13 }), 'Website', h('span', { class: 'sr-only', text: ` of ${row.title} (opens in a new tab)` })) : null,
          !row.entry.osm && row.entry.wp ? h('a', { class: 'link small', href: wikipediaPageUrl(row.entry.wp), target: '_blank', rel: 'noopener noreferrer' }, icon('external', { size: 13 }), 'Wikipedia', h('span', { class: 'sr-only', text: ` article about ${row.title} (opens in a new tab)` })) : null) : null,
        row.kind === 'custom' ? h('a', { class: 'link small', href: googleMapsUrl(row.place, { name: tripPlace, country: '' }), target: '_blank', rel: 'noopener noreferrer' }, icon('external', { size: 13 }), 'Google Maps', h('span', { class: 'sr-only', text: ` search for ${row.title} (opens in a new tab)` })) : null,
        row.kind === 'place' && row.place ? h('a', { class: 'link small', href: googleMapsUrl(row.place, row.dest), target: '_blank', rel: 'noopener noreferrer' }, icon('external', { size: 13 }), 'Google Maps', h('span', { class: 'sr-only', text: ` for ${row.title} (opens in a new tab)` })) : null),
      h('div', { class: 'guide-row-actions' },
        row.missing ? null : dayPicker(row, days),
        row.kind === 'custom' ? iconButton({ icon: 'edit', label: `Edit ${row.title}`, key: `edit-${row.key}`, onClick: () => customPlaceDialog({ store, tripId, entry: row.entry }) }) : null,
        canMove ? h('div', { class: 'move-btns' },
          h('button', { type: 'button', class: 'drag-handle', 'data-key': `drag-${row.key}`, 'aria-label': `Reorder ${row.title}. Drag, or press Alt plus Up or Down arrow.`, title: 'Drag to reorder', onPointerdown: (e) => startDrag(e, e.currentTarget.closest('li'), e.currentTarget.closest('ul'), dayRows), onKeydown: (e) => { if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); store.moveEntry(tripId, row.kind, row.entry.refId, e.key === 'ArrowUp' ? -1 : 1); } } }, icon('grip', { size: 18 })),
          iconButton({ icon: 'arrowU', label: `Move ${row.title} earlier`, key: `up-${row.key}`, onClick: () => store.moveEntry(tripId, row.kind, row.entry.refId, -1), className: first ? 'is-dim' : '' }),
          iconButton({ icon: 'arrowD', label: `Move ${row.title} later`, key: `down-${row.key}`, onClick: () => store.moveEntry(tripId, row.kind, row.entry.refId, 1), className: last ? 'is-dim' : '' })) : null,
        iconButton({ icon: 'trash', label: `Remove ${row.title} from my guide`, key: `rm-${row.key}`, onClick: () => remove(row) })),
    );
  }

  // ------------------------------------------------------------------- build
  return {
    title: 'My trip guide',
    build() {
      const state = store.state;
      const trip = getTrip(state, tripId);
      if (!trip) return h('div');
      const rows = resolveGuide(tripEntries(state, tripId));
      const days = dayCount(trip, rows);
      const prefs = getPrefs();
      const hints = packHints(rows, tripItems(state, tripId));
      const hidden = new Set(trip.hiddenHints);
      const open = hints.filter((x) => !x.have && !hidden.has(x.id));
      const covered = hints.filter((x) => x.have).length;
      const hiddenCount = hints.filter((x) => !x.have && hidden.has(x.id)).length;
      const placeN = rows.filter((r) => r.kind !== 'food').length;
      const foodN = rows.length - placeN;
      const plannedN = planned(rows);
      const unplanned = rows.filter((r) => !r.entry.day && !r.missing).length;

      const header = pageHeader({
        title: 'My Guide',
        subtitle: `${trip.name}${tripSubtitle(trip) ? ` · ${tripSubtitle(trip)}` : ''}`,
        back: { href: `#/trip/${tripId}`, label: 'Back to packing list' },
        actions: [iconButton({ icon: 'pack', label: 'Open packing list', href: `#/trip/${tripId}` })],
      });
      const tip = companionBubble(guideMessage({ saved: rows.length, planned: plannedN, hints: open.length, dismissed: prefs.dismissed, tripId }), { onDismiss: ctx.refresh, className: 'explore-tip' });

      if (!rows.length) {
        return h('div', { class: 'screen explore-screen' }, header, guideTabs(tripId, 'guide'), tip,
          emptyState({ title: 'Your guide is empty', text: 'Save places from Explore and dishes from Taste, or add a place of your own. They appear here to arrange by interest or by day.', action: button({ label: 'Add your own place', icon: 'plus', variant: 'primary', key: 'add-own', onClick: () => customPlaceDialog({ store, tripId }) }) }),
          h('div', { class: 'center' }, button({ label: 'Explore places', icon: 'compass', variant: 'secondary', href: `#/trip/${tripId}/explore` })),
          h('div', { class: 'center' }, h('a', { class: 'link', href: `#/trip/${tripId}/taste` }, 'Or taste the destination')),
          aboutCard());
      }

      const summary = h('section', { class: 'card dest-card' },
        h('div', { class: 'dest-title' }, h('span', { class: 'dest-icon' }, icon('heart', { size: 22 })),
          h('div', {}, h('h2', { class: 'card-title', text: 'Saved for this trip' }), h('p', { class: 'muted small', text: `${plural(placeN, 'place')} · ${plural(foodN, 'dish', 'dishes & drinks')} · ${plannedN} of ${rows.length} on a day` }))),
        h('div', { class: 'chips', role: 'group', 'aria-label': 'Arrange by' },
          chip({ label: 'By interest', active: view === 'interest', key: 'v-interest', onClick: () => { view = 'interest'; ctx.refresh(); } }),
          chip({ label: 'By day', active: view === 'day', key: 'v-day', onClick: () => { view = 'day'; ctx.refresh(); } })),
        h('div', { class: 'plan-actions plan-share' },
          button({ label: 'Copy as text', icon: 'copy', variant: 'ghost', key: 'copy-guide', onClick: copyText }),
          button({ label: 'Save as .txt', icon: 'download', variant: 'ghost', key: 'save-guide', onClick: saveText }),
          button({ label: 'Print', icon: 'file', variant: 'ghost', key: 'print-guide', href: `#/trip/${tripId}/guide/print` })),
        h('div', { class: 'plan-actions' },
          button({ label: 'Add your own place', icon: 'plus', variant: 'secondary', key: 'add-own', onClick: () => customPlaceDialog({ store, tripId, defaultSub: '' }) }),
          button({ label: 'Suggest a draft plan', icon: 'sparkle', variant: 'secondary', disabled: unplanned === 0, key: 'draft', onClick: () => { suggestPlan(rows, days); ctx.refresh(); } }),
          plannedN ? button({ label: 'Clear day plan', icon: 'restore', variant: 'secondary', key: 'clear-plan', onClick: () => { clearPlan(rows); ctx.refresh(); } }) : null),
        h('p', { class: 'muted small', text: 'A day plan is a draft you arrange yourself: no times, routes or travel durations, because PackWise has no verified ones. The draft only keeps places with the same area name together.' }));

      const listFor = (group, opts) => h('section', { class: 'guide-section', 'aria-labelledby': `g-${group.id ?? 'x'}` },
        h('div', { class: 'guide-section-head' }, h('h2', { id: `g-${group.id ?? 'x'}`, class: 'section-title', text: group.label }), h('span', { class: 'muted small', text: plural(group.rows.length, 'item') })),
        group.rows.length ? h('ul', { class: 'guide-list' }, group.rows.map((r, i) => guideRow(r, { days, canMove: opts.moves && group.rows.length > 1, first: i === 0, last: i === group.rows.length - 1, dayRows: group.rows, tripPlace: trip.destination || trip.name }))) : h('p', { class: 'muted small', text: opts.empty }));

      const body = view === 'interest'
        ? groupByInterest(rows).map((g) => listFor({ ...g, id: g.id }, { moves: false }))
        : groupByDay(rows, days).map((g) => listFor({ id: g.day === null ? 'unplanned' : `day-${g.day}`, label: g.day === null ? 'Unplanned' : `Day ${g.day}`, rows: g.rows }, { moves: g.day !== null, empty: g.day === null ? 'Everything has a day.' : 'Nothing yet. Pick this day on any item.' }));

      const packing = hints.length
        ? h('section', { class: 'card pack-hints', 'aria-labelledby': 'hints-title' },
          h('h2', { id: 'hints-title', class: 'card-title', text: 'Packing ideas from your guide' }),
          h('p', { class: 'muted small', text: 'Optional. These are reminders based on the places you saved. Nothing is added to your packing list unless you tap “Add to packing list”.' }),
          open.length ? h('ul', { class: 'hint-list' }, open.map((x) => h('li', { class: 'hint' },
            h('div', { class: 'hint-text' }, h('strong', { text: x.title }), h('span', { class: 'muted small', text: x.why })),
            h('div', { class: 'hint-actions' },
              x.add ? button({ label: 'Add to packing list', icon: 'plus', variant: 'secondary', key: `hint-add-${x.id}`, onClick: () => addHint(x) }) : null,
              button({ label: 'Not now', variant: 'ghost', ariaLabel: `Hide suggestion: ${x.title}`, key: `hint-no-${x.id}`, onClick: () => store.setHintHidden(tripId, x.id, true) }))))) : h('p', { class: 'muted small', text: 'No open suggestions.' }),
          covered ? h('p', { class: 'muted small', text: `${plural(covered, 'idea')} already look covered by your packing list.` }) : null,
          hiddenCount ? h('div', {}, button({ label: `Show ${hiddenCount} hidden`, variant: 'ghost', key: 'hint-reset', onClick: () => store.resetHints(tripId) })) : null,
          h('a', { class: 'link small', href: `#/trip/${tripId}` }, 'Open packing list'))
        : null;

      return h('div', { class: 'screen explore-screen guide-screen' }, header, guideTabs(tripId, 'guide'), summary, tip,
        h('div', { class: 'guide-results' }, body), packing, aboutCard());
    },
  };

  function aboutCard() {
    return h('section', { class: 'card about-guide', 'aria-label': 'About My Guide' },
      h('h2', { class: 'card-title', text: 'About My Guide' }),
      h('ul', { class: 'fact-list' },
        h('li', { class: 'fact' }, h('span', { class: 'fact-icon' }, icon('wifi', { size: 18 })), h('div', {}, h('strong', { text: 'Works offline' }), h('span', { class: 'muted', text: 'Saved items, day plans and the bundled guide work without a connection and stay on this device. Map and Wikipedia links, and anything not bundled, need one. Your guide is included in backups.' }))),
        h('li', { class: 'fact' }, h('span', { class: 'fact-icon' }, icon('alert', { size: 18 })), h('div', {}, h('strong', { text: 'Pack and Explore stay separate' }), h('span', { class: 'muted', text: 'This guide never changes your packing list by itself. Opening hours, prices and travel times are not provided.' }))),
      ),
    );
  }
}

/** Print-friendly guide: black on white, one block per day (or per interest). */
export function GuidePrintScreen(ctx) {
  const { store, params } = ctx;
  const tripId = params.id;
  if (!getTrip(store.state, tripId)) return { redirect: '/trips', title: 'Trip not found', build: () => h('div') };
  return {
    title: 'Print guide',
    static: true,
    build() {
      const trip = getTrip(store.state, tripId);
      const rows = resolveGuide(tripEntries(store.state, tripId));
      const m = guideModel(trip, rows, dayCount(trip, rows));
      const box = (done) => h('span', { class: `pbox${done ? ' is-done' : ''}`, 'aria-hidden': 'true' }, done ? '✓' : '');
      return h('div', { class: 'screen print-screen' },
        h('div', { class: 'print-actions no-print' }, button({ label: 'Back', icon: 'chevL', variant: 'ghost', href: `#/trip/${tripId}/guide` }), h('span', { class: 'muted small', text: 'Use your browser’s print dialog to print or save as PDF.' }), button({ label: 'Print', icon: 'file', variant: 'primary', onClick: () => window.print() })),
        h('article', { class: 'print-sheet' },
          h('h1', { tabindex: '-1', text: m.title }),
          m.meta ? h('p', { class: 'print-meta', text: m.meta }) : null,
          m.byDay ? h('p', { class: 'print-meta', text: 'A draft arranged by hand: no times, routes or durations.' }) : null,
          m.count ? m.sections.map((s) => h('section', { class: 'print-section' }, h('h2', { text: s.label }), h('ul', {}, s.rows.map((r) => h('li', {}, r.tried === null ? null : box(r.tried), h('span', { class: 'print-name', text: `${r.title}${r.sub && !r.missing ? ` (${r.sub})` : ''}${r.tag ? ` [${r.tag}]` : ''}${r.coords ? ` @ ${r.coords}` : ''}` }), r.note ? h('span', { class: 'print-note', text: ` — ${r.note}` }) : null))))) : h('p', { text: 'Nothing saved yet.' }),
          h('p', { class: 'print-foot', text: `${GUIDE_FOOT} Printed from PackWise.` })));
    },
  };
}
