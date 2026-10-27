import { h } from '../dom.js';
import { button } from '../ui/components.js';
import { companion, destinationArt, logoMark, suitcase } from '../ui/art.js';
import { setPrefs } from '../prefs.js';

export function WelcomeScreen(ctx) {
  return {
    title: 'Welcome',
    static: true,
    build() {
      const start = () => {
        setPrefs({ onboarded: true });
        ctx.navigate(ctx.store.state.trips.length ? '/' : '/trips/new');
      };
      return h(
        'div',
        { class: 'welcome' },
        h('div', { class: 'welcome-art' }, (() => { const art = destinationArt('city', { className: 'welcome-bg' }); art.dataset.parallax = '0.18'; art.dataset.parallaxMax = '40'; return art; })(), h('div', { class: 'welcome-fade' })),
        h(
          'div',
          { class: 'welcome-body' },
          h('div', { class: 'welcome-brand' }, logoMark({ size: 44 }), h('h1', { tabindex: '-1' }, 'Pack', h('span', { text: 'Wise' }))),
          h('p', { class: 'welcome-tag', text: 'Smart Packing Companion' }),
          h('p', { class: 'welcome-hook', text: 'Good trips start with great packing!' }),
          h('div', { class: 'welcome-chars', 'aria-hidden': 'true', 'data-parallax': '-0.05', 'data-parallax-max': '16' }, suitcase({ className: 'welcome-case' }), companion({ className: 'welcome-mascot' })),
          h('div', { class: 'welcome-cta' }, button({ label: 'Get Started', icon: 'arrowR', iconAfter: true, variant: 'primary', onClick: start, className: 'btn-block btn-lg', key: 'get-started' }), h('p', { class: 'muted small center', text: 'Free · Offline · No Account' })),
        ),
      );
    },
  };
}
