import { describe, expect, it } from 'vitest';
import {
  applyPinToPlan,
  dishToMeal,
  freeSlots,
  pinnedWeek,
  refreshDishInPlan,
  removeDishFromPins,
  unlinkDishInPlan,
  withDayTotals,
} from './pins';
import { DAY_NAMES, DEFAULT_MEAL_SLOTS, type Dish, type Meal, type MealPlan } from './schemas';

const oats: Dish = {
  id: 'd1',
  name: 'Oats',
  kcal: 350,
  protein_g: 12,
  fat_g: 8,
  carbs_g: 55,
  ingredients: [{ name: 'oats', grams: 80 }],
  createdAt: '2026-09-01T00:00:00.000Z',
};

function meal(kcal: number, name = 'meal'): Meal {
  return { name, kcal, protein_g: 10, fat_g: 10, carbs_g: 10, ingredients: [] };
}

function plan(): MealPlan {
  return {
    generatedAt: '2026-09-07T10:00:00.000Z',
    startDate: '2026-09-07',
    days: DAY_NAMES.map((day) => ({
      day,
      meals: { breakfast: meal(400), lunch: meal(600), dinner: meal(500) },
      total_kcal: 1500,
      total_protein_g: 30,
      total_fat_g: 30,
      total_carbs_g: 30,
    })),
  };
}

describe('dishToMeal', () => {
  it('carries the dish id and copies ingredients', () => {
    const m = dishToMeal(oats);
    expect(m.dishId).toBe('d1');
    expect(m.kcal).toBe(350);
    expect(m.ingredients).toEqual([{ name: 'oats', grams: 80 }]);
    expect(m.ingredients).not.toBe(oats.ingredients);
  });
});

describe('pinnedWeek', () => {
  it('resolves pins to meals and skips unknown dishes', () => {
    const week = pinnedWeek({ Monday: { breakfast: 'd1', lunch: 'gone' }, Friday: {} }, [oats]);
    expect(week.Monday?.breakfast?.name).toBe('Oats');
    expect(week.Monday?.lunch).toBeUndefined();
    expect(week.Friday).toBeUndefined();
    expect(freeSlots(week.Monday, DEFAULT_MEAL_SLOTS)).toEqual(['lunch', 'dinner']);
    expect(freeSlots(undefined, DEFAULT_MEAL_SLOTS)).toEqual(['breakfast', 'lunch', 'dinner']);
    // Snack slots are opt-in and only generated when the profile asks for them.
    expect(freeSlots(week.Monday, ['breakfast', 'morning_snack', 'lunch'])).toEqual([
      'morning_snack',
      'lunch',
    ]);
  });
});

describe('withDayTotals', () => {
  it('sums kcal and macros, omitting macro totals when a meal lacks them', () => {
    const full = withDayTotals(plan().days[0]);
    expect(full.total_kcal).toBe(1500);
    expect(full.total_protein_g).toBe(30);
    // A day with a snack slot totals four meals, not a hardcoded three.
    const withSnack = withDayTotals({
      ...plan().days[0],
      meals: { ...plan().days[0].meals, morning_snack: meal(200, 'snack') },
    });
    expect(withSnack.total_kcal).toBe(1700);
    const legacy = withDayTotals({
      ...plan().days[0],
      meals: { ...plan().days[0].meals, dinner: { name: 'x', kcal: 100, ingredients: [] } },
    });
    expect(legacy.total_kcal).toBe(1100);
    expect(legacy.total_protein_g).toBeUndefined();
  });
});

describe('applyPinToPlan', () => {
  it('replaces the slot and recomputes totals; unpin only drops the link', () => {
    const pinned = applyPinToPlan(plan(), 'Tuesday', 'lunch', dishToMeal(oats));
    const tue = pinned.days.find((d) => d.day === 'Tuesday')!;
    expect(tue.meals.lunch!.dishId).toBe('d1');
    expect(tue.total_kcal).toBe(400 + 350 + 500);
    expect(tue.total_protein_g).toBe(10 + 12 + 10);
    expect(pinned.days.find((d) => d.day === 'Monday')!.total_kcal).toBe(1500);

    const unpinned = applyPinToPlan(pinned, 'Tuesday', 'lunch', null);
    const lunch = unpinned.days.find((d) => d.day === 'Tuesday')!.meals.lunch!;
    expect(lunch.dishId).toBeUndefined();
    expect(lunch.name).toBe('Oats');
  });
});

describe('dish edits and deletes', () => {
  it('refreshDishInPlan updates every slot pinned to the dish', () => {
    let p = applyPinToPlan(plan(), 'Monday', 'breakfast', dishToMeal(oats));
    p = applyPinToPlan(p, 'Sunday', 'dinner', dishToMeal(oats));
    const edited = refreshDishInPlan(p, { ...oats, name: 'Big oats', kcal: 500 });
    expect(edited.days[0].meals.breakfast!.name).toBe('Big oats');
    expect(edited.days[0].total_kcal).toBe(500 + 600 + 500);
    expect(edited.days[6].meals.dinner!.kcal).toBe(500);
  });

  it('unlinkDishInPlan keeps the meal but removes dishId', () => {
    const p = applyPinToPlan(plan(), 'Monday', 'breakfast', dishToMeal(oats));
    const b = unlinkDishInPlan(p, 'd1').days[0].meals.breakfast!;
    expect(b.dishId).toBeUndefined();
    expect(b.name).toBe('Oats');
  });

  it('removeDishFromPins drops the dish everywhere and empty days', () => {
    const pins = removeDishFromPins(
      { Monday: { breakfast: 'd1', lunch: 'd2' }, Tuesday: { dinner: 'd1' } },
      'd1'
    );
    expect(pins).toEqual({ Monday: { lunch: 'd2' } });
  });
});
