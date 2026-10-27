// My Trip Guide: everything saved from Explore and Taste, arranged by interest or by day, with an
// optional draft day plan and optional packing suggestions. Nothing here edits the packing list unless
// the user taps "Add to packing list". Day plans have no times, routes or durations.
import { h } from '../dom.js';
import { icon } from '../ui/icons.js';
import { button, chip, emptyState, iconButton } from '../ui/components.js';
import { companionBubble } from '../ui/bubble.js';
import { toast } from '../ui/toast.js';
import { ADMISSION, googleMapsUrl } from '../guide.js';
import { dayCount, draftPlan, groupByDay, groupByInterest, packHints, planned, resolveGuide } from '../plan.js';
import { guideMessage } from '../companion.js';
import { dismissTip, getPrefs, setPrefs } from '../prefs.js';
import { getTrip, tripEntries, tripItems } from '../selectors.js';
import { plural } from '../format.js';
import { guideTabs, pageHeader, tripSubtitle } from './shared.js';

export function GuideScreen(ctx) {
  const { store, params } = ctx;
  const tripId = params.id;
  if (!getTrip(store.state, tripId)) return { redirect: '/trips', title: 'Trip not found', build: () => h('div') };
  ctx.setLastTrip(tripId);

  let view = 'interest'; // 'interest' | 'day'
  const hintKey = (id) => `hint:${tripId}:${id}`;

  // ------------------------------------------------------------------ actions
  function remove(row) {
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

  function guideRow(row, { days, canMove, first, last }) {
    const tags = [];
    if (row.kind === 'place' && row.place) tags.push(h('span', { class: `tag adm-tag adm-tag-${row.place.admission}`, text: ADMISSION[row.place.admission].label }));
    if (row.kind === 'food') tags.push(h('span', { class: 'tag', text: 'Food & drink' }));
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
        row.kind === 'place' && row.place ? h('a', { class: 'link small', href: googleMapsUrl(row.place, row.dest), target: '_blank', rel: 'noopener noreferrer' }, icon('external', { size: 13 }), 'Google Maps', h('span', { class: 'sr-only', text: ` for ${row.title} (opens in a new tab)` })) : null),
      h('div', { class: 'guide-row-actions' },
        row.missing ? null : dayPicker(row, days),
        canMove ? h('div', { class: 'move-btns' },
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
      const open = hints.filter((x) => !x.have && !prefs.dismissed.includes(hintKey(x.id)));
      const covered = hints.filter((x) => x.have).length;
      const hiddenCount = hints.filter((x) => !x.have && prefs.dismissed.includes(hintKey(x.id))).length;
      const placeN = rows.filter((r) => r.kind === 'place').length;
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
          emptyState({ title: 'Your guide is empty', text: 'Save places from Explore and dishes from Taste. They appear here to arrange by interest or by day.', action: button({ label: 'Explore places', icon: 'compass', variant: 'primary', href: `#/trip/${tripId}/explore` }) }),
          h('div', { class: 'center' }, h('a', { class: 'link', href: `#/trip/${tripId}/taste` }, 'Or taste the destination')),
          aboutCard());
      }

      const summary = h('section', { class: 'card dest-card' },
        h('div', { class: 'dest-title' }, h('span', { class: 'dest-icon' }, icon('heart', { size: 22 })),
          h('div', {}, h('h2', { class: 'card-title', text: 'Saved for this trip' }), h('p', { class: 'muted small', text: `${plural(placeN, 'place')} · ${plural(foodN, 'dish', 'dishes & drinks')} · ${plannedN} of ${rows.length} on a day` }))),
        h('div', { class: 'chips', role: 'group', 'aria-label': 'Arrange by' },
          chip({ label: 'By interest', active: view === 'interest', key: 'v-interest', onClick: () => { view = 'interest'; ctx.refresh(); } }),
          chip({ label: 'By day', active: view === 'day', key: 'v-day', onClick: () => { view = 'day'; ctx.refresh(); } })),
        h('div', { class: 'plan-actions' },
          button({ label: 'Suggest a draft plan', icon: 'sparkle', variant: 'secondary', disabled: unplanned === 0, key: 'draft', onClick: () => { suggestPlan(rows, days); ctx.refresh(); } }),
          plannedN ? button({ label: 'Clear day plan', icon: 'restore', variant: 'secondary', key: 'clear-plan', onClick: () => { clearPlan(rows); ctx.refresh(); } }) : null),
        h('p', { class: 'muted small', text: 'A day plan is a draft you arrange yourself: no times, routes or travel durations, because PackWise has no verified ones. The draft only keeps places with the same area name together.' }));

      const listFor = (group, opts) => h('section', { class: 'guide-section', 'aria-labelledby': `g-${group.id ?? 'x'}` },
        h('div', { class: 'guide-section-head' }, h('h2', { id: `g-${group.id ?? 'x'}`, class: 'section-title', text: group.label }), h('span', { class: 'muted small', text: plural(group.rows.length, 'item') })),
        group.rows.length ? h('ul', { class: 'guide-list' }, group.rows.map((r, i) => guideRow(r, { days, canMove: opts.moves && group.rows.length > 1, first: i === 0, last: i === group.rows.length - 1 }))) : h('p', { class: 'muted small', text: opts.empty }));

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
              button({ label: 'Not now', variant: 'ghost', ariaLabel: `Hide suggestion: ${x.title}`, key: `hint-no-${x.id}`, onClick: () => { dismissTip(hintKey(x.id)); ctx.refresh(); } }))))) : h('p', { class: 'muted small', text: 'No open suggestions.' }),
          covered ? h('p', { class: 'muted small', text: `${plural(covered, 'idea')} already look covered by your packing list.` }) : null,
          hiddenCount ? h('div', {}, button({ label: `Show ${hiddenCount} hidden`, variant: 'ghost', key: 'hint-reset', onClick: () => { setPrefs({ dismissed: getPrefs().dismissed.filter((d) => !d.startsWith(`hint:${tripId}:`)) }); ctx.refresh(); } })) : null,
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
