// Browser-side backup flows: download an export, preview + confirm an import.
import { h } from './dom.js';
import { parseBackup, MAX_BACKUP_BYTES } from './validate.js';
import { button } from './ui/components.js';
import { showDialog, confirmDialog } from './ui/dialog.js';
import { toast } from './ui/toast.js';
import { plural } from './format.js';

export function exportFilename(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `packwise-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export function downloadBackup(store) {
  const json = JSON.stringify(store.exportData(), null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = h('a', { href: url, download: exportFilename() });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('Backup downloaded. Keep the file somewhere safe.', { tone: 'success' });
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
