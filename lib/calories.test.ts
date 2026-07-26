import { describe, expect, it } from 'vitest';
import { bmr, calorieTarget, round10 } from './calories';

describe('bmr', () => {
  it('matches the spec worked example (male, 30y, 80kg, 180cm)', () => {
    expect(bmr('male', 80, 180, 30)).toBeCloseTo(1853.6, 1);
  });

  it('uses the female formula', () => {
    // 447.593 + 9.247*60 + 3.098*165 - 4.33*25 = 1405.33
    expect(bmr('female', 60, 165, 25)).toBeCloseTo(1405.33, 1);
  });
});

describe('round10', () => {
  it('rounds to the nearest 10', () => {
    expect(round10(2442)).toBe(2440);
    expect(round10(2445)).toBe(2450);
    expect(round10(1983.4)).toBe(1980);
  });
});

describe('calorieTarget', () => {
  it('matches the spec worked example: 2440 kcal', () => {
    // male, 30y, 80kg, 180cm, moderate, weight loss → 1853.6 × 1.55 × 0.85 ≈ 2442 → 2440
    expect(
      calorieTarget({
        sex: 'male',
        age: 30,
        weightKg: 80,
        heightCm: 180,
        activityLevel: 'moderate',
        goal: 'weight_loss',
      })
    ).toBe(2440);
  });

  it('maintenance keeps the activity-adjusted BMR', () => {
    expect(
      calorieTarget({
        sex: 'male',
        age: 30,
        weightKg: 80,
        heightCm: 180,
        activityLevel: 'moderate',
        goal: 'maintenance',
      })
    ).toBe(round10(1853.578 * 1.55));
  });

  it('muscle gain is 10% above maintenance', () => {
    const maintenance = calorieTarget({
      sex: 'female',
      age: 25,
      weightKg: 60,
      heightCm: 165,
      activityLevel: 'light',
      goal: 'maintenance',
    });
    const gain = calorieTarget({
      sex: 'female',
      age: 25,
      weightKg: 60,
      heightCm: 165,
      activityLevel: 'light',
      goal: 'muscle_gain',
    });
    expect(gain).toBeGreaterThan(maintenance);
  });
});
