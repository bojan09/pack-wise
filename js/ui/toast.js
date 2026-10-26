// Non-blocking messages announced through an aria-live region.
import { h } from '../dom.js';

let host;
const getHost = () => {
  host ||= document.getElementById('toasts');
  return host;
};

/**
 * @param {string} message
 * @param {{action?: {label: string, run: () => void}, timeout?: number, tone?: 'info'|'error'|'success'}} [opts]
 * @returns {() => void} dismiss function
 */
export function toast(message, { action, timeout = 5000, tone = 'info' } = {}) {
  const root = getHost();
  if (!root) return () => {};
  let timer;
  const el = h(
    'div',
    { class: `toast toast-${tone}` },
    h('span', { text: message }),
    action
      ? h('button', { type: 'button', class: 'toast-action', text: action.label, onClick: () => { dismiss(); action.run(); } })
      : null,
  );
  const dismiss = () => {
    clearTimeout(timer);
    el.remove();
  };
  root.append(el);
  while (root.children.length > 2) root.firstElementChild.remove(); // keep the stack short
  if (timeout > 0) timer = setTimeout(dismiss, timeout);
  return dismiss;
}
