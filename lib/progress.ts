import { daySlots, type DayPlan, type EatenExtra, type MealSlot } from './schemas';

// What today's bar shows: checked-off plan meals plus anything logged on top.
// `eaten` may name slots the day no longer carries (the day was regenerated
// with fewer meals), so only slots present on the day count.
export function eatenKcal(day: DayPlan | null, eaten: MealSlot[], extras: EatenExtra[]): number {
  const fromPlan = day
    ? daySlots(day)
        .filter((slot) => eaten.includes(slot))
        .reduce((sum, slot) => sum + day.meals[slot]!.kcal, 0)
    : 0;
  return fromPlan + extras.reduce((sum, e) => sum + e.kcal, 0);
}
