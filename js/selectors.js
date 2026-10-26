// Read-only views over store state. Pure.
import { daysUntil, tripPhase } from './progress.js';

export const getTrip = (state, id) => state.trips.find((t) => t.id === id) || null;

export const tripItems = (state, tripId) => state.items.filter((i) => i.tripId === tripId);

export const tripBags = (state, tripId) =>
  state.bags.filter((b) => b.tripId === tripId).sort((a, b) => a.order - b.order);

export const tripTasks = (state, tripId) =>
  state.tasks.filter((t) => t.tripId === tripId).sort((a, b) => a.order - b.order);

export function sortedTrips(state, status = 'active', now = new Date()) {
  return state.trips
    .filter((t) => t.status === status)
    .sort((a, b) => rank(a, now) - rank(b, now) || b.updatedAt.localeCompare(a.updatedAt));
}

// ongoing first, then soonest upcoming, then undated, then past (most recent first)
function rank(trip, now) {
  const phase = tripPhase(trip, now);
  if (phase === 'ongoing') return 0;
  if (phase === 'upcoming') return 1 + Math.min(daysUntil(trip.startDate, now), 1e6) / 1e7;
  if (phase === 'undated') return 2;
  return 3 + Math.min(Math.max(-daysUntil(trip.endDate || trip.startDate, now), 0), 1e6) / 1e7;
}

export function featuredTrip(state, now = new Date()) {
  return sortedTrips(state, 'active', now)[0] || null;
}
