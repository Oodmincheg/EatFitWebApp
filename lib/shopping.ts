import type { MealPlan, ShoppingCategory, ShoppingItem } from './schemas';

// Naive by design (spec §5.4.1) — good enough for the demo; no NLP.

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[.,;:!?]+$/, '')
    .trim();
}

function singularize(s: string): string {
  if (s.endsWith('es')) return s.slice(0, -2);
  if (s.endsWith('s')) return s.slice(0, -1);
  return s;
}

// Owned if, after normalization, either string contains the other,
// comparing with trailing s/es stripped.
export function isOwned(ingredient: string, owned: string[]): boolean {
  const ing = singularize(normalize(ingredient));
  if (!ing) return false;
  return owned.some((o) => {
    const own = singularize(normalize(o));
    if (!own) return false;
    return ing.includes(own) || own.includes(ing);
  });
}

export function parseOwnedIngredients(raw: string): string[] {
  return raw
    .split(/[,;\n]/)
    .map(normalize)
    .filter(Boolean);
}

// Aisle order for display in the cart.
export const CATEGORY_ORDER: ShoppingCategory[] = [
  'produce',
  'meat-fish',
  'dairy-eggs',
  'grains',
  'pantry',
  'other',
];

export const CATEGORY_LABELS: Record<ShoppingCategory, string> = {
  produce: '🥦 Fruits & Veggies',
  'meat-fish': '🥩 Meat & Fish',
  'dairy-eggs': '🥛 Dairy & Eggs',
  grains: '🌾 Grains & Bakery',
  pantry: '🧂 Pantry',
  other: '🛒 Other',
};

// Keyword buckets checked in this order — first match wins, so pantry
// beats produce for "tomato paste" and dairy for "peanut butter".
// prettier-ignore
const CATEGORY_KEYWORDS: [ShoppingCategory, string[]][] = [
  ['pantry', [
    'oil', 'salt', 'sugar', 'honey', 'spice', 'seasoning', 'sauce', 'paste',
    'vinegar', 'mustard', 'ketchup', 'mayonnaise', 'mayo', 'broth', 'stock',
    'almond', 'walnut', 'peanut', 'cashew', 'hazelnut', 'pistachio', 'seed',
    'tahini', 'hummus', 'chocolate', 'cocoa', 'coffee', 'tea', 'jam', 'syrup',
    'lentil', 'chickpea', 'bean', 'canned', 'olive', 'raisin', 'dried', 'soy',
    'coconut', 'yeast',
  ]],
  ['meat-fish', [
    'chicken', 'turkey', 'beef', 'pork', 'veal', 'lamb', 'duck', 'rabbit',
    'meat', 'mince', 'sausage', 'ham', 'bacon', 'salami', 'liver', 'fillet',
    'fish', 'salmon', 'tuna', 'cod', 'trout', 'hake', 'mackerel', 'herring',
    'shrimp', 'seafood', 'squid', 'mussel',
  ]],
  ['dairy-eggs', [
    'milk', 'cheese', 'yogurt', 'yoghurt', 'kefir', 'cream', 'butter', 'egg',
    'curd', 'cottage', 'mozzarella', 'feta', 'parmesan', 'ricotta',
  ]],
  ['grains', [
    'bread', 'loaf', 'bun', 'bagel', 'pita', 'lavash', 'tortilla', 'wrap',
    'rice', 'buckwheat', 'oat', 'oatmeal', 'pasta', 'spaghetti', 'macaroni',
    'noodle', 'flour', 'couscous', 'bulgur', 'quinoa', 'barley', 'millet',
    'granola', 'cereal', 'muesli', 'cracker', 'toast',
  ]],
  ['produce', [
    'tomato', 'cucumber', 'pepper', 'onion', 'garlic', 'carrot', 'potato',
    'broccoli', 'cauliflower', 'cabbage', 'spinach', 'lettuce', 'salad',
    'greens', 'zucchini', 'eggplant', 'mushroom', 'beet', 'radish', 'celery',
    'asparagus', 'leek', 'ginger', 'parsley', 'dill', 'basil', 'cilantro',
    'arugula', 'herb', 'pumpkin', 'squash', 'corn', 'pea', 'apple', 'banana',
    'berries', 'berry', 'orange', 'lemon', 'lime', 'grape', 'pear', 'peach',
    'plum', 'kiwi', 'avocado', 'mango', 'pineapple', 'melon', 'apricot',
    'pomegranate', 'cherry', 'fruit', 'vegetable',
  ]],
];

// Whole-word match ("egg" must not hit "eggplant"), with trailing s/es
// stripped and an endsWith pass for compounds like "strawberries".
function wordMatches(word: string, keyword: string): boolean {
  return singularize(word) === singularize(keyword) || word.endsWith(keyword);
}

export function categorize(name: string): ShoppingCategory {
  const words = normalize(name)
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (words.some((word) => keywords.some((kw) => wordMatches(word, kw)))) {
      return category;
    }
  }
  return 'other';
}

export function shoppingList(plan: MealPlan, ownedRaw: string): ShoppingItem[] {
  const owned = parseOwnedIngredients(ownedRaw);
  const items = new Map<string, { grams: number; usedIn: Set<string> }>();

  for (const day of plan.days) {
    for (const meal of Object.values(day.meals)) {
      for (const ingredient of meal.ingredients) {
        const name = normalize(ingredient.name);
        if (!name || isOwned(name, owned)) continue;
        if (!items.has(name)) items.set(name, { grams: 0, usedIn: new Set() });
        const item = items.get(name)!;
        item.grams += ingredient.grams;
        item.usedIn.add(meal.name);
      }
    }
  }

  return [...items.entries()]
    .map(([name, { grams, usedIn }]) => ({
      name,
      grams,
      usedIn: [...usedIn],
      category: categorize(name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// "650 g" / "1.2 kg"; empty for unknown (0) weights from legacy plans.
export function formatWeight(grams: number): string {
  if (grams <= 0) return '';
  if (grams >= 1000) {
    const kg = grams / 1000;
    return `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`;
  }
  return `${Math.round(grams)} g`;
}
