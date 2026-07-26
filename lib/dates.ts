import { DAY_NAMES, type DayName, type MealPlan, type MealSlot } from './schemas';

// Local calendar date key "YYYY-MM-DD" — progress is a physical-day concept,
// so we deliberately avoid UTC (toISOString) here.
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

// Plan days are named Monday…Sunday; JS getDay() is 0=Sunday.
export function weekdayName(d: Date): DayName {
  return DAY_NAMES[(d.getDay() + 6) % 7];
}

// Monday of the week containing `d`.
export function weekStart(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}

// Local Date for a "YYYY-MM-DD" key.
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Date of days[0]. Plans carry an explicit startDate (the day they were
// generated); legacy plans without one were Monday-anchored.
export function planStart(plan: MealPlan): Date {
  return plan.startDate
    ? parseDateKey(plan.startDate)
    : weekStart(new Date(plan.generatedAt));
}

// The 7-day date span a plan covers, as progress-query keys.
export function planRange(plan: MealPlan): { from: string; to: string } {
  const start = planStart(plan);
  return { from: dateKey(start), to: dateKey(addDays(start, 6)) };
}

// Progress keyed by local date → keyed by plan day name, where days[i]
// falls on planStart + i.
export function eatenByDayName(
  plan: MealPlan,
  byDate: Record<string, MealSlot[]>
): Record<DayName, MealSlot[]> {
  const start = planStart(plan);
  return Object.fromEntries(
    plan.days.map((d, i) => [d.day, byDate[dateKey(addDays(start, i))] ?? []])
  ) as Record<DayName, MealSlot[]>;
}

export function formatDay(key: string): string {
  return parseDateKey(key).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
