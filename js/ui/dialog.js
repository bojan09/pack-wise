// Modal dialogs on top of the native <dialog> element: built-in focus trap, Escape to close
// and focus restoration to the opener. Content is always built with the safe DOM helpers.
import { h, domId } from '../dom.js';
import { button, iconButton } from './components.js';
import { icon as iconEl } from './icons.js';

/**
 * @param {{title: string, build: (close: (value?: any) => void, titleId: string) => Node, wide?: boolean, sheet?: boolean}} opts
 * @returns {Promise<any>} resolves with the value passed to close(), or undefined if dismissed
 */
export function showDialog({ title, build, wide = false, sheet = false }) {
  return new Promise((resolve) => {
    const titleId = domId('dlg');
    const dlg = h('dialog', { class: `dialog${wide ? ' dialog-wide' : ''}${sheet ? ' dialog-sheet' : ''}`, 'aria-labelledby': titleId });
    let result;
    const close = (value) => {
      result = value;
      dlg.close();
    };
    dlg.append(
      h('div', { class: 'dialog-head' }, h('h2', { id: titleId, text: title }), iconButton({ icon: 'x', label: 'Close dialog', onClick: () => close() })),
      h('div', { class: 'dialog-body' }, build(close, titleId)),
    );
    dlg.addEventListener('close', () => {
      dlg.remove();
      resolve(result);
    });
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) close(); // click on the backdrop
    });
    document.body.append(dlg);
    dlg.showModal();
    const autofocus = dlg.querySelector('[data-autofocus]');
    (autofocus || dlg.querySelector('input, select, textarea, .dialog-body button'))?.focus();
  });
}

export async function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, cancelLabel = 'Cancel' }) {
  const ok = await showDialog({
    title,
    build: (close) =>
      h(
        'div',
        { class: 'dialog-stack' },
        h('p', { text: message }),
        h('div', { class: 'dialog-actions' }, button({ label: cancelLabel, variant: 'ghost', onClick: () => close(false), key: 'dlg-cancel' }), button({ label: confirmLabel, variant: danger ? 'danger' : 'primary', onClick: () => close(true), key: 'dlg-confirm' })),
      ),
  });
  return ok === true;
}

/** Bottom-sheet style list of actions. Resolves with the chosen action's id. */
export function actionSheet({ title, actions }) {
  return showDialog({
    title,
    sheet: true,
    build: (close) =>
      h(
        'ul',
        { class: 'sheet-list' },
        actions.map((a) =>
          h('li', {}, h('button', { type: 'button', class: `sheet-item${a.danger ? ' is-danger' : ''}`, onClick: () => close(a.id) }, a.icon ? iconEl(a.icon) : null, h('span', { text: a.label }))),
        ),
      ),
  });
}
