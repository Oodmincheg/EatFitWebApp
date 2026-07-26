'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ZakazCart } from '@/components/dashboard/ZakazCart';
import { StorePicker } from '@/components/dashboard/StorePicker';
import { useSession } from '@/hooks/useSession';
import { useOrders } from '@/hooks/useOrders';
import { PENDING_CART_KEY, type StoreOption } from '@/lib/stores';
import type { OrderItem } from '@/lib/schemas';

type Pending = { items: OrderItem[]; storeId: string };

export default function CartPage() {
  const { profile } = useSession();
  const { placeOrder } = useOrders();
  // undefined = still reading storage; null = nothing handed off.
  const [pending, setPending] = useState<Pending | null | undefined>(undefined);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_CART_KEY);
      const parsed = raw ? (JSON.parse(raw) as Pending) : null;
      setPending(parsed?.items?.length ? parsed : null);
    } catch {
      setPending(null);
    }
  }, []);

  if (!profile) return null;

  const changeStore = (store: StoreOption) => {
    setPending((prev) => {
      if (!prev) return prev;
      const next = { ...prev, storeId: store.id };
      try {
        sessionStorage.setItem(PENDING_CART_KEY, JSON.stringify(next));
      } catch {
        // Non-fatal — the store still updates in memory for this view.
      }
      return next;
    });
    setPicking(false);
  };

  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-extrabold">Cart</h1>
        <p className="mt-0.5 text-sm font-semibold text-latte">
          Your shopping list matched to real products — open each in the store to order.
        </p>
      </div>

      {pending ? (
        <ZakazCart
          items={pending.items}
          storeId={pending.storeId}
          onCheckout={() => placeOrder(pending.items).catch(() => {})}
          onChangeStore={() => setPicking(true)}
        />
      ) : pending === null ? (
        <div className="rounded-3xl border-2 border-dashed border-sand py-12 text-center">
          <p className="text-3xl" aria-hidden="true">
            🛒
          </p>
          <p className="mt-3 font-display text-lg font-extrabold">Your cart is empty</p>
          <p className="mt-1 text-sm text-latte">
            Head to{' '}
            <Link
              href="/dashboard/ingredients"
              className="font-bold text-tomato underline-offset-2 hover:underline"
            >
              Ingredients
            </Link>{' '}
            to pick a store and build your cart.
          </p>
        </div>
      ) : null}

      <StorePicker open={picking} onPick={changeStore} onClose={() => setPicking(false)} />
    </>
  );
}
