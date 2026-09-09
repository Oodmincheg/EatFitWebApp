'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SilpoCart } from '@/components/dashboard/SilpoCart';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';
import { useOrders } from '@/hooks/useOrders';
import { PENDING_CART_KEY } from '@/lib/stores';
import type { OrderItem } from '@/lib/schemas';

export default function CartPage() {
  const { t } = useI18n();
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

  // /api/auth/silpo/* redirect back here with ?silpo=<outcome>.
  useEffect(() => {
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get('silpo');
    if (!outcome) return;
    toast(t.cartPage.link[outcome] ?? t.cartPage.link.error);
    url.searchParams.delete('silpo');
    window.history.replaceState(null, '', url.toString());
  }, [toast, t]);

  if (!profile) return null;

  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-extrabold">{t.cartPage.title}</h1>
        <p className="mt-0.5 text-sm font-semibold text-latte">{t.cartPage.subtitle}</p>
      </div>

      {items ? (
        <SilpoCart items={items} onCommitted={(_, selectedItems) => placeOrder(selectedItems).catch(() => {})} />
      ) : items === null ? (
        <div className="rounded-3xl border-2 border-dashed border-sand py-12 text-center">
          <p className="text-3xl" aria-hidden="true">
            🛒
          </p>
          <p className="mt-3 font-display text-lg font-extrabold">{t.cartPage.empty}</p>
          <p className="mt-1 text-sm text-latte">
            {t.cartPage.emptyBefore}
            <Link
              href="/dashboard/ingredients"
              className="font-bold text-tomato underline-offset-2 hover:underline"
            >
              {t.cartPage.emptyLink}
            </Link>
            {t.cartPage.emptyAfter}
          </p>
        </div>
      ) : null}
    </>
  );
}
