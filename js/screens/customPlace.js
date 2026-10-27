// "Add your own place" dialog: for destinations the built-in guide does not cover, or places only you know.
// Saved into My Guide like any other place (no admission, price or hours are ever claimed for it).
import { h } from '../dom.js';
import { button, field } from '../ui/components.js';
import { showDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { KINDS } from '../guide.js';

const TYPE_OPTIONS = [{ id: '', label: 'Something else' }, ...KINDS.map((k) => ({ id: k.id, label: k.label }))];

/** @param {{store: object, tripId: string, entry?: object, defaultSub?: string}} opts entry = an existing custom entry to edit */
export function customPlaceDialog({ store, tripId, entry, defaultSub = '' }) {
  return showDialog({
    title: entry ? 'Edit your place' : 'Add your own place',
    build: (close) => {
      const name = h('input', { type: 'text', name: 'label', maxlength: 80, value: entry?.label || '', placeholder: 'e.g. Waterfall hike', required: true, 'data-autofocus': '', autocomplete: 'off' });
      const where = h('input', { type: 'text', name: 'sub', maxlength: 60, value: entry?.sub ?? defaultSub, placeholder: 'Area or town (optional)', autocomplete: 'off' });
      const type = h('select', { name: 'type' }, TYPE_OPTIONS.map((o) => h('option', { value: o.id, selected: o.id === (entry?.type || ''), text: o.label })));
      const note = h('textarea', { name: 'note', rows: 3, maxlength: 300, placeholder: 'Anything to remember (optional)' }, entry?.note || '');
      const error = h('p', { class: 'field-error', role: 'alert' });
      const save = (e) => {
        e.preventDefault();
        const label = name.value.trim();
        if (!label) { error.textContent = 'Give the place a name.'; name.focus(); return; }
        const fields = { label, sub: where.value.trim(), type: type.value, note: note.value.trim() };
        const saved = entry ? store.editCustomPlace(tripId, entry.refId, fields) : store.addCustomPlace(tripId, fields);
        if (!saved) { error.textContent = 'You already have a place with that name.'; name.focus(); return; }
        toast(entry ? 'Place updated' : `Added “${label}” to My Guide`, { tone: 'success' });
        close(saved);
      };
      return h(
        'form',
        { class: 'form-stack', novalidate: true, onSubmit: save },
        field({ label: 'Name', input: name }),
        error,
        h('div', { class: 'grid-2' }, field({ label: 'Type', input: type, hint: 'Used for packing ideas, such as walking shoes for a hike.' }), field({ label: 'Where', input: where })),
        field({ label: 'Note', input: note }),
        h('p', { class: 'muted small', text: 'PackWise does not know anything about this place: no prices, hours or directions are shown for it.' }),
        h('div', { class: 'dialog-actions' }, h('span', { class: 'spacer' }), button({ label: 'Cancel', variant: 'ghost', onClick: () => close() }), button({ label: entry ? 'Save' : 'Add place', variant: 'primary', type: 'submit' })),
      );
    },
  });
}
