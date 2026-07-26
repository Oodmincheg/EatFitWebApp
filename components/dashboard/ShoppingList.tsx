'use client';

import { useEffect, useMemo, useState } from 'react';
import { CART_TICKS_PREFIX } from '@/lib/clientStorage';
import { CATEGORY_LABELS, CATEGORY_ORDER, formatWeight, shoppingList } from '@/lib/shopping';
import type { MealPlan, OrderItem } from '@/lib/schemas';

export function ShoppingList({
  plan,
  ownedRaw,
  onOrder,
}: {
  plan: MealPlan;
  ownedRaw: string;
  onOrder: (items: OrderItem[]) => void;
}) {
  const items = useMemo(() => shoppingList(plan, ownedRaw), [plan, ownedRaw]);
  // Ticks are keyed by the plan's generatedAt: they survive navigation but
  // start fresh with each new plan — the list is derived from it anyway.
  const storageKey = `${CART_TICKS_PREFIX}${plan.generatedAt}`;
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setChecked(raw ? new Set(JSON.parse(raw)) : new Set());
      // Drop ticks left over from previous plans.
      Object.keys(localStorage)
        .filter((key) => key.startsWith(CART_TICKS_PREFIX) && key !== storageKey)
        .forEach((key) => localStorage.removeItem(key));
    } catch {
      // Storage unavailable (private mode, etc.) — ticks just won't persist.
    }
  }, [storageKey]);

  const persist = (next: Set<string>) => {
    setChecked(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      // Storage unavailable — keep in-memory state only.
    }
  };

  const toBuy = items.filter((item) => !checked.has(item.name));
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: items.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);

  const toggle = (name: string) => {
    const next = new Set(checked);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    persist(next);
  };
  const uncheckAll = () => persist(new Set());

  return (
    <section className="rounded-[20px] border-2 border-ink bg-tomato p-5 text-white sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-[11px] font-bold tracking-widest">
          🛒 SHOPPING LIST · {toBuy.length} {toBuy.length === 1 ? 'ITEM' : 'ITEMS'} TO BUY
        </h2>
        <div className="flex items-center gap-3">
          {checked.size > 0 && (
            <button
              onClick={uncheckAll}
              className="text-xs font-bold text-white/80 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Uncheck all ({checked.size})
            </button>
          )}
          {toBuy.length > 0 && (
            <button
              onClick={() => onOrder(toBuy.map(({ name, grams }) => ({ name, grams })))}
              className="rounded-full bg-white px-5 py-3 text-[14.5px] font-bold whitespace-nowrap text-tomato transition-colors hover:bg-peach focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Build my grocery cart 🛒
            </button>
          )}
        </div>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 font-semibold">You already have everything you need 🎉</p>
      ) : (
        <>
          {toBuy.length === 0 && (
            <p className="mt-3 font-semibold">Everything&rsquo;s ticked off 🎉</p>
          )}
          {groups.map(({ category, items: groupItems }) => (
            <div key={category}>
              <h3 className="mt-5 text-[11px] font-bold tracking-widest text-white/70 uppercase">
                {CATEGORY_LABELS[category]}
              </h3>
              <ul className="mt-1 flex flex-col divide-y divide-white/15">
                {groupItems.map((item) => {
                  const isChecked = checked.has(item.name);
                  return (
                    <li key={item.name}>
                      <label
                        className={`flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 transition-colors ${
                          isChecked ? 'bg-lime/90' : 'hover:bg-white/5'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggle(item.name)}
                          className="peer sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-sm font-bold transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white ${
                            isChecked
                              ? 'border-white bg-white text-lime-deep'
                              : 'border-white/40'
                          }`}
                        >
                          {isChecked ? '✓' : ''}
                        </span>
                        <span className={`min-w-0 flex-1 ${isChecked ? 'line-through' : ''}`}>
                          <span className="text-sm font-semibold capitalize">{item.name}</span>
                          {item.grams > 0 && (
                            <span className="ml-2 font-mono text-xs font-bold text-white/80">
                              {formatWeight(item.grams)}
                            </span>
                          )}
                          <span className="block truncate text-xs text-white/65">
                            {item.usedIn.slice(0, 3).join(', ')}
                            {item.usedIn.length > 3 ? '…' : ''}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
