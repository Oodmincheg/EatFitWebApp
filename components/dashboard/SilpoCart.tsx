'use client';

import { useId, useState } from 'react';
import { useSilpoCart } from '@/hooks/useSilpoCart';
import { exceedsStock, lineMax, lineStep, purchasedGrams } from '@/lib/silpo/review';
import { suggestQuantity } from '@/lib/silpo/quantity';
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
  SilpoProduct,
} from '@/lib/schemas';

type Quantities = Record<string, number>;

const money = (locale: string, n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'UAH' }).format(n);

function formatSlot(t: Dict, start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const day = s.toLocaleDateString(t.intl, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = (d: Date) => d.toLocaleTimeString(t.intl, { hour: 'numeric', minute: '2-digit' });
  return t.silpo.slot(day, time(s), time(e));
}

export function SilpoCart({
  items,
  onCommitted,
}: {
  items: OrderItem[];
  onCommitted?: (result: SilpoCommitResult, items: OrderItem[]) => void;
}) {
  const { t } = useI18n();
  const s = t.silpo;
  const { state, load, connect, setQuantity, replaceProduct, commit } = useSilpoCart(items, onCommitted);

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
          onReplace={replaceProduct}
          onCommit={commit}
        />
      )}

      {state.phase === 'committed' && (
        <CommittedBody result={state.result} />
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
  onReplace,
  onCommit,
}: {
  cart: SilpoCartData;
  quantities: Quantities;
  committing: boolean;
  commitError?: string;
  onQuantity: (line: SilpoCartLine, next: number) => void;
  onReplace: (line: SilpoCartLine, product: SilpoProduct) => void;
  onCommit: () => void;
}) {
  const { t } = useI18n();
  const s = t.silpo;
  const uah = (n: number) => money(t.intl, n);
  const included = cart.lines.filter((l) => l.product && (quantities[l.query] ?? 0) > 0);
  const total = cart.total;
  const stockExceeded = exceedsStock(cart.lines, quantities);
  const belowMin = cart.delivery.minOrderCost > 0 && total < cart.delivery.minOrderCost;

  return (
    <>
      <div className="mt-4 rounded-xl border-2 border-ink bg-white p-4" aria-live="polite">
        <p className="font-display font-extrabold">{s.summaryTitle}</p>
        <p className="mt-1 text-sm font-semibold">{s.summary(included.length, cart.lines.length, uah(total))}</p>
        <p className="mt-1 text-xs text-latte">{s.summaryNote}</p>
        {cart.lines.some((l) => !l.product) && <p className="mt-2 text-sm font-semibold text-tomato">
          {s.missingItems(cart.lines.filter((l) => !l.product).map((l) => l.query).join(', '))}
        </p>}
        {cart.lines.some((l) => l.product && !quantities[l.query]) && <p className="mt-2 text-sm text-latte">
          {s.excludedItems(cart.lines.filter((l) => l.product && !quantities[l.query]).map((l) => l.query).join(', '))}
        </p>}
      </div>
      <ul className="mt-4 flex flex-col gap-2">
        {cart.lines.map((line) =>
          line.product ? (
            <MatchedRow
              key={line.query}
              line={line}
              quantity={quantities[line.query] ?? 0}
              onQuantity={(q) => onQuantity(line, q)}
              disabled={committing}
              onReplace={(p) => onReplace(line, p)}
            />
          ) : (
            <UnmatchedRow key={line.query} line={line} disabled={committing} onReplace={(p) => onReplace(line, p)} />
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

      {stockExceeded && <p role="alert" className="mt-3 text-sm font-bold text-tomato">{s.stockExceeded}</p>}

      {commitError && (
        <p className="mt-3 rounded-xl border-2 border-tomato bg-white p-3 text-sm font-semibold text-tomato">
          {commitError}
        </p>
      )}

      <div className="mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-bold text-ink">{s.itemsTotal(included.length, uah(total))}</p>
        <Button onClick={onCommit} disabled={committing || stockExceeded || included.length === 0} className="px-6 py-3">
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
  disabled,
  onReplace,
}: {
  line: SilpoCartLine;
  quantity: number;
  onQuantity: (q: number) => void;
  disabled: boolean;
  onReplace: (product: SilpoProduct) => void;
}) {
  const { t } = useI18n();
  const s = t.silpo;
  const uah = (n: number) => money(t.intl, n);
  const p = line.product!;
  const step = lineStep(line);
  const left = quantity <= 0;
  return (
    <li
      className={`relative flex flex-wrap items-center gap-3 rounded-xl border-2 bg-white p-2.5 ${p.weighted ? 'pr-7' : ''} ${left ? 'border-dashed border-sand opacity-60' : 'border-sand'}`}
    >
      {p.img ? (
        <Image src={p.img} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-lg object-cover" unoptimized />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-peach text-xl">🛍️</span>
      )}
      <div className="min-w-0 flex-1 basis-40">
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
              {s.need(formatWeight(line.neededGrams, t.units, t.intl))}
            </span>
          )}
        </p>
      </div>
      {left ? (
        <button
          disabled={disabled}
          onClick={() => onQuantity(suggestQuantity(line.neededGrams, p))}
          className="shrink-0 rounded-full border-2 border-ink px-3 py-1.5 text-xs font-bold text-ink hover:bg-peach focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
        >
          {s.addBack}
        </button>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          <Stepper disabled={disabled} label={s.less} onClick={() => onQuantity(quantity - step)}>
            −
          </Stepper>
          <span className="min-w-[3.5rem] text-center font-mono text-sm font-bold text-ink">
            {p.weighted ? s.kgQty(quantity) : s.packQty(quantity)}
          </span>
          <Stepper label={s.more} onClick={() => onQuantity(quantity + step)} disabled={disabled || quantity >= lineMax(line)}>
            +
          </Stepper>
        </div>
      )}
      {p.weighted && <StepHint step={step} />}
      <div className="w-full border-t border-sand pt-2">
        <p className="text-xs font-bold capitalize text-ink">{line.query}</p>
        {!left && <QuantityExplanation line={line} quantity={quantity} />}
        <div className="mt-2 flex flex-wrap items-start gap-3">
          <Alternatives line={line} disabled={disabled} onReplace={onReplace} />
          {!left && <button disabled={disabled} onClick={() => onQuantity(0)} className="text-xs font-bold text-latte underline disabled:opacity-50">{s.remove}</button>}
        </div>
      </div>
    </li>
  );
}

// "ⓘ" next to a weighted quantity: the store's minimum step explains numbers
// like 0.55 kg for 120 g of bananas. Shows on hover, focus, or tap.
function StepHint({ step }: { step: number }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const id = useId();
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

function UnmatchedRow({ line, disabled, onReplace }: { line: SilpoCartLine; disabled: boolean; onReplace: (product: SilpoProduct) => void }) {
  const { t } = useI18n();
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed border-sand bg-white/60 p-2.5">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-sand/50 text-xl">🔍</span>
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-sm font-semibold capitalize text-ink">{line.query}</p>
        <p className="text-xs font-semibold text-latte">{t.silpo.noMatch}</p>
        <Alternatives line={line} disabled={disabled} onReplace={onReplace} />
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

function CommittedBody({ result }: { result: SilpoCommitResult }) {
  const { t } = useI18n();
  const s = t.silpo;
  const uah = (n: number) => money(t.intl, n);
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

function QuantityExplanation({ line, quantity }: { line: SilpoCartLine; quantity: number }) {
  const { t } = useI18n();
  const grams = purchasedGrams(line.product!, quantity);
  const weight = (n: number) => formatWeight(n, t.units, t.intl) || `0 ${t.units.g}`;
  return <p className="mt-1 text-xs text-latte">
    {line.neededGrams > 0 && <span>{t.silpo.need(weight(line.neededGrams))} · </span>}
    {grams === null ? t.silpo.unknownWeight : t.silpo.buyWeight(weight(grams))}
    {grams !== null && line.neededGrams > 0 && <span className={grams < line.neededGrams ? 'font-bold text-tomato' : ''}>
      {' · '}{grams >= line.neededGrams ? t.silpo.leftover(weight(grams - line.neededGrams)) : t.silpo.shortfall(weight(line.neededGrams - grams))}
    </span>}
  </p>;
}

function Alternatives({ line, disabled, onReplace }: { line: SilpoCartLine; disabled: boolean; onReplace: (product: SilpoProduct) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const id = useId();
  const candidates = (line.candidates ?? []).filter((p) => p.productId !== line.product?.productId);
  if (!candidates.length) return <span className="text-xs text-latte">{t.silpo.noAlternatives}</span>;
  return <div className="min-w-0 flex-1">
    <button disabled={disabled} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="text-xs font-bold text-tomato underline disabled:opacity-50">
      {open ? t.silpo.closeAlternatives : t.silpo.replace}
    </button>
    {open && <div id={id} className="mt-2 rounded-xl bg-cream p-3">
      <p className="mb-2 text-xs text-latte">{t.silpo.alternativesNote}</p>
      <ul className="space-y-2">{candidates.map((p) => {
        const quantity = suggestQuantity(line.neededGrams, p);
        return <li key={`${p.companyId}:${p.branchId}:${p.productId}`}>
          <button disabled={disabled} onClick={() => { onReplace(p); setOpen(false); }} className="w-full rounded-lg border-2 border-sand bg-white p-3 text-left hover:border-tomato focus-visible:outline-2 focus-visible:outline-tomato disabled:opacity-50">
            <span className="block text-sm font-semibold">{p.title}</span>
            <span className="block text-xs text-latte">{money(t.intl, p.price)}{p.weighted ? t.silpo.perKg : p.displayRatio ? ` · ${p.displayRatio}` : ''}</span>
            <span className="mt-1 block text-xs font-bold">{t.silpo.optionTotal(p.weighted ? t.silpo.kgQty(quantity) : t.silpo.packQty(quantity), money(t.intl, p.price * quantity))}</span>
          </button>
        </li>;
      })}</ul>
    </div>}
  </div>;
}
