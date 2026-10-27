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

/**
 * Tip for the Explore page. `status` comes from matchDestination().
 * @returns {{id: string, text: string, mood: string}|null}
 */
export function guideMessage({ saved = 0, planned = 0, hints = 0, dismissed = [], tripId = '' }) {
  const gone = new Set(dismissed);
  const list = [];
  if (!saved) list.push({ id: `guide-empty:${tripId}`, text: 'Nothing here yet. Tap the heart on places and dishes, and they land here for you to arrange.', mood: 'happy' });
  else {
    if (hints > 0) list.push({ id: `guide-hints:${tripId}:${hints}`, text: `I have ${hints} optional packing ${hints === 1 ? 'idea' : 'ideas'} based on what you saved. Nothing is added unless you tap.`, mood: 'wave' });
    if (!planned) list.push({ id: `guide-plan:${tripId}`, text: 'Want a head start? I can sketch a draft day plan you can rearrange. It has no times or routes.', mood: 'happy' });
  }
  return list.find((m) => !gone.has(m.id)) || null;
}

export function tasteMessage({ status, countryLabel = '', asked = '', saved = 0, dismissed = [] }) {
  const gone = new Set(dismissed);
  const list = [];
  if (status !== 'covered') {
    list.push({ id: `taste-none:${asked}`, text: `I don’t have a built-in food guide for “${asked}” yet. You can browse a covered country below.`, mood: 'wave' });
  } else {
    if (saved > 0) list.push({ id: `taste-saved:${countryLabel}`, text: `${saved} on your Must-Try list. Tick “I tried it” as you go; it stays on this device.`, mood: 'happy' });
    list.push({ id: `taste-intro:${countryLabel}`, text: `Hungry? Here are regional favourites for ${countryLabel}. Check ingredients with the cook if you have allergies or a special diet.`, mood: 'happy' });
  }
  return list.find((m) => !gone.has(m.id)) || null;
}

export function exploreMessage({ status, destName = '', asked = '', saved = 0, dismissed = [] }) {
  const gone = new Set(dismissed);
  const list = [];
  if (status === 'none' || status === 'ambiguous') {
    list.push({ id: `explore-none:${asked}`, text: `I don’t have a built-in guide for “${asked}” yet. You can add your own places, search the map, or browse a covered destination.`, mood: 'wave' });
  } else if (status === 'country') {
    list.push({ id: `explore-country:${asked}`, text: 'Pick a city to see places. A whole country is too big to guess at.', mood: 'happy' });
  } else if (destName) {
    if (saved > 0) list.push({ id: `explore-saved:${destName}`, text: `${saved} saved. They stay on this device and travel with your backup.`, mood: 'happy' });
    list.push({ id: `explore-intro:${destName}`, text: `Here’s a short editorial guide to ${destName}. Tap the heart to save places for this trip.`, mood: 'happy' });
  }
  return list.find((m) => !gone.has(m.id)) || null;
}
