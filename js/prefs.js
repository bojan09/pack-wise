// Lightweight UI preferences in localStorage, with an in-memory fallback when storage is blocked.

const KEY = 'packwise.prefs.v1';

export const ACCENTS = [
  { id: 'teal', label: 'Teal', accent: '#31B6A6', strong: '#1A7C74' },
  { id: 'blue', label: 'Blue', accent: '#4A9BE8', strong: '#2467B0' },
  { id: 'purple', label: 'Purple', accent: '#9D8CF0', strong: '#5240AC' },
  { id: 'coral', label: 'Coral', accent: '#F28A72', strong: '#B4492F' },
  { id: 'amber', label: 'Amber', accent: '#E7B66C', strong: '#8A5A0B' },
  { id: 'green', label: 'Green', accent: '#5DBB63', strong: '#2E7D32' },
  { id: 'pink', label: 'Pink', accent: '#E8749F', strong: '#B03A69' },
];

export const LIGHT_BACKGROUNDS = [
  { id: 'default', label: 'Cream', swatch: '#f8f5ef' },
  { id: 'sage', label: 'Sage', swatch: '#eef3ea' },
  { id: 'mist', label: 'Mist blue', swatch: '#eef3f8' },
  { id: 'blush', label: 'Blush', swatch: '#faf1f0' },
  { id: 'lavender', label: 'Lavender', swatch: '#f3f0f9' },
  { id: 'sand', label: 'Warm sand', swatch: '#f7f0e2' },
  { id: 'white', label: 'Paper white', swatch: '#fbfbfa' },
];

export const DARK_BACKGROUNDS = [
  { id: 'default', label: 'Ocean', swatch: '#0e1f21' },
  { id: 'midnight', label: 'Midnight', swatch: '#0d1424' },
  { id: 'forest', label: 'Forest', swatch: '#0e1a12' },
  { id: 'graphite', label: 'Graphite', swatch: '#131415' },
  { id: 'plum', label: 'Plum', swatch: '#1a1020' },
  { id: 'espresso', label: 'Espresso', swatch: '#1a1410' },
];

/** ISO 3166-1 alpha-2 codes (plus XK, Kosovo). Names come from the browser's own Intl data, so nothing is translated by hand. */
const COUNTRY_CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'.split(' ');
const regionName = (() => {
  try { const d = new Intl.DisplayNames(['en'], { type: 'region' }); return (c) => d.of(c) || c; } catch { return (c) => c; }
})();
/** Every country, for "home country" (used to tell trips at home from trips abroad). */
export const HOME_COUNTRIES = COUNTRY_CODES.map((id) => ({ id, label: regionName(id) })).sort((a, b) => a.label.localeCompare(b.label));
export const countryName = (code) => (COUNTRY_CODES.includes(code) ? regionName(code) : '');

export const BACKGROUNDS = [
  { id: 'default', label: 'Default' },
  { id: 'mountains', label: 'Mountains' },
  { id: 'beach', label: 'Beach' },
  { id: 'city', label: 'City' },
  { id: 'minimal', label: 'Minimal' },
];

const DEFAULTS = { theme: 'system', accent: 'teal', name: '', onboarded: false, lastTripId: '', companion: true, motion: 'standard', dismissed: [], background: 'default', bgLight: 'default', bgDark: 'default', homeCountry: '', placeSuggest: true, haptics: false };
export const MOTION_LEVELS = [
  { id: 'reduced', label: 'Reduced' },
  { id: 'standard', label: 'Standard' },
  { id: 'enhanced', label: 'Enhanced' },
];

let memory = { ...DEFAULTS };
const listeners = new Set();

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return sanitize(parsed);
  } catch {
    return { ...memory };
  }
}

export const loadPrefsFrom = (p) => sanitize(p);

function sanitize(p) {
  const out = { ...DEFAULTS };
  if (['light', 'dark', 'system'].includes(p?.theme)) out.theme = p.theme;
  if (ACCENTS.some((a) => a.id === p?.accent)) out.accent = p.accent;
  if (typeof p?.name === 'string') out.name = p.name.replace(/[\u0000-\u001F]/g, '').trim().slice(0, 40);
  out.onboarded = p?.onboarded === true;
  if (typeof p?.lastTripId === 'string') out.lastTripId = p.lastTripId.slice(0, 64);
  out.companion = p?.companion !== false;
  out.haptics = p?.haptics === true;
  out.placeSuggest = p?.placeSuggest !== false; // destination autocomplete is on unless turned off
  if (BACKGROUNDS.some((b) => b.id === p?.background)) out.background = p.background;
  if (HOME_COUNTRIES.some((c) => c.id === p?.homeCountry)) out.homeCountry = p.homeCountry;
  if (LIGHT_BACKGROUNDS.some((b) => b.id === p?.bgLight)) out.bgLight = p.bgLight;
  if (DARK_BACKGROUNDS.some((b) => b.id === p?.bgDark)) out.bgDark = p.bgDark;
  if (MOTION_LEVELS.some((m) => m.id === p?.motion)) out.motion = p.motion;
  if (Array.isArray(p?.dismissed)) out.dismissed = p.dismissed.filter((x) => typeof x === 'string').map((x) => x.slice(0, 100)).slice(-200);
  return out;
}

export function getPrefs() {
  memory = read();
  return memory;
}

export function setPrefs(patch) {
  memory = sanitize({ ...getPrefs(), ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* storage blocked: preferences last for this session only */
  }
  applyPrefs(memory);
  listeners.forEach((fn) => fn(memory));
  return memory;
}

export const onPrefsChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Effective motion level: the OS reduced-motion setting always wins over the in-app choice. */
export function effectiveMotion(prefs = getPrefs()) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 'reduced';
  return prefs.motion;
}

export function dismissTip(id) {
  const cur = getPrefs().dismissed;
  if (!cur.includes(id)) setPrefs({ dismissed: [...cur, id] });
}

export function applyPrefs(prefs = getPrefs()) {
  const root = document.documentElement;
  root.setAttribute('data-motion', effectiveMotion(prefs));
  root.setAttribute('data-bg', prefs.background);
  root.setAttribute('data-bgl', prefs.bgLight);
  root.setAttribute('data-bgd', prefs.bgDark);
  if (prefs.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', prefs.theme);
  const accent = ACCENTS.find((a) => a.id === prefs.accent) || ACCENTS[0];
  root.style.setProperty('--accent', accent.accent);
  root.style.setProperty('--accent-strong', accent.strong);
  const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const pick = dark ? DARK_BACKGROUNDS.find((b) => b.id === prefs.bgDark) : LIGHT_BACKGROUNDS.find((b) => b.id === prefs.bgLight);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', pick?.swatch || (dark ? '#0E1F21' : '#F8F5EF'));
}
