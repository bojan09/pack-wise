// Safe DOM helpers. User content only ever reaches the DOM via textContent / text nodes /
// setAttribute — the app never parses strings as markup.

const SVG_NS = 'http://www.w3.org/2000/svg';
const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'indeterminate', 'open']);
const URL_ATTRS = new Set(['href', 'src', 'action']);

function safeUrl(v) {
  const s = String(v).trim();
  return /^(#|\.{0,2}\/|[\w./-]+$|https:|blob:)/i.test(s) && !/^\s*(javascript|data|vbscript):/i.test(s);
}

function applyProps(el, props) {
  for (const [key, val] of Object.entries(props || {})) {
    if (val === undefined || val === null || val === false) continue;
    if (key === 'class') el.setAttribute('class', val);
    else if (key === 'text') el.textContent = val;
    else if (key === 'style' && typeof val === 'object') Object.assign(el.style, val);
    else if (key === 'dataset') Object.assign(el.dataset, val);
    else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2).toLowerCase(), val);
    else if (PROPS.has(key) && !(el instanceof SVGElement)) el[key] = val;
    else if (URL_ATTRS.has(key) && !safeUrl(val)) continue;
    else el.setAttribute(key, val === true ? '' : String(val));
  }
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  applyProps(el, props);
  append(el, children);
  return el;
}

export function svg(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props);
  append(el, children);
  return el;
}

let counter = 0;
export const domId = (prefix = 'pw') => `${prefix}-${++counter}`;

/**
 * Replace the children of `container` with `build()` while keeping keyboard focus:
 * elements tagged data-key are re-focused after the re-render.
 */
export function rerender(container, build) {
  const active = document.activeElement;
  const key = active && container.contains(active) ? active.dataset?.key : null;
  const selection =
    key && active && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  container.replaceChildren(build());
  if (key) {
    const next = container.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (next) {
      next.focus({ preventScroll: true });
      if (selection && 'setSelectionRange' in next) {
        try {
          next.setSelectionRange(...selection);
        } catch {
          /* not a text input */
        }
      }
    }
  }
}
