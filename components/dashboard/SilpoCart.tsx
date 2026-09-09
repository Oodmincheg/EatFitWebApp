'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/hooks/useI18n';
import type { Dict } from '@/lib/i18n';
import { formatWeight } from '@/lib/shopping';
import type {
  OrderItem,
  SilpoCart as SilpoCartData,
  SilpoCartLine,
  SilpoCommitResult,
  SilpoValidation,
} from '@/lib/schemas';

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

const uah = (n: number) => `₴${n.toFixed(2)}`;

function formatSlot(t: Dict, start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const day = s.toLocaleDateString(t.intl, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = (d: Date) => d.toLocaleTimeString(t.intl, { hour: 'numeric', minute: '2-digit' });
  return t.silpo.slot(day, time(s), time(e));
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) return res.json();
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

function lineStep(line: SilpoCartLine): number {
  return line.product?.weighted ? line.product.step || 0.1 : 1;
}

function lineMax(line: SilpoCartLine): number {
  const p = line.product;
  if (!p) return 0;
  if (p.weighted) {
    const step = lineStep(line);
    return Math.min(20, Math.max(step, Math.floor(p.stock / step) * step));
  }
  return Math.min(20, Math.max(1, Math.floor(p.stock)));
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function SilpoCart({
  items,
  onCommitted,
}: {
  items: OrderItem[];
  onCommitted?: (result: SilpoCommitResult) => void;
}) {
  const { t } = useI18n();
  const s = t.silpo;
  const [state, setState] = useState<State>({ phase: 'loading' });
  const key = items.map((i) => i.name).join('|');

  const load = useCallback(() => {
    let cancelled = false;
    setState({ phase: 'loading' });
    postJson<SilpoCartData>('/api/cart/silpo', { items })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(load, [load]);

  const connect = () => {
    window.location.href = '/api/auth/silpo/start';
  };

  const setQuantity = (line: SilpoCartLine, next: number) => {
    setState((prev) => {
      if (prev.phase !== 'review') return prev;
      const clamped = next <= 0 ? 0 : Math.min(lineMax(line), round3(next));
      return { ...prev, quantities: { ...prev.quantities, [line.query]: clamped } };
    });
  };

  const commit = async () => {
    if (state.phase !== 'review') return;
    const { cart, quantities } = state;
    const lines = cart.lines
      .filter((l) => l.product && (quantities[l.query] ?? 0) > 0)
      .map((l) => ({
        productId: l.product!.productId,
        companyId: l.product!.companyId,
        branchId: l.product!.branchId,
        quantity: quantities[l.query],
      }));
    if (lines.length === 0) return;
    setState({ ...state, committing: true, commitError: undefined });
    try {
      const result = await postJson<SilpoCommitResult>('/api/cart/silpo/commit', {
        cartId: cart.cartId,
        ...(cart.timeslot.stale ? { timeslot: { start: cart.timeslot.start, end: cart.timeslot.end } } : {}),
        lines,
      });
      setState({ phase: 'committed', cart, quantities, result });
      onCommitted?.(result);
    } catch (e) {
      const err = e instanceof CartError ? e : new CartError('error');
      if (err.kind === 'unlinked') setState({ phase: 'unlinked' });
      else setState({ ...state, committing: false, commitError: err.detail ?? s.commitFailed });
    }
  };

  const title =
    state.phase === 'committed'
      ? s.readyTitle
      : state.phase === 'review'
        ? s.reviewTitle
        : state.phase === 'unlinked'
          ? s.connectTitle
          : s.buildingTitle;

  return (
    <section className="rounded-[20px] border-2 border-ink bg-cream p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-extrabold">{title}</h2>
        {state.phase === 'review' && (
          <p className="text-sm font-semibold text-latte">
            {s.matched(state.cart.matchedCount, state.cart.lines.length)}
          </p>
        )}
      </div>

      {state.phase === 'loading' && <LoadingRows items={items} />}

      {state.phase === 'unlinked' && (
        <Notice title={s.unlinked.title} body={s.unlinked.text}>
          <Button onClick={connect}>{s.unlinked.button}</Button>
        </Notice>
      )}

      {state.phase === 'no_cart' && (
        <Notice title={s.noCart.title} body={s.noCart.text}>
          <Button variant="secondary" onClick={load}>
            {t.common.tryAgain}
          </Button>
        </Notice>
      )}

      {state.phase === 'error' && (
        <Notice title={s.error.title} body={state.detail ?? s.error.text}>
          <Button variant="secondary" onClick={load}>
            {t.common.tryAgain}
          </Button>
        </Notice>
      )}

      {state.phase === 'review' && (
        <ReviewBody
          cart={state.cart}
          quantities={state.quantities}
          committing={state.committing}
          commitError={state.commitError}
          onQuantity={setQuantity}
          onCommit={commit}
        />
      )}

      {state.phase === 'committed' && (
        <CommittedBody
          result={state.result}
          onEdit={() =>
            setState({
              phase: 'review',
              cart: state.cart,
              quantities: state.quantities,
              committing: false,
            })
          }
        />
      )}
    </section>
  );
}

function Notice({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border-2 border-sand bg-white p-4 text-center">
      <p className="font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-latte">{body}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function LoadingRows({ items }: { items: OrderItem[] }) {
  const { t } = useI18n();
  return (
    <ul className="mt-4 flex flex-col gap-2">
      {items.slice(0, 6).map((it) => (
        <li key={it.name} className="flex items-center gap-3 rounded-xl border-2 border-sand bg-white p-2.5">
          <span className="h-12 w-12 shrink-0 animate-pulse rounded-lg bg-sand" />
          <span className="h-3 flex-1 animate-pulse rounded bg-sand" />
        </li>
      ))}
      <li className="mt-1 text-center text-xs font-semibold text-latte">
        {t.silpo.loadingItems(items.length)}
      </li>
    </ul>
  );
}

function ReviewBody({
  cart,
  quantities,
  committing,
  commitError,
  onQuantity,
  onCommit,
}: {
  cart: SilpoCartData;
  quantities: Quantities;
  committing: boolean;
  commitError?: string;
  onQuantity: (line: SilpoCartLine, next: number) => void;
  onCommit: () => void;
}) {
  const { t } = useI18n();
  const s = t.silpo;
  const included = cart.lines.filter((l) => l.product && (quantities[l.query] ?? 0) > 0);
  const total = included.reduce((sum, l) => sum + l.product!.price * quantities[l.query], 0);
  const belowMin = cart.delivery.minOrderCost > 0 && total < cart.delivery.minOrderCost;

  return (
    <>
      <ul className="mt-4 flex flex-col gap-2">
        {cart.lines.map((line) =>
          line.product ? (
            <MatchedRow
              key={line.query}
              line={line}
              quantity={quantities[line.query] ?? 0}
              onQuantity={(q) => onQuantity(line, q)}
            />
          ) : (
            <UnmatchedRow key={line.query} line={line} />
          )
        )}
      </ul>

      <div className="mt-4 rounded-xl border-2 border-sand bg-white p-3 text-xs font-semibold text-latte">
        <p>
          {s.delivery(formatSlot(t, cart.timeslot.start, cart.timeslot.end))}
          {cart.delivery.deliveryCost !== null && s.deliveryCost(uah(cart.delivery.deliveryCost))}
          {cart.delivery.minOrderCost > 0 && s.minOrder(uah(cart.delivery.minOrderCost))}
        </p>
        {cart.timeslot.stale && <p className="mt-1 text-ink">{s.staleSlot}</p>}
        {belowMin && <p className="mt-1 text-tomato">{s.belowMin(uah(total))}</p>}
      </div>

      {commitError && (
        <p className="mt-3 rounded-xl border-2 border-tomato bg-white p-3 text-sm font-semibold text-tomato">
          {commitError}
        </p>
      )}

      <div className="mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-bold text-ink">{s.itemsTotal(included.length, uah(total))}</p>
        <Button onClick={onCommit} disabled={committing || included.length === 0} className="px-6 py-3">
          {committing ? s.committing : s.commit}
        </Button>
      </div>
    </>
  );
}

function MatchedRow({
  line,
  quantity,
  onQuantity,
}: {
  line: SilpoCartLine;
  quantity: number;
  onQuantity: (q: number) => void;
}) {
  const { t } = useI18n();
  const s = t.silpo;
  const p = line.product!;
  const step = lineStep(line);
  const left = quantity <= 0;
  return (
    <li
      className={`relative flex items-center gap-3 rounded-xl border-2 bg-white p-2.5 ${p.weighted ? 'pr-7' : ''} ${left ? 'border-dashed border-sand opacity-60' : 'border-sand'}`}
    >
      {p.img ? (
        <Image src={p.img} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-lg object-cover" unoptimized />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-peach text-xl">🛍️</span>
      )}
      <div className="min-w-0 flex-1">
        <a
          href={p.webUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm font-semibold text-ink underline-offset-2 hover:underline"
        >
          {p.title}
        </a>
        <p className="text-xs font-bold text-latte">
          {uah(p.price)}
          {p.weighted ? s.perKg : p.displayRatio ? ` · ${p.displayRatio}` : ''}
          {p.oldPrice !== null && p.oldPrice > p.price && (
            <span className="ml-1.5 font-normal text-sand line-through">{uah(p.oldPrice)}</span>
          )}
          {line.neededGrams > 0 && (
            <span className="ml-2 font-mono font-normal text-sand">
              {s.need(formatWeight(line.neededGrams, t.units))}
            </span>
          )}
        </p>
      </div>
      {left ? (
        <button
          onClick={() => onQuantity(line.quantity || step)}
          className="shrink-0 rounded-full border-2 border-ink px-3 py-1.5 text-xs font-bold text-ink hover:bg-peach focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
        >
          {s.addBack}
        </button>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          <Stepper label={s.less} onClick={() => onQuantity(quantity - step)}>
            −
          </Stepper>
          <span className="min-w-[3.5rem] text-center font-mono text-sm font-bold text-ink">
            {p.weighted ? s.kgQty(quantity) : s.packQty(quantity)}
          </span>
          <Stepper label={s.more} onClick={() => onQuantity(quantity + step)} disabled={quantity >= lineMax(line)}>
            +
          </Stepper>
        </div>
      )}
      {p.weighted && <StepHint step={step} />}
    </li>
  );
}

// "ⓘ" next to a weighted quantity: the store's minimum step explains numbers
// like 0.55 kg for 120 g of bananas. Shows on hover, focus, or tap.
function StepHint({ step }: { step: number }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const id = `step-hint-${String(step).replace('.', '-')}`;
  return (
    <span className="group absolute top-1.5 right-1.5 inline-flex">
      <button
        type="button"
        aria-label={t.silpo.stepInfo}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-sand text-[9px] font-bold leading-none text-latte hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
      >
        i
      </button>
      <span
        id={id}
        role="tooltip"
        className={`absolute right-0 top-full z-20 mt-1.5 w-64 rounded-xl border-2 border-ink bg-white p-3 text-left text-xs font-semibold leading-snug text-ink shadow-[4px_4px_0_var(--color-ink)] group-hover:block group-focus-within:block ${open ? 'block' : 'hidden'}`}
      >
        {t.silpo.stepHint(step)}
      </span>
    </span>
  );
}

function Stepper({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="h-8 w-8 rounded-full border-2 border-ink text-sm font-bold text-ink hover:bg-peach disabled:border-sand disabled:text-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
    >
      {children}
    </button>
  );
}

function UnmatchedRow({ line }: { line: SilpoCartLine }) {
  const { t } = useI18n();
  return (
    <li className="flex items-center gap-3 rounded-xl border-2 border-dashed border-sand bg-white/60 p-2.5">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-sand/50 text-xl">🔍</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold capitalize text-ink">{line.query}</p>
        <p className="text-xs font-semibold text-latte">{t.silpo.noMatch}</p>
      </div>
      <a
        href={`https://silpo.ua/search?find=${encodeURIComponent(line.uaQuery)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded-full border-2 border-ink px-3.5 py-2 text-xs font-bold whitespace-nowrap text-ink hover:bg-peach focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
      >
        {t.silpo.search}
      </a>
    </li>
  );
}

function CommittedBody({ result, onEdit }: { result: SilpoCommitResult; onEdit: () => void }) {
  const { t } = useI18n();
  const s = t.silpo;
  const problems = result.validations.filter((v) => v.level === 'error' || v.level === 'warning');
  const discounted = result.totalAfterDiscounts < result.total;
  return (
    <>
      <p className="mt-1 text-sm font-semibold text-latte">
        {s.inCart(result.itemCount)}
        <span className="text-ink">{uah(result.totalAfterDiscounts)}</span>
        {discounted && <span className="ml-1.5 line-through">{uah(result.total)}</span>}
      </p>

      {problems.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {problems.map((v, i) => (
            <ValidationRow key={`${v.type}:${v.message}:${i}`} v={v} />
          ))}
        </ul>
      )}

      {result.loyalty?.isEnabled && result.loyalty.bonusAvailable > 0 && (
        <p className="mt-4 rounded-xl border-2 border-sand bg-white p-3 text-sm font-semibold text-ink">
          {s.bonuses(result.loyalty.bonusAvailable)}
        </p>
      )}

      <div className="mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={onEdit}
          className="text-sm font-bold text-latte underline-offset-2 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
        >
          {s.edit}
        </button>
        <div className="flex flex-col gap-2 sm:flex-row">
          {result.checkoutMobileLink && (
            <a
              href={result.checkoutMobileLink}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border-2 border-ink px-5 py-3 text-center text-sm font-bold text-ink hover:bg-peach focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
            >
              {s.openApp}
            </a>
          )}
          <a
            href={result.checkoutWebLink ?? 'https://silpo.ua/'}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-tomato px-5 py-3 text-center text-sm font-bold text-white shadow-[0_4px_0_var(--color-tomato-deep)] transition-all hover:bg-tomato-deep active:translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
          >
            {s.checkoutWeb}
          </a>
        </div>
      </div>
    </>
  );
}

function ValidationRow({ v }: { v: SilpoValidation }) {
  const { t } = useI18n();
  const error = v.level === 'error';
  return (
    <li
      className={`rounded-xl border-2 bg-white p-3 text-sm font-semibold ${error ? 'border-tomato text-tomato' : 'border-sand text-ink'}`}
    >
      {error ? '⚠️ ' : 'ℹ️ '}
      {t.silpo.validations[v.message] ?? v.message}
    </li>
  );
}
