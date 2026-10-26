// Packing checklist: category cards, filters, quantity steppers, bag management.
import { h } from '../dom.js';
import { icon } from '../ui/icons.js';
import { button, checkbox, chip, emptyState, field, iconButton, progressBar, ring, selectInput, stepper } from '../ui/components.js';
import { actionSheet, confirmDialog, showDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { BAG_KINDS, CATEGORY_PRESETS, LIMITS, PRIORITIES, categoryMeta, normalizeCategory } from '../models.js';
import { bagProgress, categoryProgress, essentialsLeft, isItemPacked, sumQty } from '../progress.js';
import { getTrip, tripBags, tripItems } from '../selectors.js';
import { plural } from '../format.js';
import { pageHeader, tripSubtitle } from './shared.js';

const FILTERS = [
  ['all', 'All'],
  ['topack', 'To pack'],
  ['packed', 'Packed'],
  ['essential', 'Essentials'],
];

export function ChecklistScreen(ctx) {
  const { store, navigate, params } = ctx;
  const tripId = params.id;
  if (!getTrip(store.state, tripId)) return { redirect: '/trips', title: 'Trip not found', build: () => h('div') };
  ctx.setLastTrip(tripId);

  let filter = 'all';
  let bagFilter = 'all';
  const collapsed = new Set();
  let quickCategory = null;
  const search = h('input', { type: 'search', class: 'search-input', placeholder: 'Search items', 'aria-label': 'Search items', 'data-key': 'item-search', onInput: () => ctx.refresh() });

  const matches = (item) => {
    const q = search.value.trim().toLowerCase();
    if (q && !`${item.name} ${item.notes} ${categoryMeta(item.category).label}`.toLowerCase().includes(q)) return false;
    if (bagFilter !== 'all' && item.bagId !== bagFilter) return false;
    if (filter === 'topack') return !isItemPacked(item);
    if (filter === 'packed') return isItemPacked(item);
    if (filter === 'essential') return item.essential;
    return true;
  };

  async function openMenu(trip) {
    const choice = await actionSheet({
      title: trip.name,
      actions: [
        { id: 'bags', label: 'Manage bags', icon: 'suitcase' },
        { id: 'tasks', label: 'Travel tasks', icon: 'tasks' },
        { id: 'summary', label: 'Trip summary', icon: 'check' },
        { id: 'edit', label: 'Edit trip', icon: 'edit' },
        { id: 'dup', label: 'Duplicate trip', icon: 'copy' },
        { id: 'archive', label: 'Archive trip', icon: 'archive' },
      ],
    });
    if (choice === 'bags') manageBags(store, tripId);
    else if (choice === 'tasks') navigate(`/trip/${tripId}/tasks`);
    else if (choice === 'summary') navigate(`/trip/${tripId}/summary`);
    else if (choice === 'edit') navigate(`/trip/${tripId}/edit`);
    else if (choice === 'dup') {
      const copy = store.duplicateTrip(tripId);
      if (copy) {
        toast(`Duplicated as “${copy.name}”`, { tone: 'success' });
        navigate(`/trip/${copy.id}`);
      }
    } else if (choice === 'archive') {
      store.archiveTrip(tripId);
      toast(`Archived “${trip.name}”`, { action: { label: 'Undo', run: () => store.restoreTrip(tripId) } });
      navigate('/trips');
    }
  }

  function removeItem(item) {
    const removed = store.deleteItem(item.id);
    if (removed) toast(`Removed “${removed.name}”`, { action: { label: 'Undo', run: () => store.restoreItem(removed) } });
  }

  function itemRow(item, bags) {
    const done = isItemPacked(item);
    const state = done ? true : item.packed > 0 ? 'mixed' : false;
    const bag = bags.find((b) => b.id === item.bagId);
    const meta = [bag?.name, item.target > 1 ? `${item.packed}/${item.target} packed` : '', item.priority === 'high' ? 'High priority' : '', item.notes ? 'Has note' : ''].filter(Boolean).join(' · ');
    return h(
      'li',
      { class: `item-row${done ? ' is-packed' : ''}` },
      checkbox({ state, label: `${item.name}: ${done ? 'packed' : 'not packed'}`, onChange: () => store.togglePacked(item.id), key: `chk-${item.id}` }),
      h(
        'button',
        { type: 'button', class: 'item-main', 'data-key': `edit-${item.id}`, 'aria-label': `Edit ${item.name}`, onClick: () => itemDialog({ store, tripId, item }) },
        h('span', { class: 'item-name' }, item.name, item.essential ? h('span', { class: 'badge-essential', title: 'Essential' }, icon('star', { size: 12 }), h('span', { class: 'sr-only', text: 'Essential' })) : null),
        meta ? h('span', { class: 'item-meta', text: meta }) : null,
      ),
      stepper({ value: item.target, min: 1, max: LIMITS.maxQty, label: item.name, key: `qty-${item.id}`, onChange: (n) => store.setTarget(item.id, n) }),
    );
  }

  function categoryCard(cat, items, allItems, bags) {
    const meta = categoryMeta(cat);
    const q = categoryProgress(allItems, cat);
    const open = !collapsed.has(cat);
    const bodyId = `cat-${cat.replace(/\W/g, '_')}`;
    const quick = quickCategory === cat;
    return h(
      'section',
      { class: 'card category-card', 'aria-label': meta.label },
      h(
        'button',
        { type: 'button', class: 'category-head', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': bodyId, 'data-key': `cat-${cat}`, onClick: () => { if (open) collapsed.add(cat); else collapsed.delete(cat); ctx.refresh(); } },
        h('span', { class: 'category-icon' }, icon(meta.icon, { size: 20 })),
        h('span', { class: 'category-info' }, h('strong', { text: meta.label }), h('span', { class: 'muted small', text: `${q.packedItems}/${allItems.filter((i) => i.category === cat).length} items` })),
        h('span', { class: `pct-pill${q.percent === 100 ? ' is-done' : ''}`, text: `${q.percent}%` }),
        icon('chevD', { size: 18, class: `chev${open ? ' is-open' : ''}` }),
      ),
      open
        ? h(
            'div',
            { class: 'category-body', id: bodyId },
            h('ul', { class: 'item-list' }, items.map((i) => itemRow(i, bags))),
            quick
              ? h(
                  'form',
                  { class: 'quick-add', onSubmit: (e) => { e.preventDefault(); const input = e.target.elements.name; const v = input.value.trim(); if (!v) return; store.addItem(tripId, { name: v, category: cat, target: 1 }); } },
                  h('input', { type: 'text', name: 'name', maxlength: LIMITS.itemName, placeholder: `Add to ${meta.label}…`, 'aria-label': `New ${meta.label} item`, 'data-key': `quick-${cat}`, autocomplete: 'off', onKeydown: (e) => { if (e.key === 'Escape') { quickCategory = null; ctx.refresh(); } } }),
                  button({ label: 'Add', variant: 'primary', type: 'submit' }),
                  button({ label: 'Done', variant: 'ghost', onClick: () => { quickCategory = null; ctx.refresh(); } }),
                )
              : h('button', { type: 'button', class: 'add-inline', 'data-key': `add-${cat}`, onClick: () => { quickCategory = cat; ctx.refresh(); } }, icon('plus', { size: 16 }), 'Add item'),
          )
        : null,
    );
  }

  return {
    title: 'Packing list',
    build() {
      const state = store.state;
      const trip = getTrip(state, tripId);
      if (!trip) return h('div');
      const bags = tripBags(state, tripId);
      const all = tripItems(state, tripId);
      const q = sumQty(all);
      const visible = all.filter(matches);

      const counts = { all: all.length, topack: all.filter((i) => !isItemPacked(i)).length, packed: all.filter(isItemPacked).length, essential: all.filter((i) => i.essential).length };

      // group by category, presets first in their canonical order
      const order = [...CATEGORY_PRESETS.map((c) => c.id), ...[...new Set(all.map((i) => i.category))].filter((c) => !CATEGORY_PRESETS.some((p) => p.id === c)).sort((a, b) => a.localeCompare(b))];
      const groups = order.map((cat) => [cat, visible.filter((i) => i.category === cat).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))]).filter(([cat, items]) => items.length || (quickCategory === cat && all.some((i) => i.category === cat)));

      const list = all.length === 0
        ? emptyState({ title: 'Your list is empty', text: 'Add the first item to start packing.', action: button({ label: 'Add item', icon: 'plus', variant: 'primary', onClick: () => itemDialog({ store, tripId }) }) })
        : groups.length === 0
          ? emptyState({ title: 'Nothing here', text: 'No items match the current search or filter.', showCompanion: false, action: button({ label: 'Clear filters', variant: 'secondary', onClick: () => { filter = 'all'; bagFilter = 'all'; search.value = ''; ctx.refresh(); } }) })
          : h('div', { class: 'category-list' }, groups.map(([cat, items]) => categoryCard(cat, items, all, bags)));

      const complete = q.target > 0 && q.packed === q.target;

      const main = h(
        'div',
        { class: 'checklist-main' },
        pageHeader({ title: trip.name, subtitle: tripSubtitle(trip), back: { href: '#/trips', label: 'Back to trips' }, actions: [iconButton({ icon: 'plus', label: 'Add item', onClick: () => itemDialog({ store, tripId }), className: 'icon-btn-primary hide-desktop', key: 'add-top' }), iconButton({ icon: 'dots', label: 'Trip actions', onClick: () => openMenu(trip), key: 'trip-menu' })] }),
        h('section', { class: 'card summary-card hide-desktop', 'aria-label': 'Packing summary' }, h('div', { class: 'row-between' }, h('strong', { text: 'Packed' }), h('strong', { class: 'pct', text: `${q.percent}%` })), progressBar(q.percent, { label: 'Packing progress' }), h('p', { class: 'muted small', text: `${q.packed} / ${q.target} items${bags.length > 1 ? ` · ${plural(bags.length, 'bag')}` : ''}` })),
        complete ? h('div', { class: 'banner banner-success' }, icon('check', { size: 18 }), h('span', { text: 'Everything is packed!' }), h('a', { class: 'link', href: `#/trip/${tripId}/summary`, text: 'View summary' })) : null,
        h('div', { class: 'toolbar' }, search, bags.length > 1 ? bagSelect(bags) : null),
        h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter items' }, FILTERS.map(([id, label]) => chip({ label, count: counts[id], active: filter === id, key: `flt-${id}`, onClick: () => { filter = id; ctx.refresh(); } }))),
        button({ label: 'Add item', icon: 'plus', variant: 'secondary', className: 'btn-block hide-mobile-add', onClick: () => itemDialog({ store, tripId }), key: 'add-main' }),
        list,
      );

      const panel = h(
        'aside',
        { class: 'side-panel', 'aria-label': 'Trip overview' },
        h('section', { class: 'card panel-card' }, h('div', { class: 'panel-ring' }, ring(q.percent, { label: 'Packed' }), h('div', {}, h('strong', { text: `${q.packed} / ${q.target}` }), h('p', { class: 'muted small', text: 'items packed' })))),
        h(
          'section',
          { class: 'card panel-card' },
          h('div', { class: 'row-between' }, h('h2', { class: 'card-title', text: 'Bags' }), h('button', { type: 'button', class: 'link-btn', text: 'Manage', onClick: () => manageBags(store, tripId) })),
          h('ul', { class: 'bag-list' }, bags.map((b) => { const p = bagProgress(all, b.id); return h('li', {}, h('div', { class: 'row-between' }, h('span', { class: 'bag-name' }, icon(BAG_KINDS.find((k) => k.id === b.kind)?.icon || 'box', { size: 16 }), b.name), h('span', { class: 'muted small', text: `${p.packed}/${p.target}` })), progressBar(p.percent, { label: `${b.name} progress` })); })),
        ),
        essentialPanel(all),
      );

      return h('div', { class: 'screen checklist-layout' }, main, panel);

      function bagSelect(bagList) {
        const sel = selectInput({ options: [{ id: 'all', label: 'All bags' }, ...bagList.map((b) => ({ id: b.id, label: b.name }))], value: bagFilter, name: 'bagFilter' });
        sel.setAttribute('aria-label', 'Filter by bag');
        sel.dataset.key = 'bag-filter';
        sel.addEventListener('change', (e) => { bagFilter = e.target.value; ctx.refresh(); });
        return sel;
      }

      function essentialPanel(items) {
        const left = essentialsLeft(items);
        return h(
          'section',
          { class: 'card panel-card' },
          h('h2', { class: 'card-title', text: 'Essentials left' }),
          left.length
            ? h('ul', { class: 'mini-list' }, left.slice(0, 6).map((i) => h('li', {}, h('button', { type: 'button', class: 'mini-item', 'data-key': `ess-${i.id}`, 'aria-label': `Mark ${i.name} as packed`, onClick: () => store.togglePacked(i.id) }, icon('star', { size: 14 }), h('span', { text: i.name })))))
            : h('p', { class: 'muted small', text: items.some((i) => i.essential) ? 'All essentials are packed.' : 'No essentials flagged yet.' }),
        );
      }
    },
  };
}

// ---------------------------------------------------------------- item dialog
export function itemDialog({ store, tripId, item, defaultCategory }) {
  const bags = tripBags(store.state, tripId);
  const customCats = [...new Set(tripItems(store.state, tripId).map((i) => i.category))].filter((c) => !CATEGORY_PRESETS.some((p) => p.id === c));
  const catOptions = [...CATEGORY_PRESETS.map((c) => ({ id: c.id, label: c.label })), ...customCats.map((c) => ({ id: c, label: c })), { id: '__new', label: 'New category…' }];
  return showDialog({
    title: item ? 'Edit item' : 'Add item',
    build: (close) => {
      const name = h('input', { type: 'text', name: 'name', maxlength: LIMITS.itemName, value: item?.name || '', required: true, autocomplete: 'off', 'data-autofocus': '' });
      const category = selectInput({ options: catOptions, value: item?.category || defaultCategory || 'clothing', name: 'category' });
      const newCat = h('input', { type: 'text', name: 'newCategory', maxlength: LIMITS.category, placeholder: 'Category name', 'aria-label': 'New category name', hidden: true });
      category.addEventListener('change', () => { newCat.hidden = category.value !== '__new'; if (!newCat.hidden) newCat.focus(); });
      const target = h('input', { type: 'number', name: 'target', min: 1, max: LIMITS.maxQty, value: item?.target ?? 1, inputmode: 'numeric' });
      const packed = h('input', { type: 'number', name: 'packed', min: 0, max: LIMITS.maxQty, value: item?.packed ?? 0, inputmode: 'numeric' });
      const bag = selectInput({ options: bags.map((b) => ({ id: b.id, label: b.name })), value: item?.bagId || bags[0]?.id, name: 'bag' });
      const priority = selectInput({ options: PRIORITIES, value: item?.priority || 'normal', name: 'priority' });
      const essential = h('input', { type: 'checkbox', class: 'check', name: 'essential', checked: item?.essential === true });
      const notes = h('textarea', { name: 'notes', rows: 2, maxlength: LIMITS.itemNotes, placeholder: 'Optional' }, item?.notes || '');
      const error = h('p', { class: 'field-error', role: 'alert' });

      const form = h(
        'form',
        {
          class: 'form-stack',
          novalidate: true,
          onSubmit: (e) => {
            e.preventDefault();
            const nm = name.value.trim();
            if (!nm) { error.textContent = 'Give the item a name.'; name.setAttribute('aria-invalid', 'true'); name.focus(); return; }
            const cat = category.value === '__new' ? normalizeCategory(newCat.value) : category.value;
            const tgt = Math.min(LIMITS.maxQty, Math.max(1, parseInt(target.value, 10) || 1));
            const pck = Math.min(tgt, Math.max(0, parseInt(packed.value, 10) || 0));
            const fields = { name: nm, category: cat, target: tgt, packed: pck, bagId: bag.value, priority: priority.value, essential: essential.checked, notes: notes.value };
            if (item) store.updateItem(item.id, fields);
            else store.addItem(tripId, fields);
            close(true);
          },
        },
        field({ label: 'Name', input: name, error: '' }),
        error,
        h('div', { class: 'grid-2' }, h('div', {}, field({ label: 'Category', input: category }), newCat), field({ label: 'Bag', input: bag })),
        h('div', { class: 'grid-3' }, field({ label: 'How many', input: target }), field({ label: 'Packed', input: packed }), field({ label: 'Priority', input: priority })),
        h('label', { class: 'switch-row' }, essential, h('span', {}, h('strong', { text: 'Essential' }), h('span', { class: 'muted small', text: 'Flag items you must not forget.' }))),
        field({ label: 'Notes', input: notes }),
        h(
          'div',
          { class: 'dialog-actions' },
          item ? button({ label: 'Delete', icon: 'trash', variant: 'danger-ghost', onClick: () => { const removed = store.deleteItem(item.id); close(true); if (removed) toast(`Removed “${removed.name}”`, { action: { label: 'Undo', run: () => store.restoreItem(removed) } }); } }) : null,
          item ? button({ label: 'Duplicate', icon: 'copy', variant: 'ghost', onClick: () => { store.duplicateItem(item.id); close(true); } }) : null,
          h('span', { class: 'spacer' }),
          button({ label: 'Cancel', variant: 'ghost', onClick: () => close() }),
          button({ label: item ? 'Save' : 'Add item', variant: 'primary', type: 'submit' }),
        ),
      );
      return form;
    },
  });
}

// ---------------------------------------------------------------- bag manager
export function manageBags(store, tripId) {
  return showDialog({
    title: 'Manage bags',
    build: (close) => {
      const host = h('div', { class: 'dialog-stack' });
      const render = () => {
        const bags = tripBags(store.state, tripId);
        const items = tripItems(store.state, tripId);
        const nameInput = h('input', { type: 'text', name: 'bagName', maxlength: LIMITS.bagName, placeholder: 'e.g. Duffel bag', 'aria-label': 'New bag name' });
        const kind = selectInput({ options: BAG_KINDS, value: 'other', name: 'bagKind' });
        kind.setAttribute('aria-label', 'Bag type');
        host.replaceChildren(
          h('ul', { class: 'bag-edit-list' }, bags.map((b) => {
            const input = h('input', { type: 'text', value: b.name, maxlength: LIMITS.bagName, 'aria-label': `Name of ${b.name}`, onChange: (e) => { const v = e.target.value.trim(); if (v) store.updateBag(b.id, { name: v }); else e.target.value = b.name; } });
            const count = items.filter((i) => i.bagId === b.id).length;
            return h('li', {}, icon(BAG_KINDS.find((k) => k.id === b.kind)?.icon || 'box', { size: 20 }), input, h('span', { class: 'muted small', text: plural(count, 'item') }), iconButton({ icon: 'trash', label: `Delete ${b.name}`, className: bags.length < 2 ? 'is-disabled' : '', onClick: async () => {
              if (bags.length < 2) { toast('A trip needs at least one bag.'); return; }
              const ok = count === 0 || (await confirmDialog({ title: `Delete “${b.name}”?`, message: `Its ${plural(count, 'item')} will move to “${bags.find((x) => x.id !== b.id).name}”. Nothing is lost.`, confirmLabel: 'Delete bag', danger: true }));
              if (ok) { store.deleteBag(b.id); render(); }
            } }));
          })),
          h('form', { class: 'bag-add', onSubmit: (e) => { e.preventDefault(); const v = nameInput.value.trim(); if (!v) { nameInput.focus(); return; } store.addBag(tripId, { name: v, kind: kind.value }); render(); host.querySelector('input[name="bagName"]')?.focus(); } }, nameInput, kind, button({ label: 'Add bag', icon: 'plus', variant: 'secondary', type: 'submit' })),
          h('div', { class: 'dialog-actions' }, h('span', { class: 'spacer' }), button({ label: 'Done', variant: 'primary', onClick: () => close(true) })),
        );
      };
      render();
      return host;
    },
  });
}
