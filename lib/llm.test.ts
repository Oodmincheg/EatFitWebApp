import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { normalizePlan } from './llm';
import { DAY_NAMES } from './schemas';

function modelMeal(kcal: number, protein: number, fat: number, carbs: number) {
  return {
    name: ' Chicken Bowl ',
    kcal,
    protein_g: protein,
    fat_g: fat,
    carbs_g: carbs,
    ingredients: [{ name: ' Chicken Breast ', grams: 150.4 }],
  };
}

function modelPlan() {
  return {
    days: DAY_NAMES.map((day) => ({
      day,
      meals: {
        breakfast: modelMeal(400.4, 30.6, 10.2, 40.5),
        lunch: modelMeal(600, 40, 20, 60),
        dinner: modelMeal(500, 35.4, 15, 50),
      },
      total_kcal: 0, // model arithmetic is ignored
    })),
  };
}

describe('normalizePlan', () => {
  // 2026-07-10 is a Friday.
  const plan = normalizePlan(modelPlan(), '2026-07-10');

  it('rounds macros to whole grams', () => {
    const breakfast = plan.days[0].meals.breakfast;
    expect(breakfast.protein_g).toBe(31);
    expect(breakfast.fat_g).toBe(10);
    expect(breakfast.carbs_g).toBe(41);
  });

  it('recomputes day macro totals from rounded meal macros', () => {
    const day = plan.days[0];
    expect(day.total_protein_g).toBe(31 + 40 + 35);
    expect(day.total_fat_g).toBe(10 + 20 + 15);
    expect(day.total_carbs_g).toBe(41 + 60 + 50);
  });

  it('still recomputes total_kcal from meal kcal', () => {
    expect(plan.days[0].total_kcal).toBe(400 + 600 + 500);
  });

  it('assigns day names positionally from startDate', () => {
    expect(plan.days[0].day).toBe('Friday');
    expect(plan.days[6].day).toBe('Thursday');
  });
});

describe('normalizePlan with pinned dishes', () => {
  it('keeps pinned meals, merges generated ones and recomputes totals', () => {
    const pinnedLunch = {
      name: 'My oats',
      kcal: 300,
      protein_g: 10,
      fat_g: 5,
      carbs_g: 50,
      ingredients: [],
      dishId: 'd1',
    };
    // 2026-07-10 is a Friday, so days[0] is Friday.
    const plan = normalizePlan(modelPlan(), '2026-07-10', { Friday: { lunch: pinnedLunch } });
    const friday = plan.days[0];
    expect(friday.meals.lunch.name).toBe('My oats');
    expect(friday.meals.lunch.dishId).toBe('d1');
    expect(friday.total_kcal).toBe(400 + 300 + 500);
    expect(friday.total_protein_g).toBe(31 + 10 + 35);
    expect(plan.days[1].meals.lunch.dishId).toBeUndefined();
  });
});
