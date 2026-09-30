import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uk } from '@/lib/i18n/uk';
import type { MealPlan } from '@/lib/schemas';
import PlanPage from './page';

const state = vi.hoisted(() => ({ plan: null as MealPlan | null, generating: false }));

vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: uk }) }));
vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({
    profile: {
      createdAt: '2026-09-01T00:00:00Z',
      calorieTarget: 2500,
      mealSlots: ['breakfast', 'afternoon_snack', 'dinner'],
      pantry: [],
      dietaryTags: [],
    },
  }),
}));
vi.mock('@/hooks/usePlan', () => ({
  usePlan: () => ({
    plan: state.plan,
    generating: state.generating,
    regeneratingDay: null,
    regeneratingMeal: null,
    error: 'upstream_error',
    generate: vi.fn(),
    regenerateDay: vi.fn(),
    regenerateMeal: vi.fn(),
  }),
}));
vi.mock('@/hooks/usePins', () => ({
  usePins: () => ({ pins: { Wednesday: { afternoon_snack: 'shake' } }, pin: vi.fn() }),
}));
vi.mock('@/hooks/useDishes', () => ({
  useDishes: () => ({ dishes: [{ id: 'shake', name: 'Шейк', kcal: 270 }], loading: false }),
}));
vi.mock('@/hooks/useProgress', () => ({ useProgress: () => ({ byDate: {} }) }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => vi.fn() }));
vi.mock('@/components/dashboard/SummaryCard', () => ({ SummaryCard: () => null }));
vi.mock('@/components/dashboard/FridgeModal', () => ({ FridgeModal: () => null }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 21, 17));
  state.generating = false;
  state.plan = {
    generatedAt: '2026-09-15T10:00:00Z',
    startDate: '2026-09-16',
    days: [{
      day: 'Wednesday',
      total_kcal: 270,
      meals: { afternoon_snack: { name: 'Шейк', kcal: 270, ingredients: [], dishId: 'shake' } },
    }],
  };
});

afterEach(() => vi.useRealTimers());

describe('recurring pin access', () => {
  it('keeps the pin editor available after a plan expires and regeneration fails', () => {
    const html = renderToStaticMarkup(<PlanPage />);
    expect(html).toContain(uk.plan.upstream);
    expect(html).toContain(uk.pins.templateTitle);
    expect(html).toContain('id="week-template"');
    expect(html).toMatch(/datetime="2026-09-16"/i);
    expect(html).not.toContain(uk.day.regenerateAria(uk.days.Wednesday.acc));
  });

  it.each(['2026-09-21', '2026-09-23'])('offers meal editing and recurring pins for %s', (date) => {
    state.plan!.startDate = date;
    const day = date === '2026-09-21' ? 'Monday' : 'Wednesday';
    state.plan!.days[0].day = day;
    const html = renderToStaticMarkup(<PlanPage />);
    expect(html).toContain(uk.pins.templateTitle);
    expect(html).toContain(uk.day.regenerateAria(uk.days[day].acc));
  });

  it('keeps the pin editor available before the first plan', () => {
    state.plan = null;
    expect(renderToStaticMarkup(<PlanPage />)).toContain(uk.pins.templateTitle);
  });

  it('does not offer pin edits while generation is running', () => {
    state.generating = true;
    expect(renderToStaticMarkup(<PlanPage />)).not.toContain(uk.pins.templateTitle);
  });
});
