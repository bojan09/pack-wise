// Browser-side backup flows: download an export, preview + confirm an import.
import { h } from './dom.js';
import { parseBackup, MAX_BACKUP_BYTES } from './validate.js';
import { button } from './ui/components.js';
import { showDialog, confirmDialog } from './ui/dialog.js';
import { toast } from './ui/toast.js';
import { plural } from './format.js';
import { textFilename, tripToText } from './export.js';

export function exportFilename(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `packwise-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export function downloadFile(filename, text, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function downloadBackup(store) {
  downloadFile(exportFilename(), JSON.stringify(store.exportData(), null, 2));
  toast('Backup downloaded. Keep the file somewhere safe.', { tone: 'success' });
}

const tripSource = (state, id) => ({
  trip: state.trips.find((t) => t.id === id),
  bags: state.bags.filter((x) => x.tripId === id),
  items: state.items.filter((x) => x.tripId === id),
  tasks: state.tasks.filter((x) => x.tripId === id),
});

export function downloadTripText(store, tripId) {
  const src = tripSource(store.state, tripId);
  if (!src.trip) return;
  downloadFile(textFilename(src.trip), tripToText(src), 'text/plain');
  toast('Text list downloaded.', { tone: 'success' });
}

export async function copyTripText(store, tripId) {
  const src = tripSource(store.state, tripId);
  if (!src.trip) return;
  try {
    await navigator.clipboard.writeText(tripToText(src));
    toast('List copied. Paste it into any app.', { tone: 'success' });
  } catch {
    toast('Copying was blocked by the browser. Use “Export as text” instead.', { tone: 'error' });
  }
}

export function downloadAllText(store) {
  const text = store.state.trips.map((t) => tripToText(tripSource(store.state, t.id))).join('\n\n----------------------------------------\n\n');
  if (!text) { toast('There are no trips to export yet.'); return; }
  downloadFile('packwise-all-trips.txt', text, 'text/plain');
  toast('All trips downloaded as text.', { tone: 'success' });
}

/** A file in backup format built from the pre-upgrade safety copy (re-imports through the normal migration path). */
export function downloadSafetyCopy(copy) {
  const file = { app: 'packwise', schemaVersion: copy.fromVersion, exportedAt: copy.savedAt, data: copy.data };
  downloadFile(`packwise-before-upgrade-${String(copy.savedAt).slice(0, 10)}.json`, JSON.stringify(file, null, 2));
}

function summary(counts) {
  return `${plural(counts.trips, 'trip')}, ${plural(counts.items, 'packing item')}, ${plural(counts.tasks, 'task')}, ${plural(counts.bags, 'bag')}`;
}

/** Validate a chosen file, preview it, ask merge/replace, then import. Never writes on failure. */
export async function importFromFile(store, file) {
  if (!file) return;
  if (file.size > MAX_BACKUP_BYTES) {
    await showError(['The file is too large to be a PackWise backup.']);
    return;
  }
  let text;
  try {
    text = await file.text();
  } catch {
    await showError(['The file could not be read.']);
    return;
  }
  const result = parseBackup(text);
  if (!result.ok) {
    await showError(result.errors);
    return;
  }
  const choice = await showDialog({
    title: 'Import backup',
    build: (close) => {
      let mode = 'merge';
      const radio = (value, title, detail, checked) =>
        h('label', { class: 'radio-card' }, h('input', { type: 'radio', name: 'mode', value, checked, onChange: () => (mode = value) }), h('span', {}, h('strong', { text: title }), h('span', { class: 'muted small', text: detail })));
      return h(
        'div',
        { class: 'dialog-stack' },
        h('p', {}, 'This file contains ', h('strong', { text: summary(result.counts) }), '.'),
        result.warnings.length ? h('ul', { class: 'warn-list' }, result.warnings.map((w) => h('li', { text: w }))) : null,
        radio('merge', 'Merge with my data', 'Adds the trips from the file. Nothing you have now is changed or overwritten.', true),
        radio('replace', 'Replace everything', 'Deletes all current trips and restores the file exactly. Export a backup first if unsure.', false),
        h('div', { class: 'dialog-actions' }, button({ label: 'Cancel', variant: 'ghost', onClick: () => close() }), button({ label: 'Import', variant: 'primary', onClick: () => close(mode), key: 'import-confirm' })),
      );
    },
  });
  if (!choice) return;
  if (choice === 'replace') {
    const ok = await confirmDialog({ title: 'Replace all data?', message: 'All trips currently on this device will be deleted and replaced by the backup. This cannot be undone.', confirmLabel: 'Replace everything', danger: true });
    if (!ok) return;
  }
  await store.importData(result.data, choice);
  toast(choice === 'replace' ? 'Backup restored.' : 'Backup merged into your trips.', { tone: 'success' });
}

function showError(errors) {
  return showDialog({
    title: 'Can’t import this file',
    build: (close) =>
      h(
        'div',
        { class: 'dialog-stack' },
        h('p', { text: 'Nothing was changed. Details:' }),
        h('ul', { class: 'warn-list' }, errors.slice(0, 8).map((e) => h('li', { text: e }))),
        h('div', { class: 'dialog-actions' }, button({ label: 'OK', variant: 'primary', onClick: () => close(), key: 'import-ok' })),
      ),
  });
}
