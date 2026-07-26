'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { formatWeight } from '@/lib/shopping';
import type { DayPlan, Meal, MealSlot } from '@/lib/schemas';

const MEAL_ROWS = [
  { slot: 'breakfast', label: '🍳 BREAKFAST', accent: 'text-tomato' },
  { slot: 'lunch', label: '🥗 LUNCH', accent: 'text-lime-deep' },
  { slot: 'dinner', label: '🍲 DINNER', accent: 'text-tomato-deep' },
] as const;

function mealWeight(meal: Meal): number {
  return meal.ingredients.reduce((sum, i) => sum + i.grams, 0);
}

// Null on legacy plans generated before macros existed — hide, never show 0.
function dayMacros(day: DayPlan) {
  const { total_protein_g: p, total_fat_g: f, total_carbs_g: c } = day;
  return p != null && f != null && c != null ? { p, f, c } : null;
}

function mealMacros(meal: Meal) {
  const { protein_g: p, fat_g: f, carbs_g: c } = meal;
  return p != null && f != null && c != null ? { p, f, c } : null;
}

export function DayCard({
  day,
  target,
  eaten,
  onRegenerate,
  regenerating = false,
}: {
  day: DayPlan;
  target: number;
  eaten?: MealSlot[];
  // Present only for today/future days — past days are history.
  onRegenerate?: (preference: string) => void;
  regenerating?: boolean;
}) {
  const offTarget = Math.abs(day.total_kcal - target) > target * 0.1;
  const macros = dayMacros(day);
  const [openSlot, setOpenSlot] = useState<MealSlot | null>(null);
  const [regenOpen, setRegenOpen] = useState(false);
  const [preference, setPreference] = useState('');
  const openRow = MEAL_ROWS.find((r) => r.slot === openSlot);
  const openMeal = openSlot ? day.meals[openSlot] : null;

  return (
    <div className="flex flex-col rounded-2xl border-2 border-ink bg-white p-3">
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-1">
          <h3 className="font-display text-[15px] font-extrabold" title={day.day}>
            {day.day.slice(0, 3)}
          </h3>
          {onRegenerate && (
            <button
              onClick={() => setRegenOpen(true)}
              disabled={regenerating}
              className="cursor-pointer rounded-full p-0.5 text-[13px] leading-none hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato disabled:cursor-not-allowed"
              aria-label={`Regenerate ${day.day}`}
              title={regenerating ? 'Cooking…' : `Regenerate ${day.day}`}
            >
              <span
                aria-hidden="true"
                className={regenerating ? 'inline-block animate-spin' : undefined}
              >
                🎲
              </span>
            </button>
          )}
        </div>
        <span
          className={`font-mono text-[11px] font-bold ${
            offTarget ? 'rounded bg-apricot px-1 text-tomato-deep' : 'text-lime-deep'
          }`}
          title={
            offTarget
              ? `${day.total_kcal} kcal — outside target ±10% (${target} kcal)`
              : `${day.total_kcal} kcal`
          }
        >
          {day.total_kcal}
        </span>
      </div>
      {macros && (
        <p
          className="mt-1 font-mono text-[10px] font-bold text-latte"
          title={`protein ${macros.p} g · fat ${macros.f} g · carbs ${macros.c} g`}
        >
          P {macros.p} · F {macros.f} · C {macros.c} g
        </p>
      )}
      <ul className={`mt-3 flex flex-1 flex-col gap-2 ${regenerating ? 'opacity-40' : ''}`}>
        {MEAL_ROWS.map(({ slot, label, accent }) => {
          const meal = day.meals[slot];
          const weight = formatWeight(mealWeight(meal));
          const isEaten = eaten?.includes(slot) ?? false;
          return (
            <li key={slot}>
              <button
                onClick={() => setOpenSlot(slot)}
                className={`w-full rounded-[9px] px-2 py-1.5 text-left hover:brightness-[.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato ${
                  isEaten ? 'bg-mint' : 'bg-cream'
                }`}
                aria-label={`${meal.name} — view ingredients`}
              >
                <p
                  className={`flex items-center justify-between gap-1 text-[9px] font-bold tracking-wide ${accent}`}
                >
                  <span>{label}</span>
                  {isEaten && (
                    <span className="text-lime-deep" title="Eaten" aria-label="Eaten">
                      ✓
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs font-semibold leading-tight">{meal.name}</p>
                <p className="font-mono text-[10px] font-bold text-sand">
                  {meal.kcal}
                  {weight && <span className="text-sand/70"> · {weight}</span>}
                </p>
              </button>
            </li>
          );
        })}
      </ul>

      <Modal
        open={openMeal !== null}
        onClose={() => setOpenSlot(null)}
        labelledBy="meal-ingredients-title"
      >
        {openMeal && openRow && (
          <>
            <p className={`text-[10px] font-bold tracking-wide ${openRow.accent}`}>
              {openRow.label} · {day.day.toUpperCase()}
            </p>
            <h2
              id="meal-ingredients-title"
              className="mt-1 font-display text-xl font-extrabold"
            >
              {openMeal.name}
            </h2>
            <p className="mt-0.5 font-mono text-xs font-bold text-sand">
              {openMeal.kcal} kcal
              {formatWeight(mealWeight(openMeal)) && (
                <span className="text-sand/70"> · {formatWeight(mealWeight(openMeal))}</span>
              )}
            </p>
            {mealMacros(openMeal) && (
              <p className="mt-0.5 font-mono text-xs font-bold text-latte">
                protein {openMeal.protein_g} g · fat {openMeal.fat_g} g · carbs {openMeal.carbs_g} g
              </p>
            )}
            {openMeal.ingredients.length > 0 ? (
              <ul className="mt-4 flex flex-col gap-1.5">
                {openMeal.ingredients.map((ing, i) => (
                  <li
                    key={`${ing.name}-${i}`}
                    className="flex items-baseline justify-between gap-3 rounded-[9px] bg-cream px-3 py-2 text-sm font-semibold"
                  >
                    <span>{ing.name}</span>
                    {formatWeight(ing.grams) && (
                      <span className="whitespace-nowrap font-mono text-xs font-bold text-latte">
                        {formatWeight(ing.grams)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-latte">No ingredient details for this meal.</p>
            )}
          </>
        )}
      </Modal>

      <Modal
        open={regenOpen}
        onClose={() => setRegenOpen(false)}
        labelledBy="regen-day-title"
      >
        <h2 id="regen-day-title" className="font-display text-xl font-extrabold">
          Regenerate {day.day} 🎲
        </h2>
        <p className="mt-1 text-sm font-semibold text-latte">
          All three meals for this day will be replaced. Tell the AI what
          you’re in the mood for, or leave empty for a surprise.
        </p>
        <textarea
          value={preference}
          onChange={(e) => setPreference(e.target.value)}
          placeholder="e.g. something with fish, lighter dinner, no soup"
          rows={3}
          maxLength={300}
          autoFocus
          className="mt-4 w-full rounded-xl border-2 border-peach-line bg-white px-3 py-2.5 text-sm font-medium focus:border-ink focus:outline-none"
          aria-label={`Your wishes for ${day.day}`}
        />
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setRegenOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setRegenOpen(false);
              setPreference('');
              onRegenerate?.(preference);
            }}
          >
            Regenerate 🎲
          </Button>
        </div>
      </Modal>
    </div>
  );
}
