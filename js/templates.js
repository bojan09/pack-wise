// Deterministic, offline starter-list rules. Output is a suggestion the user can edit freely.
import { BAG_KINDS, TRIP_TYPES } from './models.js';

const it = (category, name, target = 1, essential = false) => ({ category, name, target, essential });

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function defaultDays(type) {
  return TRIP_TYPES.find((t) => t.id === type)?.days ?? 5;
}

const TYPE_EXTRAS = {
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
  camping: () => [
    it('misc', 'Tent', 1, true),
    it('misc', 'Sleeping bag', 1, true),
    it('misc', 'Sleeping mat', 1),
    it('misc', 'Headlamp / flashlight', 1, true),
    it('misc', 'Camping stove & fuel', 1),
    it('misc', 'Water filter / purification', 1),
    it('essentials', 'First-aid kit', 1, true),
    it('essentials', 'Insect repellent', 1),
    it('clothing', 'Hiking boots', 1),
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
  custom: () => [],
};

/**
 * @param {{type?: string, days?: number}} opts
 * @returns {Array<{category:string,name:string,target:number,essential:boolean}>}
 */
export function generatePackingList({ type = 'custom', days } = {}) {
  const d = clamp(Math.round(days || defaultDays(type)), 1, 60);
  const laundry = d > 10; // longer trips assume laundry, so clothing counts are capped
  const cap = laundry ? 8 : 12;

  const base = [
    it('clothing', 'T-shirts', clamp(d, 2, cap)),
    it('clothing', 'Underwear', clamp(d + 1, 3, cap + 2)),
    it('clothing', 'Socks (pairs)', clamp(d + 1, 3, cap + 2)),
    it('clothing', 'Pants / jeans', clamp(Math.ceil(d / 3), 1, 4)),
    it('clothing', 'Jacket', 1),
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

  const extras = (TYPE_EXTRAS[type] || TYPE_EXTRAS.custom)(d);
  // a type-specific shoe/boot replaces the generic pair instead of sitting beside it
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

/** Which bag kinds suit a category best, in order of preference. */
const BAG_PREFERENCE = {
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
