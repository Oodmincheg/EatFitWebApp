'use client';
import { z } from 'zod';
import { SilpoCartSchema, SilpoCommitResultSchema } from '@/lib/schemas';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from './useI18n';
import type { OrderItem, SilpoCart as SilpoCartData, SilpoCartLine, SilpoCommitResult, SilpoProduct } from '@/lib/schemas';
import { suggestQuantity } from '@/lib/silpo/quantity';
import { commitLines, exceedsStock, lineMax, updateReviewCart } from '@/lib/silpo/review';
type Quantities = Record<string, number>; // by line.query; 0 = left out

type State =
  | { phase: 'loading' }
  | { phase: 'unlinked' }
  | { phase: 'no_cart' }
  | { phase: 'error'; detail?: string }
  | { phase: 'review'; cart: SilpoCartData; quantities: Quantities; committing: boolean; commitError?: string }
  | { phase: 'committed'; cart: SilpoCartData; quantities: Quantities; result: SilpoCommitResult };

class CartError extends Error {
  constructor(
    public readonly kind: 'unlinked' | 'no_cart' | 'error',
    public readonly detail?: string
  ) {
    super(kind);
  }
}

async function postJson<T>(url: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) return schema.parse(await res.json());
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.error === 'silpo_unlinked') throw new CartError('unlinked');
  if (res.status === 409 && data.error === 'no_cart') throw new CartError('no_cart');
  throw new CartError('error', typeof data.detail === 'string' ? data.detail : undefined);
}

function initialQuantities(cart: SilpoCartData): Quantities {
  return Object.fromEntries(
    cart.lines.filter((l) => l.product).map((l) => [l.query, l.quantity])
  );
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function useSilpoCart(items: OrderItem[], onCommitted?: (result: SilpoCommitResult, items: OrderItem[]) => void) {
  const { t } = useI18n();
  const s = t.silpo;
  const [state, setState] = useState<State>({ phase: 'loading' });
  const key = JSON.stringify(items);

  const load = useCallback(() => {
    let cancelled = false;
    setState({ phase: 'loading' });
    postJson<SilpoCartData>('/api/cart/silpo', { items: JSON.parse(key) }, SilpoCartSchema)
      .then((cart) => {
        if (cancelled) return;
        setState({ phase: 'review', cart, quantities: initialQuantities(cart), committing: false });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const err = e instanceof CartError ? e : new CartError('error');
        setState(err.kind === 'error' ? { phase: 'error', detail: err.detail } : { phase: err.kind });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(load, [load]);

  const connect = () => {
    window.location.href = '/api/auth/silpo/start';
  };

  const setQuantity = (line: SilpoCartLine, next: number) => {
    setState((prev) => {
      if (prev.phase !== 'review' || prev.committing) return prev;
      const clamped = next <= 0 ? 0 : Math.min(lineMax(line), round3(next));
      const quantities = { ...prev.quantities, [line.query]: clamped };
      return { ...prev, cart: updateReviewCart(prev.cart, quantities), quantities };
    });
  };

  const commit = async () => {
    if (state.phase !== 'review' || state.committing) return;
    const { cart, quantities } = state;
    const lines = commitLines(cart.lines, quantities);
    if (lines.length === 0 || exceedsStock(cart.lines, quantities)) return;
    setState({ ...state, committing: true, commitError: undefined });
    try {
      const result = await postJson<SilpoCommitResult>('/api/cart/silpo/commit', {
        cartId: cart.cartId,
        ...(cart.timeslot.stale ? { timeslot: { start: cart.timeslot.start, end: cart.timeslot.end } } : {}),
        lines,
      }, SilpoCommitResultSchema);
      setState({ phase: 'committed', cart, quantities, result });
      onCommitted?.(result, cart.lines.filter((l) => l.product && quantities[l.query] > 0)
        .map((l) => ({ name: l.query, grams: l.neededGrams })));
    } catch (e) {
      const err = e instanceof CartError ? e : new CartError('error');
      if (err.kind === 'unlinked') setState({ phase: 'unlinked' });
      else setState({ ...state, committing: false, commitError: err.detail ?? s.commitFailed });
    }
  };

  const replaceProduct = (line: SilpoCartLine, product: SilpoProduct) => {
    setState((prev) => {
      if (prev.phase !== 'review' || prev.committing) return prev;
      const quantity = suggestQuantity(line.neededGrams, product);
      const lines = prev.cart.lines.map((l) => l.query === line.query
        ? { ...l, product, quantity, lineTotal: product.price * quantity } : l);
      const quantities = { ...prev.quantities, [line.query]: quantity };
      return { ...prev, cart: updateReviewCart({ ...prev.cart, lines }, quantities), quantities };
    });
  };
  return { state, load, connect, setQuantity, replaceProduct, commit };
}
