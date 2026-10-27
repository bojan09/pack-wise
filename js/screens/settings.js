// Settings: Appearance · Data · Preferences · About (tabs, as in the approved design).
import { h } from '../dom.js';
import { icon } from '../ui/icons.js';
import { button, segmented, field } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { backgroundArt, logoMark } from '../ui/art.js';
import { ACCENTS, BACKGROUNDS, MOTION_LEVELS, getPrefs, setPrefs } from '../prefs.js';
import { hapticsSupported, buzz } from '../haptics.js';
import { STORAGE_NOTE } from '../install.js';
import { APP_VERSION } from '../models.js';
import { downloadAllText, downloadBackup, downloadSafetyCopy, importFromFile } from '../backup.js';
import { pageHeader } from './shared.js';

const TABS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'data', label: 'Data' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'about', label: 'About' },
];

function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function SettingsScreen(ctx) {
  const { store, app } = ctx;
  let tab = TABS.some((t) => t.id === ctx.query.get('tab')) ? ctx.query.get('tab') : 'appearance';
  const panel = h('div', { class: 'settings-panel', role: 'tabpanel', tabindex: '0' });
  const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Settings sections' });
  let unsubInstall = null;

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', tabindex: '-1', 'aria-label': 'Choose a PackWise backup file', onChange: async (e) => { const f = e.target.files?.[0]; e.target.value = ''; await importFromFile(store, f); } });

  // ------------------------------------------------------------------ Appearance
  function appearance() {
    const prefs = getPrefs();
    const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Accent color' }, ACCENTS.map((a) => h('label', { class: 'swatch', title: a.label }, h('input', { type: 'radio', name: 'accent', value: a.id, checked: a.id === prefs.accent, 'aria-label': a.label, onChange: () => setPrefs({ accent: a.id }) }), h('span', { style: { background: a.accent } }, icon('check', { size: 16 })))));
    const bgs = h('div', { class: 'bg-options', role: 'radiogroup', 'aria-label': 'Background style' }, BACKGROUNDS.map((b) => {
      const art = backgroundArt(b.id);
      return h('label', { class: 'bg-opt' }, h('input', { type: 'radio', name: 'background', value: b.id, checked: b.id === prefs.background, onChange: () => setPrefs({ background: b.id }) }), h('span', { class: `bg-thumb bg-thumb-${b.id}` }, art), h('span', { class: 'bg-label', text: b.label }));
    }));
    return h(
      'div',
      { class: 'settings-stack' },
      h('section', { class: 'card settings-card' }, h('h2', { class: 'card-title', text: 'Theme' }), segmented({ name: 'theme', label: 'Theme', value: prefs.theme, options: [{ id: 'light', label: 'Light', icon: 'sun' }, { id: 'dark', label: 'Dark', icon: 'moon' }, { id: 'system', label: 'System', icon: 'monitor' }], onChange: (v) => setPrefs({ theme: v }) }), h('h2', { class: 'card-title', text: 'Accent color' }), swatches),
      h('section', { class: 'card settings-card' }, h('h2', { class: 'card-title', text: 'Background style' }), bgs),
      h('section', { class: 'card settings-card' }, h('h2', { class: 'card-title', text: 'Motion intensity' }), segmented({ name: 'motion', label: 'Motion intensity', value: prefs.motion, options: MOTION_LEVELS, onChange: (v) => setPrefs({ motion: v }) }), h('p', { class: 'muted small', text: 'Controls the suitcase animations and celebrations. Your device’s “reduce motion” setting always takes priority.' })),
    );
  }

  // ------------------------------------------------------------------------ Data
  function data() {
    const storageInfo = h('p', { class: 'muted small', text: 'Checking storage…' });
    const persistInfo = h('p', { class: 'muted small', 'aria-live': 'polite' });
    (async () => {
      try {
        const [est, persisted] = await Promise.all([navigator.storage?.estimate?.(), navigator.storage?.persisted?.()]);
        storageInfo.textContent = est ? `Using ${formatBytes(est.usage)} of ${formatBytes(est.quota)} available.` : 'Storage details are not available in this browser.';
        persistInfo.textContent = persisted ? 'Protected: the browser will not clear this data automatically.' : 'Not protected: the browser may clear this data if the device runs low on space.';
      } catch {
        storageInfo.textContent = 'Storage details are not available in this browser.';
      }
    })();
    const safetyHost = h('div');
    store.getSafetyCopy().then((copy) => {
      if (!copy) return;
      safetyHost.append(h('div', { class: 'danger-zone' }, h('div', {}, h('strong', { text: 'Safety copy from before the last upgrade' }), h('span', { class: 'muted small block', text: `Saved ${String(copy.savedAt).slice(0, 10)}. Your data was upgraded to a newer format; this is the original, untouched.` })), button({ label: 'Download', icon: 'download', variant: 'secondary', key: 'safety-copy', onClick: () => downloadSafetyCopy(copy) })));
    }).catch(() => {});
    return h(
      'div',
      { class: 'settings-stack' },
      h(
        'section',
        { class: 'card settings-card' },
        h('h2', { class: 'card-title', text: 'Backup & restore' }),
        h('p', { class: 'muted', text: STORAGE_NOTE }),
        h('div', { class: 'btn-row' }, button({ label: 'Export backup (JSON)', icon: 'download', variant: 'primary', onClick: () => downloadBackup(store), key: 'export' }), button({ label: 'Import backup', icon: 'upload', variant: 'secondary', onClick: () => fileInput.click(), key: 'import' }), button({ label: 'Export all trips as text', icon: 'file', variant: 'secondary', onClick: () => downloadAllText(store), key: 'export-text' }), fileInput),
        h('p', { class: 'muted small', text: 'Imports are checked before anything changes. You choose to merge with, or replace, your current trips.' }),
      ),
      h(
        'section',
        { class: 'card settings-card' },
        h('h2', { class: 'card-title', text: 'Storage' }),
        storageInfo,
        persistInfo,
        navigator.storage?.persist ? button({ label: 'Ask the browser to protect my data', icon: 'lock', variant: 'secondary', key: 'persist', onClick: async () => { const ok = await navigator.storage.persist(); persistInfo.textContent = ok ? 'Protected: the browser will not clear this data automatically.' : 'The browser declined. Regular backups are the safest option.'; toast(ok ? 'Storage is now protected.' : 'The browser declined to protect storage.', { tone: ok ? 'success' : 'info' }); } }) : null,
        safetyHost,
      ),
      h(
        'section',
        { class: 'card settings-card' },
        h('h2', { class: 'card-title', text: 'Sample & reset' }),
        h('div', { class: 'danger-zone sample-zone' }, h('div', {}, h('strong', { text: 'Sample data' }), h('span', { class: 'muted small block', text: 'Add a demo trip to explore PackWise. Remove it any time; your own trips are never touched.' })), h('div', { class: 'btn-row' }, button({ label: 'Add sample trip', icon: 'plus', variant: 'secondary', key: 'demo-add', onClick: () => { store.loadDemo(); toast('Sample trip added.', { tone: 'success' }); } }), button({ label: 'Remove sample data', variant: 'ghost', key: 'demo-remove', onClick: () => { const n = store.removeDemo(); toast(n ? 'Sample data removed.' : 'No sample data to remove.'); } }))),
        h('div', { class: 'danger-zone' }, h('div', {}, h('strong', { text: 'Clear all data' }), h('span', { class: 'muted small block', text: 'Permanently deletes every trip, list and task on this device.' })), button({ label: 'Clear data…', icon: 'trash', variant: 'danger-ghost', key: 'clear', onClick: async () => { const ok = await confirmDialog({ title: 'Delete everything?', message: 'All trips, packing lists and tasks on this device will be permanently deleted. Export a backup first if you might need them.', confirmLabel: 'Delete everything', danger: true }); if (ok) { await store.clearAll(); toast('All data cleared.'); } } })),
      ),
    );
  }

  // ----------------------------------------------------------------- Preferences
  function preferences() {
    const prefs = getPrefs();
    const name = h('input', { type: 'text', maxlength: 40, value: prefs.name, placeholder: 'Traveler', autocomplete: 'given-name', onChange: (e) => { setPrefs({ name: e.target.value }); toast('Saved', { timeout: 1500 }); } });
    const supported = hapticsSupported();
    return h(
      'div',
      { class: 'settings-stack' },
      h(
        'section',
        { class: 'card settings-card' },
        h('h2', { class: 'card-title', text: 'Personal' }),
        field({ label: 'Your name (shown in the greeting)', input: name }),
        h('label', { class: 'switch-row' }, h('input', { type: 'checkbox', class: 'check', name: 'companion', checked: prefs.companion, onChange: (e) => setPrefs({ companion: e.target.checked }) }), h('span', {}, h('strong', { text: 'Travel companion' }), h('span', { class: 'muted small', text: 'Mascot tips and reactions. Turn off to hide them everywhere.' }))),
        h('div', { class: 'row-between' }, h('span', {}, h('strong', { text: 'Dismissed tips' }), h('span', { class: 'muted small block', text: `${prefs.dismissed.length} hidden` })), button({ label: 'Show them again', variant: 'ghost', key: 'reset-tips', onClick: () => { setPrefs({ dismissed: [] }); toast('Tips will show again.'); ctx.refresh(); } })),
      ),
      h(
        'section',
        { class: 'card settings-card' },
        h('h2', { class: 'card-title', text: 'Haptic feedback' }),
        h('label', { class: 'switch-row' }, h('input', { type: 'checkbox', class: 'check', name: 'haptics', checked: prefs.haptics && supported, disabled: !supported, onChange: (e) => { setPrefs({ haptics: e.target.checked }); if (e.target.checked) buzz('tick'); } }), h('span', {}, h('strong', { text: 'Vibrate when packing' }), h('span', { class: 'muted small', text: supported ? 'A light tap when you pack an item and a pattern when a trip is fully packed.' : 'Not supported by this browser or device. Nothing in PackWise depends on it.' }))),
      ),
    );
  }

  // ----------------------------------------------------------------------- About
  /** A settings row: text on the left, control on the right (stacks on narrow screens). */
  const row = ({ title, desc, control }) => h('div', { class: 'srow' }, h('div', { class: 'srow-text' }, h('strong', { text: title }), desc ? h('span', { class: 'muted small', text: desc }) : null), control ? h('div', { class: 'srow-control' }, control) : null);
  const fact = (ic, title, text) => h('li', { class: 'fact' }, h('span', { class: 'fact-icon' }, icon(ic, { size: 18 })), h('div', {}, h('strong', { text: title }), h('span', { class: 'muted', text })));

  function about() {
    const installHost = h('div', { class: 'install-box' });
    const paintInstall = () => {
      const a = app.installAdvice();
      installHost.replaceChildren(...[h('div', { class: 'install-text' }, h('strong', { text: a.title }), h('span', { class: 'muted small', text: a.text })), a.kind === 'prompt' ? button({ label: 'Install app', icon: 'download', variant: 'primary', key: 'install', onClick: async () => { const r = await app.install(); toast(r === 'accepted' ? 'Installing…' : 'Install cancelled.'); } }) : null].filter(Boolean)); // replaceChildren would stringify null
    };
    paintInstall();
    unsubInstall?.();
    unsubInstall = app.onInstallChange(() => { if (tab === 'about') paintInstall(); });
    const cacheStatus = h('p', { class: 'muted small srow-status', 'aria-live': 'polite', text: app.swSupported ? 'Offline files have not been checked yet.' : 'Offline files are only available on a secure (https) address.' });
    const repairBtn = button({ label: 'Repair', icon: 'refresh', variant: 'secondary', key: 'repair-cache', ariaLabel: 'Repair offline files', onClick: async () => { cacheStatus.textContent = 'Repairing…'; const r = await app.repairCache(); cacheStatus.textContent = r.ok ? `Offline files repaired and verified (${r.total} files).` : `Repair did not finish${r.missing?.length ? `: ${r.missing.length} file(s) missing` : ''}. Check your connection and try again.`; } });
    const checkBtn = button({ label: 'Check', icon: 'check', variant: 'secondary', key: 'verify-cache', ariaLabel: 'Check offline files', onClick: async () => { cacheStatus.textContent = 'Checking…'; const r = await app.verifyCache(); cacheStatus.textContent = r.ok ? (r.missing.length ? `${r.missing.length} of ${r.total} offline files are missing. Use “Repair offline files”.` : `All ${r.total} offline files are in place. PackWise will open without a connection.`) : 'Could not check yet. Reload once and try again.'; } });
    const updateBtn = button({ label: 'Check now', icon: 'refresh', variant: 'secondary', onClick: async () => { const r = await app.checkForUpdate(); toast(r === 'update' ? 'Update found — see the prompt to reload.' : r === 'none' ? 'You have the latest version.' : 'Could not check for updates right now.'); } });
    return h(
      'div',
      { class: 'settings-stack' },
      h('section', { class: 'card settings-card about-hero' }, h('span', { class: 'about-logo' }, logoMark({ size: 44 })), h('div', {}, h('h2', { class: 'card-title', text: 'PackWise' }), h('p', { class: 'muted', text: 'Smart Packing Companion' })), h('div', { class: 'about-badges' }, h('span', { class: 'badge', text: `v${APP_VERSION}` }), h('span', { class: `badge${app.storageKind === 'indexeddb' ? '' : ' badge-warn'}`, text: app.storageKind === 'indexeddb' ? 'Stored on this device' : 'Temporary memory only' }))),
      h('section', { class: 'card settings-card' }, h('h2', { class: 'card-title', text: 'Install' }), installHost),
      h('section', { class: 'card settings-card' }, h('h2', { class: 'card-title', text: 'Offline & updates' }), row({ title: 'Offline files', desc: 'Make sure PackWise opens without a connection.', control: app.swSupported ? h('div', { class: 'btn-row' }, checkBtn, repairBtn) : null }), cacheStatus, app.swSupported ? row({ title: 'App updates', desc: 'PackWise checks for a new version when you open it. You choose when to reload.', control: updateBtn }) : null),
      h('section', { class: 'card settings-card' }, h('h2', { class: 'card-title', text: 'Privacy' }), h('ul', { class: 'fact-list' }, fact('lock', 'No accounts or tracking', 'No analytics, no cookies. Your trips are never sent anywhere.'), fact('wifi', 'Offline by design', 'The only network use is loading PackWise itself. Countdowns use your device clock; there are no background notifications.'), fact('info', 'Stored in this browser', 'Clearing site data removes your trips, so export backups.'))),
      h('section', { class: 'card settings-card' }, h('h2', { class: 'card-title', text: 'Good to know' }), h('ul', { class: 'fact-list' }, fact('sparkle', 'Suggestions, not advice', 'Starter lists follow trip type, length, season and weather you choose. They are not a forecast or airline, safety or customs advice.'), fact('calendar', 'Balkan seasons', 'Spring Mar–May · summer Jun–Aug · fall Sep–Nov · winter Dec–Feb.'), fact('luggage', 'The studio is an illustration', 'A full suitcase picture does not mean everything fits.'), fact('box', 'Nothing third-party', 'No bundled third-party code, fonts or images.'))),
    );
  }

  const builders = { appearance, data, preferences, about };

  function renderPanel(focus = false) {
    panel.id = `panel-${tab}`;
    panel.setAttribute('aria-labelledby', `tab-${tab}`);
    panel.replaceChildren(builders[tab]());
    for (const b of tablist.children) {
      const on = b.dataset.tab === tab;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    }
  }
  function select(id, focus) {
    tab = id;
    history.replaceState(null, '', `#/settings?tab=${id}`);
    renderPanel(focus);
  }
  for (const t of TABS) {
    tablist.append(h('button', { type: 'button', role: 'tab', id: `tab-${t.id}`, class: 'tab', 'data-tab': t.id, 'aria-controls': `panel-${t.id}`, text: t.label, onClick: () => select(t.id, false), onKeydown: (e) => {
      const i = TABS.findIndex((x) => x.id === tab);
      const move = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (move) { e.preventDefault(); select(TABS[(i + move + TABS.length) % TABS.length].id, true); }
      if (e.key === 'Home') { e.preventDefault(); select(TABS[0].id, true); }
      if (e.key === 'End') { e.preventDefault(); select(TABS.at(-1).id, true); }
    } }));
  }

  return {
    title: 'Settings',
    static: true,
    build() {
      const root = h('div', { class: 'screen settings-screen' }, pageHeader({ title: 'Settings' }), tablist, panel);
      renderPanel(false);
      return root;
    },
    destroy() {
      unsubInstall?.();
    },
  };
}
