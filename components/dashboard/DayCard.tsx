'use client';

import { useState } from 'react';
import { DishPicker } from './DishPicker';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/hooks/useI18n';
import { formatWeight } from '@/lib/shopping';
import type { DayPlan, Meal, MealSlot } from '@/lib/schemas';

const MEAL_ROWS: { slot: MealSlot; accent: string }[] = [
  { slot: 'breakfast', accent: 'text-tomato' },
  { slot: 'lunch', accent: 'text-lime-deep' },
  { slot: 'dinner', accent: 'text-tomato-deep' },
];

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
  onPin,
  regenerating = false,
}: {
  day: DayPlan;
  target: number;
  eaten?: MealSlot[];
  // Present only for today/future days — past days are history.
  onRegenerate?: (preference: string) => void;
  // Pin one of the user's dishes into a slot (null = unpin); same day rule.
  onPin?: (slot: MealSlot, dishId: string | null) => void;
  regenerating?: boolean;
}) {
  const { t } = useI18n();
  const dayText = t.days[day.day];
  const offTarget = Math.abs(day.total_kcal - target) > target * 0.1;
  const macros = dayMacros(day);
  const [openSlot, setOpenSlot] = useState<MealSlot | null>(null);
  const [pickerSlot, setPickerSlot] = useState<MealSlot | null>(null);
  const [regenOpen, setRegenOpen] = useState(false);
  const [preference, setPreference] = useState('');
  const openRow = MEAL_ROWS.find((r) => r.slot === openSlot);
  const openMeal = openSlot ? day.meals[openSlot] : null;
  const openMacros = openMeal ? mealMacros(openMeal) : null;

  return (
    <div className="flex flex-col rounded-2xl border-2 border-ink bg-white p-3">
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-1">
          <h3 className="font-display text-[15px] font-extrabold" title={dayText.label}>
            {dayText.short}
          </h3>
          {onRegenerate && (
            <button
              onClick={() => setRegenOpen(true)}
              disabled={regenerating}
              className="cursor-pointer rounded-full p-0.5 text-[13px] leading-none hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato disabled:cursor-not-allowed"
              aria-label={t.day.regenerateAria(dayText.acc)}
              title={regenerating ? t.day.cooking : t.day.regenerateAria(dayText.acc)}
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
            offTarget ? t.day.offTarget(day.total_kcal, target) : t.day.kcalTitle(day.total_kcal)
          }
        >
          {day.total_kcal}
        </span>
      </div>
      {macros && (
        <p
          className="mt-1 font-mono text-[10px] font-bold text-latte"
          title={t.day.macrosTitle(macros.p, macros.f, macros.c)}
        >
          {t.day.macrosShort(macros.p, macros.f, macros.c)}
        </p>
      )}
      <ul className={`mt-3 flex flex-1 flex-col gap-2 ${regenerating ? 'opacity-40' : ''}`}>
        {MEAL_ROWS.map(({ slot, accent }) => {
          const meal = day.meals[slot];
          const weight = formatWeight(mealWeight(meal), t.units, t.intl);
          const isEaten = eaten?.includes(slot) ?? false;
          return (
            <li key={slot}>
              <button
                onClick={() => setOpenSlot(slot)}
                className={`w-full rounded-[9px] px-2 py-1.5 text-left hover:brightness-[.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato ${
                  isEaten ? 'bg-mint' : meal.dishId ? 'bg-peach' : 'bg-cream'
                }`}
                aria-label={t.day.viewIngredients(meal.name)}
              >
                <p
                  className={`flex items-center justify-between gap-1 text-[9px] font-bold tracking-wide ${accent}`}
                >
                  <span>
                    {t.mealLabels[slot]}
                    {meal.dishId && (
                      <span className="ml-1" title={t.pins.pinned} aria-label={t.pins.pinned}>
                        📌
                      </span>
                    )}
                  </span>
                  {isEaten && (
                    <span className="text-lime-deep" title={t.day.eaten} aria-label={t.day.eaten}>
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
              {t.mealLabels[openRow.slot]} · {dayText.label.toUpperCase()}
              {openMeal.dishId && <span className="ml-1.5 text-latte">📌 {t.pins.pinned}</span>}
            </p>
            <h2
              id="meal-ingredients-title"
              className="mt-1 font-display text-xl font-extrabold"
            >
              {openMeal.name}
            </h2>
            <p className="mt-0.5 font-mono text-xs font-bold text-sand">
              {openMeal.kcal} {t.units.kcal}
              {formatWeight(mealWeight(openMeal), t.units, t.intl) && (
                <span className="text-sand/70"> · {formatWeight(mealWeight(openMeal), t.units, t.intl)}</span>
              )}
            </p>
            {openMacros && (
              <p className="mt-0.5 font-mono text-xs font-bold text-latte">
                {t.day.macrosTitle(openMacros.p, openMacros.f, openMacros.c)}
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
                    {formatWeight(ing.grams, t.units, t.intl) && (
                      <span className="whitespace-nowrap font-mono text-xs font-bold text-latte">
                        {formatWeight(ing.grams, t.units, t.intl)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-latte">{t.day.noIngredients}</p>
            )}
            {onPin && (
              <div className="mt-5 flex flex-wrap justify-end gap-3">
                {openMeal.dishId && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      onPin(openRow.slot, null);
                      setOpenSlot(null);
                    }}
                  >
                    {t.pins.unpin}
                  </Button>
                )}
                <Button
                  onClick={() => {
                    setPickerSlot(openRow.slot);
                    setOpenSlot(null);
                  }}
                >
                  {t.pins.pin}
                </Button>
              </div>
            )}
          </>
        )}
      </Modal>

      {onPin && (
        <DishPicker
          open={pickerSlot !== null}
          title={pickerSlot ? t.pins.pickTitle(t.meals[pickerSlot], dayText.label) : ''}
          currentId={pickerSlot ? day.meals[pickerSlot].dishId : undefined}
          onPick={(id) => {
            if (pickerSlot) onPin(pickerSlot, id);
            setPickerSlot(null);
          }}
          onUnpin={() => {
            if (pickerSlot) onPin(pickerSlot, null);
            setPickerSlot(null);
          }}
          onClose={() => setPickerSlot(null)}
        />
      )}

      <Modal
        open={regenOpen}
        onClose={() => setRegenOpen(false)}
        labelledBy="regen-day-title"
      >
        <h2 id="regen-day-title" className="font-display text-xl font-extrabold">
          {t.day.regenTitle(dayText.acc)}
        </h2>
        <p className="mt-1 text-sm font-semibold text-latte">{t.day.regenText}</p>
        <textarea
          value={preference}
          onChange={(e) => setPreference(e.target.value)}
          placeholder={t.day.regenPlaceholder}
          rows={3}
          maxLength={300}
          autoFocus
          className="mt-4 w-full rounded-xl border-2 border-peach-line bg-white px-3 py-2.5 text-sm font-medium focus:border-ink focus:outline-none"
          aria-label={t.day.regenAria(dayText.acc)}
        />
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setRegenOpen(false)}>
            {t.common.cancel}
          </Button>
          <Button
            onClick={() => {
              setRegenOpen(false);
              setPreference('');
              onRegenerate?.(preference);
            }}
          >
            {t.day.regenButton}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
