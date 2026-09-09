'use client';

import { useI18n } from '@/hooks/useI18n';
import { formatWeight } from '@/lib/shopping';
import { daySlots, type DayPlan, type Meal, type MealSlot } from '@/lib/schemas';

const SLOT_ACCENT: Record<MealSlot, string> = {
  breakfast: 'text-tomato',
  morning_snack: 'text-latte',
  lunch: 'text-lime-deep',
  afternoon_snack: 'text-latte',
  dinner: 'text-tomato-deep',
};

function mealWeight(meal: Meal): number {
  return meal.ingredients.reduce((sum, i) => sum + i.grams, 0);
}

// Null on legacy plans generated before macros existed — hide, never show 0.
function dayMacros(day: DayPlan) {
  const { total_protein_g: p, total_fat_g: f, total_carbs_g: c } = day;
  return p != null && f != null && c != null ? { p, f, c } : null;
}

// Today's meals with eaten check-offs and a kcal progress bar vs target.
export function TodayCard({
  day,
  target,
  eaten,
  onToggle,
}: {
  day: DayPlan;
  target: number;
  eaten: MealSlot[];
  onToggle: (slot: MealSlot, eaten: boolean) => void;
}) {
  const { t } = useI18n();
  const slots = daySlots(day);
  const eatenKcal = slots
    .filter((slot) => eaten.includes(slot))
    .reduce((sum, slot) => sum + day.meals[slot]!.kcal, 0);
  const pct = Math.min(100, Math.round((eatenKcal / target) * 100));
  const allDone = slots.every((slot) => eaten.includes(slot));
  const macros = dayMacros(day);

  return (
    <section className="rounded-3xl border-2 border-ink bg-paper p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-extrabold">
          {allDone ? t.today.allDone : t.today.mealsTitle}
        </h2>
        <p className="font-mono text-sm font-bold text-latte">
          <span className="text-ink">{eatenKcal.toLocaleString(t.intl)}</span> /{' '}
          {target.toLocaleString(t.intl)} {t.units.kcal}
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuenow={eatenKcal}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label={t.today.eatenAria}
        className="mt-3 h-3 overflow-hidden rounded-full border-2 border-ink bg-cream"
      >
        <div
          className="h-full rounded-full bg-lime transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {macros && (
        <p className="mt-2 font-mono text-xs font-bold text-latte">
          {t.today.planned(macros.p, macros.f, macros.c)}
        </p>
      )}

      <ul className="mt-5 flex flex-col gap-2.5">
        {slots.map((slot) => {
          const meal = day.meals[slot]!;
          const isEaten = eaten.includes(slot);
          const weight = formatWeight(mealWeight(meal), t.units);
          return (
            <li key={slot}>
              <label
                className={`flex cursor-pointer items-center gap-3.5 rounded-2xl border-2 px-4 py-3 transition-colors ${
                  isEaten
                    ? 'border-lime bg-mint'
                    : 'border-peach-line bg-cream hover:border-sand'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isEaten}
                  onChange={(e) => onToggle(slot, e.target.checked)}
                  className="h-5 w-5 shrink-0 accent-lime-deep"
                  aria-label={t.today.markEaten(t.meals[slot])}
                />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[10px] font-bold tracking-wide ${SLOT_ACCENT[slot]}`}>
                    {t.mealLabels[slot]}
                  </span>
                  <span
                    className={`block text-sm font-semibold leading-tight ${
                      isEaten ? 'text-latte line-through decoration-2' : ''
                    }`}
                  >
                    {meal.name}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs font-bold text-sand">
                  {meal.kcal} {t.units.kcal}
                  {weight && <span className="text-sand/70"> · {weight}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
