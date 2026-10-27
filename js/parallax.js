// Smooth parallax for decorative layers. Elements opt in with data-parallax="<rate>":
//  - default: the layer drifts against its container as the container crosses the viewport
//  - data-parallax-mode="scroll": the layer is offset by the page scroll (e.g. the fixed background)
// Only transforms change (GPU friendly), positions ease toward their target every frame, and
// everything is off under reduced motion. Content that carries meaning is never parallaxed.
import { effectiveMotion, onPrefsChange } from './prefs.js';

const layers = new Set();
let raf = 0;

const clamp = (v, max) => Math.max(-max, Math.min(max, v));

function frame() {
  raf = 0;
  const level = effectiveMotion();
  const gain = level === 'reduced' ? 0 : level === 'enhanced' ? 1.6 : 1;
  const vh = window.innerHeight;
  let moving = false;
  for (const el of layers) {
    if (!el.isConnected) {
      layers.delete(el);
      continue;
    }
    const rate = parseFloat(el.dataset.parallax) * gain;
    const max = parseFloat(el.dataset.parallaxMax || '36');
    let target = 0;
    if (gain > 0) {
      if (el.dataset.parallaxMode === 'scroll') {
        target = clamp(-window.scrollY * rate, max);
      } else {
        const box = (el.parentElement || el).getBoundingClientRect();
        if (box.bottom < -120 || box.top > vh + 120) continue; // off screen: leave it where it is
        target = clamp(-(box.top + box.height / 2 - vh / 2) * rate, max);
      }
    }
    if (el._py === undefined || gain === 0) el._py = target; // first sight / reduced: no easing
    else {
      const diff = target - el._py;
      el._py += diff * 0.16;
      if (Math.abs(diff) > 0.15) moving = true;
      else el._py = target;
    }
    el.style.transform = gain === 0 ? '' : `translate3d(0, ${el._py.toFixed(2)}px, 0)`;
  }
  if (moving) raf = requestAnimationFrame(frame);
}

const schedule = () => {
  if (!raf) raf = requestAnimationFrame(frame);
};

export function refreshParallax() {
  layers.clear();
  document.querySelectorAll('[data-parallax]').forEach((el) => layers.add(el));
  schedule();
}

/** @param {HTMLElement} root element whose subtree is rebuilt by the router */
export function initParallax(root) {
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      refreshParallax();
    });
  }).observe(root, { childList: true, subtree: true });
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  onPrefsChange(() => {
    layers.forEach((el) => { el._py = undefined; });
    schedule();
  });
  refreshParallax();
}
