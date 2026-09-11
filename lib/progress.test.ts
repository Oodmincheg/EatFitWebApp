import { describe, expect, it } from 'vitest';
import { eatenKcal } from './progress';
import type { DayPlan, EatenExtra } from './schemas';

const meal = (name: string, kcal: number) => ({ name, kcal, ingredients: [] });

const day: DayPlan = {
  day: 'Monday',
  meals: { breakfast: meal('Oats', 400), lunch: meal('Soup', 600), dinner: meal('Fish', 500) },
  total_kcal: 1500,
};

const banana: EatenExtra = { id: 'x1', name: 'Banana', kcal: 90, loggedAt: '2026-09-11T10:00:00.000Z' };
const latte: EatenExtra = { id: 'x2', name: 'Latte', kcal: 150, loggedAt: '2026-09-11T11:00:00.000Z' };

describe('eatenKcal', () => {
  it('sums checked-off meals and logged extras', () => {
    expect(eatenKcal(day, ['breakfast', 'lunch'], [banana, latte])).toBe(1240);
  });

  it('ignores eaten slots the day no longer carries', () => {
    expect(eatenKcal(day, ['breakfast', 'morning_snack'], [])).toBe(400);
  });

  it('counts extras alone when there is no plan for the day', () => {
    expect(eatenKcal(null, ['breakfast'], [banana])).toBe(90);
  });

  it('is zero with nothing eaten', () => {
    expect(eatenKcal(day, [], [])).toBe(0);
  });
});
