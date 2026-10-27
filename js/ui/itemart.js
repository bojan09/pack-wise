// Item illustrations: small flat SVG pictures, one per kind of thing you pack, so the suitcase tray,
// case and tiles show what an item actually is. Pure data + a tiny renderer built from DOM nodes (never from markup strings).
//
// Colors come from the item's category via CSS custom properties (see css/studio.css):
//   f1 = category color, f2 = darker, f3 = pale, fw = white, fk = ink, fa = amber, fr = red, fb = blue.
// Shapes: ['p', d, cls] path · ['r', x, y, w, h, rx, cls] rect · ['c', cx, cy, r, cls] circle ·
//         ['l', x1, y1, x2, y2, cls] line (stroked) · ['e', cx, cy, rx, ry, cls] ellipse.
import { svg } from '../dom.js';

const TEE = 'M15 9l-9 6 4 7 5-3v21h18V19l5 3 4-7-9-6c-1 3-4 5-9 5s-8-2-9-5z';

/** name pattern -> shapes. First match wins, so specific patterns come first. */
export const ART = [
  // ------------------------------------------------------------- clothing
  [/underwear/i, [['p', 'M7 14h34v8c0 6-5 8-10 8l-7 6-7-6c-5 0-10-2-10-8z', 'f1'], ['p', 'M7 14h34v4H7z', 'f2'], ['p', 'M20 30l4 6 4-6', 'f3']]],
  [/sleepwear|pajama/i, [['p', TEE, 'f1'], ['p', 'M24 14v26', 'f2k'], ['c', 33, 28, 4, 'fa'], ['c', 35, 27, 3.4, 'f1']]],
  [/t-?shirt|\btops?\b|lightweight breathable/i, [['p', TEE, 'f1'], ['p', 'M19 9c1 4 4 6 5 6s4-2 5-6', 'f2']]],
  [/dress shirt/i, [['p', TEE, 'fw'], ['p', 'M17 9l7 9 7-9-3-1-4 4-4-4z', 'f3'], ['l', 24, 18, 24, 40, 'f2k'], ['c', 24, 24, 1.2, 'f2'], ['c', 24, 30, 1.2, 'f2'], ['c', 24, 36, 1.2, 'f2']]],
  [/pants|jeans|trousers/i, [['p', 'M12 6h24l3 36h-10l-5-24-5 24H9z', 'f1'], ['p', 'M12 6h24v5H12z', 'f2'], ['l', 24, 12, 24, 18, 'f2k']]],
  [/socks?/i, [['p', 'M15 5h14v20l10 8c3 3 2 9-3 9H17c-5 0-7-4-7-8V25z', 'f1'], ['p', 'M15 5h14v6H15z', 'f2'], ['p', 'M10 36h6', 'f2k']]],
  [/blazer|suit jacket/i, [['p', 'M14 7l10 8 10-8 8 6-3 29H9L6 13z', 'f1'], ['p', 'M24 15l-6 25M24 15l6 25', 'f2k'], ['p', 'M24 15l-4 6 4 3 4-3z', 'f2'], ['c', 24, 31, 1.4, 'fi']]],
  [/winter coat|warm jacket|^jacket|light jacket/i, [['p', 'M14 6l10 5 10-5 8 8-2 28H8L6 14z', 'f1'], ['l', 24, 11, 24, 42, 'f2k'], ['p', 'M14 6l10 5 10-5-4 7h-12z', 'f2'], ['r', 13, 28, 8, 5, 1.5, 'f2'], ['r', 27, 28, 8, 5, 1.5, 'f2']]],
  [/rain jacket|windbreaker|waterproof jacket/i, [['p', 'M12 14c0-6 5-10 12-10s12 4 12 10l7 6-3 22H8L5 20z', 'f1'], ['p', 'M16 14c0-4 3-7 8-7s8 3 8 7c0 4-4 7-8 7s-8-3-8-7z', 'f2'], ['l', 24, 21, 24, 42, 'f2k'], ['p', 'M38 22l1 6M10 22l-1 6', 'f3k']]],
  [/fleece|mid-layer/i, [['p', 'M15 7l9 4 9-4 9 8-4 6-4-2v21H14V19l-4 2-4-6z', 'f1'], ['l', 24, 11, 24, 31, 'f2k'], ['r', 15, 28, 8, 6, 2, 'f2'], ['c', 33, 24, 1.3, 'f3'], ['c', 33, 29, 1.3, 'f3']]],
  [/sweater|jumper|thermal|base layer/i, [['p', 'M15 7c3 3 15 3 18 0l9 8-4 6-4-2v21H14V19l-4 2-4-6z', 'f1'], ['p', 'M14 28h20M14 34h20M14 40h20', 'f2k'], ['p', 'M15 7c3 3 15 3 18 0', 'f2k']]],
  [/waterproof (boots?|shoes)/i, [['p', 'M12 6h14v14l12 6c4 2 5 5 5 9v3H8V6z', 'f1'], ['p', 'M8 38h35v4H8z', 'fi'], ['p', 'M12 6h14v6H12z', 'f2'], ['p', 'M32 12c0 3-2 4-2 4s-2-1-2-4 2-5 2-5 2 2 2 5z', 'fb']]],
  [/hiking boots?|\bboots?\b/i, [['p', 'M12 5h14v15l11 5c4 2 6 5 6 9v4H8V5z', 'f1'], ['p', 'M8 37h35v5H8z', 'fi'], ['p', 'M12 5h14v6H12z', 'f2'], ['l', 14, 15, 24, 15, 'fwk'], ['l', 14, 21, 24, 21, 'fwk'], ['l', 14, 27, 24, 27, 'fwk']]],
  [/dress shoes?/i, [['p', 'M6 30c8 0 11-4 13-8 5 4 10 6 22 8 3 1 3 6 0 7H6z', 'f1'], ['p', 'M6 37h35v4H6z', 'fi'], ['p', 'M19 22c2 2 3 3 5 3', 'fwk']]],
  [/sandals?/i, [['p', 'M8 36c0-8 6-14 14-14 6 0 12 4 18 8l-2 8H8z', 'f3'], ['p', 'M8 36h30v5H8z', 'f2'], ['p', 'M20 26l8 8M30 28l-8 8', 'f1k'], ['p', 'M14 32c4-2 8-2 12 0', 'f1k']]],
  [/shoes?|sneakers?|trainers?/i, [['p', 'M6 12h10l2 6c3 4 6 5 12 6 7 1 12 3 12 9v3H6z', 'f1'], ['p', 'M6 36h36v5a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z', 'fw'], ['p', 'M18 18l5 4M22 21l5 4M26 24l5 3', 'fwk'], ['p', 'M6 12h10v4H6z', 'f2'], ['p', 'M32 28c3 1 6 3 6 6', 'f2k']]],
  [/sun hat|^hat\b|\bcap\b/i, [['e', 24, 33, 20, 6, 'f2'], ['p', 'M12 33c0-12 6-19 12-19s12 7 12 19z', 'f1'], ['p', 'M12 30h24v4H12z', 'fa']]],
  [/warm hat|beanie|winter hat/i, [['p', 'M10 32c0-12 6-20 14-20s14 8 14 20z', 'f1'], ['r', 8, 30, 32, 8, 3, 'f2'], ['c', 24, 10, 4, 'f3'], ['p', 'M14 30v8M20 30v8M26 30v8M32 30v8', 'f1k']]],
  [/scarf/i, [['p', 'M8 12c8-4 24-4 32 0v8c-8-4-24-4-32 0z', 'f1'], ['p', 'M30 18h10v24l-5-3-5 3z', 'f1'], ['p', 'M30 26h10M30 33h10', 'f2k'], ['p', 'M8 16c8-4 24-4 32 0', 'f2k']]],
  [/waterproof gloves|gloves?|mittens?/i, [['p', 'M14 42V24l-4-8c-1-3 3-5 5-2l3 5V8c0-3 4-3 4 0v9V6c0-3 4-3 4 0v11V9c0-3 4-3 4 0v10l3-4c2-3 5 0 4 2l-5 12v17z', 'f1'], ['r', 14, 36, 22, 6, 2, 'f2']]],
  [/swim/i, [['p', 'M8 12h32v10c0 6-5 10-10 10l-6-5-6 5c-5 0-10-4-10-10z', 'f1'], ['p', 'M8 12h32v4H8z', 'f2'], ['p', 'M12 22h6M30 22h6M15 26h4M29 26h4', 'f3k'], ['l', 24, 12, 24, 19, 'fwk']]],
  [/smart-casual|outfit/i, [['p', 'M24 6c3 0 4 2 4 4s-2 3-4 4v3', 'f2k'], ['p', 'M24 17L6 30c-2 2-1 4 2 4h32c3 0 4-2 2-4z', 'f1'], ['p', 'M12 34h24v8H12z', 'f2']]],
  // ------------------------------------------------------------ toiletries
  [/toothbrush|toothpaste/i, [['p', 'M6 33l22-22c3-3 7 1 4 4L10 37z', 'fw'], ['p', 'M27 12l9 9', 'f2k'], ['p', 'M30 8l3 3M34 12l-3-3', 'f2k'], ['p', 'M28 38c0-3 2-4 4-4h6c2 0 4 1 4 4s-2 4-4 4h-6c-2 0-4-1-4-4z', 'f1'], ['r', 36, 31, 5, 4, 1, 'f2']]],
  [/shampoo|soap/i, [['p', 'M12 14h12v4c3 1 4 3 4 6v16c0 2-1 3-3 3H11c-2 0-3-1-3-3V24c0-3 1-5 4-6z', 'f1'], ['r', 13, 7, 10, 7, 2, 'f2'], ['r', 10, 26, 16, 8, 1, 'fw'], ['r', 31, 30, 12, 12, 3, 'f3'], ['p', 'M34 34h6M34 38h6', 'f2k']]],
  [/deodorant/i, [['r', 14, 18, 20, 24, 4, 'f1'], ['p', 'M16 18c0-8 4-12 8-12s8 4 8 12z', 'f3'], ['r', 14, 26, 20, 7, 0, 'fw'], ['c', 24, 13, 2, 'f2']]],
  [/medications?|pills?|medicine/i, [['r', 14, 6, 20, 8, 3, 'fw'], ['p', 'M12 14h24c2 0 3 1 3 3v21c0 3-2 4-4 4H13c-2 0-4-1-4-4V17c0-2 1-3 3-3z', 'f1'], ['r', 15, 22, 18, 12, 2, 'fw'], ['p', 'M24 24v8M20 28h8', 'frk']]],
  [/sunscreen|sunblock/i, [['p', 'M12 42V12c0-3 2-5 4-5h16c2 0 4 2 4 5v30z', 'f1'], ['r', 11, 38, 26, 5, 2, 'f2'], ['c', 24, 24, 6, 'fa'], ['p', 'M24 14v2M24 32v2M14 24h2M32 24h2M17 17l1.5 1.5M29.5 29.5L31 31M31 17l-1.5 1.5M18.5 29.5L17 31', 'fak']]],
  [/lip balm|moisturi[sz]er/i, [['r', 15, 22, 18, 20, 3, 'f1'], ['p', 'M17 22V12c0-3 3-6 7-6s7 3 7 6v10z', 'f3'], ['p', 'M17 12l14 6', 'f1k'], ['r', 15, 22, 18, 4, 0, 'f2']]],
  [/liquids|travel-size/i, [['r', 5, 12, 38, 28, 5, 'f3'], ['r', 5, 12, 38, 6, 3, 'f2'], ['r', 11, 22, 8, 14, 2, 'f1'], ['r', 22, 24, 8, 12, 2, 'fa'], ['r', 33, 22, 6, 14, 2, 'fb']]],
  // ----------------------------------------------------------- electronics
  [/multi-port|power strip/i, [['r', 4, 17, 40, 14, 4, 'f1'], ['r', 9, 21, 7, 6, 1, 'fi'], ['r', 20, 21, 7, 6, 1, 'fi'], ['r', 31, 21, 7, 6, 1, 'fi'], ['p', 'M44 24h2', 'f2k'], ['p', 'M10 34v8', 'f2k']]],
  [/laptop charger|laptop adapter/i, [['r', 6, 14, 26, 18, 4, 'f1'], ['p', 'M32 23h8c3 0 4 2 4 5v8', 'f2k'], ['p', 'M42 36h4v4h-4z', 'fi'], ['p', 'M6 23H2', 'f2k'], ['c', 19, 23, 3, 'fa']]],
  [/laptop/i, [['r', 9, 9, 30, 21, 3, 'f2'], ['r', 11, 11, 26, 17, 1, 'f3'], ['p', 'M3 33h42l-3 6H6z', 'f1'], ['p', 'M15 17h10M15 22h16', 'f2k']]],
  [/power ?bank|portable charger/i, [['r', 11, 5, 26, 38, 5, 'f1'], ['r', 16, 11, 16, 8, 2, 'f3'], ['p', 'M22 28h4M24 26v4', 'f2k'], ['c', 18, 37, 1.6, 'fa'], ['c', 24, 37, 1.6, 'fa'], ['c', 30, 37, 1.6, 'f3']]],
  [/travel adapter|plug adapter|adapter/i, [['r', 10, 14, 28, 24, 6, 'f1'], ['r', 15, 19, 6, 9, 1.5, 'fi'], ['r', 27, 19, 6, 9, 1.5, 'fi'], ['r', 20, 8, 3, 6, 1, 'f2'], ['r', 25, 8, 3, 6, 1, 'f2'], ['c', 24, 33, 2.5, 'f3']]],
  [/phone charger|charger|charging/i, [['p', 'M14 4v8M24 4v8', 'f2k'], ['p', 'M9 12h20v8c0 6-4 9-10 9S9 26 9 20z', 'f1'], ['p', 'M19 29c0 10 10 6 12 10s-3 6-8 4', 'f2k'], ['r', 28, 38, 10, 7, 2, 'fi']]],
  [/headphones?|earbuds?/i, [['p', 'M9 28V24c0-10 6-16 15-16s15 6 15 16v4', 'f2k'], ['r', 6, 26, 9, 14, 4, 'f1'], ['r', 33, 26, 9, 14, 4, 'f1'], ['r', 8, 29, 5, 8, 2, 'f3'], ['r', 35, 29, 5, 8, 2, 'f3']]],
  // ------------------------------------------------------------- documents
  [/passport|\bid\b|id card|driving licence/i, [['r', 9, 5, 30, 38, 4, 'f1'], ['c', 24, 20, 8, 'f2'], ['p', 'M18 20h12M24 12v16M19 14c2 4 2 10 0 12M29 14c-2 4-2 10 0 12', 'f3k'], ['r', 14, 33, 20, 3, 1, 'f3'], ['r', 17, 38, 14, 2, 1, 'f3']]],
  [/ticket|booking confirmation/i, [['p', 'M4 14h40v7a3 3 0 0 0 0 6v7H4v-7a3 3 0 0 0 0-6z', 'f1'], ['p', 'M32 14v20', 'f3k'], ['p', 'M10 21h14M10 27h10', 'f3k'], ['c', 38, 24, 2, 'f3']]],
  [/insurance/i, [['r', 8, 6, 28, 36, 3, 'fw'], ['p', 'M30 14c-4 0-4 2-8 2v7c0 8 4 11 8 13 4-2 8-5 8-13v-7c-4 0-4-2-8-2z', 'f1'], ['p', 'M26 25l3 3 5-6', 'fwk'], ['p', 'M12 12h10M12 18h6', 'f2k']]],
  [/itinerary|booking details|group/i, [['r', 9, 5, 30, 38, 3, 'fw'], ['r', 9, 5, 30, 7, 3, 'f1'], ['p', 'M14 18h4M22 18h12M14 25h4M22 25h12M14 32h4M22 32h8', 'f2k'], ['c', 38, 38, 6, 'fa'], ['p', 'M38 35v3l2 2', 'fkk']]],
  [/business cards?/i, [['r', 6, 20, 26, 16, 3, 'f3'], ['r', 14, 12, 26, 16, 3, 'f1'], ['p', 'M18 18h10M18 22h16', 'fwk'], ['c', 35, 18, 1.5, 'fw']]],
  [/notes?|agenda/i, [['r', 9, 8, 30, 34, 3, 'fw'], ['r', 9, 8, 30, 7, 3, 'f1'], ['p', 'M14 21h20M14 27h20M14 33h12', 'f2k'], ['c', 16, 6, 2, 'fi'], ['c', 24, 6, 2, 'fi'], ['c', 32, 6, 2, 'fi']]],
  // ------------------------------------------------------------ essentials
  [/first.?aid/i, [['r', 5, 14, 38, 28, 5, 'fw'], ['p', 'M17 14V10c0-2 1-3 3-3h8c2 0 3 1 3 3v4', 'f2k'], ['p', 'M24 20v16M16 28h16', 'frk'], ['r', 5, 14, 38, 5, 0, 'fr']]],
  [/insect|repellent|bug spray/i, [['r', 14, 18, 20, 26, 5, 'f1'], ['r', 18, 9, 12, 9, 2, 'f2'], ['r', 20, 4, 8, 5, 1, 'fi'], ['p', 'M34 8l5-3M35 12h6M34 16l5 3', 'f2k'], ['c', 24, 31, 5, 'fw'], ['p', 'M21 31h6M24 28v6M22 29l4 4M26 29l-4 4', 'f2k']]],
  [/keys?/i, [['c', 14, 14, 8, 'f1'], ['c', 14, 14, 3, 'fw'], ['p', 'M20 20l20 20', 'f2k'], ['p', 'M32 32l4-4M37 37l3-3', 'f2k'], ['c', 38, 12, 5, 'f3'], ['c', 38, 12, 2, 'fw']]],
  [/wallet|cash|cards/i, [['p', 'M6 14c0-3 2-5 5-5h24v6', 'f2k'], ['r', 5, 14, 38, 27, 5, 'f1'], ['r', 28, 24, 15, 9, 4, 'f2'], ['c', 34, 28.5, 2, 'fw'], ['p', 'M5 18h38', 'f2k']]],
  // ---------------------------------------------------------------- camping
  [/tent/i, [['p', 'M3 40L24 7l21 33z', 'f1'], ['p', 'M24 7v33', 'f2k'], ['p', 'M19 40l5-14 5 14z', 'fi'], ['p', 'M3 40h42', 'f2k']]],
  [/sleeping bag/i, [['r', 14, 4, 20, 40, 10, 'f1'], ['r', 18, 6, 12, 12, 6, 'f3'], ['p', 'M24 18v26', 'f2k'], ['p', 'M16 26h16M16 33h16', 'f2k']]],
  [/sleeping (pad|mat)|insulated/i, [['r', 6, 30, 36, 10, 4, 'f1'], ['p', 'M12 30v10M18 30v10M24 30v10M30 30v10M36 30v10', 'f2k'], ['p', 'M6 30c4-6 14-8 30-8', 'f3k'], ['c', 38, 22, 5, 'f2']]],
  [/stove|windshield/i, [['r', 8, 28, 32, 12, 3, 'f1'], ['p', 'M14 28V22h20v6', 'f2'], ['p', 'M24 20c-4-3-4-6 0-10 4 4 4 7 0 10z', 'fa'], ['p', 'M24 18c-2-2-2-3 0-5 2 2 2 3 0 5z', 'fr']]],
  [/pot|cooking|utensils/i, [['p', 'M8 18h32v14c0 6-4 10-10 10H18c-6 0-10-4-10-10z', 'f1'], ['r', 6, 14, 36, 5, 2, 'f2'], ['p', 'M4 22h4M40 22h4', 'f2k'], ['p', 'M18 10c0-3 3-3 3-6M26 10c0-3 3-3 3-6', 'f3k']]],
  [/cooler|food storage/i, [['r', 6, 14, 36, 28, 4, 'f1'], ['r', 4, 10, 40, 8, 3, 'f2'], ['p', 'M18 10V6h12v4', 'f2k'], ['r', 14, 26, 20, 4, 2, 'fw'], ['c', 38, 24, 1.4, 'f3']]],
  [/blanket/i, [['r', 6, 10, 36, 28, 3, 'f1'], ['p', 'M6 18h36M6 26h36M6 34h36', 'f2k'], ['p', 'M12 10v28M20 10v28M28 10v28M36 10v28', 'f3k'], ['p', 'M6 38v5M12 38v5M18 38v5M24 38v5M30 38v5M36 38v5M42 38v5', 'f2k']]],
  [/stakes|guy lines/i, [['p', 'M16 6h6v26l-3 10-3-10z', 'f1'], ['p', 'M22 10c8 0 10 4 14 8', 'f2k'], ['p', 'M30 10h6v22l-3 10-3-10z', 'f2'], ['c', 19, 11, 2, 'fw']]],
  [/headlamp|flashlight|torch/i, [['p', 'M8 22c0-8 6-12 12-12h8c6 0 12 4 12 12v2H8z', 'f1'], ['r', 16, 14, 16, 12, 3, 'fi'], ['c', 24, 20, 4, 'fa'], ['p', 'M24 10v-5M14 12l-4-4M34 12l4-4', 'fak'], ['p', 'M6 30h36', 'f2k'], ['p', 'M10 30v10M38 30v10', 'f2k']]],
  [/snacks to share|^snacks?$/i, [['p', 'M12 6h24l-2 8 2 6-2 22H14l-2-22 2-6z', 'f1'], ['p', 'M12 6h24l-1 4H13z', 'f2'], ['c', 24, 28, 7, 'f3'], ['p', 'M21 28c1-3 5-3 6 0M22 31h4', 'f2k'], ['p', 'M12 14h4M32 14h4', 'f2k']]],
  [/food/i, [['r', 6, 16, 36, 24, 5, 'f1'], ['r', 6, 16, 36, 7, 3, 'f2'], ['p', 'M18 16v-4c0-2 1-3 3-3h6c2 0 3 1 3 3v4', 'f2k'], ['c', 17, 31, 4, 'fw'], ['c', 29, 31, 4, 'fa'], ['p', 'M33 29l5 4', 'fwk']]],
  [/hand warmers?/i, [['r', 8, 14, 32, 20, 8, 'f1'], ['p', 'M18 28c-3-3-3-6 0-9 0 3 3 3 3 6s-1 3-3 3zM28 28c-3-3-3-6 0-9 0 3 3 3 3 6s-1 3-3 3z', 'fa'], ['p', 'M14 40c2-2 4-2 6 0s4 2 6 0 4-2 6 0', 'f2k']]],
  [/lighter|matches/i, [['r', 12, 6, 24, 36, 5, 'f1'], ['r', 15, 22, 18, 17, 2, 'f2'], ['p', 'M24 6c-4-2-4-5 0-6 3 1 4 4 0 6z', 'fa'], ['r', 20, 9, 8, 6, 1, 'fi']]],
  [/map|compass/i, [['c', 24, 24, 19, 'f3'], ['c', 24, 24, 15, 'fw'], ['p', 'M24 9l5 15-5 15-5-15z', 'f1'], ['p', 'M24 9l5 15h-10z', 'fr'], ['c', 24, 24, 2, 'fi']]],
  [/multi-tool|knife/i, [['p', 'M10 18h28c3 0 3 8 0 8H10z', 'f1'], ['p', 'M10 18c-5 0-5 8 0 8', 'f2'], ['p', 'M14 18l8-12 3 2-5 10z', 'fw'], ['p', 'M24 26l10 14 3-2-8-12z', 'fw'], ['c', 38, 22, 1.6, 'fi']]],
  [/plate|cup|cutlery/i, [['c', 20, 26, 14, 'fw'], ['c', 20, 26, 9, 'f3'], ['c', 20, 26, 14, 'f2k'], ['p', 'M38 8v14M34 8v6c0 3 2 4 4 4s4-1 4-4V8', 'f2k'], ['p', 'M38 22v18', 'f2k']]],
  [/rope|cord/i, [['c', 24, 24, 16, 'f1'], ['c', 24, 24, 8, 'fi'], ['p', 'M8 24h32M10 16l28 16M10 32l28-16', 'f2k'], ['p', 'M40 36c3 2 4 5 4 8', 'f2k']]],
  [/tarp|rain fly|sun shelter|shade/i, [['p', 'M3 18L24 8l21 10-4 22H7z', 'f1'], ['p', 'M24 8v32M3 18l21 10 21-10', 'f2k'], ['c', 6, 38, 2, 'fi'], ['c', 42, 38, 2, 'fi']]],
  [/shovel/i, [['p', 'M22 4h4v22h-4z', 'fi'], ['p', 'M14 26h20l3 16H11z', 'f1'], ['p', 'M18 4h12', 'f2k']]],
  [/batteries|spare batter/i, [['r', 6, 12, 14, 26, 3, 'f1'], ['r', 10, 8, 6, 4, 1, 'f2'], ['r', 28, 12, 14, 26, 3, 'fa'], ['r', 32, 8, 6, 4, 1, 'f2'], ['p', 'M10 20h6M32 20h6M35 17v6', 'fwk']]],
  [/dry clothes|dry bag|rain cover for your bag/i, [['p', 'M12 14h24l4 26c0 2-2 4-4 4H12c-2 0-4-2-4-4z', 'f1'], ['r', 12, 8, 24, 8, 2, 'f2'], ['p', 'M16 8V5h16v3', 'fkk'], ['p', 'M14 26h20', 'f3k'], ['p', 'M22 30c0-4 4-4 4 0 0 4-4 4-4 0z', 'fw']]],
  [/trash bags?/i, [['p', 'M12 14c-2 8-4 16-2 26 4 3 24 3 28 0 2-10 0-18-2-26z', 'f1'], ['p', 'M12 14c3-4 5-6 12-6s9 2 12 6', 'f2'], ['p', 'M20 8c0-4 2-5 4-5s4 1 4 5', 'f2k'], ['p', 'M18 24l12 10M30 24L18 34', 'f3k']]],
  [/trowel|toilet paper/i, [['p', 'M6 40l16-16c3-3 8 1 5 5L11 45z', 'f1'], ['p', 'M24 20l6-8', 'f2k'], ['r', 28, 24, 16, 18, 8, 'fw'], ['c', 36, 33, 4, 'f3'], ['c', 36, 33, 16, 'f2k']]],
  [/water bottles?|container|extra drinking water|jug/i, [['p', 'M14 14h20v26c0 3-2 5-5 5H19c-3 0-5-2-5-5z', 'fb'], ['r', 17, 5, 14, 9, 2, 'fi'], ['p', 'M14 24h20', 'fwk'], ['p', 'M18 30h6M18 36h10', 'f3k']]],
  [/water filter|purification/i, [['r', 14, 4, 20, 8, 2, 'fi'], ['r', 12, 12, 24, 30, 6, 'f1'], ['p', 'M12 24h24M12 32h24', 'f2k'], ['p', 'M24 36c-4-4-4-6 0-9 4 3 4 5 0 9z', 'fb'], ['p', 'M36 18h6v6', 'f2k']]],
  [/pack cover/i, [['p', 'M10 18c0-8 6-12 14-12s14 4 14 12v22c0 3-2 4-4 4H14c-2 0-4-1-4-4z', 'f1'], ['p', 'M10 28h28', 'f2k'], ['p', 'M14 12c3-3 17-3 20 0', 'f3k'], ['r', 18, 30, 12, 8, 2, 'f2']]],
  [/chair/i, [['p', 'M12 6l-3 22h30l-3-22z', 'f1'], ['p', 'M9 28L6 42M39 28l3 14M9 28l30 14M39 28L9 42', 'fkk'], ['p', 'M12 6h24', 'f2k']]],
  // -------------------------------------------------------------------- misc
  [/beach towel|towel/i, [['r', 6, 8, 36, 32, 3, 'f1'], ['p', 'M6 16h36M6 24h36M6 32h36', 'fwk'], ['p', 'M6 40v4M12 40v4M18 40v4M24 40v4M30 40v4M36 40v4M42 40v4', 'f2k']]],
  [/umbrella/i, [['p', 'M3 24C4 12 12 5 24 5s20 7 21 19c-3-3-6-3-9 0-3-3-6-3-9 0-3-3-6-3-9 0-3-3-6-3-9 0z', 'f1'], ['p', 'M24 5v36c0 3-4 4-6 1', 'fkk'], ['p', 'M24 5c-5 4-6 12-6 19M24 5c5 4 6 12 6 19', 'f2k']]],
  [/day bag|backpack|rucksack/i, [['r', 10, 10, 28, 33, 9, 'f1'], ['p', 'M18 10V7c0-2 2-3 3-3h6c1 0 3 1 3 3v3', 'f2k'], ['r', 15, 28, 18, 11, 3, 'f2'], ['p', 'M15 24h18', 'f3k'], ['p', 'M10 18c-3 2-3 10 0 12M38 18c3 2 3 10 0 12', 'f2k']]],
  [/laundry bag|detergent/i, [['p', 'M12 14c-3 10-2 20 0 28h24c2-8 3-18 0-28z', 'f3'], ['p', 'M12 14c4-3 20-3 24 0', 'f2'], ['p', 'M20 14l-2-6M28 14l2-6', 'f2k'], ['p', 'M18 28c2-3 4 3 6 0s4 3 6 0', 'f1k']]],
  [/shopping bag|tote/i, [['p', 'M8 16h32l-3 27H11z', 'f1'], ['p', 'M17 16c0-10 14-10 14 0', 'f2k'], ['p', 'M24 24c-4-4-8 0-4 4l4 4 4-4c4-4 0-8-4-4z', 'fw']]],
  [/water bottle|bottle/i, [['p', 'M19 5h10v6c4 2 6 5 6 9v21c0 2-2 3-4 3H17c-2 0-4-1-4-3V20c0-4 2-7 6-9z', 'fb'], ['r', 19, 3, 10, 5, 1, 'fi'], ['p', 'M13 24h22M13 33h22', 'fwk']]],
  [/sunglasses/i, [['l', 4, 18, 44, 18, 'fkk'], ['p', 'M5 18c0 10 5 14 10 14s9-4 9-10v-4zM43 18c0 10-5 14-10 14s-9-4-9-10v-4z', 'fi'], ['p', 'M9 22c1 4 3 6 6 6', 'f3k'], ['p', 'M39 22c-1 4-3 6-6 6', 'f3k'], ['p', 'M22 20c1-2 3-2 4 0', 'fkk']]],
];

/** One distinct fallback glyph per category, for items the table does not know (custom names). */
const FALLBACK = {
  clothing: [['p', 'M24 6c3 0 4 2 4 4s-2 3-4 4v3', 'f2k'], ['p', 'M24 17L6 30c-2 2-1 4 2 4h32c3 0 4-2 2-4z', 'f1']],
  toiletries: [['p', 'M12 14h24v26c0 3-2 4-4 4H16c-2 0-4-1-4-4z', 'f1'], ['r', 16, 6, 16, 8, 2, 'f2'], ['p', 'M12 26h24', 'f3k']],
  electronics: [['r', 12, 5, 24, 38, 5, 'f2'], ['r', 15, 9, 18, 26, 2, 'f3'], ['c', 24, 39, 2, 'fw'], ['p', 'M19 17h10M19 23h10', 'f1k']],
  documents: [['r', 9, 5, 30, 38, 3, 'fw'], ['p', 'M14 14h20M14 21h20M14 28h12', 'f1k'], ['r', 9, 5, 30, 4, 0, 'f1']],
  essentials: [['c', 24, 24, 18, 'fa'], ['p', 'M24 11l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z', 'fw']],
  camping: [['p', 'M3 40L24 7l21 33z', 'f1'], ['p', 'M24 7v33', 'f2k']],
  misc: [['r', 8, 14, 32, 28, 4, 'f1'], ['p', 'M8 24h32', 'f2k'], ['r', 20, 20, 8, 8, 2, 'f3']],
};

/** Shapes for an item: the first matching illustration, else the category glyph. */
export function artFor(name, category) {
  const hit = ART.find(([re]) => re.test(name || ''));
  return hit ? hit[1] : FALLBACK[category] || FALLBACK.misc;
}

/** Whether the name has its own illustration (not just the category fallback). */
export const hasArt = (name) => ART.some(([re]) => re.test(name || ''));

/** Build the <svg> for an item. Decorative: callers label the surrounding control. */
export function itemArt(name, category, { size = 44 } = {}) {
  const el = svg('svg', { class: 'item-art', viewBox: '0 0 48 48', width: size, height: size, 'aria-hidden': 'true', focusable: 'false' });
  for (const [kind, ...a] of artFor(name, category)) {
    const cls = a[a.length - 1];
    let node;
    if (kind === 'p') node = svg('path', { d: a[0], class: `a-${cls}` });
    else if (kind === 'r') node = svg('rect', { x: a[0], y: a[1], width: a[2], height: a[3], rx: a[4], class: `a-${cls}` });
    else if (kind === 'c') node = svg('circle', { cx: a[0], cy: a[1], r: a[2], class: `a-${cls}` });
    else if (kind === 'e') node = svg('ellipse', { cx: a[0], cy: a[1], rx: a[2], ry: a[3], class: `a-${cls}` });
    else node = svg('line', { x1: a[0], y1: a[1], x2: a[2], y2: a[3], class: `a-${cls}` });
    el.append(node);
  }
  return el;
}
