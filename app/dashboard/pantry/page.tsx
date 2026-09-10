'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/hooks/useI18n';
import { usePantry } from '@/hooks/usePantry';
import { useSession } from '@/hooks/useSession';
import { mergePantry, parsePantryText } from '@/lib/pantry';
import { PANTRY_UNITS, type PantryItem, type PantryUnit } from '@/lib/schemas';

const MAX_ITEMS = 120;
const SAVE_DELAY = 800;

export default function PantryPage() {
  const { t } = useI18n();
  const { profile } = useSession();
  const { pantry, save } = usePantry();
  const [items, setItems] = useState<PantryItem[]>(pantry);
  // Edits are saved on their own, so "unsaved changes" can never strand the
  // shopping list on an older pantry.
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [bulk, setBulk] = useState('');
  const touched = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What the debounce still owes the server, so leaving the page flushes it.
  const pending = useRef<PantryItem[] | null>(null);

  // Adopt the session's pantry until the user starts editing; after that the
  // local list is authoritative (a half-typed row must not vanish on save).
  useEffect(() => {
    if (!touched.current) setItems(pantry);
  }, [pantry]);

  const flush = useCallback(
    async (next: PantryItem[]) => {
      const cleaned = next
        .map((item) => ({ ...item, name: item.name.trim() }))
        .filter((item) => item.name);
      pending.current = null;
      setStatus('saving');
      try {
        await save(cleaned);
        setStatus('saved');
      } catch {
        setStatus('failed');
      }
    },
    [save]
  );

  const update = useCallback(
    (next: PantryItem[]) => {
      touched.current = true;
      const capped = next.slice(0, MAX_ITEMS);
      setItems(capped);
      pending.current = capped;
      // "Saved" must not stay on screen while an edit is still owed.
      setStatus('saving');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(capped), SAVE_DELAY);
    },
    [flush]
  );

  // Leaving the page mid-debounce would otherwise drop the edit — send it
  // now; client-side navigation keeps the request alive.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) void flush(pending.current);
    },
    [flush]
  );

  if (!profile) return null;

  const setName = (i: number, name: string) =>
    update(items.map((item, idx) => (idx === i ? { ...item, name } : item)));

  const setAmount = (i: number, raw: string) =>
    update(
      items.map((item, idx) => {
        if (idx !== i) return item;
        const amount = Number(raw);
        return raw.trim() === '' || !Number.isFinite(amount) || amount < 0
          ? { name: item.name }
          : { name: item.name, amount, unit: item.unit ?? 'g' };
      })
    );

  const setUnit = (i: number, unit: PantryUnit) =>
    update(items.map((item, idx) => (idx === i ? { ...item, unit } : item)));

  const addRow = () => update([...items, { name: '' }]);
  const removeRow = (i: number) => update(items.filter((_, idx) => idx !== i));

  const addBulk = () => {
    const parsed = parsePantryText(bulk);
    if (parsed.length === 0) return;
    update(mergePantry(items, parsed));
    setBulk('');
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold">{t.pantry.title}</h1>
          <p className="mt-0.5 max-w-xl text-sm font-semibold text-latte">{t.pantry.subtitle}</p>
        </div>
        {status !== 'idle' && (
          <span
            role="status"
            className={`text-xs font-bold ${status === 'failed' ? 'text-tomato' : 'text-latte'}`}
          >
            {status === 'saving' ? t.pantry.saving : status === 'saved' ? `✓ ${t.pantry.saved}` : t.pantry.saveFailed}
          </span>
        )}
      </div>

      <section className="rounded-3xl border-2 border-ink bg-paper p-4 sm:p-5">
        <p className="text-[11px] font-bold tracking-widest text-latte">
          {t.pantry.countHint(items.length)}
        </p>

        {items.length === 0 ? (
          <div className="mt-4 rounded-2xl border-2 border-dashed border-sand py-10 text-center">
            <p className="text-3xl" aria-hidden="true">
              🧊
            </p>
            <p className="mt-3 font-display text-lg font-extrabold">{t.pantry.empty}</p>
            <p className="mt-1 text-sm text-latte">{t.pantry.emptyText}</p>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {items.map((item, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  value={item.name}
                  onChange={(e) => setName(i, e.target.value)}
                  placeholder={t.pantry.namePlaceholder}
                  maxLength={80}
                  aria-label={t.pantry.nameAria}
                  className="min-w-0 flex-1 rounded-xl border-2 border-peach-line bg-paper px-3 py-2 text-sm font-semibold focus:border-ink focus:outline-none"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={item.amount ?? ''}
                  onChange={(e) => setAmount(i, e.target.value)}
                  placeholder={t.pantry.amountPlaceholder}
                  aria-label={t.pantry.amountAria(item.name)}
                  className="w-24 rounded-xl border-2 border-peach-line bg-paper px-3 py-2 text-sm font-semibold focus:border-ink focus:outline-none"
                />
                <select
                  value={item.unit ?? 'g'}
                  onChange={(e) => setUnit(i, e.target.value as PantryUnit)}
                  aria-label={t.pantry.unitAria(item.name)}
                  className="w-20 rounded-xl border-2 border-peach-line bg-paper px-2 py-2 text-sm font-semibold focus:border-ink focus:outline-none"
                >
                  {PANTRY_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {t.pantryUnits[unit]}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => removeRow(i)}
                  aria-label={t.pantry.removeAria(item.name)}
                  title={t.pantry.remove}
                  className="h-9 w-9 shrink-0 rounded-full border-2 border-peach-line text-sm font-bold text-latte hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="secondary" className="px-4 py-2 text-xs" onClick={addRow}>
            {t.pantry.add}
          </Button>
          <span className="text-xs font-medium text-latte">{t.pantry.weightHint}</span>
        </div>
      </section>

      <section className="rounded-3xl border-2 border-peach-line bg-cream p-4 sm:p-5">
        <h2 className="text-[11px] font-bold tracking-widest text-latte">{t.pantry.bulk}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addBulk()}
            placeholder={t.pantry.bulkPlaceholder}
            maxLength={2000}
            aria-label={t.pantry.bulk}
            className="min-w-0 flex-1 rounded-xl border-2 border-peach-line bg-paper px-3 py-2 text-sm font-semibold focus:border-ink focus:outline-none"
          />
          <Button variant="secondary" onClick={addBulk} disabled={!bulk.trim()}>
            {t.pantry.bulkAdd}
          </Button>
        </div>
      </section>
    </>
  );
}
