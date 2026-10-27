// Templates: built-in presets + the user's saved templates.
import { h } from '../dom.js';
import { icon } from '../ui/icons.js';
import { button, emptyState } from '../ui/components.js';
import { actionSheet, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { BUILTIN_TEMPLATES, builtinTemplateItems } from '../templates.js';
import { typeMeta, pageHeader } from './shared.js';
import { templateEditor } from './tripDialogs.js';
import { plural } from '../format.js';

export function TemplatesScreen(ctx) {
  const { store, navigate } = ctx;

  async function customMenu(t) {
    const choice = await actionSheet({ title: t.name, actions: [{ id: 'use', label: 'Use for a new trip', icon: 'plus' }, { id: 'edit', label: 'Edit name & quantities', icon: 'edit' }, { id: 'delete', label: 'Delete…', icon: 'trash', danger: true }] });
    if (choice === 'use') navigate(`/trips/new?template=${t.id}`);
    else if (choice === 'edit') templateEditor({ source: t, onSave: (name, items) => { store.updateTemplate(t.id, { name, items }); toast('Template updated', { tone: 'success' }); } });
    else if (choice === 'delete') {
      const ok = await confirmDialog({ title: 'Delete template?', message: `“${t.name}” will be deleted. Trips you already created from it are not affected.`, confirmLabel: 'Delete template', danger: true });
      if (ok) { store.deleteTemplate(t.id); toast('Template deleted'); }
    }
  }

  function customizeBuiltin(b) {
    const items = builtinTemplateItems(b.id);
    templateEditor({ title: `Customize “${b.name}”`, saveLabel: 'Save as my template', source: { name: `${b.name} (mine)`, items }, onSave: (name, list) => { store.addTemplate({ name, type: b.type, items: list }); toast('Saved to My templates', { tone: 'success' }); } });
  }

  return {
    title: 'Templates',
    build() {
      const mine = store.state.templates;
      const card = (t, { builtin }) => h(
        'article',
        { class: 'card tpl-card' },
        h('span', { class: 'tpl-icon' }, icon(typeMeta(t.type).icon, { size: 22 })),
        h('div', { class: 'tpl-info' }, h('h3', { text: t.name }), h('p', { class: 'muted small', text: builtin ? t.blurb : plural(t.items.length, 'item') })),
        h('div', { class: 'tpl-actions' }, button({ label: 'Use', variant: 'primary', href: `#/trips/new?template=${t.id}`, className: 'btn-sm' }), builtin ? button({ label: 'Customize', variant: 'ghost', className: 'btn-sm', onClick: () => customizeBuiltin(t), ariaLabel: `Customize ${t.name}` }) : h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Actions for ${t.name}`, onClick: () => customMenu(t) }, icon('dots'))),
      );
      return h(
        'div',
        { class: 'screen templates-screen' },
        pageHeader({ title: 'Templates', subtitle: 'Reusable starting points for new trips', back: { href: '#/trips', label: 'Back to trips' } }),
        h('section', { class: 'tpl-section' }, h('h2', { class: 'section-title', text: 'My templates' }), mine.length ? h('div', { class: 'tpl-grid' }, mine.map((t) => card(t, { builtin: false }))) : emptyState({ title: 'No saved templates yet', text: 'Open any packing list, choose ⋯ → “Save as template”, or customize a built-in one below.', showCompanion: false })),
        h('section', { class: 'tpl-section' }, h('h2', { class: 'section-title', text: 'Built-in' }), h('div', { class: 'tpl-grid' }, BUILTIN_TEMPLATES.map((t) => card(t, { builtin: true })))),
      );
    },
  };
}
