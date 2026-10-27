// Pure logic for the "Taste the Destination" guide: which dishes belong to a trip, dietary filtering,
// grouping. No DOM. Dietary data is a general guide only, never a safety guarantee.
import { FOOD } from './data/food.js';

export const DIETS = [
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
];

export const ALLERGEN_LABEL = { gluten: 'Gluten', dairy: 'Dairy', egg: 'Egg', nuts: 'Nuts', fish: 'Fish', shellfish: 'Shellfish', sesame: 'Sesame' };

export const DIET_NOTE = {
  true: 'Usually',
  varies: 'Depends on the recipe — ask',
  false: 'No',
};

/** Items eaten in any of the given country codes, in catalog order. */
export function foodForCountries(codes, food = FOOD) {
  const set = new Set(codes);
  return food.items.filter((i) => i.countries.some((c) => set.has(c)));
}

export const foodRef = (item) => item.id;

/** Which diet / allergen controls make sense for this list (a control that changes nothing is hidden). */
export function availableDietFilters(items) {
  const diets = DIETS.filter((d) => {
    const ok = items.filter((i) => i[d.id] === true).length;
    return ok > 0 && ok < items.length;
  }).map((d) => d.id);
  const present = [...new Set(items.flatMap((i) => i.allergens))].filter((a) => ALLERGEN_LABEL[a]);
  return { diets, allergens: present, categories: [...new Set(items.map((i) => i.category))] };
}

/**
 * filters: { diet: 'all'|'vegetarian'|'vegan', avoid: string[], category: 'all'|id, saved: boolean, untried: boolean }
 * `savedRefs` Set of food ids on the Must-Try list. Diet filters only keep items listed as definitely suitable.
 */
export function filterFood(items, filters, savedRefs = new Set()) {
  return items.filter((i) => {
    if (filters.diet && filters.diet !== 'all' && i[filters.diet] !== true) return false;
    if (filters.avoid?.length && i.allergens.some((a) => filters.avoid.includes(a))) return false;
    if (filters.category && filters.category !== 'all' && i.category !== filters.category) return false;
    if (filters.saved && !savedRefs.has(foodRef(i))) return false;
    return true;
  });
}

/** Items that the diet filter hid because they only *may* suit; surfaced as a hint, never as a promise. */
export function maybeSuitable(items, filters) {
  if (!filters.diet || filters.diet === 'all') return 0;
  return items.filter((i) => i[filters.diet] === 'varies' && !(filters.avoid || []).some((a) => i.allergens.includes(a))).length;
}

export function groupFood(items, food = FOOD) {
  return food.categories.map((c) => ({ ...c, items: items.filter((i) => i.category === c.id) })).filter((g) => g.items.length);
}
