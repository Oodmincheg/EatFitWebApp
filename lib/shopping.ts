import { daySlots, type MealPlan, type PantryItem, type ShoppingCategory, type ShoppingItem } from './schemas';

// Naive by design (spec §5.4.1) — good enough for the demo; no NLP.
// Ingredient names arrive in the plan's language (English or Ukrainian), and
// the owned list in whatever the user typed, so matching handles both.

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[.,;:!?]+$/, '')
    .trim();
}

const CYRILLIC = /[Ѐ-ӿ]/;
// One inflectional ending, so "помідори"/"помідор" and "яйця"/"яйце" compare equal.
const UK_ENDING = /(ами|ями|ові|еві|ах|ях|ів|їв|ей|и|і|ї|а|я|у|ю|е|є|о)$/;

// English: trailing s/es stripped. Ukrainian: one ending stripped, keeping
// at least three letters.
export function stem(s: string): string {
  if (CYRILLIC.test(s)) {
    const out = s.replace(UK_ENDING, '');
    return out.length >= 3 ? out : s;
  }
  if (s.endsWith('es')) return s.slice(0, -2);
  if (s.endsWith('s')) return s.slice(0, -1);
  return s;
}

// Matched if, after normalization and stemming, either string contains the other.
export function namesMatch(ingredient: string, ownedName: string): boolean {
  const ing = stem(normalize(ingredient));
  const own = stem(normalize(ownedName));
  if (!ing || !own) return false;
  return ing.includes(own) || own.includes(ing);
}

export function isOwned(ingredient: string, owned: string[]): boolean {
  return owned.some((o) => namesMatch(ingredient, o));
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

// Keyword buckets checked in this order — first match wins, so pantry
// beats produce for "tomato paste" and dairy for "peanut butter"; dairy
// precedes meat so "яйця курячі" / "chicken eggs" stay eggs.
// English entries are words; Ukrainian entries are stems (see `stem`).
// prettier-ignore
const CATEGORY_KEYWORDS: [ShoppingCategory, string[]][] = [
  ['pantry', [
    'oil', 'salt', 'sugar', 'honey', 'spice', 'seasoning', 'sauce', 'paste',
    'vinegar', 'mustard', 'ketchup', 'mayonnaise', 'mayo', 'broth', 'stock',
    'almond', 'walnut', 'peanut', 'cashew', 'hazelnut', 'pistachio', 'seed',
    'tahini', 'hummus', 'chocolate', 'cocoa', 'coffee', 'tea', 'jam', 'syrup',
    'lentil', 'chickpea', 'bean', 'canned', 'olive', 'raisin', 'dried', 'soy',
    'coconut', 'yeast',
    'олі', 'оливков', 'оливк', 'маслин', 'сіль', 'сол', 'цукор', 'цукр', 'мед',
    'спеці', 'приправ', 'соус', 'паст', 'томатн', 'оцет', 'оцт', 'гірчиц',
    'кетчуп', 'майонез', 'бульйон', 'мигдал', 'горіх', 'арахіс', 'кеш',
    'фундук', 'фісташк', 'насінн', 'тахін', 'хумус', 'шоколад', 'какао', 'кав',
    'чай', 'джем', 'варенн', 'сироп', 'сочевиц', 'нут', 'квасол', 'консерв',
    'консервован', 'родзинк', 'ізюм', 'сушен', 'со', 'кокос', 'дріждж',
  ]],
  ['dairy-eggs', [
    'milk', 'cheese', 'yogurt', 'yoghurt', 'kefir', 'cream', 'butter', 'egg',
    'curd', 'cottage', 'mozzarella', 'feta', 'parmesan', 'ricotta',
    'молок', 'сир', 'йогурт', 'кефір', 'вершк', 'вершков', 'масл', 'яйц',
    'яєчн', 'сметан', 'ряжанк', 'моцарел', 'фет', 'пармезан', 'рікот',
    'бринз', 'творог',
  ]],
  ['meat-fish', [
    'chicken', 'turkey', 'beef', 'pork', 'veal', 'lamb', 'duck', 'rabbit',
    'meat', 'mince', 'sausage', 'ham', 'bacon', 'salami', 'liver', 'fillet',
    'fish', 'salmon', 'tuna', 'cod', 'trout', 'hake', 'mackerel', 'herring',
    'shrimp', 'seafood', 'squid', 'mussel',
    'курк', 'куряч', 'курят', 'індичк', 'індич', 'яловичин', 'свинин',
    'телятин', 'баранин', 'качк', 'кролик', 'м’яс', 'мяс', 'фарш', 'ковбас',
    'сосиск', 'шинк', 'бекон', 'салямі', 'печінк', 'філ', 'риб', 'лосось',
    'сьомг', 'тунець', 'тунц', 'тріск', 'форель', 'хек', 'скумбрі', 'оселедець',
    'оселедц', 'креветк', 'морепродукт', 'кальмар', 'мідії', 'міді',
  ]],
  ['grains', [
    'bread', 'loaf', 'bun', 'bagel', 'pita', 'lavash', 'tortilla', 'wrap',
    'rice', 'buckwheat', 'oat', 'oatmeal', 'pasta', 'spaghetti', 'macaroni',
    'noodle', 'flour', 'couscous', 'bulgur', 'quinoa', 'barley', 'millet',
    'granola', 'cereal', 'muesli', 'cracker', 'toast',
    'хліб', 'булк', 'булочк', 'лаваш', 'піт', 'тортил', 'рис', 'гречк',
    'вівсянк', 'вівсян', 'макарон', 'спагет', 'локшин', 'борошн', 'кускус',
    'булгур', 'кіноа', 'перлов', 'пшон', 'ячмін', 'гранол', 'мюсл', 'крекер',
    'тост', 'круп', 'пластівц',
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
    'помідор', 'томат', 'огірк', 'огірок', 'перець', 'перц', 'цибул', 'часник',
    'моркв', 'картопл', 'брокол', 'капуст', 'шпинат', 'салат', 'зелень',
    'кабачк', 'цукін', 'баклажан', 'гриб', 'буряк', 'редис', 'селер', 'спарж',
    'імбир', 'петрушк', 'кріп', 'базилік', 'кінз', 'рукол', 'гарбуз',
    'кукурудз', 'горош', 'яблук', 'банан', 'ягод', 'апельсин', 'лимон', 'лайм',
    'виноград', 'груш', 'персик', 'слив', 'ківі', 'авокадо', 'манго', 'ананас',
    'дин', 'кавун', 'абрикос', 'гранат', 'черешн', 'вишн', 'полуниц', 'малин',
    'чорниц', 'фрукт', 'овоч',
  ]],
];

// Whole-word match ("egg" must not hit "eggplant"). English: plural
// stripped plus an endsWith pass for compounds like "strawberries".
// Ukrainian: the word's stem equals the keyword stem.
function wordMatches(word: string, keyword: string): boolean {
  if (CYRILLIC.test(keyword)) return stem(word) === keyword;
  return stem(word) === stem(keyword) || word.endsWith(keyword);
}

export function categorize(name: string): ShoppingCategory {
  const words = normalize(name)
    .split(/[^\p{L}’']+/u)
    .filter(Boolean);
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (words.some((word) => keywords.some((kw) => wordMatches(word, kw)))) {
      return category;
    }
  }
  return 'other';
}

// The week's ingredients minus what the pantry covers. A pantry row without
// a weight means "enough of it" (the old free-text behaviour); a row with a
// weight only covers that much, and the rest is still on the list.
export function shoppingList(plan: MealPlan, pantry: PantryItem[]): ShoppingItem[] {
  const items = new Map<string, { grams: number; usedIn: Set<string> }>();

  for (const day of plan.days) {
    for (const slot of daySlots(day)) {
      for (const ingredient of day.meals[slot]!.ingredients) {
        const name = normalize(ingredient.name);
        if (!name) continue;
        if (!items.has(name)) items.set(name, { grams: 0, usedIn: new Set() });
        const item = items.get(name)!;
        item.grams += ingredient.grams;
        item.usedIn.add(day.meals[slot]!.name);
      }
    }
  }

  const out: ShoppingItem[] = [];
  for (const [name, { grams, usedIn }] of items) {
    const matches = pantry.filter((row) => namesMatch(name, row.name));
    if (matches.length === 0) {
      out.push({ name, grams, usedIn: [...usedIn], category: categorize(name) });
      continue;
    }
    // Any weightless match covers the item entirely; so does an unknown need.
    if (matches.some((row) => row.grams === undefined) || grams <= 0) continue;
    const have = matches.reduce((sum, row) => sum + (row.grams ?? 0), 0);
    if (have >= grams) continue;
    out.push({
      name,
      grams: Math.round(grams - have),
      haveGrams: Math.round(have),
      usedIn: [...usedIn],
      category: categorize(name),
    });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export type WeightUnits = { g: string; kg: string };

// "650 g" / "1.2 kg"; empty for unknown (0) weights from legacy plans.
export function formatWeight(grams: number, units: WeightUnits = { g: 'g', kg: 'kg' }): string {
  if (grams <= 0) return '';
  if (grams >= 1000) {
    const kg = grams / 1000;
    return `${Number.isInteger(kg) ? kg : kg.toFixed(1)} ${units.kg}`;
  }
  return `${Math.round(grams)} ${units.g}`;
}
