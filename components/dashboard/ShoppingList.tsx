'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/hooks/useI18n';
import { useShoppingEdits } from '@/hooks/useShoppingEdits';
import { CART_TICKS_PREFIX } from '@/lib/clientStorage';
import { CATEGORY_ORDER, formatWeight, shoppingList } from '@/lib/shopping';
import type { Dict } from '@/lib/i18n';
import type { MealPlan, OrderItem, PantryItem, ShoppingItem } from '@/lib/schemas';

type ListItem = ShoppingItem & { custom?: boolean };

// Plain text for clipboard, share sheet and print.
function toText(t: Dict, groups: { category: ShoppingItem['category']; items: ListItem[] }[]): string {
  return groups
    .map(({ category, items }) =>
      [
        t.categories[category],
        ...items.map((i) => `- ${i.name}${i.grams > 0 ? ` — ${formatWeight(i.grams, t.units)}` : ''}`),
      ].join('\n')
    )
    .join('\n\n');
}

export function ShoppingList({
  plan,
  pantry,
  onOrder,
}: {
  plan: MealPlan;
  pantry: PantryItem[];
  onOrder: (items: OrderItem[]) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const derived = useMemo(() => shoppingList(plan, pantry), [plan, pantry]);
  const { edits, effective, addItem, setWeight, removeItem, restoreAll } = useShoppingEdits(
    plan.generatedAt,
    derived
  );
  // Ticks are keyed by the plan's generatedAt: they survive navigation but
  // start fresh with each new plan — the list is derived from it anyway.
  const storageKey = `${CART_TICKS_PREFIX}${plan.generatedAt}`;
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGrams, setNewGrams] = useState('');

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

  const persistTicks = (next: Set<string>) => {
    setChecked(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      // Storage unavailable — keep in-memory state only.
    }
  };

  const items: ListItem[] = effective;
  const toBuy = items.filter((item) => !checked.has(item.name));
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: items.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);

  const toggle = (name: string) => {
    const next = new Set(checked);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    persistTicks(next);
  };
  const uncheckAll = () => persistTicks(new Set());

  const confirmAdd = () => {
    const grams = Number(newGrams);
    addItem(newName, Number.isFinite(grams) && grams > 0 ? grams : 0);
    setNewName('');
    setNewGrams('');
    setAdding(false);
  };

  const exportText = () => `${t.shopping.exportTitle}\n\n${toText(t, groups)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportText());
      toast(t.shopping.copied);
    } catch {
      toast(t.shopping.copyFailed);
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: t.shopping.exportTitle, text: exportText() });
    } catch {
      // Cancelled or unsupported — nothing to report.
    }
  };

  return (
    <section className="shopping-print rounded-[20px] border-2 border-ink bg-tomato p-5 text-white sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-[11px] font-bold tracking-widest">{t.shopping.title(toBuy.length)}</h2>
        <div className="flex flex-wrap items-center gap-3">
          {checked.size > 0 && (
            <button
              onClick={uncheckAll}
              className="no-print text-xs font-bold text-white/80 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {t.shopping.uncheckAll(checked.size)}
            </button>
          )}
          {toBuy.length > 0 && (
            <button
              onClick={() => onOrder(toBuy.map(({ name, grams }) => ({ name, grams })))}
              className="no-print rounded-full bg-white px-5 py-3 text-[14.5px] font-bold whitespace-nowrap text-tomato transition-colors hover:bg-peach focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {t.shopping.build}
            </button>
          )}
        </div>
      </div>

      <div className="no-print mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold">
        <button onClick={copy} className="underline-offset-2 hover:underline">
          {t.shopping.copy}
        </button>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button onClick={share} className="underline-offset-2 hover:underline">
            {t.shopping.share}
          </button>
        )}
        <button onClick={() => window.print()} className="underline-offset-2 hover:underline">
          {t.shopping.print}
        </button>
        {edits.removed.length > 0 && (
          <button onClick={restoreAll} className="text-white/80 underline-offset-2 hover:underline">
            {t.shopping.restore(edits.removed.length)}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-3 font-semibold">{t.shopping.haveEverything}</p>
      ) : (
        <>
          {toBuy.length === 0 && <p className="mt-3 font-semibold">{t.shopping.allTicked}</p>}
          {groups.map(({ category, items: groupItems }) => (
            <div key={category}>
              <h3 className="mt-5 text-[11px] font-bold tracking-widest text-white/70 uppercase">
                {t.categories[category]}
              </h3>
              <ul className="mt-1 flex flex-col divide-y divide-white/15">
                {groupItems.map((item) => {
                  const isChecked = checked.has(item.name);
                  return (
                    <li key={item.name} className="flex items-center gap-2">
                      <label
                        className={`flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 transition-colors ${
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
                            isChecked ? 'border-white bg-white text-lime-deep' : 'border-white/40'
                          }`}
                        >
                          {isChecked ? '✓' : ''}
                        </span>
                        <span className={`min-w-0 flex-1 ${isChecked ? 'line-through' : ''}`}>
                          <span className="text-sm font-semibold capitalize">{item.name}</span>
                          <span className="block truncate text-xs text-white/65">
                            {item.custom
                              ? t.shopping.addOwn
                              : item.usedIn.slice(0, 3).join(', ') +
                                (item.usedIn.length > 3 ? '…' : '')}
                            {item.haveGrams
                              ? ` · ${t.shopping.have(formatWeight(item.haveGrams, t.units))}`
                              : ''}
                          </span>
                        </span>
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={10}
                        value={item.grams || ''}
                        onChange={(e) => setWeight(item.name, Math.max(0, Number(e.target.value)))}
                        aria-label={t.shopping.editQty(item.name)}
                        className="no-print w-20 shrink-0 rounded-lg border-2 border-white/30 bg-transparent px-2 py-1 text-right font-mono text-xs font-bold text-white placeholder-white/50 focus:border-white focus:outline-none"
                        placeholder={t.shopping.addGrams}
                      />
                      <span className="hidden font-mono text-xs font-bold print:inline">
                        {formatWeight(item.grams, t.units)}
                      </span>
                      <button
                        onClick={() => removeItem(item.name)}
                        aria-label={t.shopping.removeItem(item.name)}
                        className="no-print h-7 w-7 shrink-0 rounded-full border-2 border-white/30 text-xs font-bold text-white/80 hover:border-white hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </>
      )}

      <div className="no-print mt-5">
        {adding ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmAdd()}
              placeholder={t.shopping.addName}
              maxLength={200}
              autoFocus
              aria-label={t.shopping.addName}
              className="min-w-0 flex-1 rounded-xl border-2 border-white/40 bg-transparent px-3 py-2 text-sm font-semibold text-white placeholder-white/60 focus:border-white focus:outline-none"
            />
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={newGrams}
              onChange={(e) => setNewGrams(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmAdd()}
              placeholder={t.shopping.addGrams}
              aria-label={t.shopping.addGrams}
              className="w-20 rounded-xl border-2 border-white/40 bg-transparent px-3 py-2 text-sm font-semibold text-white placeholder-white/60 focus:border-white focus:outline-none"
            />
            <Button variant="secondary" className="px-4 py-2 text-xs" onClick={confirmAdd}>
              {t.shopping.addConfirm}
            </Button>
            <Button
              variant="secondary"
              className="border-white/40 bg-transparent px-4 py-2 text-xs text-white hover:bg-white/10"
              onClick={() => setAdding(false)}
            >
              {t.common.cancel}
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="text-xs font-bold underline-offset-2 hover:underline"
          >
            {t.shopping.addItem}
          </button>
        )}
      </div>
    </section>
  );
}
