'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { formatWeight } from '@/lib/shopping';
import type { OrderItem, ZakazCart as ZakazCartData } from '@/lib/schemas';

type State =
  | { phase: 'loading' }
  | { phase: 'loaded'; cart: ZakazCartData }
  | { phase: 'error' };

const hryvnia = (kop: number) => `₴${(kop / 100).toFixed(2)}`;

async function fetchCart(items: OrderItem[], storeId: string): Promise<ZakazCartData> {
  const res = await fetch('/api/cart/zakaz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, storeId }),
  });
  if (!res.ok) throw new Error('cart_failed');
  return res.json();
}

export function ZakazCart({
  items,
  storeId,
  onCheckout,
  onChangeStore,
  onClose,
}: {
  items: OrderItem[];
  storeId: string;
  onCheckout?: () => void;
  onChangeStore?: () => void;
  onClose?: () => void;
}) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  // Refetch whenever the requested items or the chosen store change.
  const key = `${storeId}:${items.map((i) => i.name).join('|')}`;

  useEffect(() => {
    let cancelled = false;
    setState({ phase: 'loading' });
    fetchCart(items, storeId)
      .then((cart) => !cancelled && setState({ phase: 'loaded', cart }))
      .catch(() => !cancelled && setState({ phase: 'error' }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <section className="rounded-[20px] border-2 border-ink bg-cream p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-extrabold">
          {state.phase === 'loaded'
            ? `🛒 Your cart in ${state.cart.store.name}`
            : '🛒 Building your cart…'}
        </h2>
        <div className="flex items-center gap-3">
          {onChangeStore && (
            <button
              onClick={onChangeStore}
              className="text-xs font-bold text-tomato underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
            >
              Change store
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="text-xs font-bold text-latte underline-offset-2 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
            >
              Hide
            </button>
          )}
        </div>
      </div>

      {state.phase === 'loading' && (
        <ul className="mt-4 flex flex-col gap-2">
          {items.slice(0, 6).map((it) => (
            <li
              key={it.name}
              className="flex items-center gap-3 rounded-xl border-2 border-sand bg-white p-2.5"
            >
              <span className="h-12 w-12 shrink-0 animate-pulse rounded-lg bg-sand" />
              <span className="h-3 flex-1 animate-pulse rounded bg-sand" />
            </li>
          ))}
          <li className="mt-1 text-center text-xs font-semibold text-latte">
            Matching {items.length} {items.length === 1 ? 'item' : 'items'} to real products…
          </li>
        </ul>
      )}

      {state.phase === 'error' && (
        <div className="mt-4 rounded-xl border-2 border-sand bg-white p-4 text-center">
          <p className="font-semibold text-ink">Couldn&rsquo;t reach the store</p>
          <p className="mt-1 text-sm text-latte">
            Your shopping list above is still ready — try building the cart again in a moment.
          </p>
          <div className="mt-3">
            <Button variant="secondary" onClick={() => setState({ phase: 'loading' })}>
              Try again
            </Button>
          </div>
        </div>
      )}

      {state.phase === 'loaded' && (
        <ZakazCartBody cart={state.cart} onCheckout={onCheckout} />
      )}
    </section>
  );
}

function ZakazCartBody({
  cart,
  onCheckout,
}: {
  cart: ZakazCartData;
  onCheckout?: () => void;
}) {
  return (
    <>
      <p className="mt-1 text-sm font-semibold text-latte">
        {cart.matchedCount}/{cart.lines.length} matched · ≈{hryvnia(cart.totalKop)}
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {cart.lines.map((line) =>
          line.product ? (
            <li
              key={line.query}
              className="flex items-center gap-3 rounded-xl border-2 border-sand bg-white p-2.5"
            >
              {line.product.img ? (
                <Image
                  src={line.product.img}
                  alt=""
                  width={48}
                  height={48}
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  unoptimized
                />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-peach text-xl">
                  🛍️
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{line.product.title}</p>
                <p className="text-xs font-bold text-latte">
                  {hryvnia(line.product.priceKop)}
                  {line.quantity > 1 && <span> × {line.quantity}</span>}
                  {line.neededGrams > 0 && (
                    <span className="ml-2 font-mono font-normal text-sand">
                      need {formatWeight(line.neededGrams)}
                    </span>
                  )}
                </p>
              </div>
              <a
                href={line.product.webUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-full bg-ink px-3.5 py-2 text-xs font-bold whitespace-nowrap text-white hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
              >
                Open in {cart.store.chain} ↗
              </a>
            </li>
          ) : (
            <li
              key={line.query}
              className="flex items-center gap-3 rounded-xl border-2 border-dashed border-sand bg-white/60 p-2.5"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-sand/50 text-xl">
                🔍
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold capitalize text-ink">{line.query}</p>
                <p className="text-xs font-semibold text-latte">No exact match — search it</p>
              </div>
              <a
                href={line.searchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-full border-2 border-ink px-3.5 py-2 text-xs font-bold whitespace-nowrap text-ink hover:bg-peach focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
              >
                Search ↗
              </a>
            </li>
          )
        )}
      </ul>

      <div className="mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-latte">
          Prices &amp; stock are live from {cart.store.chain}. Add items on the store to finish your
          order.
        </p>
        <a
          href={cart.store.home}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onCheckout?.()}
          className="shrink-0 rounded-full bg-tomato px-5 py-3 text-center text-sm font-bold text-white shadow-[0_4px_0_var(--color-tomato-deep)] transition-all hover:bg-tomato-deep active:translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
        >
          Open {cart.store.name} to checkout ↗
        </a>
      </div>
    </>
  );
}
