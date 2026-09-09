'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/hooks/useI18n';
import { usePantry } from '@/hooks/usePantry';
import { useSession } from '@/hooks/useSession';
import { scanFridgePhoto, mergePantry, parsePantryText } from '@/lib/pantry';
import type { PantryItem } from '@/lib/schemas';

const MAX_ITEMS = 120;

export default function PantryPage() {
  const { t } = useI18n();
  const toast = useToast();
  const { profile } = useSession();
  const { pantry, saving, save } = usePantry();
  const [items, setItems] = useState<PantryItem[]>(pantry);
  const [dirty, setDirty] = useState(false);
  const [bulk, setBulk] = useState('');
  const [scanning, setScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The session is the source of truth; adopt it until the user edits.
  useEffect(() => {
    if (!dirty) setItems(pantry);
  }, [pantry, dirty]);

  if (!profile) return null;

  const update = (next: PantryItem[]) => {
    setItems(next.slice(0, MAX_ITEMS));
    setDirty(true);
  };

  const setName = (i: number, name: string) =>
    update(items.map((item, idx) => (idx === i ? { ...item, name } : item)));

  const setGrams = (i: number, raw: string) =>
    update(
      items.map((item, idx) => {
        if (idx !== i) return item;
        const grams = Number(raw);
        return raw.trim() === '' || !Number.isFinite(grams) || grams < 0
          ? { name: item.name }
          : { name: item.name, grams };
      })
    );

  const addRow = () => update([...items, { name: '' }]);
  const removeRow = (i: number) => update(items.filter((_, idx) => idx !== i));

  const addBulk = () => {
    const parsed = parsePantryText(bulk);
    if (parsed.length === 0) return;
    update(mergePantry(items, parsed));
    setBulk('');
  };

  const scan = async (file: Blob) => {
    if (scanning) return;
    setScanning(true);
    try {
      const names = await scanFridgePhoto(file);
      if (names.length === 0) {
        toast(t.fridge.noFood);
        return;
      }
      update(mergePantry(items, names.map((name) => ({ name }))));
    } catch {
      toast(t.fridge.readFailed);
    } finally {
      setScanning(false);
    }
  };

  const persist = async () => {
    const cleaned = items
      .map((item) => ({ ...item, name: item.name.trim() }))
      .filter((item) => item.name);
    try {
      await save(cleaned);
      setItems(cleaned);
      setDirty(false);
      toast(t.pantry.saved);
    } catch {
      toast(t.pantry.saveFailed);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold">{t.pantry.title}</h1>
          <p className="mt-0.5 max-w-xl text-sm font-semibold text-latte">{t.pantry.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          {dirty && (
            <span className="text-xs font-bold text-tomato" role="status">
              {t.pantry.unsaved}
            </span>
          )}
          <Button onClick={persist} disabled={saving || !dirty}>
            {saving ? t.pantry.saving : t.pantry.save}
          </Button>
        </div>
      </div>

      <section className="rounded-3xl border-2 border-ink bg-paper p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] font-bold tracking-widest text-latte">
            {t.pantry.countHint(items.length)}
          </p>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) scan(file);
              }}
            />
            <Button
              variant="secondary"
              className="px-4 py-2 text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={scanning}
            >
              {scanning ? t.pantry.scanning : t.pantry.scan}
            </Button>
          </div>
        </div>

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
                  inputMode="numeric"
                  min={0}
                  value={item.grams ?? ''}
                  onChange={(e) => setGrams(i, e.target.value)}
                  placeholder={t.pantry.gramsPlaceholder}
                  aria-label={t.pantry.gramsAria(item.name)}
                  className="w-24 rounded-xl border-2 border-peach-line bg-paper px-3 py-2 text-sm font-semibold focus:border-ink focus:outline-none"
                />
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
