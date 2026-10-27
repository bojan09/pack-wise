// Dialogs shared by several screens: return-trip planner, save-as-template, template editor.
import { h } from '../dom.js';
import { button, field, stepper } from '../ui/components.js';
import { showDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { LIMITS, categoryMeta } from '../models.js';
import { getTrip, tripItems } from '../selectors.js';
import { plural } from '../format.js';

/** Pick belongings for the journey home; creates a separate linked trip, the original stays as it was. */
export function returnTripDialog({ store, tripId, navigate }) {
  const trip = getTrip(store.state, tripId);
  if (!trip) return Promise.resolve();
  const items = tripItems(store.state, tripId).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  return showDialog({
    title: 'Plan return trip',
    wide: true,
    build: (close) => {
      const chosen = new Set(items.map((i) => i.id));
      const name = h('input', { type: 'text', maxlength: LIMITS.name, value: `${trip.name} — return`, 'data-autofocus': '' });
      const count = h('p', { class: 'muted small', 'aria-live': 'polite' });
      const boxes = new Map();
      const refresh = () => { count.textContent = `${plural(chosen.size, 'item')} will be copied. Your original trip is not changed.`; };
      const list = h('ul', { class: 'pick-list' }, items.map((i) => {
        const box = h('input', { type: 'checkbox', class: 'check', checked: true, 'aria-label': i.name, onChange: (e) => { if (e.target.checked) chosen.add(i.id); else chosen.delete(i.id); refresh(); } });
        boxes.set(i.id, box);
        return h('li', {}, h('label', { class: 'pick-row' }, box, h('span', { class: 'pick-name', text: i.name }), h('span', { class: 'muted small', text: categoryMeta(i.category).label })));
      }));
      const setAll = (on) => { items.forEach((i) => { boxes.get(i.id).checked = on; if (on) chosen.add(i.id); else chosen.delete(i.id); }); refresh(); };
      refresh();
      return h(
        'form',
        { class: 'dialog-stack', onSubmit: (e) => { e.preventDefault(); if (!chosen.size) { toast('Choose at least one item to bring home.'); return; } const back = store.createReturnTrip(tripId, { itemIds: [...chosen], name: name.value.trim() || undefined }); if (back) { close(true); toast('Return checklist created.', { tone: 'success' }); navigate(`/trip/${back.id}`); } } },
        h('p', { class: 'muted', text: 'Choose what you want to pack for the journey home. It becomes its own checklist, with everything unpacked.' }),
        field({ label: 'Name', input: name }),
        h('div', { class: 'btn-row' }, button({ label: 'Select all', variant: 'ghost', onClick: () => setAll(true) }), button({ label: 'Select none', variant: 'ghost', onClick: () => setAll(false) })),
        list,
        count,
        h('div', { class: 'dialog-actions' }, h('span', { class: 'spacer' }), button({ label: 'Cancel', variant: 'ghost', onClick: () => close() }), button({ label: 'Create return checklist', variant: 'primary', type: 'submit' })),
      );
    },
  });
}

export function saveTemplateDialog({ store, tripId }) {
  const trip = getTrip(store.state, tripId);
  if (!trip) return Promise.resolve();
  return showDialog({
    title: 'Save as template',
    build: (close) => {
      const name = h('input', { type: 'text', maxlength: LIMITS.name, value: `${trip.name} template`, required: true, 'data-autofocus': '' });
      return h(
        'form',
        { class: 'dialog-stack', onSubmit: (e) => { e.preventDefault(); const v = name.value.trim(); if (!v) return; const t = store.saveTripAsTemplate(tripId, v); close(true); if (t) toast(`Saved template “${t.name}”`, { tone: 'success' }); } },
        h('p', { class: 'muted', text: 'Saves item names, categories, quantities and essentials, without packed state. Use it when creating future trips.' }),
        field({ label: 'Template name', input: name }),
        h('div', { class: 'dialog-actions' }, h('span', { class: 'spacer' }), button({ label: 'Cancel', variant: 'ghost', onClick: () => close() }), button({ label: 'Save template', variant: 'primary', type: 'submit' })),
      );
    },
  });
}

/**
 * Edit a template's name and suggested quantities (add/remove items). `source` is a template
 * object; `onSave(name, items)` persists.
 */
export function templateEditor({ title = 'Edit template', source, saveLabel = 'Save', onSave }) {
  return showDialog({
    title,
    wide: true,
    build: (close) => {
      const items = source.items.map((i) => ({ ...i }));
      const name = h('input', { type: 'text', maxlength: LIMITS.name, value: source.name, required: true, 'data-autofocus': '' });
      const host = h('ul', { class: 'pick-list tpl-items' });
      const addName = h('input', { type: 'text', maxlength: LIMITS.itemName, placeholder: 'Add an item…', 'aria-label': 'New template item' });
      const render = () => {
        host.replaceChildren(...items.map((it, idx) => h('li', { class: 'tpl-row' }, h('span', { class: 'pick-name' }, it.name, h('span', { class: 'muted small block', text: categoryMeta(it.category).label })), stepper({ value: it.target, min: 1, max: LIMITS.maxQty, label: it.name, key: `tpl-${idx}`, onChange: (n) => { it.target = n; render(); } }), h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove ${it.name}`, onClick: () => { items.splice(idx, 1); render(); } }, '×'))));
      };
      render();
      return h(
        'form',
        { class: 'dialog-stack', onSubmit: (e) => { e.preventDefault(); const v = name.value.trim(); if (!v) return; onSave(v, items); close(true); } },
        field({ label: 'Name', input: name }),
        host,
        h('div', { class: 'quick-add' }, addName, button({ label: 'Add', variant: 'secondary', onClick: () => { const v = addName.value.trim(); if (!v) return; items.push({ category: 'misc', name: v, target: 1, essential: false }); addName.value = ''; render(); } })),
        h('div', { class: 'dialog-actions' }, h('span', { class: 'spacer' }), button({ label: 'Cancel', variant: 'ghost', onClick: () => close() }), button({ label: saveLabel, variant: 'primary', type: 'submit' })),
      );
    },
  });
}
