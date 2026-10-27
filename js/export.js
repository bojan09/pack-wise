// Plain-text and print-friendly views of a trip. Pure: no DOM, no storage.
import { CATEGORY_PRESETS, CONDITIONS, SEASONS, TASK_PHASES, categoryMeta } from './models.js';
import { sumQty, taskProgress } from './progress.js';

const orderOfCategory = (c) => {
  const i = CATEGORY_PRESETS.findIndex((p) => p.id === c);
  return i === -1 ? 999 : i;
};

/**
 * Structured, display-agnostic model used by both the text export and the print view.
 * @param {{trip: object, bags: object[], items: object[], tasks: object[]}} src
 */
export function tripModel({ trip, bags, items, tasks }) {
  const q = sumQty(items);
  const season = SEASONS.find((s) => s.id && s.id === trip.season)?.label || '';
  const conditions = CONDITIONS.filter((c) => trip.conditions?.includes(c.id)).map((c) => c.label);
  const meta = [
    [trip.destination && trip.destination !== trip.name ? trip.destination : '', trip.startDate ? `${trip.startDate}${trip.endDate && trip.endDate !== trip.startDate ? ` to ${trip.endDate}` : ''}` : ''].filter(Boolean).join(' · '),
    [season, conditions.join(', ')].filter(Boolean).join(' · '),
    trip.travelers > 1 ? `${trip.travelers} travelers` : '',
  ].filter(Boolean);

  const toEntry = (i) => ({ name: i.name, target: i.target, packed: i.packed, done: i.packed >= i.target, essential: i.essential, high: i.priority === 'high', note: i.notes });
  const section = (name, list) => {
    const p = sumQty(list);
    const cats = [...new Set(list.map((i) => i.category))].sort((a, b) => orderOfCategory(a) - orderOfCategory(b) || a.localeCompare(b));
    return {
      name,
      packed: p.packed,
      target: p.target,
      categories: cats.map((c) => ({
        label: categoryMeta(c).label,
        items: list.filter((i) => i.category === c).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)).map(toEntry),
      })),
    };
  };
  const sections = [...bags].sort((a, b) => a.order - b.order).map((b) => section(b.name, items.filter((i) => i.bagId === b.id)));
  const known = new Set(bags.map((b) => b.id));
  const loose = items.filter((i) => !known.has(i.bagId));
  if (loose.length) sections.push(section('No bag', loose));

  const t = taskProgress(tasks);
  const taskGroups = TASK_PHASES.map((ph) => ({
    label: ph.label,
    tasks: tasks.filter((x) => x.phase === ph.id).sort((a, b) => a.order - b.order).map((x) => ({ title: x.title, done: x.done, due: x.dueDate })),
  })).filter((g) => g.tasks.length);

  return {
    title: trip.name,
    meta,
    summary: `${q.packed} of ${q.target} items packed (${q.percent}%)`,
    sections: sections.filter((s) => s.target > 0 || sections.length === 1),
    taskSummary: t.total ? `${t.done} of ${t.total} tasks done` : '',
    taskGroups,
    notes: trip.notes || '',
  };
}

const box = (done) => (done ? '[x]' : '[ ]');

export function tripToText(src) {
  const m = tripModel(src);
  const out = [`PackWise — ${m.title}`, ...m.meta, m.summary, ''];
  for (const s of m.sections) {
    out.push(`${s.name.toUpperCase()} (${s.packed}/${s.target})`);
    for (const c of s.categories) {
      out.push(`  ${c.label}`);
      for (const i of c.items) {
        const qty = i.target > 1 ? ` x${i.target}${!i.done && i.packed > 0 ? ` (${i.packed} packed)` : ''}` : '';
        out.push(`    ${box(i.done)} ${i.name}${qty}${i.essential ? ' *' : ''}${i.high ? ' !' : ''}${i.note ? ` — ${i.note.replace(/\s*\n\s*/g, ' ')}` : ''}`);
      }
    }
    out.push('');
  }
  if (m.taskGroups.length) {
    out.push(`TRAVEL TASKS (${m.taskSummary})`);
    for (const g of m.taskGroups) {
      out.push(`  ${g.label}`);
      for (const t of g.tasks) out.push(`    ${box(t.done)} ${t.title}${t.due ? ` (due ${t.due})` : ''}`);
    }
    out.push('');
  }
  if (m.notes) out.push('NOTES', `  ${m.notes.replace(/\n/g, '\n  ')}`, '');
  out.push('* essential   ! high priority', 'Exported from PackWise — your data stays on your device.');
  return out.join('\n');
}

export function textFilename(trip) {
  const slug = trip.name.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'trip';
  return `packwise-${slug}.txt`;
}
