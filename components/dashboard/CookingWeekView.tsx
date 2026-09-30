'use client';

import { useI18n } from '@/hooks/useI18n';
import { batchRemaining, cookingDates, nutritionPerServing, positionKey } from '@/lib/cookingPlan';
import { parseDateKey } from '@/lib/dates';
import type { CookingPlan, MealSlot } from '@/lib/schemas';

export function CookingWeekView({ plan, onlyDate, onEdit, disabled = false }: {
  plan: CookingPlan;
  onlyDate?: string;
  onEdit?: (at: { date: string; slot: MealSlot }) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const dates = cookingDates(plan).filter((date) => !onlyDate || date === onlyDate);
  if (!dates.length) return <p>{t.cooking.emptyToday}</p>;
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {dates.map((date) => <section key={date} className="rounded-3xl border-2 border-ink bg-paper p-4">
      <h2 className="mb-3 font-display text-lg font-extrabold">{parseDateKey(date).toLocaleDateString(t.intl, { weekday: 'short', day: 'numeric', month: 'short' })}</h2>
      <div className="space-y-3">{plan.slots.map((slot) => {
        const at = { date, slot };
        const assignment = plan.assignments.find((a) => positionKey(a) === positionKey(at));
        const batch = assignment?.kind === 'meal' ? plan.batches.find((b) => b.id === assignment.batchId) : undefined;
        const cooking = batch && positionKey(batch.cookAt) === positionKey(at);
        const kcal = batch && nutritionPerServing(batch.recipe).kcal;
        return <article key={slot} className="rounded-2xl bg-cream p-3">
          <h3 className="text-xs font-bold text-latte">{t.meals[slot]}</h3>
          <p className="mt-1 font-bold">{batch?.recipe.name ?? (assignment?.kind === 'away' ? t.cooking.away : t.cooking.empty)}</p>
          {batch && <div className="mt-2 space-y-1 text-sm">
            <p className="font-bold text-tomato">{cooking ? t.cooking.cook : t.cooking.reheat} · {t.cooking.forTwo}</p>
            {cooking ? <>
              <p>{t.cooking.portions(batch.servings)} · {t.cooking.remaining(batchRemaining(plan, batch.id))}</p>
              {batch.recipe.cookingMinutes !== undefined && <p>{t.cooking.minutes}: {batch.recipe.cookingMinutes}</p>}
              {batch.recipe.attention && <p>{t.cooking.attentionLevels[batch.recipe.attention]}</p>}
            </> : <p>{t.cooking.source}: {parseDateKey(batch.cookAt.date).toLocaleDateString(t.intl, { day: 'numeric', month: 'short' })} · {t.meals[batch.cookAt.slot]}</p>}
            {batch.recipe.classification === 'experimental' && <p className="font-bold">{t.cooking.experimental}</p>}
            <p className="text-latte">{kcal === undefined ? t.cooking.nutritionUnknown : t.cooking.perServing(kcal)}</p>
            <details><summary className="cursor-pointer">{t.cooking.recipe} · {t.cooking.portions(batch.servings)}</summary>
              <ul className="mt-2 space-y-1">{batch.recipe.ingredients.map((i, index) => <li key={index}>{i.name}: {i.grams === undefined ? t.cooking.unknown : `${Math.round(i.grams * batch.servings / batch.recipe.recipeServings)} ${t.units.g}`}</li>)}</ul>
            </details>
          </div>}
          {onEdit && <button disabled={disabled} onClick={() => onEdit(at)} className="mt-3 rounded-full border-2 border-ink px-4 py-1 text-sm font-bold disabled:opacity-50">{assignment ? t.cooking.edit : t.cooking.cook}</button>}
        </article>;
      })}</div>
    </section>)}
  </div>;
}
