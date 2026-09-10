'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SilpoCart } from '@/components/dashboard/SilpoCart';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';
import { useOrders } from '@/hooks/useOrders';
import { usePantry } from '@/hooks/usePantry';
import { replenishPantry } from '@/lib/pantry';
import { PENDING_CART_KEY } from '@/lib/stores';
import type { OrderItem, PantryItem } from '@/lib/schemas';

export default function CartPage() {
  const { t } = useI18n();
  const { profile } = useSession();
  const { placeOrder } = useOrders();
  const { pantry, saving, save } = usePantry();
  const toast = useToast();
  // Offered once the cart is written: what was just bought is now at home.
  // Holds the committed lines, not the original request — unmatched and
  // excluded rows never reach the pantry. `key` identifies one commit so the
  // same groceries cannot be counted into the pantry twice.
  const [purchase, setPurchase] = useState<{ key: string; items: PantryItem[] } | null>(null);
  const [imported, setImported] = useState<string[]>([]);
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
        <>
          <SilpoCart
            items={items}
            onCommitted={(result, bought) => {
              const key = `${result.cartId}:${bought
                .map((i) => `${i.name}=${i.amount ?? ''}${i.unit ?? ''}`)
                .join('|')}`;
              setPurchase(bought.length > 0 ? { key, items: bought } : null);
              placeOrder(items).catch(() => {});
            }}
          />
          {purchase && !imported.includes(purchase.key) && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-ink bg-peach px-4 py-3 text-sm font-semibold">
              <span>
                <span aria-hidden="true">🧊 </span>
                {t.pantry.subtitle}
              </span>
              <Button
                variant="secondary"
                disabled={saving}
                onClick={async () => {
                  try {
                    await save(replenishPantry(pantry, purchase.items));
                    setImported((prev) => [...prev, purchase.key]);
                    setPurchase(null);
                    toast(t.pantry.fromCartDone);
                  } catch {
                    toast(t.pantry.saveFailed);
                  }
                }}
              >
                {t.pantry.fromCart}
              </Button>
            </div>
          )}
        </>
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
