import { h } from '../dom.js';
import { icon } from '../ui/icons.js';
import { button, segmented, field } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { ACCENTS, getPrefs, setPrefs } from '../prefs.js';
import { APP_VERSION } from '../models.js';
import { downloadBackup, importFromFile } from '../backup.js';
import { pageHeader } from './shared.js';

function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function SettingsScreen(ctx) {
  const { store, app } = ctx;
  const storageInfo = h('p', { class: 'muted small', text: 'Checking storage…' });

  (async () => {
    try {
      const [est, persisted] = await Promise.all([navigator.storage?.estimate?.(), navigator.storage?.persisted?.()]);
      storageInfo.textContent = est ? `Using ${formatBytes(est.usage)} of ${formatBytes(est.quota)} available. ${persisted ? 'Storage is marked persistent.' : 'The browser may clear this data if the device runs low on space.'}` : 'Storage details are not available in this browser.';
    } catch {
      storageInfo.textContent = 'Storage details are not available in this browser.';
    }
  })();

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', tabindex: '-1', 'aria-label': 'Choose a PackWise backup file', onChange: async (e) => { const f = e.target.files?.[0]; e.target.value = ''; await importFromFile(store, f); } });

  return {
    title: 'Settings',
    static: true,
    build() {
      const prefs = getPrefs();
      const name = h('input', { type: 'text', maxlength: 40, value: prefs.name, placeholder: 'Traveler', autocomplete: 'given-name', onChange: (e) => { setPrefs({ name: e.target.value }); toast('Saved', { timeout: 1500 }); } });

      const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Accent color' }, ACCENTS.map((a) => h('label', { class: 'swatch', title: a.label }, h('input', { type: 'radio', name: 'accent', value: a.id, checked: a.id === prefs.accent, 'aria-label': a.label, onChange: () => setPrefs({ accent: a.id }) }), h('span', { style: { background: a.accent } }, icon('check', { size: 16 })))));

      const updateRow = h('div', { class: 'row-between' }, h('span', {}, h('strong', { text: 'App updates' }), h('span', { class: 'muted small block', text: app.swSupported ? 'PackWise updates itself when a new version is available.' : 'Offline support needs a secure (https) connection.' })), app.swSupported ? button({ label: 'Check now', icon: 'refresh', variant: 'secondary', onClick: async () => { const r = await app.checkForUpdate(); toast(r === 'update' ? 'Update found — see the prompt to reload.' : r === 'none' ? 'You have the latest version.' : 'Could not check for updates right now.'); } }) : null);

      return h(
        'div',
        { class: 'screen settings-screen' },
        pageHeader({ title: 'Settings' }),
        h(
          'div',
          { class: 'settings-grid' },
          h(
            'section',
            { class: 'card settings-card' },
            h('h2', { class: 'card-title', text: 'Appearance' }),
            h('div', { class: 'setting' }, h('span', { class: 'setting-label', id: 'lbl-theme', text: 'Theme' }), segmented({ name: 'theme', label: 'Theme', value: prefs.theme, options: [{ id: 'light', label: 'Light', icon: 'sun' }, { id: 'dark', label: 'Dark', icon: 'moon' }, { id: 'system', label: 'System', icon: 'monitor' }], onChange: (v) => setPrefs({ theme: v }) })),
            h('div', { class: 'setting' }, h('span', { class: 'setting-label', text: 'Accent color' }), swatches),
            field({ label: 'Your name (shown in the greeting)', input: name }),
          ),
          h(
            'section',
            { class: 'card settings-card' },
            h('h2', { class: 'card-title', text: 'Your data' }),
            h('p', { class: 'muted', text: 'Everything lives in this browser on this device. A backup file is the only reliable way to move it or protect against the browser clearing it.' }),
            h('div', { class: 'btn-row' }, button({ label: 'Export backup', icon: 'download', variant: 'primary', onClick: () => downloadBackup(store), key: 'export' }), button({ label: 'Import backup', icon: 'upload', variant: 'secondary', onClick: () => fileInput.click(), key: 'import' }), fileInput),
            storageInfo,
            h('div', { class: 'danger-zone' }, h('div', {}, h('strong', { text: 'Clear all data' }), h('span', { class: 'muted small block', text: 'Permanently deletes every trip, list and task on this device.' })), button({ label: 'Clear data…', icon: 'trash', variant: 'danger-ghost', key: 'clear', onClick: async () => { const ok = await confirmDialog({ title: 'Delete everything?', message: 'All trips, packing lists and tasks on this device will be permanently deleted. Export a backup first if you might need them.', confirmLabel: 'Delete everything', danger: true }); if (ok) { await store.clearAll(); toast('All data cleared.'); } } })),
          ),
          h(
            'section',
            { class: 'card settings-card' },
            h('h2', { class: 'card-title', text: 'Privacy & offline' }),
            h('ul', { class: 'plain-list' }, h('li', {}, icon('lock', { size: 18 }), 'No account, no tracking, no analytics. Your trips are never sent anywhere.'), h('li', {}, icon('wifi', { size: 18 }), 'Works offline once loaded. Reminders and countdowns use your device clock; there are no background notifications.'), h('li', {}, icon('info', { size: 18 }), 'Starter lists are general suggestions, not weather, airline or safety advice.')),
            updateRow,
          ),
          h('section', { class: 'card settings-card' }, h('h2', { class: 'card-title', text: 'About' }), h('p', {}, h('strong', { text: 'PackWise' }), ` v${APP_VERSION}`), h('p', { class: 'muted small', text: `Storage: ${app.storageKind === 'indexeddb' ? 'IndexedDB (this device)' : 'Temporary memory only — changes will not survive closing the app'}` })),
        ),
      );
    },
  };
}
