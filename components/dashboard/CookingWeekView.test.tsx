import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { uk } from '@/lib/i18n/uk';
import { applyCookingAction, createCookingPlan } from '@/lib/cookingPlan';
import type { Dish } from '@/lib/schemas';
import { CookingWeekView } from './CookingWeekView';

vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: uk }) }));
const recipe: Dish = { id: 'dish', name: 'Суп', createdAt: '', classification: 'regular', recipeServings: 2, cookingMinutes: 25, ingredients: [{ name: 'Картопля', grams: 400 }] };
function plan(kcal?: number) {
  const empty = createCookingPlan('id', '2026-09-28', 3, ['lunch', 'dinner'], '');
  const cooked = applyCookingAction(empty, { type: 'cook', at: { date: '2026-09-28', slot: 'dinner' }, dishId: recipe.id, servings: 4 }, { ...recipe, kcal }, 'batch');
  return applyCookingAction(cooked, { type: 'reuse', at: { date: '2026-09-29', slot: 'lunch' }, batchId: 'batch' });
}

describe('shared cooking cards', () => {
  it('shows cooking, reheating and unknown nutrition without a fabricated zero', () => {
    const html = renderToStaticMarkup(<CookingWeekView plan={plan()} />);
    expect(html).toContain(uk.cooking.cook);
    expect(html).toContain(uk.cooking.reheat);
    expect(html).toContain(uk.cooking.nutritionUnknown);
    expect(html).not.toContain(uk.cooking.perServing(0));
    expect(html).toContain('800');
    expect(html).toContain(uk.cooking.remaining(0));
  });
  it('displays recipe nutrition per portion, including explicit zero', () => {
    expect(renderToStaticMarkup(<CookingWeekView plan={plan(800)} />)).toContain(uk.cooking.perServing(400));
    expect(renderToStaticMarkup(<CookingWeekView plan={plan(0)} />)).toContain(uk.cooking.perServing(0));
  });
  it('shows only today and provides an empty state outside the plan', () => {
    const html = renderToStaticMarkup(<CookingWeekView plan={plan()} onlyDate="2026-09-29" />);
    expect(html).toContain(uk.cooking.reheat);
    expect(html).not.toContain(uk.cooking.minutes);
    expect(renderToStaticMarkup(<CookingWeekView plan={plan()} onlyDate="2026-10-01" />)).toContain(uk.cooking.emptyToday);
  });
});
