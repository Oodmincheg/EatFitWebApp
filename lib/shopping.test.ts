import { describe, expect, it } from 'vitest';
import {
  categorize,
  formatWeight,
  isOwned,
  normalize,
  parseOwnedIngredients,
  shoppingList,
} from './shopping';
import type { Ingredient, MealPlan } from './schemas';

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

  it('excludes owned ingredients (containment + plural rules)', () => {
    const items = shoppingList(plan, 'chicken, buckwheat, eggs, tomato');
    const names = items.map((i) => i.name);
    expect(names).toEqual(['broccoli', 'milk', 'rice', 'salmon']);
  });

  it('is sorted alphabetically with usedIn meal names', () => {
    const items = shoppingList(plan, '');
    expect(items.map((i) => i.name)).toEqual([...items.map((i) => i.name)].sort());
    const rice = items.find((i) => i.name === 'rice');
    expect(rice?.usedIn).toContain('Chicken bowl');
  });

  it('dedupes ingredients across days', () => {
    const items = shoppingList(plan, '');
    expect(items.filter((i) => i.name === 'rice')).toHaveLength(1);
  });

  it('empty owned list buys everything', () => {
    expect(shoppingList(plan, '').length).toBe(8);
  });

  it('sums weights across the week', () => {
    const items = shoppingList(plan, '');
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
