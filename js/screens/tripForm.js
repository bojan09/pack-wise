// Create-trip wizard (single guided page) and edit-trip form.
import { h } from '../dom.js';
import { icon } from '../ui/icons.js';
import { button, field, selectInput, tiles } from '../ui/components.js';
import { toast } from '../ui/toast.js';
import { BAG_KINDS, LIMITS, TRANSPORTS, TRIP_TYPES, cleanDate } from '../models.js';
import { getTrip } from '../selectors.js';
import { defaultDays } from '../templates.js';
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
    bagKinds: ['carry-on'],
    generate: true,
  };

  return {
    title: editing ? 'Edit trip' : 'Create a New Trip',
    static: true, // never re-render under the user's typing
    build() {
      const errors = {};
      const root = h('div', { class: 'screen trip-form' });
      const formEl = h('form', { class: 'form-stack', novalidate: true });

      const destination = h('input', { type: 'text', name: 'destination', maxlength: LIMITS.destination, value: form.destination, placeholder: 'City, country or region', autocomplete: 'off', onInput: (e) => (form.destination = e.target.value) });
      const start = h('input', { type: 'date', name: 'start', value: form.startDate, onChange: (e) => { form.startDate = cleanDate(e.target.value); end.min = form.startDate; } });
      const end = h('input', { type: 'date', name: 'end', value: form.endDate, min: form.startDate || undefined, onChange: (e) => (form.endDate = cleanDate(e.target.value)) });
      const name = h('input', { type: 'text', name: 'name', maxlength: LIMITS.name, value: form.name, placeholder: 'Defaults to the destination', onInput: (e) => (form.name = e.target.value) });
      const travelers = h('input', { type: 'number', name: 'travelers', min: 1, max: LIMITS.maxTravelers, value: form.travelers, inputmode: 'numeric', onInput: (e) => (form.travelers = Number(e.target.value) || 1) });
      const transport = selectInput({ options: TRANSPORTS, value: form.transport, name: 'transport' });
      transport.addEventListener('change', (e) => (form.transport = e.target.value));
      const notes = h('textarea', { name: 'notes', rows: 3, maxlength: LIMITS.notes, placeholder: 'Anything to remember for this trip', onInput: (e) => (form.notes = e.target.value) }, form.notes);
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
        const fields = { name: tripName, destination: dest, type: form.type, startDate: form.startDate, endDate: form.endDate, transport: form.transport, travelers: form.travelers, notes: form.notes };
        if (editing) {
          store.updateTrip(existing.id, fields);
          toast('Trip updated', { tone: 'success' });
          navigate(`/trip/${existing.id}`);
        } else {
          const trip = store.createTrip(fields, { bagKinds: form.bagKinds, generate: form.generate });
          if (!trip) {
            errorBox.replaceChildren(h('p', { class: 'field-error', text: 'Could not create the trip. Check the details and try again.' }));
            return;
          }
          navigator.storage?.persist?.().catch(() => {}); // best effort: ask the browser not to evict our data
          toast(form.generate ? `Created “${trip.name}” with a starter packing list` : `Created “${trip.name}”`, { tone: 'success' });
          navigate(`/trip/${trip.id}`);
        }
      }
      formEl.addEventListener('submit', submit);

      formEl.append(
        h('section', { class: 'form-section' }, h('h2', { class: 'section-title' }, h('span', { class: 'step', text: '1' }), 'Trip type'), tiles({ name: 'type', label: 'Trip type', options: TRIP_TYPES, value: form.type, className: 'tiles-types', onChange: (v) => (form.type = v) })),
        h('section', { class: 'form-section' }, h('h2', { class: 'section-title' }, h('span', { class: 'step', text: '2' }), 'Destination'), field({ label: 'Destination', input: destination }), field({ label: 'Trip name (optional)', input: name })),
        h('section', { class: 'form-section' }, h('h2', { class: 'section-title' }, h('span', { class: 'step', text: '3' }), 'Dates'), h('div', { class: 'grid-2' }, field({ label: 'Departure', input: start }), field({ label: 'Return', input: end })), h('p', { class: 'muted small', text: `Dates are optional. Without them, ${defaultDays(form.type)} days are assumed for the starter list.` })),
        editing
          ? null
          : h(
              'section',
              { class: 'form-section' },
              h('h2', { class: 'section-title' }, h('span', { class: 'step', text: '4' }), 'Luggage'),
              tiles({ name: 'bags', label: 'Luggage', options: BAG_KINDS.filter((k) => k.id !== 'other'), value: form.bagKinds, multi: true, className: 'tiles-bags', onChange: (v) => (form.bagKinds = v) }),
              h('p', { class: 'muted small', text: 'Pick what you are taking. You can add or rename bags later.' }),
            ),
        h('details', { class: 'more-details' }, h('summary', {}, 'More options', icon('chevD', { size: 16 })), h('div', { class: 'form-stack' }, h('div', { class: 'grid-2' }, field({ label: 'Transport', input: transport }), field({ label: 'Travelers', input: travelers })), field({ label: 'Notes', input: notes }))),
        editing
          ? null
          : h('label', { class: 'switch-row' }, h('input', { type: 'checkbox', class: 'check', checked: form.generate, onChange: (e) => (form.generate = e.target.checked) }), h('span', {}, h('strong', { text: 'Generate a starter packing list' }), h('span', { class: 'muted small', text: 'Suggestions based on trip type and length. Fully editable.' }))),
        errorBox,
        h('div', { class: 'form-actions' }, button({ label: editing ? 'Save changes' : 'Generate Packing List', icon: editing ? 'check' : 'arrowR', iconAfter: !editing, variant: 'primary', type: 'submit', className: 'btn-block' }), editing ? button({ label: 'Cancel', variant: 'ghost', href: `#/trip/${existing.id}` }) : null),
      );

      root.append(pageHeader({ title: editing ? 'Edit trip' : 'Create a New Trip', back: { href: editing ? `#/trip/${existing.id}` : '#/trips', label: 'Back' } }), formEl);
      return root;
    },
  };
}
