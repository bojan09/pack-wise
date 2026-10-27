// Print-friendly list: clean black-on-white, checkbox squares, one section per bag.
import { h } from '../dom.js';
import { button } from '../ui/components.js';
import { tripModel } from '../export.js';
import { getTrip, tripBags, tripItems, tripTasks } from '../selectors.js';

export function PrintScreen(ctx) {
  const { store, params } = ctx;
  const tripId = params.id;
  if (!getTrip(store.state, tripId)) return { redirect: '/trips', title: 'Trip not found', build: () => h('div') };
  return {
    title: 'Print list',
    static: true,
    build() {
      const trip = getTrip(store.state, tripId);
      const m = tripModel({ trip, bags: tripBags(store.state, tripId), items: tripItems(store.state, tripId), tasks: tripTasks(store.state, tripId) });
      const box = (done) => h('span', { class: `pbox${done ? ' is-done' : ''}`, 'aria-hidden': 'true' }, done ? '✓' : '');
      return h(
        'div',
        { class: 'screen print-screen' },
        h('div', { class: 'print-actions no-print' }, button({ label: 'Back', icon: 'chevL', variant: 'ghost', href: `#/trip/${tripId}` }), h('span', { class: 'spacer' }), button({ label: 'Print', icon: 'file', variant: 'primary', onClick: () => window.print(), key: 'print-now' })),
        h(
          'article',
          { class: 'print-sheet' },
          h('h1', { tabindex: '-1', text: m.title }),
          ...m.meta.map((line) => h('p', { class: 'print-meta', text: line })),
          h('p', { class: 'print-meta', text: m.summary }),
          m.sections.map((s) =>
            h(
              'section',
              { class: 'print-section' },
              h('h2', { text: `${s.name} (${s.packed}/${s.target})` }),
              s.categories.map((c) =>
                h(
                  'div',
                  { class: 'print-cat' },
                  h('h3', { text: c.label }),
                  h('ul', {}, c.items.map((i) => h('li', {}, box(i.done), h('span', { class: 'print-name', text: `${i.name}${i.target > 1 ? ` ×${i.target}` : ''}${i.essential ? ' *' : ''}${i.high ? ' !' : ''}` }), i.note ? h('span', { class: 'print-note', text: i.note }) : null))),
                ),
              ),
            ),
          ),
          m.taskGroups.length
            ? h('section', { class: 'print-section' }, h('h2', { text: `Travel tasks (${m.taskSummary})` }), m.taskGroups.map((g) => h('div', { class: 'print-cat' }, h('h3', { text: g.label }), h('ul', {}, g.tasks.map((t) => h('li', {}, box(t.done), h('span', { class: 'print-name', text: t.title }), t.due ? h('span', { class: 'print-note', text: `due ${t.due}` }) : null))))))
            : null,
          m.notes ? h('section', { class: 'print-section' }, h('h2', { text: 'Notes' }), h('p', { class: 'print-notes', text: m.notes })) : null,
          h('p', { class: 'print-foot', text: '* essential   ! high priority   Printed from PackWise' }),
        ),
      );
    },
  };
}
