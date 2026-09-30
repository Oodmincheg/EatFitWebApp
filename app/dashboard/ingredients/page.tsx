'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShoppingList } from '@/components/dashboard/ShoppingList';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';
import { cookingShoppingSource, incompleteShopping } from '@/lib/cookingPlan';
import { PENDING_CART_KEY } from '@/lib/stores';
import type { OrderItem } from '@/lib/schemas';

export default function IngredientsPage() {
  const { t } = useI18n();
  const { profile, plan: legacyPlan, cookingPlan } = useSession();
  const plan = cookingPlan ? cookingShoppingSource(cookingPlan) : legacyPlan;
  const missing = cookingPlan ? incompleteShopping(cookingPlan) : [];
  const router = useRouter();

  if (!profile) return null;

  // Hand the to-buy list to the Cart page, which matches it against Silpo.
  const buildCart = (items: OrderItem[]) => {
    try {
      sessionStorage.setItem(PENDING_CART_KEY, JSON.stringify({ items }));
    } catch {
      // Storage unavailable — the Cart page will show its empty state.
    }
    router.push('/dashboard/cart');
  };

  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-extrabold">{t.ingredients.title}</h1>
        <p className="mt-0.5 text-sm font-semibold text-latte">{t.ingredients.subtitle}</p>
      </div>

      {cookingPlan && cookingPlan.assignments.length < cookingPlan.dayCount * cookingPlan.slots.length && <p className="rounded-2xl bg-peach p-4">{t.cooking.partialPlanShopping}</p>}
      {missing.length > 0 && <div role="status" className="rounded-2xl bg-peach p-4">
        <p>{t.cooking.incompleteShopping}</p><p className="font-bold">{[...new Set(missing)].join(', ')}</p>
        <Link href="/dashboard/plan" className="underline">{t.cooking.openPlan}</Link>
      </div>}
      {plan ? (
        <ShoppingList plan={plan} pantry={profile.pantry} onOrder={buildCart} incomplete={missing.length > 0} />
      ) : (
        <div className="rounded-3xl border-2 border-dashed border-sand py-12 text-center">
          <p className="text-3xl" aria-hidden="true">
            🥕
          </p>
          <p className="mt-3 font-display text-lg font-extrabold">{t.ingredients.empty}</p>
          <p className="mt-1 text-sm text-latte">
            <Link
              href="/dashboard/plan"
              className="font-bold text-tomato underline-offset-2 hover:underline"
            >
              {t.ingredients.emptyLink}
            </Link>
            {t.ingredients.emptyText}
          </p>
        </div>
      )}
    </>
  );
}
