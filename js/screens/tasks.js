// Travel preparation tasks (separate from luggage items).
import { h } from '../dom.js';
import { icon } from '../ui/icons.js';
import { button, checkbox, chip, emptyState, field, iconButton, progressBar, selectInput } from '../ui/components.js';
import { showDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { LIMITS, TASK_PHASES, cleanDate } from '../models.js';
import { daysUntil, taskProgress } from '../progress.js';
import { formatDate, plural } from '../format.js';
import { getTrip, sortedTrips, tripTasks } from '../selectors.js';
import { pageHeader, scopeBanner, tripSubtitle } from './shared.js';

const TASK_ICONS = [
  [/passport|\bid\b|visa/i, 'file'],
  [/transfer|airport|station|transport|check-in|boarding|flight/i, 'plane'],
  [/accommodation|hotel|booking|check out/i, 'home'],
  [/\bmaps?\b|navigation/i, 'pin'],
  [/insurance|secure|valuables/i, 'lock'],
  [/weather|forecast/i, 'sun'],
  [/bank|card|money|cash/i, 'user'],
  [/unpack|laundry/i, 'box'],
];
const taskIcon = (title) => TASK_ICONS.find(([re]) => re.test(title))?.[1] || 'check';

const PHASE_LABEL = Object.fromEntries(TASK_PHASES.map((p) => [p.id, p.label]));

/** `/tasks` tab: jump to the most relevant trip, or show an empty state. */
export function TasksRedirectScreen(ctx) {
  const { store } = ctx;
  const last = getTrip(store.state, ctx.lastTrip());
  const trip = last && last.status === 'active' ? last : sortedTrips(store.state, 'active')[0];
  if (trip) return { redirect: `/trip/${trip.id}/tasks`, title: 'Tasks', build: () => h('div') };
  return { title: 'Tasks', build: () => h('div', { class: 'screen' }, pageHeader({ title: 'Travel Tasks' }), emptyState({ title: 'No trips yet', text: 'Create a trip to get a checklist of things to do before you go.', action: button({ label: 'Plan a trip', icon: 'plus', variant: 'primary', href: '#/trips/new' }) })) };
}

export function TasksScreen(ctx) {
  const { store, navigate, params } = ctx;
  const tripId = params.id;
  if (!getTrip(store.state, tripId)) return { redirect: '/tasks', title: 'Trip not found', build: () => h('div') };
  ctx.setLastTrip(tripId);
  let phase = 'all';

  return {
    title: 'Travel tasks',
    build() {
      const state = store.state;
      const trip = getTrip(state, tripId);
      if (!trip) return h('div');
      const all = tripTasks(state, tripId);
      const p = taskProgress(all);
      const shown = phase === 'all' ? all : all.filter((t) => t.phase === phase);
      const trips = sortedTrips(state, 'active');

      const switcher = trips.length > 1
        ? (() => {
            const sel = selectInput({ options: trips.map((t) => ({ id: t.id, label: t.name })), value: tripId, name: 'trip' });
            sel.setAttribute('aria-label', 'Choose trip');
            sel.addEventListener('change', (e) => navigate(`/trip/${e.target.value}/tasks`));
            return sel;
          })()
        : null;

      const row = (t) => {
        const diff = t.dueDate && !t.done ? daysUntil(t.dueDate) : null;
        const due = t.dueDate ? h('span', { class: `due${diff !== null && diff < 0 ? ' is-late' : ''}`, text: `${diff !== null && diff < 0 ? 'Overdue · ' : 'Due '}${formatDate(t.dueDate)}` }) : null;
        return h(
          'li',
          { class: `task-row${t.done ? ' is-done' : ''}` },
          checkbox({ state: t.done, label: `${t.title}: ${t.done ? 'done' : 'not done'}`, onChange: () => store.toggleTask(t.id), key: `task-${t.id}` }),
          h('span', { class: `task-icon phase-${t.phase}`, 'aria-hidden': 'true' }, icon(taskIcon(t.title), { size: 18 })),
          h('button', { type: 'button', class: 'item-main', 'data-key': `task-edit-${t.id}`, 'aria-label': `Edit task ${t.title}`, onClick: () => taskDialog({ store, tripId, task: t }) }, h('span', { class: 'item-name', text: t.title }), h('span', { class: 'item-meta' }, phase === 'all' ? `${PHASE_LABEL[t.phase]}` : null, phase === 'all' && due ? ' · ' : null, due)),
          iconButton({ icon: 'trash', label: `Delete task ${t.title}`, onClick: () => { const removed = store.deleteTask(t.id); if (removed) toast(`Removed “${removed.title}”`, { action: { label: 'Undo', run: () => store.restoreTask(removed) } }); } }),
        );
      };

      return h(
        'div',
        { class: 'screen tasks-screen' },
        pageHeader({ title: 'Travel Tasks', subtitle: tripSubtitle(trip) || trip.name, back: { href: `#/trip/${tripId}`, label: 'Back to packing list' }, actions: [iconButton({ icon: 'plus', label: 'Add task', onClick: () => taskDialog({ store, tripId, defaultPhase: phase === 'all' ? 'before' : phase }), className: 'icon-btn-primary', key: 'task-add-top' })] }),
        switcher ? h('div', { class: 'toolbar' }, switcher) : null,
        scopeBanner(store, trip),
        h('section', { class: 'card summary-card', 'aria-label': 'Task progress' }, h('div', { class: 'row-between' }, h('strong', { text: `${p.done} / ${p.total} completed` }), h('strong', { class: 'pct', text: `${p.percent}%` })), progressBar(p.percent, { label: 'Travel task progress' })),
        h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter tasks' }, chip({ label: 'All', count: all.length, active: phase === 'all', key: 'tp-all', onClick: () => { phase = 'all'; ctx.refresh(); } }), TASK_PHASES.map((ph) => chip({ label: ph.label, count: all.filter((t) => t.phase === ph.id).length, active: phase === ph.id, key: `tp-${ph.id}`, onClick: () => { phase = ph.id; ctx.refresh(); } }))),
        shown.length ? h('ul', { class: 'card task-list' }, shown.map(row)) : emptyState({ title: all.length ? 'Nothing in this group' : 'No tasks yet', text: 'Tasks are things to do — separate from what goes in your bags.', showCompanion: false, action: button({ label: 'Add task', icon: 'plus', variant: 'primary', onClick: () => taskDialog({ store, tripId, defaultPhase: phase === 'all' ? 'before' : phase }) }) }),
        shown.length ? button({ label: 'Add task', icon: 'plus', variant: 'secondary', className: 'btn-block', onClick: () => taskDialog({ store, tripId, defaultPhase: phase === 'all' ? 'before' : phase }), key: 'task-add' }) : null,
      );
    },
  };
}

export function taskDialog({ store, tripId, task, defaultPhase = 'before' }) {
  return showDialog({
    title: task ? 'Edit task' : 'Add task',
    build: (close) => {
      const title = h('input', { type: 'text', name: 'title', maxlength: LIMITS.taskTitle, value: task?.title || '', required: true, 'data-autofocus': '' });
      const ph = selectInput({ options: TASK_PHASES, value: task?.phase || defaultPhase, name: 'phase' });
      const due = h('input', { type: 'date', name: 'due', value: task?.dueDate || '' });
      const error = h('p', { class: 'field-error', role: 'alert' });
      return h(
        'form',
        { class: 'form-stack', novalidate: true, onSubmit: (e) => { e.preventDefault(); const t = title.value.trim(); if (!t) { error.textContent = 'Give the task a title.'; title.focus(); return; } const fields = { title: t, phase: ph.value, dueDate: cleanDate(due.value) }; if (task) store.updateTask(task.id, fields); else store.addTask(tripId, fields); close(true); } },
        field({ label: 'Task', input: title }),
        error,
        h('div', { class: 'grid-2' }, field({ label: 'When', input: ph }), field({ label: 'Due date (optional)', input: due })),
        h('div', { class: 'dialog-actions' }, h('span', { class: 'spacer' }), button({ label: 'Cancel', variant: 'ghost', onClick: () => close() }), button({ label: task ? 'Save' : 'Add task', variant: 'primary', type: 'submit' })),
      );
    },
  });
}
