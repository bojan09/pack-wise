// Companion speech bubble: optional, dismissible, never blocks anything.
import { h } from '../dom.js';
import { icon } from './icons.js';
import { companion } from './art.js';
import { dismissTip, getPrefs } from '../prefs.js';

/**
 * @param {{id: string, text: string, mood?: string}|null} message
 * @param {{onDismiss?: () => void, className?: string}} [opts]
 * @returns {HTMLElement|null} null when there is nothing to say or the companion is muted
 */
export function companionBubble(message, { onDismiss, className = '' } = {}) {
  if (!message || !getPrefs().companion) return null;
  return h(
    'aside',
    { class: `bubble ${className}`.trim(), 'aria-label': 'Tip from your travel companion' },
    h('p', { class: 'bubble-text', text: message.text }),
    h('button', { type: 'button', class: 'bubble-close', 'aria-label': 'Dismiss tip', onClick: () => { dismissTip(message.id); onDismiss?.(); } }, icon('x', { size: 14 })),
  );
}

export const mascot = (mood, className) => companion({ mood, className });
