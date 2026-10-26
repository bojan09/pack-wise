// Original, locally generated illustrations (no external assets).
import { svg as s, domId } from '../dom.js';

const grad = (id, stops, { x2 = 0, y2 = 1 } = {}) =>
  s(
    'linearGradient',
    { id, x1: 0, y1: 0, x2, y2 },
    ...stops.map(([offset, color]) => s('stop', { offset, 'stop-color': color })),
  );

const g = (props, ...kids) => s('g', props, ...kids);
const rect = (x, y, w, h, fill, rx = 0, extra = {}) => s('rect', { x, y, width: w, height: h, fill, rx, ...extra });
const circle = (cx, cy, r, fill, extra = {}) => s('circle', { cx, cy, r, fill, ...extra });
const path = (d, fill, extra = {}) => s('path', { d, fill, ...extra });

function frame(w, h, label, className, ...kids) {
  return s(
    'svg',
    {
      class: className,
      viewBox: `0 0 ${w} ${h}`,
      preserveAspectRatio: 'xMidYMid slice',
      role: label ? 'img' : undefined,
      'aria-label': label || undefined,
      'aria-hidden': label ? undefined : 'true',
      focusable: 'false',
    },
    ...kids,
  );
}

// ------------------------------------------------------------------ companion
/** Friendly traveler mascot. `mood`: 'happy' | 'camera' | 'wave'. */
export function companion({ mood = 'happy', className = 'companion', label = '' } = {}) {
  const id = domId('cg');
  const body = `${id}-b`;
  return s(
    'svg',
    {
      class: className,
      viewBox: '0 0 200 220',
      role: label ? 'img' : undefined,
      'aria-label': label || undefined,
      'aria-hidden': label ? undefined : 'true',
      focusable: 'false',
    },
    s('defs', {}, grad(body, [[0, '#B6EFE5'], [1, '#52C4B4']]), grad(`${id}-h`, [[0, '#F6D08E'], [1, '#E7B66C']])),
    s('ellipse', { cx: 100, cy: 208, rx: 62, ry: 9, fill: '#123D40', opacity: 0.16 }),
    // feet
    s('ellipse', { cx: 76, cy: 197, rx: 17, ry: 10, fill: '#F28A72' }),
    s('ellipse', { cx: 124, cy: 197, rx: 17, ry: 10, fill: '#F28A72' }),
    // body
    path('M100 56c40 0 68 28 68 70 0 38-26 66-68 66s-68-28-68-66c0-42 28-70 68-70z', `url(#${body})`),
    s('ellipse', { cx: 100, cy: 150, rx: 36, ry: 30, fill: '#E3FBF6', opacity: 0.75 }),
    // arms
    mood === 'wave'
      ? s('ellipse', { cx: 168, cy: 112, rx: 11, ry: 17, fill: '#7ED6C9', transform: 'rotate(28 168 112)' })
      : s('ellipse', { cx: 166, cy: 140, rx: 11, ry: 17, fill: '#7ED6C9', transform: 'rotate(-18 166 140)' }),
    s('ellipse', { cx: 34, cy: 140, rx: 11, ry: 17, fill: '#7ED6C9', transform: 'rotate(18 34 140)' }),
    // eyes
    g(
      { class: 'companion-eyes' },
      s('ellipse', { cx: 76, cy: 112, rx: 11, ry: 14, fill: '#123D40' }),
      s('ellipse', { cx: 124, cy: 112, rx: 11, ry: 14, fill: '#123D40' }),
      circle(80, 106, 4.2, '#fff'),
      circle(128, 106, 4.2, '#fff'),
      circle(73, 117, 2, '#fff', { opacity: 0.8 }),
      circle(121, 117, 2, '#fff', { opacity: 0.8 }),
    ),
    s('ellipse', { cx: 56, cy: 134, rx: 9, ry: 6, fill: '#F28A72', opacity: 0.55 }),
    s('ellipse', { cx: 144, cy: 134, rx: 9, ry: 6, fill: '#F28A72', opacity: 0.55 }),
    path('M88 136q12 12 24 0', 'none', { stroke: '#123D40', 'stroke-width': 3.4, 'stroke-linecap': 'round' }),
    // sun hat
    s('ellipse', { cx: 100, cy: 70, rx: 66, ry: 17, fill: `url(#${id}-h)` }),
    path('M62 68c0-30 18-48 38-48s38 18 38 48c-22 10-54 10-76 0z', `url(#${id}-h)`),
    path('M62 62c24 9 52 9 76 0l1 9c-24 10-54 10-78 0z', '#2FA597'),
    s('ellipse', { cx: 100, cy: 70, rx: 66, ry: 17, fill: 'none', stroke: '#C99A4D', 'stroke-width': 1.5, opacity: 0.6 }),
    mood === 'camera'
      ? g(
          {},
          rect(80, 150, 40, 26, '#123D40', 6),
          rect(86, 146, 14, 6, '#123D40', 2),
          circle(100, 163, 9, '#7ED6C9'),
          circle(100, 163, 5, '#123D40'),
        )
      : null,
  );
}

// ------------------------------------------------------------------- suitcase
export function suitcase({ className = 'suitcase-art' } = {}) {
  const id = domId('sc');
  return s(
    'svg',
    { class: className, viewBox: '0 0 160 200', 'aria-hidden': 'true', focusable: 'false' },
    s('defs', {}, grad(id, [[0, '#2FB8A8'], [1, '#157A74']], { x2: 1, y2: 0.2 })),
    s('ellipse', { cx: 80, cy: 192, rx: 54, ry: 7, fill: '#123D40', opacity: 0.2 }),
    path('M60 46V26a8 8 0 0 1 8-8h24a8 8 0 0 1 8 8v20', 'none', { stroke: '#0F4F52', 'stroke-width': 7, 'stroke-linecap': 'round' }),
    rect(22, 44, 116, 134, `url(#${id})`, 20),
    rect(22, 44, 116, 134, 'none', 20, { stroke: '#0F5F5E', 'stroke-width': 3 }),
    rect(46, 52, 10, 118, '#0F5F5E', 4, { opacity: 0.45 }),
    rect(104, 52, 10, 118, '#0F5F5E', 4, { opacity: 0.45 }),
    rect(22, 100, 116, 12, '#E7B66C', 0, { opacity: 0.9 }),
    circle(112, 76, 13, '#F28A72'),
    path('M106 76l4 4 8-9', 'none', { stroke: '#fff', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    circle(48, 186, 7, '#123D40'),
    circle(112, 186, 7, '#123D40'),
  );
}

// ----------------------------------------------------------------------- logo
export function logoMark({ size = 40 } = {}) {
  const id = domId('lm');
  return s(
    'svg',
    { class: 'logo-mark', width: size, height: size, viewBox: '0 0 64 64', 'aria-hidden': 'true', focusable: 'false' },
    s('defs', {}, grad(id, [[0, '#3CC6B5'], [1, '#157A74']], { x2: 1, y2: 1 })),
    rect(4, 4, 56, 56, `url(#${id})`, 16),
    path('M16 40c8-2 14-8 18-18l12-6-4 12-10 6-4 12-4-3 1-8-7 3z', '#fff'),
    path('M14 48c8 3 20 3 30-2', 'none', { stroke: '#F8F5EF', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-dasharray': '1 6' }),
  );
}

// ------------------------------------------------------------ destination art
const SCENES = {
  beach(id) {
    return [
      s('defs', {}, grad(`${id}a`, [[0, '#FFD7A0'], [0.55, '#FFB98F'], [1, '#8ED8E0']]), grad(`${id}b`, [[0, '#46C3CC'], [1, '#1F8EA6']])),
      rect(0, 0, 400, 240, `url(#${id}a)`),
      circle(300, 92, 34, '#FFF1C9', { opacity: 0.95 }),
      circle(300, 92, 52, '#FFF1C9', { opacity: 0.25 }),
      rect(0, 130, 400, 70, `url(#${id}b)`),
      path('M0 150q50-10 100 0t100 0t100 0t100 0v8H0z', '#7ADBDF', { opacity: 0.5 }),
      path('M0 196q60-16 130-4t140-6q60-8 130 8v46H0z', '#F3D9A3'),
      path('M0 214q80-10 160 0t240-6v32H0z', '#E8C27F', { opacity: 0.7 }),
      path('M74 214c4-40 10-72 22-104', 'none', { stroke: '#8A5A2B', 'stroke-width': 7, 'stroke-linecap': 'round' }),
      path('M96 110c-18-24-44-22-58-8 20-6 40-2 58 8zM96 110c10-26 34-34 52-26-22 0-40 10-52 26zM96 110c-4-22-24-38-46-34 22 2 36 14 46 34zM96 110c20-14 40-12 56 4-20-6-38-6-56-4z', '#2E9E6B'),
      s('ellipse', { cx: 300, cy: 212, rx: 28, ry: 5, fill: '#B98A3E', opacity: 0.35 }),
      path('M300 212V160', 'none', { stroke: '#8A5A2B', 'stroke-width': 4, 'stroke-linecap': 'round' }),
      path('M270 160a30 24 0 0 1 60 0z', '#F28A72'),
      path('M270 160a30 24 0 0 1 20-22l-4 22zM300 160l4-24a30 24 0 0 1 22 14l-4 10z', '#fff', { opacity: 0.85 }),
    ];
  },
  city(id) {
    const win = (x, y, w, rows) =>
      Array.from({ length: rows }, (_, r) => rect(x + 6, y + 10 + r * 14, w - 12, 5, '#FFE9B8', 1, { opacity: 0.8 }));
    return [
      s('defs', {}, grad(`${id}a`, [[0, '#F9C7A6'], [0.6, '#F2DCC6'], [1, '#A9D3E8']])),
      rect(0, 0, 400, 240, `url(#${id}a)`),
      circle(70, 70, 26, '#FFF4D6', { opacity: 0.9 }),
      path('M0 170h400v70H0z', '#2F5C63'),
      rect(20, 100, 48, 80, '#3F7580', 3),
      ...win(20, 100, 48, 4),
      rect(78, 70, 42, 110, '#2F6068', 3),
      ...win(78, 70, 42, 6),
      // dome landmark
      rect(140, 112, 96, 68, '#E9B98E', 2),
      path('M152 112a36 36 0 0 1 72 0z', '#D9805F'),
      rect(184, 70, 8, 22, '#C96D4F'),
      circle(188, 66, 6, '#F28A72'),
      ...[152, 172, 192, 212].map((x) => path(`M${x} 180v-34a8 8 0 0 1 16 0v34z`, '#C48A62')),
      rect(250, 90, 52, 90, '#3F7580', 3),
      ...win(250, 90, 52, 5),
      rect(312, 120, 40, 60, '#2F6068', 3),
      ...win(312, 120, 40, 3),
      rect(360, 98, 40, 82, '#3A6E78', 3),
      ...win(360, 98, 40, 4),
      rect(0, 178, 400, 8, '#244A50'),
    ];
  },
  business(id) {
    const tower = (x, y, w, c1, c2) => [
      rect(x, y, w, 190 - y, c1, 3),
      ...Array.from({ length: Math.floor((190 - y) / 16) }, (_, i) => rect(x + 5, y + 8 + i * 16, w - 10, 6, c2, 1, { opacity: 0.55 })),
    ];
    return [
      s('defs', {}, grad(`${id}a`, [[0, '#BFD9EA'], [1, '#EEF4F8']])),
      rect(0, 0, 400, 240, `url(#${id}a)`),
      circle(320, 52, 18, '#FFF', { opacity: 0.8 }),
      ...tower(40, 70, 56, '#5E8FB0', '#DDEFFC'),
      ...tower(108, 36, 64, '#3E7396', '#CFE6F7'),
      ...tower(184, 88, 50, '#79A6C2', '#E7F3FB'),
      ...tower(246, 52, 60, '#4A819F', '#D4EAF8'),
      ...tower(318, 100, 52, '#6C9BB9', '#E3F1FA'),
      rect(0, 188, 400, 52, '#27495A'),
      rect(0, 206, 400, 4, '#F2C879', 0, { opacity: 0.8 }),
    ];
  },
  camping(id) {
    const pine = (x, y, sc) =>
      g({ transform: `translate(${x} ${y}) scale(${sc})` }, path('M0 0l16 34H-16zM0 18l20 40H-20zM0 40l24 46H-24z', '#1E6B55'), rect(-3, 84, 6, 12, '#5B3A29'));
    return [
      s('defs', {}, grad(`${id}a`, [[0, '#1E3A5A'], [0.6, '#7C6A8F'], [1, '#F4A77E']])),
      rect(0, 0, 400, 240, `url(#${id}a)`),
      ...[[40, 30], [110, 56], [200, 24], [270, 48], [340, 28], [370, 70]].map(([x, y]) => circle(x, y, 1.8, '#fff', { opacity: 0.85 })),
      circle(310, 100, 22, '#FFE7B0', { opacity: 0.9 }),
      path('M0 170l70-84 60 70 60-92 70 96 60-60 80 80v60H0z', '#2E5C70'),
      path('M0 190l90-60 70 54 70-50 80 56 90-40v90H0z', '#1D4A55'),
      path('M0 206q120-18 400 0v34H0z', '#173B43'),
      pine(60, 130, 0.9),
      pine(104, 146, 0.65),
      pine(350, 124, 1),
      path('M170 214l40-70 40 70z', '#F28A72'),
      path('M210 144l40 70h-40z', '#D96E57'),
      path('M196 214l14-24 14 24z', '#7A2F27'),
      circle(278, 206, 6, '#FFC36B'),
      path('M278 200c-5-8 3-12 0-18 8 4 10 12 0 18z', '#FF9D4D'),
    ];
  },
  winter(id) {
    const pine = (x, y, sc) =>
      g({ transform: `translate(${x} ${y}) scale(${sc})` }, path('M0 0l16 34H-16zM0 18l20 40H-20zM0 40l24 46H-24z', '#2C6A62'), path('M0 0l7 15h-14zM0 18l9 18h-18zM0 40l11 21h-22z', '#fff', { opacity: 0.9 }), rect(-3, 84, 6, 10, '#5B3A29'));
    return [
      s('defs', {}, grad(`${id}a`, [[0, '#BBD7EE'], [1, '#EEF6FB']])),
      rect(0, 0, 400, 240, `url(#${id}a)`),
      circle(320, 60, 22, '#fff', { opacity: 0.8 }),
      path('M0 160l80-90 50 50 70-100 90 120 50-40 60 60v80H0z', '#9DBBD6'),
      path('M80 70l22 24-14-4-12 12-10-14zM200 20l36 48-22-8-14 18-14-18z', '#fff'),
      path('M0 190q100-30 200-10t200-14v74H0z', '#F4F9FD'),
      path('M0 214q120-20 400-4v30H0z', '#DDEAF4'),
      pine(60, 130, 0.75),
      pine(310, 120, 0.9),
      pine(350, 140, 0.6),
      ...[[30, 40], [90, 90], [150, 30], [230, 70], [260, 30], [350, 100], [380, 40], [190, 120]].map(([x, y]) => circle(x, y, 2.4, '#fff')),
    ];
  },
  weekend(id) {
    return [
      s('defs', {}, grad(`${id}a`, [[0, '#FFE2B8'], [0.6, '#E8F1D9'], [1, '#BFE6E0']])),
      rect(0, 0, 400, 240, `url(#${id}a)`),
      circle(88, 82, 30, '#FFF0C6'),
      path('M0 170q90-50 190-14t210-22v106H0z', '#8CCB9A'),
      path('M0 200q120-40 240-8t160-12v60H0z', '#5FAE84'),
      path('M0 224q150-24 400-6v22H0z', '#3E8C6C'),
      // hot-air balloon
      s('ellipse', { cx: 290, cy: 86, rx: 34, ry: 40, fill: '#F28A72' }),
      path('M256 86q34 -14 68 0', 'none', { stroke: '#fff', 'stroke-width': 5, opacity: 0.8 }),
      path('M268 118l8 24h28l8-24', 'none', { stroke: '#8A5A2B', 'stroke-width': 2 }),
      rect(276, 142, 28, 16, '#C28A4B', 3),
    ];
  },
  custom(id) {
    return [
      s('defs', {}, grad(`${id}a`, [[0, '#8ADBD0'], [1, '#2C9C90']], { x2: 1, y2: 1 })),
      rect(0, 0, 400, 240, `url(#${id}a)`),
      path('M0 190q100-40 200-10t200-30v120H0z', '#1B7F79', { opacity: 0.55 }),
      ...[[60, 60, 40], [150, 40, 28], [300, 80, 48], [350, 34, 22]].map(([x, y, r]) => s('ellipse', { cx: x, cy: y, rx: r, ry: r * 0.45, fill: '#fff', opacity: 0.55 })),
      path('M70 190C150 190 200 120 330 70', 'none', { stroke: '#fff', 'stroke-width': 3, 'stroke-dasharray': '2 9', 'stroke-linecap': 'round' }),
      g({ transform: 'translate(322 54) rotate(-20)' }, path('M0 8l30-4-26 16 2 12-8-9-9 3z', '#fff')),
    ];
  },
};

export function destinationArt(type = 'custom', { className = 'dest-art', label = '' } = {}) {
  const id = domId('da');
  const make = SCENES[type] || SCENES.custom;
  return frame(400, 240, label, className, ...make(id));
}
