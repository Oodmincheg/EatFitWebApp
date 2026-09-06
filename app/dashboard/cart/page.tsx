'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SilpoCart } from '@/components/dashboard/SilpoCart';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/hooks/useSession';
import { useOrders } from '@/hooks/useOrders';
import { PENDING_CART_KEY } from '@/lib/stores';
import type { OrderItem } from '@/lib/schemas';

// /api/auth/silpo/* redirect back here with ?silpo=<outcome>.
const LINK_MESSAGES: Record<string, string> = {
  linked: 'Silpo account connected.',
  denied: 'Silpo sign-in was cancelled.',
  state_mismatch: 'Silpo sign-in could not be verified. Try again.',
  error: 'Could not connect to Silpo. Try again.',
};

export default function CartPage() {
  const { profile } = useSession();
  const { placeOrder } = useOrders();
  const toast = useToast();
  // undefined = still reading storage; null = nothing handed off.
  const [items, setItems] = useState<OrderItem[] | null | undefined>(undefined);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_CART_KEY);
      const parsed = raw ? (JSON.parse(raw) as { items?: OrderItem[] }) : null;
      setItems(parsed?.items?.length ? parsed.items : null);
    } catch {
      setItems(null);
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get('silpo');
    if (!outcome) return;
    toast(LINK_MESSAGES[outcome] ?? LINK_MESSAGES.error);
    url.searchParams.delete('silpo');
    window.history.replaceState(null, '', url.toString());
  }, [toast]);

  if (!profile) return null;

  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-extrabold">Cart</h1>
        <p className="mt-0.5 text-sm font-semibold text-latte">
          Your shopping list matched to real Silpo products and added to your Silpo cart.
        </p>
      </div>

      {items ? (
        <SilpoCart items={items} onCommitted={() => placeOrder(items).catch(() => {})} />
      ) : items === null ? (
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
            to build your cart.
          </p>
        </div>
      ) : null}
    </>
  );
}
