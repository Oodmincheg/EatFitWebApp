'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShoppingList } from '@/components/dashboard/ShoppingList';
import { StorePicker } from '@/components/dashboard/StorePicker';
import { useSession } from '@/hooks/useSession';
import { PENDING_CART_KEY, type StoreOption } from '@/lib/stores';
import type { OrderItem } from '@/lib/schemas';

export default function IngredientsPage() {
  const { profile, plan } = useSession();
  const router = useRouter();
  const [pending, setPending] = useState<OrderItem[] | null>(null);

  if (!profile) return null;

  const pickStore = (store: StoreOption) => {
    try {
      sessionStorage.setItem(
        PENDING_CART_KEY,
        JSON.stringify({ items: pending, storeId: store.id })
      );
    } catch {
      // Storage unavailable — the Cart page will show its empty state.
    }
    router.push('/dashboard/cart');
  };

  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-extrabold">Ingredients</h1>
        <p className="mt-0.5 text-sm font-semibold text-latte">
          Groceries for your current menu — tick off what you&rsquo;ve got, then build a cart.
        </p>
      </div>

      {plan ? (
        <ShoppingList plan={plan} ownedRaw={profile.ingredients} onOrder={setPending} />
      ) : (
        <div className="rounded-3xl border-2 border-dashed border-sand py-12 text-center">
          <p className="text-3xl" aria-hidden="true">
            🥕
          </p>
          <p className="mt-3 font-display text-lg font-extrabold">Nothing to buy yet</p>
          <p className="mt-1 text-sm text-latte">
            <Link
              href="/dashboard/plan"
              className="font-bold text-tomato underline-offset-2 hover:underline"
            >
              Generate a weekly menu
            </Link>{' '}
            to build your shopping list.
          </p>
        </div>
      )}

      <StorePicker open={pending !== null} onPick={pickStore} onClose={() => setPending(null)} />
    </>
  );
}
