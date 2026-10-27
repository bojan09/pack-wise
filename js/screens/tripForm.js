// Create-trip wizard (single guided page) and edit-trip form.
import { h } from '../dom.js';
import { icon } from '../ui/icons.js';
import { button, field, segmented, selectInput, tiles } from '../ui/components.js';
import { toast } from '../ui/toast.js';
import { BAG_KINDS, CONDITIONS, LIMITS, SEASONS, TRANSPORTS, TRIP_TYPES, cleanDate } from '../models.js';
import { getTrip, sortedTrips } from '../selectors.js';
import { BUILTIN_TEMPLATES, builtinTemplateItems, defaultDays } from '../templates.js';
import { seasonForDates, tripLengthDays } from '../progress.js';
import { pageHeader } from './shared.js';

export function TripFormScreen(ctx, { mode }) {
  const { store, navigate, params } = ctx;
  const editing = mode === 'edit';
  const existing = editing ? getTrip(store.state, params.id) : null;
  if (editing && !existing) return { redirect: '/trips', title: 'Trip not found', build: () => h('div') };

  const form = {
    type: existing?.type || 'city',
    destination: existing?.destination || '',
    name: existing?.name || '',
    startDate: existing?.startDate || '',
    endDate: existing?.endDate || '',
    transport: existing?.transport ?? '',
    travelers: existing?.travelers || 1,
    notes: existing?.notes || '',
    season: existing?.season || '',
    conditions: [...(existing?.conditions || [])],
    bagKinds: ['carry-on'],
    bagsTouched: false,
    seasonTouched: Boolean(existing?.season), // true once the user picked a season themselves
    startFrom: 'suggested', // suggested | template | copy | empty
    templateId: ctx.query.get('template') || '',
    copyFrom: '',
  };
  const customTemplates = store.state.templates;
  const pastTrips = sortedTrips(store.state, 'active').concat(sortedTrips(store.state, 'archived'));
  if (!editing && form.templateId) {
    form.startFrom = 'template';
    const b = BUILTIN_TEMPLATES.find((t) => t.id === form.templateId);
    if (b) form.type = b.type;
  }

  return {
    title: editing ? 'Edit trip' : 'Create a New Trip',
    static: true, // never re-render under the user's typing
    build() {
      const errors = {};
      const root = h('div', { class: 'screen trip-form' });
      const formEl = h('form', { class: 'form-stack', novalidate: true });

      const destination = h('input', { type: 'text', name: 'destination', maxlength: LIMITS.destination, value: form.destination, placeholder: 'City, country or region', autocomplete: 'off', onInput: (e) => (form.destination = e.target.value) });
      const start = h('input', { type: 'date', name: 'start', value: form.startDate, onChange: (e) => { form.startDate = cleanDate(e.target.value); end.min = form.startDate; autoSeason(); } });
      const end = h('input', { type: 'date', name: 'end', value: form.endDate, min: form.startDate || undefined, onChange: (e) => { form.endDate = cleanDate(e.target.value); autoSeason(); } });
      const name = h('input', { type: 'text', name: 'name', maxlength: LIMITS.name, value: form.name, placeholder: 'Defaults to the destination', onInput: (e) => (form.name = e.target.value) });
      const travelers = h('input', { type: 'number', name: 'travelers', min: 1, max: LIMITS.maxTravelers, value: form.travelers, inputmode: 'numeric', onInput: (e) => (form.travelers = Number(e.target.value) || 1) });
      const transport = selectInput({ options: TRANSPORTS, value: form.transport, name: 'transport' });
      transport.addEventListener('change', (e) => (form.transport = e.target.value));
      const notes = h('textarea', { name: 'notes', rows: 3, maxlength: LIMITS.notes, placeholder: 'Anything to remember for this trip', onInput: (e) => (form.notes = e.target.value) }, form.notes);
      const seasonHint = h('p', { class: 'muted small', 'aria-live': 'polite' });
      const errorBox = h('div', { class: 'form-errors', role: 'alert' });

      function submit(e) {
        e.preventDefault();
        const problems = [];
        const dest = form.destination.trim();
        const tripName = form.name.trim() || dest;
        if (!tripName) problems.push({ el: destination, msg: 'Enter a destination or a trip name.' });
        if (form.startDate && form.endDate && form.endDate < form.startDate) problems.push({ el: end, msg: 'The return date must be on or after the departure date.' });
        errorBox.replaceChildren(...problems.map((p) => h('p', { class: 'field-error', text: p.msg })));
        for (const el of [destination, end]) el.removeAttribute('aria-invalid');
        problems.forEach((p) => p.el.setAttribute('aria-invalid', 'true'));
        if (problems.length) {
          problems[0].el.focus();
          return;
        }
        const fields = { name: tripName, destination: dest, type: form.type, startDate: form.startDate, endDate: form.endDate, transport: form.transport, travelers: form.travelers, season: form.season, conditions: form.conditions, notes: form.notes };
        if (editing) {
          store.updateTrip(existing.id, fields);
          toast('Trip updated', { tone: 'success' });
          navigate(`/trip/${existing.id}`);
        } else {
          const opts = { bagKinds: form.bagKinds, generate: form.startFrom === 'suggested' };
          const days = form.startDate && form.endDate ? tripLengthDays({ startDate: form.startDate, endDate: form.endDate }) : null;
          if (form.startFrom === 'template') {
            const builtin = BUILTIN_TEMPLATES.find((t) => t.id === form.templateId);
            const custom = customTemplates.find((t) => t.id === form.templateId);
            if (builtin) opts.templateItems = builtinTemplateItems(builtin.id, { days: days || builtin.days, travelers: form.travelers, bagKinds: form.bagKinds, season: form.season, conditions: form.conditions });
            else if (custom) opts.templateItems = custom.items;
            else { errorBox.replaceChildren(h('p', { class: 'field-error', text: 'Choose a template.' })); return; }
          } else if (form.startFrom === 'copy') {
            if (!pastTrips.some((t) => t.id === form.copyFrom)) { errorBox.replaceChildren(h('p', { class: 'field-error', text: 'Choose a trip to copy.' })); return; }
            opts.copyFrom = form.copyFrom;
          } else if (form.startFrom === 'empty') opts.withTasks = true;
          const trip = store.createTrip(fields, opts);
          if (!trip) {
            errorBox.replaceChildren(h('p', { class: 'field-error', text: 'Could not create the trip. Check the details and try again.' }));
            return;
          }
          navigator.storage?.persist?.().catch(() => {}); // best effort: ask the browser not to evict our data
          toast(form.startFrom === 'empty' ? `Created “${trip.name}”` : `Created “${trip.name}” with a ready-made packing list`, { tone: 'success' });
          navigate(`/trip/${trip.id}`);
        }
      }
      formEl.addEventListener('submit', submit);

      /** Ticks bag tiles programmatically (e.g. camping suggests a camping-gear bag). */
      function setBagTiles(kinds) {
        formEl.querySelectorAll('input[name=bags]').forEach((i) => { i.checked = kinds.includes(i.value); });
        form.bagKinds = kinds;
      }

      /** Balkan seasons from the trip dates, unless the user chose a season themselves. */
      function autoSeason() {
        if (form.seasonTouched || !form.startDate) return;
        const s = seasonForDates(form.startDate, form.endDate);
        if (!s) return;
        form.season = s;
        formEl.querySelectorAll('input[name=season]').forEach((i) => { i.checked = i.value === s; });
        const label = SEASONS.find((x) => x.id === s)?.label || s;
        seasonHint.textContent = `Set from your dates: ${label}. Change it if you like.`;
      }

      function weatherSection() {
        const seasonSel = segmented({ name: 'season', label: 'Season', value: form.season, options: SEASONS, onChange: (v) => { form.season = v; form.seasonTouched = true; seasonHint.textContent = ''; } });
        seasonSel.classList.add('wrap');
        const chips = h('div', { class: 'cond-chips', role: 'group', 'aria-label': 'Expected weather' }, CONDITIONS.map((c) => h('label', { class: 'cond-chip' }, h('input', { type: 'checkbox', name: 'conditions', value: c.id, checked: form.conditions.includes(c.id), onChange: () => { form.conditions = [...chips.querySelectorAll('input:checked')].map((i) => i.value); } }), h('span', {}, icon(c.icon, { size: 16 }), c.label))));
        return h('section', { class: 'form-section' }, h('h2', { class: 'section-title' }, h('span', { class: 'step', text: '4' }), 'Season & weather'), seasonSel, seasonHint, h('p', { class: 'muted small', text: 'Balkan seasons: spring Mar–May · summer Jun–Aug · fall Sep–Nov · winter Dec–Feb.' }), h('p', { class: 'setting-label', text: 'What do you expect outside? Pick any that apply.' }), chips, h('p', { class: 'muted small', text: 'Optional. This shapes the suggested list (clothing, rain gear, camping shelter and sleeping gear). It is not a forecast, so check one before you go.' }));
      }

      function startFromSection() {
        const box = h('section', { class: 'form-section' });
        const pick = h('div', { class: 'start-pick' });
        const renderPick = () => {
          pick.replaceChildren();
          if (form.startFrom === 'template') {
            const sel = h('select', { name: 'template', 'aria-label': 'Template' }, h('option', { value: '', text: 'Choose a template…' }), h('optgroup', { label: 'Built-in' }, BUILTIN_TEMPLATES.map((t) => h('option', { value: t.id, selected: t.id === form.templateId, text: `${t.name} — ${t.blurb}` }))), customTemplates.length ? h('optgroup', { label: 'My templates' }, customTemplates.map((t) => h('option', { value: t.id, selected: t.id === form.templateId, text: `${t.name} (${t.items.length} items)` }))) : null);
            sel.addEventListener('change', (e) => { form.templateId = e.target.value; const b = BUILTIN_TEMPLATES.find((t) => t.id === form.templateId); if (b) { form.type = b.type; const r = formEl.querySelector(`input[name=type][value=${b.type}]`); if (r) r.checked = true; } });
            pick.append(sel);
          } else if (form.startFrom === 'copy') {
            if (!pastTrips.length) pick.append(h('p', { class: 'muted small', text: 'No earlier trips to copy yet.' }));
            else {
              const sel = h('select', { name: 'copyFrom', 'aria-label': 'Trip to copy' }, h('option', { value: '', text: 'Choose a trip…' }), pastTrips.map((t) => h('option', { value: t.id, selected: t.id === form.copyFrom, text: t.name })));
              sel.addEventListener('change', (e) => (form.copyFrom = e.target.value));
              pick.append(sel, h('p', { class: 'muted small', text: 'Copies the list and tasks with everything unpacked. The original is not changed.' }));
            }
          } else {
            pick.append(h('p', { class: 'muted small', text: form.startFrom === 'suggested' ? 'Suggestions use trip type, length, travelers, bags, season and weather. Always editable.' : 'Start with a blank list and add your own items.' }));
          }
        };
        const group = h('div', { class: 'segmented wrap', role: 'radiogroup', 'aria-label': 'Start your list from' });
        for (const [id, label] of [['suggested', 'Suggested list'], ['template', 'Template'], ['copy', 'Previous trip'], ['empty', 'Empty']]) {
          group.append(h('label', { class: 'seg-opt' }, h('input', { type: 'radio', name: 'startFrom', value: id, checked: form.startFrom === id, onChange: () => { form.startFrom = id; renderPick(); } }), h('span', {}, h('span', { text: label }))));
        }
        renderPick();
        box.append(h('h2', { class: 'section-title' }, h('span', { class: 'step', text: '6' }), 'Packing list'), group, pick);
        return box;
      }

      formEl.append(
        h('section', { class: 'form-section' }, h('h2', { class: 'section-title' }, h('span', { class: 'step', text: '1' }), 'Trip type'), tiles({ name: 'type', label: 'Trip type', options: TRIP_TYPES, value: form.type, className: 'tiles-types', onChange: (v) => { form.type = v; if (v === 'camping' && !editing && !form.bagsTouched) setBagTiles(['backpack', 'camping']); } })),
        h('section', { class: 'form-section' }, h('h2', { class: 'section-title' }, h('span', { class: 'step', text: '2' }), 'Destination'), field({ label: 'Destination', input: destination }), field({ label: 'Trip name (optional)', input: name })),
        h('section', { class: 'form-section' }, h('h2', { class: 'section-title' }, h('span', { class: 'step', text: '3' }), 'Dates'), h('div', { class: 'grid-2' }, field({ label: 'Departure', input: start }), field({ label: 'Return', input: end })), h('p', { class: 'muted small', text: `Dates are optional. Without them, ${defaultDays(form.type)} days are assumed for the starter list.` })),
        weatherSection(),
        editing
          ? null
          : h(
              'section',
              { class: 'form-section' },
              h('h2', { class: 'section-title' }, h('span', { class: 'step', text: '5' }), 'Luggage'),
              tiles({ name: 'bags', label: 'Luggage', options: BAG_KINDS.filter((k) => k.id !== 'other'), value: form.bagKinds, multi: true, className: 'tiles-bags', onChange: (v) => { form.bagKinds = v; form.bagsTouched = true; } }),
              h('p', { class: 'muted small', text: 'Pick what you are taking. You can add or rename bags later.' }),
            ),
        h('details', { class: 'more-details' }, h('summary', {}, 'More options', icon('chevD', { size: 16 })), h('div', { class: 'form-stack' }, h('div', { class: 'grid-2' }, field({ label: 'Transport', input: transport }), field({ label: 'Travelers', input: travelers })), field({ label: 'Notes', input: notes }))),
        editing ? null : startFromSection(),
        errorBox,
        h('div', { class: 'form-actions' }, button({ label: editing ? 'Save changes' : 'Generate Packing List', icon: editing ? 'check' : 'arrowR', iconAfter: !editing, variant: 'primary', type: 'submit', className: 'btn-block' }), editing ? button({ label: 'Cancel', variant: 'ghost', href: `#/trip/${existing.id}` }) : null),
      );

      root.append(pageHeader({ title: editing ? 'Edit trip' : 'Create a New Trip', back: { href: editing ? `#/trip/${existing.id}` : '#/trips', label: 'Back' } }), formEl);
      return root;
    },
  };
}
