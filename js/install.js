// Install / platform help. Pure so it can be unit-tested without a browser.

export function detectPlatform({ userAgent = '', maxTouchPoints = 0, platform = '' } = {}) {
  const ios = /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
  const android = /Android/i.test(userAgent);
  return { ios, android };
}

/**
 * @param {{standalone: boolean, secure: boolean, hasPrompt: boolean, ios: boolean, serviceWorker: boolean}} env
 * @returns {{kind: 'installed'|'prompt'|'ios'|'manual'|'insecure'|'unsupported', title: string, text: string}}
 */
export function installAdvice({ standalone, secure, hasPrompt, ios, serviceWorker }) {
  if (standalone) return { kind: 'installed', title: 'Installed', text: 'PackWise is running as an installed app.' };
  if (!secure || !serviceWorker) {
    return { kind: secure ? 'unsupported' : 'insecure', title: 'Install not available here', text: secure ? 'This browser does not support installing web apps. PackWise still works in a normal tab.' : 'Installing and offline use need a secure (https) address. Open PackWise from its https link.' };
  }
  if (hasPrompt) return { kind: 'prompt', title: 'Install PackWise', text: 'Add PackWise to your home screen or desktop. It opens like an app and works offline.' };
  if (ios) return { kind: 'ios', title: 'Add to Home Screen', text: 'In Safari, tap the Share button, then “Add to Home Screen”. iPhone and iPad do not show an install prompt.' };
  return { kind: 'manual', title: 'Install from your browser menu', text: 'Look for “Install app” or “Add to Home screen” in your browser’s menu. Some browsers only offer it after a few visits.' };
}

/** Browsers may clear site data; say so plainly, with the one reliable remedy. */
export const STORAGE_NOTE = 'Browsers can clear site data when space runs low, and iOS Safari may clear it after weeks without use. Export a backup regularly; it is the only reliable way to keep your trips.';
