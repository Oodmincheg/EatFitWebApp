'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AddFoodModal } from '@/components/dashboard/AddFoodModal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/hooks/useI18n';
import { eatenKcal } from '@/lib/progress';
import { formatWeight } from '@/lib/shopping';
import {
  daySlots,
  type DayPlan,
  type EatenExtra,
  type EatenExtraInput,
  type ExtraEstimate,
  type Meal,
  type MealSlot,
} from '@/lib/schemas';

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

// Today's meals with eaten check-offs, food logged off the plan, and a kcal
// progress bar vs target that counts both. `day` is null when today falls
// outside the plan's window; extras are logged against the date, not the plan,
// so they stay available.
export function TodayCard({
  day,
  target,
  eaten,
  extras,
  onToggle,
  onAddExtra,
  onRemoveExtra,
  onEstimateExtra,
}: {
  day: DayPlan | null;
  target: number;
  eaten: MealSlot[];
  extras: EatenExtra[];
  onToggle: (slot: MealSlot, eaten: boolean) => void;
  onAddExtra: (input: EatenExtraInput) => Promise<void>;
  onRemoveExtra: (id: string) => Promise<void>;
  onEstimateExtra: (text: string) => Promise<ExtraEstimate>;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const slots = day ? daySlots(day) : [];
  const total = eatenKcal(day, eaten, extras);
  const pct = Math.min(100, Math.round((total / target) * 100));
  const over = total > target;
  const allDone = slots.length > 0 && slots.every((slot) => eaten.includes(slot));
  const macros = day ? dayMacros(day) : null;

  const removeExtra = async (id: string) => {
    try {
      await onRemoveExtra(id);
    } catch {
      toast(t.today.removeExtraFailed);
    }
  };

  return (
    <section className="rounded-3xl border-2 border-ink bg-paper p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-extrabold">
          {allDone ? t.today.allDone : t.today.mealsTitle}
        </h2>
        <p className="font-mono text-sm font-bold text-latte">
          <span className={over ? 'text-tomato' : 'text-ink'}>{total.toLocaleString(t.intl)}</span> /{' '}
          {target.toLocaleString(t.intl)} {t.units.kcal}
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuenow={Math.min(total, target)}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label={t.today.eatenAria}
        className="mt-3 h-3 overflow-hidden rounded-full border-2 border-ink bg-cream"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${over ? 'bg-tomato' : 'bg-lime'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {macros && (
        <p className="mt-2 font-mono text-xs font-bold text-latte">
          {t.today.planned(macros.p, macros.f, macros.c)}
        </p>
      )}

      {day ? (
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
      ) : (
        <div className="mt-5 rounded-2xl border-2 border-dashed border-sand py-12 text-center">
          <p className="text-3xl" aria-hidden="true">
            🍽️
          </p>
          <p className="mt-3 font-display text-lg font-extrabold">{t.today.noPlan}</p>
          <p className="mt-1 text-sm text-latte">{t.today.noPlanText}</p>
          <Link
            href="/dashboard/plan"
            className="mt-4 inline-block rounded-full bg-tomato px-5 py-2.5 text-sm font-bold text-white shadow-[0_4px_0_var(--color-tomato-deep)] hover:bg-tomato-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
          >
            {t.today.goToPlan}
          </Link>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold tracking-widest text-latte">{t.today.extrasTitle}</h3>
        <Button variant="secondary" onClick={() => setAdding(true)} className="px-3 py-1.5 text-xs">
          {t.today.addFood}
        </Button>
      </div>

      {extras.length > 0 && (
        <ul className="mt-2.5 flex flex-col gap-2">
          {extras.map((extra) => {
            const hasMacros =
              extra.protein_g != null && extra.fat_g != null && extra.carbs_g != null;
            return (
              <li
                key={extra.id}
                className="flex items-center gap-3.5 rounded-2xl border-2 border-dashed border-sand bg-cream px-4 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-tight">{extra.name}</span>
                  {hasMacros && (
                    <span className="block font-mono text-[10px] font-bold text-latte">
                      {t.today.extraMacros(extra.protein_g!, extra.fat_g!, extra.carbs_g!)}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-xs font-bold text-sand">
                  {extra.kcal.toLocaleString(t.intl)} {t.units.kcal}
                </span>
                <button
                  type="button"
                  onClick={() => removeExtra(extra.id)}
                  aria-label={t.today.removeExtra(extra.name)}
                  className="h-8 w-8 shrink-0 rounded-full text-sm font-bold text-latte hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <AddFoodModal
        open={adding}
        onSave={async (input) => {
          await onAddExtra(input);
          setAdding(false);
        }}
        onEstimate={onEstimateExtra}
        onClose={() => setAdding(false)}
      />
    </section>
  );
}
