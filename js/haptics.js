// Optional vibration feedback. Off by default, only where the browser supports it, never
// required for any feature, and skipped when the OS asks for reduced motion.
import { getPrefs } from './prefs.js';

export const hapticsSupported = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** @returns {boolean} true if a vibration was requested */
export function buzz(kind = 'tick') {
  if (!getPrefs().haptics || !hapticsSupported()) return false;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    return navigator.vibrate(kind === 'success' ? [18, 40, 28] : 10);
  } catch {
    return false;
  }
}
