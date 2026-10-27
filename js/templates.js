// Deterministic, offline starter-list rules. Output is a suggestion the user can edit freely.
import { BAG_KINDS, TRIP_TYPES } from './models.js';

const it = (category, name, target = 1, essential = false) => ({ category, name, target, essential });
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function defaultDays(type) {
  return TRIP_TYPES.find((t) => t.id === type)?.days ?? 5;
}

const STYLE_EXTRAS = {
  beach: (d) => [
    it('clothing', 'Swimwear', clamp(Math.ceil(d / 3) + 1, 2, 4)),
    it('clothing', 'Sandals', 1),
    it('clothing', 'Sun hat', 1),
    it('toiletries', 'Sunscreen', 1, true),
    it('misc', 'Beach towel', 1),
    it('misc', 'Sunglasses', 1),
  ],
  city: () => [
    it('clothing', 'Comfortable walking shoes', 1, true),
    it('misc', 'Day bag', 1),
    it('electronics', 'Power bank', 1),
    it('misc', 'Reusable water bottle', 1),
  ],
  business: (d) => [
    it('clothing', 'Dress shirts', clamp(d, 2, 5)),
    it('clothing', 'Dress shoes', 1),
    it('clothing', 'Blazer / suit jacket', 1),
    it('electronics', 'Laptop', 1, true),
    it('electronics', 'Laptop charger', 1, true),
    it('documents', 'Business cards', 1),
    it('documents', 'Meeting notes / agenda', 1),
  ],
  camping: (d) => [
    it('camping', 'Tent (with poles & pegs)', 1, true),
    it('camping', 'Sleeping bag', 1, true),
    it('camping', 'Sleeping mat', 1),
    it('camping', 'Headlamp / flashlight', 1, true),
    it('camping', 'Spare batteries', 1),
    it('camping', 'Camping stove & fuel', 1),
    it('camping', 'Lighter / waterproof matches', 1, true),
    it('camping', 'Cooking pot & utensils', 1),
    it('camping', 'Plate, cup & cutlery', 1),
    it('camping', 'Food & snacks', clamp(d, 2, 8)),
    it('camping', 'Cooler / food storage', 1),
    it('camping', 'Water bottles / container', 2),
    it('camping', 'Water filter / purification', 1),
    it('camping', 'Multi-tool / knife', 1),
    it('camping', 'Rope / cord', 1),
    it('camping', 'Camp chair', 1),
    it('camping', 'Trash bags', 1),
    it('camping', 'Trowel & toilet paper', 1),
    it('camping', 'Map / compass', 1),
    it('essentials', 'First-aid kit', 1, true),
    it('essentials', 'Insect repellent', 1),
    it('clothing', 'Hiking boots', 1),
    it('clothing', 'Hiking socks (pairs)', clamp(Math.ceil(d / 2), 2, 5)),
    it('clothing', 'Fleece / warm mid-layer', 1),
    it('clothing', 'Rain jacket', 1),
  ],
  winter: (d) => [
    it('clothing', 'Winter coat', 1, true),
    it('clothing', 'Thermal base layers', clamp(Math.ceil(d / 2), 2, 4)),
    it('clothing', 'Warm sweaters', clamp(Math.ceil(d / 3), 2, 4)),
    it('clothing', 'Gloves', 1),
    it('clothing', 'Warm hat', 1),
    it('clothing', 'Scarf', 1),
    it('clothing', 'Waterproof boots', 1),
    it('toiletries', 'Lip balm & moisturizer', 1),
  ],
  weekend: () => [it('misc', 'Light day bag', 1), it('electronics', 'Portable charger', 1), it('clothing', 'One smart-casual outfit', 1)],
  custom: () => [],
};

/** Season gives a gentle baseline; the user's chosen conditions refine it. */
const SEASON_EXTRAS = {
  spring: [it('clothing', 'Light rain jacket', 1), it('clothing', 'Layering sweater', 1)],
  summer: [it('clothing', 'Sun hat', 1), it('toiletries', 'Sunscreen', 1, true), it('misc', 'Sunglasses', 1)],
  fall: [it('clothing', 'Layering sweater', 1), it('clothing', 'Light rain jacket', 1), it('clothing', 'Warm sweater', 1)],
  winter: [it('clothing', 'Thermal base layers', 2), it('clothing', 'Gloves', 1), it('clothing', 'Warm hat', 1), it('clothing', 'Scarf', 1)],
};
const SEASON_DEFAULT_CONDITIONS = { spring: ['cool'], summer: ['warm'], fall: ['cool'], winter: ['cold'] };

const CONDITION_EXTRAS = {
  hot: [it('clothing', 'Sun hat', 1), it('toiletries', 'Sunscreen', 1, true), it('misc', 'Sunglasses', 1), it('misc', 'Reusable water bottle', 1), it('clothing', 'Lightweight breathable tops', 2)],
  warm: [it('clothing', 'Sun hat', 1), it('toiletries', 'Sunscreen', 1, true), it('misc', 'Sunglasses', 1)],
  cool: [it('clothing', 'Layering sweater', 1)],
  cold: [it('clothing', 'Thermal base layers', 2), it('clothing', 'Gloves', 1), it('clothing', 'Warm hat', 1), it('clothing', 'Scarf', 1)],
  rainy: [it('clothing', 'Rain jacket', 1), it('misc', 'Compact umbrella', 1), it('clothing', 'Waterproof shoes / spare dry socks', 1), it('misc', 'Dry bag / rain cover for your bag', 1)],
  snowy: [it('clothing', 'Waterproof boots', 1), it('clothing', 'Waterproof gloves', 1), it('clothing', 'Warm hat', 1), it('clothing', 'Thermal base layers', 2)],
  windy: [it('clothing', 'Windbreaker', 1), it('toiletries', 'Lip balm', 1)],
};

/** Camping needs more than clothes: conditions change shelter and sleeping gear too. */
const CAMPING_CONDITION_EXTRAS = {
  hot: [it('camping', 'Extra drinking water', 1, true), it('camping', 'Shade tarp / sun shelter', 1)],
  warm: [it('camping', 'Extra drinking water', 1)],
  cool: [it('camping', 'Warm sleeping bag liner', 1)],
  cold: [it('camping', 'Cold-rated sleeping bag', 1, true), it('camping', 'Insulated sleeping pad', 1), it('camping', 'Hand warmers', 2), it('camping', 'Extra blanket', 1)],
  rainy: [it('camping', 'Tarp / rain fly', 1, true), it('camping', 'Waterproof pack cover', 1), it('camping', 'Spare dry clothes in dry bag', 1)],
  snowy: [it('camping', 'Snow-rated (4-season) tent', 1, true), it('camping', 'Insulated sleeping pad', 1), it('camping', 'Snow shovel', 1)],
  windy: [it('camping', 'Extra tent stakes & guy lines', 1), it('camping', 'Windshield for stove', 1)],
};

/** Built-in templates are named presets of the same rules, so they stay consistent and editable. */
export const BUILTIN_TEMPLATES = [
  { id: 'builtin-beach', name: 'Beach holiday', type: 'beach', style: 'beach', days: 7, blurb: 'Swimwear, sun care, light layers' },
  { id: 'builtin-city', name: 'City break', type: 'city', style: 'city', days: 4, blurb: 'Walking shoes, day bag, power bank' },
  { id: 'builtin-business', name: 'Business trip', type: 'business', style: 'business', days: 3, blurb: 'Smart clothes, laptop, documents' },
  { id: 'builtin-camping', name: 'Camping', type: 'camping', style: 'camping', days: 4, blurb: 'Shelter, sleeping gear, safety basics' },
  { id: 'builtin-winter', name: 'Winter trip', type: 'winter', style: 'winter', days: 6, blurb: 'Warm layers, boots, accessories' },
  { id: 'builtin-weekend', name: 'Weekend getaway', type: 'custom', style: 'weekend', days: 3, blurb: 'Light and quick: one bag, few extras' },
];

/**
 * @param {{type?: string, style?: string, days?: number, travelers?: number, bagKinds?: string[], season?: string, conditions?: string[]}} opts
 * @returns {Array<{category:string,name:string,target:number,essential:boolean}>}
 */
export function generatePackingList({ type = 'custom', style, days, travelers = 1, bagKinds = [], season = '', conditions = [] } = {}) {
  const d = clamp(Math.round(days || defaultDays(type)), 1, 60);
  const compact = bagKinds.length > 0 && bagKinds.every((k) => k === 'backpack' || k === 'carry-on');
  const carryOnOnly = bagKinds.length > 0 && bagKinds.every((k) => k === 'carry-on');
  // longer trips assume laundry; small bags force the same assumption
  const cap = compact ? 6 : d > 10 ? 8 : 12;

  // chosen conditions win; without any, the season supplies a sensible default
  const conds = conditions.length ? conditions : SEASON_DEFAULT_CONDITIONS[season] || [];
  const camping = (style || type) === 'camping';

  let jacket = 'Jacket';
  if (conds.includes('cold') || conds.includes('snowy')) jacket = 'Warm jacket';
  else if (conds.includes('hot') || conds.includes('warm')) jacket = 'Light jacket';

  const base = [
    it('clothing', 'T-shirts', clamp(d, 2, cap)),
    it('clothing', 'Underwear', clamp(d + 1, 3, cap + 2)),
    it('clothing', 'Socks (pairs)', clamp(d + 1, 3, cap + 2)),
    it('clothing', 'Pants / jeans', clamp(Math.ceil(d / 3), 1, compact ? 2 : 4)),
    it('clothing', jacket, 1),
    it('clothing', 'Sleepwear', 1),
    it('clothing', 'Comfortable shoes', 1),
    it('toiletries', 'Toothbrush & toothpaste', 1, true),
    it('toiletries', 'Shampoo & soap', 1),
    it('toiletries', 'Deodorant', 1),
    it('toiletries', 'Medications', 1, true),
    it('electronics', 'Phone charger', 1, true),
    it('electronics', 'Travel adapter', 1),
    it('electronics', 'Headphones', 1),
    it('documents', 'ID / Passport', 1, true),
    it('documents', 'Tickets / booking confirmations', 1, true),
    it('documents', 'Travel insurance details', 1),
    it('essentials', 'Wallet, cards & some cash', 1, true),
    it('essentials', 'Keys', 1, true),
    it('misc', 'Reusable shopping bag', 1),
  ];
  if (compact) base.push(it('misc', 'Laundry bag / detergent sheets', 1));
  if (carryOnOnly) base.push(it('toiletries', 'Travel-size liquids (check your airline’s rules)', 1));
  if (travelers > 1) {
    base.push(it('documents', 'Group itinerary & booking details', 1), it('electronics', 'Multi-port charger / power strip', 1), it('misc', 'Snacks to share', 1));
  }

  const extras = [
    ...(STYLE_EXTRAS[style || type] || STYLE_EXTRAS.custom)(d),
    ...(SEASON_EXTRAS[season] || []),
    ...conds.flatMap((c) => CONDITION_EXTRAS[c] || []),
    ...(camping ? conds.flatMap((c) => CAMPING_CONDITION_EXTRAS[c] || []) : []),
  ];
  // a style-specific shoe/boot replaces the generic pair instead of sitting beside it
  const specificFootwear = extras.some((e) => /shoes|boots/i.test(e.name));
  const seen = new Set();
  const out = [];
  for (const item of [...base.filter((b) => !(specificFootwear && b.name === 'Comfortable shoes')), ...extras]) {
    const key = `${item.category}|${item.name.toLowerCase()}`;
    if (seen.has(key)) continue; // deduplicate
    seen.add(key);
    out.push({ ...item });
  }
  return out;
}

export function generateTasks({ transport = '' } = {}) {
  const before = [
    'Check passport / ID validity',
    'Confirm accommodation booking',
    'Download offline maps',
    'Buy travel insurance',
    'Check the weather forecast',
    'Notify bank about travel',
  ];
  if (transport === 'flight') before.unshift('Online check-in & boarding pass');
  if (transport && transport !== 'car') before.splice(1, 0, 'Book airport / station transfer');
  return [
    ...before.map((title) => ({ title, phase: 'before' })),
    { title: 'Keep documents and valuables secure', phase: 'during' },
    { title: 'Check out & confirm return transport', phase: 'return' },
    { title: 'Unpack and do laundry', phase: 'return' },
  ];
}

/** Tasks for a journey-home trip. The original trip's own return tasks stay where they are. */
export function generateReturnTasks() {
  return [
    { title: 'Settle bills and check out', phase: 'before' },
    { title: 'Confirm transport home', phase: 'before' },
    { title: 'Re-check ID and tickets', phase: 'before' },
    { title: 'Do a last sweep of the room', phase: 'before' },
  ];
}

/** Items of a built-in template (id) or null. */
export function builtinTemplateItems(id, overrides = {}) {
  const t = BUILTIN_TEMPLATES.find((b) => b.id === id);
  if (!t) return null;
  return generatePackingList({ type: t.type, style: t.style, days: t.days, ...overrides });
}

/** Which bag kinds suit a category best, in order of preference. */
const BAG_PREFERENCE = {
  camping: ['camping', 'backpack', 'checked', 'other'],
  documents: ['carry-on', 'backpack', 'checked', 'other'],
  electronics: ['carry-on', 'backpack', 'checked', 'other'],
  essentials: ['carry-on', 'backpack', 'checked', 'other'],
  toiletries: ['checked', 'carry-on', 'backpack', 'other'],
  clothing: ['checked', 'carry-on', 'backpack', 'other'],
  misc: ['checked', 'backpack', 'carry-on', 'other'],
};

export function bagForCategory(category, bags) {
  if (!bags.length) return '';
  const prefs = BAG_PREFERENCE[category] || BAG_PREFERENCE.misc;
  for (const kind of prefs) {
    const hit = bags.find((b) => b.kind === kind);
    if (hit) return hit.id;
  }
  return bags[0].id;
}

export const bagKindLabel = (kind) => BAG_KINDS.find((k) => k.id === kind)?.label ?? 'Bag';
