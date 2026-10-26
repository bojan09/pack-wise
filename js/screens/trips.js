import { h } from '../dom.js';
import { button, chip, emptyState } from '../ui/components.js';
import { actionSheet, confirmDialog, showDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { sortedTrips } from '../selectors.js';
import { pageHeader, tripCard } from './shared.js';
import { field } from '../ui/components.js';

export function TripsScreen(ctx) {
  const { store, navigate } = ctx;
  let status = 'active';
  const search = h('input', { type: 'search', class: 'search-input', placeholder: 'Search trips', 'aria-label': 'Search trips', 'data-key': 'trip-search', value: ctx.query.get('q') || '', onInput: () => ctx.refresh() });

  async function openMenu(trip) {
    const choice = await actionSheet({
      title: trip.name,
      actions: [
        { id: 'open', label: 'Open packing list', icon: 'pack' },
        { id: 'edit', label: 'Edit trip', icon: 'edit' },
        { id: 'dup', label: 'Duplicate', icon: 'copy' },
        trip.status === 'active' ? { id: 'archive', label: 'Archive', icon: 'archive' } : { id: 'restore', label: 'Restore', icon: 'restore' },
        { id: 'delete', label: 'Delete…', icon: 'trash', danger: true },
      ],
    });
    if (choice === 'open') navigate(`/trip/${trip.id}`);
    else if (choice === 'edit') navigate(`/trip/${trip.id}/edit`);
    else if (choice === 'dup') {
      const name = await askName(`${trip.name} (copy)`);
      if (name) {
        const copy = store.duplicateTrip(trip.id, name);
        if (copy) toast(`Duplicated as “${copy.name}”`, { tone: 'success' });
      }
    } else if (choice === 'archive') {
      store.archiveTrip(trip.id);
      toast(`Archived “${trip.name}”`, { action: { label: 'Undo', run: () => store.restoreTrip(trip.id) } });
    } else if (choice === 'restore') {
      store.restoreTrip(trip.id);
      toast(`Restored “${trip.name}”`, { tone: 'success' });
    } else if (choice === 'delete') {
      const ok = await confirmDialog({ title: 'Delete this trip?', message: `“${trip.name}” and its bags, packing list and tasks will be permanently deleted. This cannot be undone. Export a backup first if you might need it.`, confirmLabel: 'Delete trip', danger: true });
      if (ok) {
        store.deleteTrip(trip.id);
        toast('Trip deleted');
      }
    }
  }

  return {
    title: 'My Trips',
    build() {
      const state = store.state;
      const q = search.value.trim().toLowerCase();
      const counts = { active: state.trips.filter((t) => t.status === 'active').length, archived: state.trips.filter((t) => t.status === 'archived').length };
      const trips = sortedTrips(state, status).filter((t) => !q || `${t.name} ${t.destination}`.toLowerCase().includes(q));

      const list = trips.length
        ? h('div', { class: 'trip-grid' }, trips.map((t) => tripCard({ trip: t, state, href: `#/trip/${t.id}`, onMenu: () => openMenu(t) })))
        : q
          ? emptyState({ title: 'No matching trips', text: `Nothing matches “${search.value.trim()}”.`, showCompanion: false })
          : status === 'archived'
            ? emptyState({ title: 'No archived trips', text: 'Archive finished trips to keep your list tidy. You can restore them any time.' })
            : emptyState({ title: 'No trips yet', text: 'Plan your first trip and get a smart starter packing list.', action: button({ label: 'Plan a trip', icon: 'plus', variant: 'primary', href: '#/trips/new' }) });

      return h(
        'div',
        { class: 'screen trips-screen' },
        pageHeader({ title: 'My Trips', actions: [button({ label: 'New trip', icon: 'plus', variant: 'primary', href: '#/trips/new' })] }),
        h('div', { class: 'toolbar' }, search, h('div', { class: 'chips' }, chip({ label: 'Active', count: counts.active, active: status === 'active', onClick: () => { status = 'active'; ctx.refresh(); }, key: 'f-active' }), chip({ label: 'Archived', count: counts.archived, active: status === 'archived', onClick: () => { status = 'archived'; ctx.refresh(); }, key: 'f-archived' }))),
        list,
      );
    },
  };
}

function askName(initial) {
  return showDialog({
    title: 'Duplicate trip',
    build: (close) => {
      const input = h('input', { type: 'text', maxlength: 80, value: initial, required: true, 'data-autofocus': '' });
      return h(
        'form',
        { class: 'dialog-stack', onSubmit: (e) => { e.preventDefault(); const v = input.value.trim(); if (v) close(v); } },
        field({ label: 'Name for the copy', input, hint: 'The copy keeps your bags, list and tasks, with everything unpacked.' }),
        h('div', { class: 'dialog-actions' }, button({ label: 'Cancel', variant: 'ghost', onClick: () => close() }), button({ label: 'Duplicate', variant: 'primary', type: 'submit' })),
      );
    },
  });
}
