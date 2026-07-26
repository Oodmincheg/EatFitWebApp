import type { ActivityLevel, Goal, Sex } from './schemas';

// Harris-Benedict (revised) BMR
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  return sex === 'male'
    ? 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age
    : 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * age;
}

export const ACTIVITY: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};

export const GOAL_ADJ: Record<Goal, number> = {
  weight_loss: 0.85,
  maintenance: 1.0,
  muscle_gain: 1.1,
};

export function round10(n: number): number {
  return Math.round(n / 10) * 10;
}

export function calorieTarget(input: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  activityLevel: ActivityLevel;
  goal: Goal;
}): number {
  const base = bmr(input.sex, input.weightKg, input.heightCm, input.age);
  return round10(base * ACTIVITY[input.activityLevel] * GOAL_ADJ[input.goal]);
}
