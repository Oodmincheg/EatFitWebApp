import { describe, expect, it } from 'vitest';
import { DAY_NAMES, MealPlanSchema, ModelPlanSchema, coerceStoredPlan } from './schemas';
import type { Meal, MealPlan } from './schemas';

function mealWithMacros(overrides: Partial<Meal> = {}): Meal {
  return {
    name: 'Chicken bowl',
    kcal: 500,
    protein_g: 35,
    fat_g: 15,
    carbs_g: 55,
    ingredients: [{ name: 'chicken breast', grams: 150 }],
    ...overrides,
  };
}

function legacyMeal(): Meal {
  return {
    name: 'Omelette',
    kcal: 400,
    ingredients: [{ name: 'eggs', grams: 120 }],
  };
}

function modelPlan(meal: () => Meal = mealWithMacros) {
  return {
    days: DAY_NAMES.map((day) => ({
      day,
      meals: { breakfast: meal(), lunch: meal(), dinner: meal() },
      total_kcal: 1500,
    })),
  };
}

describe('ModelPlanSchema', () => {
  it('accepts a plan where every meal carries macros', () => {
    expect(ModelPlanSchema.safeParse(modelPlan()).success).toBe(true);
  });

  it('rejects a meal missing protein_g, naming the field in the issue path', () => {
    const plan = modelPlan();
    delete (plan.days[0].meals.breakfast as Partial<Meal>).protein_g;
    const result = ModelPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
    if (!result.success) {
      // The path is fed back to the model on the corrective retry.
      expect(result.error.issues[0].path).toContain('protein_g');
    }
  });

  it('rejects negative macros', () => {
    const plan = modelPlan();
    plan.days[0].meals.lunch.fat_g = -5;
    expect(ModelPlanSchema.safeParse(plan).success).toBe(false);
  });
});

describe('MealPlanSchema', () => {
  it('accepts a legacy plan without macros or day totals', () => {
    const plan = {
      ...modelPlan(legacyMeal),
      generatedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(MealPlanSchema.safeParse(plan).success).toBe(true);
  });
});

describe('coerceStoredPlan', () => {
  const storedPlan = (meal: () => Meal): MealPlan => ({
    ...modelPlan(meal),
    generatedAt: '2026-01-01T00:00:00.000Z',
  });

  it('passes macros through unchanged', () => {
    const plan = coerceStoredPlan(storedPlan(mealWithMacros));
    expect(plan.days[0].meals.breakfast!.protein_g).toBe(35);
    expect(plan.days[0].meals.breakfast!.fat_g).toBe(15);
    expect(plan.days[0].meals.breakfast!.carbs_g).toBe(55);
  });

  it('leaves macros absent on legacy meals instead of defaulting to 0', () => {
    const plan = coerceStoredPlan(storedPlan(legacyMeal));
    expect('protein_g' in plan.days[0].meals.breakfast!).toBe(false);
  });

  it('coerces legacy string ingredients to { name, grams: 0 }', () => {
    const plan = storedPlan(legacyMeal);
    plan.days[0].meals.dinner!.ingredients = ['eggs' as unknown as Meal['ingredients'][number]];
    const coerced = coerceStoredPlan(plan);
    expect(coerced.days[0].meals.dinner!.ingredients).toEqual([{ name: 'eggs', grams: 0 }]);
  });
});
