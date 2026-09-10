import { describe, expect, it } from 'vitest';
import {
  categorize,
  formatWeight,
  isOwned,
  normalize,
  parseOwnedIngredients,
  shoppingList,
} from './shopping';
import type { Ingredient, MealPlan, PantryItem } from './schemas';

describe('normalize', () => {
  it('lowercases, trims, strips trailing punctuation', () => {
    expect(normalize('  Chicken, ')).toBe('chicken');
    expect(normalize('EGGS.')).toBe('eggs');
  });
});

describe('parseOwnedIngredients', () => {
  it('splits on comma, semicolon, and newline', () => {
    expect(parseOwnedIngredients('chicken, buckwheat; eggs\ntomatoes')).toEqual([
      'chicken',
      'buckwheat',
      'eggs',
      'tomatoes',
    ]);
  });

  it('drops empty entries', () => {
    expect(parseOwnedIngredients('chicken,, ,')).toEqual(['chicken']);
  });
});

describe('isOwned', () => {
  it('"chicken" owns "chicken breast" (containment)', () => {
    expect(isOwned('chicken breast', ['chicken'])).toBe(true);
  });

  it('"tomatoes" owns "tomato" (plural stripped)', () => {
    expect(isOwned('tomato', ['tomatoes'])).toBe(true);
    expect(isOwned('tomatoes', ['tomato'])).toBe(true);
  });

  it('unrelated items are not owned', () => {
    expect(isOwned('salmon', ['chicken', 'eggs'])).toBe(false);
  });
});

function planWith(ingredientsByMeal: Record<string, Ingredient[]>): MealPlan {
  const mealNames = Object.keys(ingredientsByMeal);
  const meal = (i: number) => ({
    name: mealNames[i % mealNames.length],
    kcal: 500,
    ingredients: ingredientsByMeal[mealNames[i % mealNames.length]],
  });
  return {
    generatedAt: '2026-07-10T00:00:00.000Z',
    days: (
      ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
    ).map((day) => ({
      day,
      meals: { breakfast: meal(0), lunch: meal(1), dinner: meal(2) },
      total_kcal: 1500,
    })),
  };
}

const g = (name: string, grams: number): Ingredient => ({ name, grams });

describe('shoppingList', () => {
  const plan = planWith({
    'Chicken bowl': [g('chicken breast', 150), g('rice', 80), g('broccoli', 100)],
    Omelette: [g('eggs', 120), g('milk', 50), g('tomatoes', 60)],
    'Buckwheat dinner': [g('buckwheat', 90), g('salmon', 140)],
  });

  const pantry = (raw: string): PantryItem[] =>
    parseOwnedIngredients(raw).map((name) => ({ name }));

  it('excludes owned ingredients (containment + plural rules)', () => {
    const items = shoppingList(plan, pantry('chicken, buckwheat, eggs, tomato'));
    const names = items.map((i) => i.name);
    expect(names).toEqual(['broccoli', 'milk', 'rice', 'salmon']);
  });

  it('a weighed pantry row only covers its own weight', () => {
    // rice needed: 80 g × 7 days = 560 g
    const items = shoppingList(plan, [{ name: 'rice', grams: 200 }]);
    const rice = items.find((i) => i.name === 'rice');
    expect(rice?.grams).toBe(360);
    expect(rice?.haveGrams).toBe(200);
  });

  it('a weighed pantry row that covers the week drops the item', () => {
    const items = shoppingList(plan, [{ name: 'rice', grams: 600 }]);
    expect(items.find((i) => i.name === 'rice')).toBeUndefined();
  });

  it('a pantry row without a weight still covers the item entirely', () => {
    const items = shoppingList(plan, [{ name: 'rice' }]);
    expect(items.find((i) => i.name === 'rice')).toBeUndefined();
  });

  it('converts kilograms and litres to grams before subtracting', () => {
    // rice needed: 560 g
    expect(
      shoppingList(plan, [{ name: 'rice', amount: 1, unit: 'kg' }]).find((i) => i.name === 'rice')
    ).toBeUndefined();
    const partial = shoppingList(plan, [{ name: 'rice', amount: 0.2, unit: 'kg' }]);
    expect(partial.find((i) => i.name === 'rice')?.grams).toBe(360);
    // millilitres count as grams
    const milk = shoppingList(plan, [{ name: 'milk', amount: 0.2, unit: 'l' }]);
    expect(milk.find((i) => i.name === 'milk')?.grams).toBe(150); // 50 g x 7 - 200
  });

  it('an amount in pieces says nothing about weight, so it covers the item', () => {
    const items = shoppingList(plan, [{ name: 'eggs', amount: 10, unit: 'pc' }]);
    expect(items.find((i) => i.name === 'eggs')).toBeUndefined();
  });

  it('spends each pantry gram once across ingredients that match it', () => {
    // Both requirements match the single "milk" row; 50 g x 7 days each.
    const twoMilks = planWith({
      'Milk bowl': [g('milk', 50)],
      'Skimmed bowl': [g('skimmed milk', 50)],
      Toast: [g('bread', 40)],
    });
    const items = shoppingList(twoMilks, [{ name: 'milk', amount: 350, unit: 'g' }]);
    const names = items.map((i) => i.name);
    // 700 g needed in total, 350 g at home: one of the two is still on the list.
    expect(names).toContain('bread');
    const milkRows = items.filter((i) => i.name.includes('milk'));
    expect(milkRows).toHaveLength(1);
    expect(milkRows[0].grams).toBe(350);
  });

  it('reads the weight of rows written before units existed', () => {
    const items = shoppingList(plan, [{ name: 'rice', grams: 200 }]);
    expect(items.find((i) => i.name === 'rice')?.grams).toBe(360);
  });

  it('is sorted alphabetically with usedIn meal names', () => {
    const items = shoppingList(plan, []);
    expect(items.map((i) => i.name)).toEqual([...items.map((i) => i.name)].sort());
    const rice = items.find((i) => i.name === 'rice');
    expect(rice?.usedIn).toContain('Chicken bowl');
  });

  it('dedupes ingredients across days', () => {
    const items = shoppingList(plan, []);
    expect(items.filter((i) => i.name === 'rice')).toHaveLength(1);
  });

  it('empty owned list buys everything', () => {
    expect(shoppingList(plan, []).length).toBe(8);
  });

  it('sums weights across the week', () => {
    const items = shoppingList(plan, []);
    // each meal appears once per day × 7 days (see planWith); rice = 80 g × 7
    const rice = items.find((i) => i.name === 'rice');
    expect(rice?.grams).toBe(560);
  });
});

describe('categorize', () => {
  it('sorts common ingredients into aisles', () => {
    expect(categorize('cherry tomatoes')).toBe('produce');
    expect(categorize('chicken breast')).toBe('meat-fish');
    expect(categorize('greek yogurt')).toBe('dairy-eggs');
    expect(categorize('buckwheat')).toBe('grains');
    expect(categorize('olive oil')).toBe('pantry');
  });

  it('matches whole words, so "egg" does not hit "eggplant"', () => {
    expect(categorize('eggs')).toBe('dairy-eggs');
    expect(categorize('eggplant')).toBe('produce');
  });

  it('pantry wins over produce/dairy for compound names', () => {
    expect(categorize('tomato paste')).toBe('pantry');
    expect(categorize('peanut butter')).toBe('pantry');
  });

  it('matches compounds via suffix ("strawberries" → berries)', () => {
    expect(categorize('strawberries')).toBe('produce');
  });

  it('falls back to other for unknown items', () => {
    expect(categorize('mystery item')).toBe('other');
  });
});

describe('formatWeight', () => {
  it('formats grams and kilograms', () => {
    expect(formatWeight(650)).toBe('650 g');
    expect(formatWeight(1000)).toBe('1 kg');
    expect(formatWeight(1250)).toBe('1.3 kg');
  });

  it('returns empty string for unknown (0) weight', () => {
    expect(formatWeight(0)).toBe('');
  });
});

describe('ukrainian ingredients', () => {
  it('categorizes stems regardless of inflection', () => {
    expect(categorize('куряче філе')).toBe('meat-fish');
    expect(categorize('помідори')).toBe('produce');
    expect(categorize('яйця курячі')).toBe('dairy-eggs');
    expect(categorize('гречка')).toBe('grains');
    expect(categorize('олія оливкова')).toBe('pantry');
    expect(categorize('кава')).toBe('pantry');
    expect(categorize('кавун')).toBe('produce');
    expect(categorize('сироп')).toBe('pantry');
    expect(categorize('сир')).toBe('dairy-eggs');
  });

  it('matches owned items across inflections', () => {
    expect(isOwned('помідори', ['помідор'])).toBe(true);
    expect(isOwned('яйце', ['яйця'])).toBe(true);
    expect(isOwned('картопля', ['картоплі'])).toBe(true);
    expect(isOwned('рис', ['риба'])).toBe(false);
  });

  it('formats weight with the given units', () => {
    expect(formatWeight(650, { g: 'г', kg: 'кг' })).toBe('650 г');
    expect(formatWeight(1250, { g: 'г', kg: 'кг' })).toBe('1.3 кг');
  });
});
