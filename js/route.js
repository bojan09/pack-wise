// Route maths for the Route page: straight-line (great-circle) distance between the trip's start and destination,
// points along that line, and where a place sits relative to it. Pure: no DOM, no network.
// Roads are longer than a straight line and PackWise knows no roads, so it never shows a driving distance or time;
// the user's maps app gives those (see the directions links in guide.js).

const R = 6371; // mean Earth radius, km
const rad = Math.PI / 180;

export const ROUTE_MIN_KM = 15; // closer than this, "on the way" is the destination itself: Explore covers it
export const ROUTE_MAX_KM = 1500; // longer than this, a corridor search is too heavy for the shared servers
export const MAX_STOPS = 40;
export const MAX_WAYPOINTS = 9; // Google Maps directions links accept up to 9 stops

const ok = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon);

/** Great-circle distance in km. */
export function distanceKm(a, b) {
  const x = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Initial bearing from a to b, degrees 0..360 (0 = north). */
export function bearing(a, b) {
  const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad);
  return ((Math.atan2(y, x) / rad) + 360) % 360;
}

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const compass = (deg) => POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

/**
 * Points on the great circle from a to b, both ends included, about `stepKm` apart (at most `max`).
 * Used as the polyline of an Overpass corridor search.
 */
export function pathPoints(a, b, stepKm = 50, max = 25) {
  const d = distanceKm(a, b) / R; // angular distance
  const n = Math.max(1, Math.min(max - 1, Math.ceil((d * R) / stepKm)));
  if (d < 1e-9) return [{ lat: a.lat, lon: a.lon }];
  const [la1, lo1, la2, lo2] = [a.lat * rad, a.lon * rad, b.lat * rad, b.lon * rad];
  const out = [];
  for (let i = 0; i <= n; i += 1) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    const z = A * Math.sin(la1) + B * Math.sin(la2);
    out.push({ lat: Math.atan2(z, Math.hypot(x, y)) / rad, lon: Math.atan2(y, x) / rad });
  }
  return out;
}

/** How far either side of the line to look: wider for longer trips, where a detour of a few km matters less. */
export const corridorKm = (totalKm) => (totalKm < 100 ? 3 : totalKm < 400 ? 5 : 8);

/**
 * Where p sits relative to the great circle a→b: how far along it (km from a) and how far off it (km).
 * `alongKm` is negative behind a and larger than the total beyond b.
 */
export function alongTrack(a, b, p) {
  const d13 = distanceKm(a, p) / R;
  const t = (bearing(a, p) - bearing(a, b)) * rad;
  const xt = Math.asin(Math.max(-1, Math.min(1, Math.sin(d13) * Math.sin(t))));
  const at = Math.acos(Math.max(-1, Math.min(1, Math.cos(d13) / Math.cos(xt))));
  return { alongKm: (Math.cos(t) < 0 ? -at : at) * R, offKm: Math.abs(xt) * R };
}

/**
 * Places between a and b, within `radiusKm` of the straight line and not at either end (those belong to the
 * destination's own Explore page, or to home). Nearest to the line first when there are too many, then in
 * travel order. Adds `alongKm` and `offKm`.
 */
export function onTheWay(places, a, b, { radiusKm, endGapKm, max = MAX_STOPS } = {}) {
  if (!ok(a) || !ok(b) || !Array.isArray(places)) return [];
  const total = distanceKm(a, b);
  radiusKm ??= corridorKm(total);
  endGapKm ??= Math.max(5, radiusKm);
  const kept = [];
  for (const p of places) {
    if (!ok(p)) continue;
    const { alongKm, offKm } = alongTrack(a, b, p);
    if (offKm > radiusKm || alongKm < 0 || alongKm > total) continue;
    if (distanceKm(a, p) < endGapKm || distanceKm(b, p) < endGapKm) continue;
    kept.push({ ...p, alongKm: Math.round(alongKm), offKm: Math.round(offKm * 10) / 10 });
  }
  return kept.sort((x, y) => x.offKm - y.offKm).slice(0, max).sort((x, y) => x.alongKm - y.alongKm || x.offKm - y.offKm);
}

/** Directions mode for the maps apps, from the trip's transport. Flights and ships fall back to driving. */
export const travelMode = (transport) => (transport === 'train' || transport === 'bus' ? 'transit' : 'driving');

/** "412 km" / "8.4 km" */
export const kmText = (km) => (km < 10 ? `${(Math.round(km * 10) / 10).toFixed(1)} km` : `${Math.round(km).toLocaleString('en-US')} km`);
