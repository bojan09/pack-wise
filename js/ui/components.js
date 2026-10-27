// Small reusable UI building blocks.
import { h, domId } from '../dom.js';
import { icon } from './icons.js';
import { companion } from './art.js';

export function button({ label, icon: ic, variant = 'secondary', onClick, type = 'button', ariaLabel, key, className = '', disabled, href, iconAfter } = {}) {
  const inner = [ic && !iconAfter ? icon(ic, { size: 16 }) : null, label ? h('span', { text: label }) : null, ic && iconAfter ? icon(ic, { size: 16 }) : null];
  const props = {
    class: `btn btn-${variant} ${className}`.trim(),
    'aria-label': ariaLabel,
    'data-key': key,
    disabled,
  };
  if (href) return h('a', { ...props, href }, inner);
  return h('button', { ...props, type, onClick }, inner);
}

export const iconButton = ({ icon: ic, label, onClick, key, className = '', href }) => {
  const props = { class: `icon-btn ${className}`.trim(), 'aria-label': label, title: label, 'data-key': key };
  return href ? h('a', { ...props, href }, icon(ic)) : h('button', { ...props, type: 'button', onClick }, icon(ic));
};

/** Accessible determinate bar. */
export function progressBar(percent, { label = 'Progress', className = '' } = {}) {
  return h(
    'div',
    { class: `bar ${className}`.trim(), role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': percent },
    h('span', { class: 'bar-fill', style: { width: `${percent}%` } }),
  );
}

/** Circular progress ring (SVG-free, conic gradient). */
export function ring(percent, { label = 'Progress', size = 92 } = {}) {
  return h(
    'div',
    { class: 'ring', role: 'img', 'aria-label': `${label}: ${percent}%`, style: { '--pct': `${percent}%`, width: `${size}px`, height: `${size}px` } },
    h('span', { class: 'ring-value', 'aria-hidden': 'true', text: `${percent}%` }),
  );
}

export function emptyState({ title, text, action, mood = 'happy', showCompanion = true }) {
  return h(
    'div',
    { class: 'empty' },
    showCompanion ? companion({ mood, className: 'empty-art' }) : null,
    h('h2', { class: 'empty-title', text: title }),
    text ? h('p', { class: 'muted', text }) : null,
    action || null,
  );
}

export function chip({ label, count, active, onClick, key, cat }) {
  return h(
    'button',
    { type: 'button', class: `chip${active ? ' is-active' : ''}`, 'aria-pressed': active ? 'true' : 'false', onClick, 'data-key': key, 'data-cat': cat },
    label,
    count !== undefined ? h('span', { class: 'chip-count', text: String(count) }) : null,
  );
}

/** Segmented single-choice control (radio semantics). */
export function segmented({ name, options, value, onChange, label }) {
  const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
  for (const opt of options) {
    const id = domId('seg');
    group.append(
      h(
        'label',
        { class: 'seg-opt', for: id },
        h('input', { type: 'radio', id, name, value: opt.id, checked: opt.id === value, onChange: () => onChange(opt.id), 'data-key': `${name}-${opt.id}` }),
        h('span', {}, opt.icon ? icon(opt.icon, { size: 18 }) : null, h('span', { text: opt.label })),
      ),
    );
  }
  return group;
}

export function stepper({ value, min = 1, max = 99, label, onChange, key }) {
  const dec = h('button', { type: 'button', class: 'step-btn', 'aria-label': `Decrease ${label}`, disabled: value <= min, 'data-key': key ? `${key}-dec` : undefined, onClick: () => onChange(value - 1) }, icon('minus', { size: 16 }));
  const inc = h('button', { type: 'button', class: 'step-btn', 'aria-label': `Increase ${label}`, disabled: value >= max, 'data-key': key ? `${key}-inc` : undefined, onClick: () => onChange(value + 1) }, icon('plus', { size: 16 }));
  return h('div', { class: 'stepper', role: 'group', 'aria-label': `${label} quantity` }, dec, h('output', { class: 'step-value', text: String(value) }), inc);
}

/** Native checkbox, styled in CSS. `state`: true | false | 'mixed'. */
export function checkbox({ state, label, onChange, key }) {
  return h('input', {
    type: 'checkbox',
    class: 'check',
    'aria-label': label,
    checked: state === true,
    indeterminate: state === 'mixed',
    'data-key': key,
    onChange,
  });
}

export function field({ label, input, hint, error, id }) {
  const fid = id || domId('f');
  input.id = fid;
  if (hint || error) input.setAttribute('aria-describedby', `${fid}-d`);
  if (error) input.setAttribute('aria-invalid', 'true');
  return h(
    'div',
    { class: `field${error ? ' has-error' : ''}` },
    h('label', { for: fid, text: label }),
    input,
    error ? h('p', { class: 'field-msg field-error', id: `${fid}-d`, role: 'alert', text: error }) : hint ? h('p', { class: 'field-msg muted', id: `${fid}-d`, text: hint }) : null,
  );
}

export function selectInput({ options, value, name, onChange }) {
  return h('select', { name, onChange }, options.map((o) => h('option', { value: o.id, selected: o.id === value, text: o.label })));
}

/**
 * Tile picker built on native radios (single choice) or checkboxes (multi), so keyboard
 * and screen-reader behavior come for free.
 */
export function tiles({ name, options, value, multi = false, onChange, label, className = '' }) {
  const selected = new Set(multi ? value : [value]);
  const group = h('div', { class: `tiles ${className}`.trim(), role: multi ? 'group' : 'radiogroup', 'aria-label': label });
  for (const opt of options) {
    const id = domId('tile');
    group.append(
      h(
        'label',
        { class: 'tile', for: id },
        h('input', {
          type: multi ? 'checkbox' : 'radio',
          id,
          name,
          value: opt.id,
          checked: selected.has(opt.id),
          'data-key': `${name}-${opt.id}`,
          onChange: (e) => {
            if (multi) {
              // read from the DOM so programmatic changes (e.g. auto-ticking a bag) are never stale
              onChange?.([...group.querySelectorAll('input:checked')].map((i) => i.value));
            } else {
              onChange?.(opt.id);
            }
          },
        }),
        h('span', { class: 'tile-face' }, h('span', { class: 'tile-icon' }, icon(opt.icon || 'box', { size: 22 })), h('span', { class: 'tile-label', text: opt.label })),
      ),
    );
  }
  return group;
}
