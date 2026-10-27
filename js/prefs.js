// Lightweight UI preferences in localStorage, with an in-memory fallback when storage is blocked.

const KEY = 'packwise.prefs.v1';

export const ACCENTS = [
  { id: 'teal', label: 'Teal', accent: '#31B6A6', strong: '#1A7C74' },
  { id: 'blue', label: 'Blue', accent: '#4A9BE8', strong: '#2467B0' },
  { id: 'purple', label: 'Purple', accent: '#8E7CE0', strong: '#5B48B8' },
  { id: 'coral', label: 'Coral', accent: '#F28A72', strong: '#C4573F' },
  { id: 'amber', label: 'Amber', accent: '#E7B66C', strong: '#8A5A0B' },
  { id: 'green', label: 'Green', accent: '#5DBB63', strong: '#2E7D32' },
  { id: 'pink', label: 'Pink', accent: '#E8749F', strong: '#B03A69' },
];

const DEFAULTS = { theme: 'system', accent: 'teal', name: '', onboarded: false, lastTripId: '', companion: true, motion: 'standard', dismissed: [] };
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

function sanitize(p) {
  const out = { ...DEFAULTS };
  if (['light', 'dark', 'system'].includes(p?.theme)) out.theme = p.theme;
  if (ACCENTS.some((a) => a.id === p?.accent)) out.accent = p.accent;
  if (typeof p?.name === 'string') out.name = p.name.replace(/[\u0000-\u001F]/g, '').trim().slice(0, 40);
  out.onboarded = p?.onboarded === true;
  if (typeof p?.lastTripId === 'string') out.lastTripId = p.lastTripId.slice(0, 64);
  out.companion = p?.companion !== false;
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
  if (prefs.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', prefs.theme);
  const accent = ACCENTS.find((a) => a.id === prefs.accent) || ACCENTS[0];
  root.style.setProperty('--accent', accent.accent);
  root.style.setProperty('--accent-strong', accent.strong);
  const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0E1F21' : '#F8F5EF');
}
