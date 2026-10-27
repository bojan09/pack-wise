// Rule-based companion tips. Deterministic and local: no AI, no network. Each message has a
// stable id so a dismissed tip stays dismissed.
import { daysUntil, essentialsLeft, sumQty, taskProgress, tripPhase } from './progress.js';

const LEVELS = [
  [75, 'Nearly there — just a few more items to go!'],
  [50, 'Halfway packed. Nice work!'],
  [25, 'Great start! Keep ticking things off.'],
];

/**
 * @param {{screen?: 'dashboard'|'checklist'|'studio', trip: object|null, items: object[], tasks: object[], tripCount: number, now?: Date, dismissed?: string[]}} ctx
 * @returns {{id: string, text: string, mood: 'happy'|'camera'|'wave'}|null}
 */
export function companionMessage({ screen = 'dashboard', trip, items, tasks, tripCount, now = new Date(), dismissed = [] }) {
  if (!trip) return null;
  const gone = new Set(dismissed);
  const q = sumQty(items);
  const ess = essentialsLeft(items);
  const t = taskProgress(tasks);
  const days = trip.startDate ? daysUntil(trip.startDate, now) : null;
  const phase = tripPhase(trip, now);
  const candidates = [];

  if (trip.returnOf) {
    candidates.push({ id: `return:${trip.id}`, text: 'Heading home! Pack what you want to bring back.', mood: 'wave' });
  }
  if (q.target > 0 && q.packed === q.target) {
    candidates.push({
      id: `complete:${trip.id}`,
      text: ess.length === 0 && t.left === 0 ? 'Everything is packed. Have an amazing trip!' : 'All items packed! A few tasks are still open.',
      mood: 'camera',
    });
  }
  if (ess.length && phase === 'upcoming' && days !== null && days <= 3) {
    const names = ess.slice(0, 3).map((i) => i.name).join(', ');
    candidates.push({ id: `essentials:${trip.id}`, text: `Departure is close. Still to pack: ${names}${ess.length > 3 ? '…' : ''}.`, mood: 'wave' });
  }
  if (q.target > 0) {
    const hit = LEVELS.find(([min]) => q.percent >= min);
    if (hit) candidates.push({ id: `milestone-${hit[0]}:${trip.id}`, text: hit[1], mood: 'happy' });
  }
  if (tripCount === 1 && q.packed === 0) {
    candidates.push({ id: 'first-trip', text: screen === 'studio' ? 'Tap an item in the tray to drop it in the case.' : 'Welcome to your first trip! Tick items off as you pack them.', mood: 'happy' });
  }
  if (screen === 'studio' && q.target > 0 && q.packed === 0) {
    candidates.push({ id: 'studio-tip', text: 'Tap an item in the tray to drop it in the case.', mood: 'happy' });
  }
  return candidates.find((c) => !gone.has(c.id)) || null;
}
