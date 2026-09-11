'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/hooks/useI18n';
import { num } from '@/lib/num';
import type { Dish, DishEstimate, DishInput } from '@/lib/schemas';

type Row = { name: string; grams: string };

const emptyRow = (): Row => ({ name: '', grams: '' });

const inputCls =
  'rounded-xl border-2 border-peach-line bg-paper px-3 py-2 text-sm font-medium focus:border-ink focus:outline-none';

// Create or edit one of the user's dishes: ingredients with grams plus the
// dish's total kcal and macros, typed by hand or estimated by the model.
export function DishForm({
  open,
  dish,
  onSave,
  onEstimate,
  onClose,
}: {
  open: boolean;
  dish: Dish | null; // null = new dish
  onSave: (input: DishInput) => Promise<void>;
  onEstimate: (input: { name?: string; ingredients: { name: string; grams: number }[] }) => Promise<DishEstimate>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const f = t.dishes.form;
  const [name, setName] = useState('');
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [carbs, setCarbs] = useState('');
  const [saving, setSaving] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setName(dish?.name ?? '');
    setRows(
      dish && dish.ingredients.length
        ? dish.ingredients.map((i) => ({ name: i.name, grams: String(i.grams) }))
        : [emptyRow()]
    );
    setKcal(dish ? String(dish.kcal) : '');
    setProtein(dish ? String(dish.protein_g) : '');
    setFat(dish ? String(dish.fat_g) : '');
    setCarbs(dish ? String(dish.carbs_g) : '');
    setSaving(false);
    setEstimating(false);
    setError(null);
  }, [open, dish]);

  const ingredients = () =>
    rows
      .filter((r) => r.name.trim())
      .map((r) => ({ name: r.name.trim(), grams: num(r.grams) }));

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const estimate = async () => {
    const list = ingredients().filter((i) => i.grams > 0);
    if (list.length === 0) return;
    setEstimating(true);
    setError(null);
    try {
      const est = await onEstimate({ name: name.trim() || undefined, ingredients: list });
      setKcal(String(est.kcal));
      setProtein(String(est.protein_g));
      setFat(String(est.fat_g));
      setCarbs(String(est.carbs_g));
    } catch {
      setError(f.estimateFailed);
    } finally {
      setEstimating(false);
    }
  };

  const save = async () => {
    if (!name.trim()) {
      setError(f.nameRequired);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        kcal: num(kcal),
        protein_g: num(protein),
        fat_g: num(fat),
        carbs_g: num(carbs),
        ingredients: ingredients(),
      });
    } catch {
      setError(f.saveFailed);
      setSaving(false);
    }
  };

  const busy = saving || estimating;

  return (
    <Modal open={open} onClose={onClose} labelledBy="dish-form-title">
      <h2 id="dish-form-title" className="font-display text-xl font-extrabold">
        {dish ? f.editTitle : f.createTitle}
      </h2>

      <label className="mt-4 block text-sm font-bold">
        {f.name}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={f.namePlaceholder}
          maxLength={120}
          autoFocus
          className={`mt-1.5 w-full ${inputCls}`}
        />
      </label>

      <h3 className="mt-5 text-sm font-bold">{f.ingredients}</h3>
      <ul className="mt-1.5 flex flex-col gap-2">
        {rows.map((row, i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              value={row.name}
              onChange={(e) => updateRow(i, { name: e.target.value })}
              placeholder={f.ingredientName}
              maxLength={80}
              aria-label={f.ingredientName}
              className={`min-w-0 flex-1 ${inputCls}`}
            />
            <input
              value={row.grams}
              onChange={(e) => updateRow(i, { grams: e.target.value })}
              inputMode="decimal"
              placeholder="0"
              aria-label={f.grams}
              className={`w-20 text-right ${inputCls}`}
            />
            <span className="w-4 text-xs font-bold text-latte">{f.grams}</span>
            <button
              type="button"
              onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : [emptyRow()]))}
              aria-label={f.removeIngredient}
              className="h-8 w-8 shrink-0 rounded-full text-sm font-bold text-latte hover:bg-cream hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, emptyRow()])}
        className="mt-2 text-sm font-bold text-tomato underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
      >
        {f.addIngredient}
      </button>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold">{f.nutrition}</h3>
        <Button
          variant="secondary"
          onClick={estimate}
          disabled={busy || ingredients().every((i) => i.grams <= 0)}
          className="px-3 py-1.5 text-xs"
        >
          {estimating ? f.estimating : f.estimate}
        </Button>
      </div>
      <p className="mt-0.5 text-xs font-semibold text-latte">{f.estimateHint}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            [f.kcal, kcal, setKcal],
            [f.protein, protein, setProtein],
            [f.fat, fat, setFat],
            [f.carbs, carbs, setCarbs],
          ] as [string, string, (v: string) => void][]
        ).map(([label, value, set]) => (
          <label key={label} className="block text-xs font-bold text-latte">
            {label}
            <input
              value={value}
              onChange={(e) => set(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className={`mt-1 w-full ${inputCls}`}
            />
          </label>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs font-bold text-tomato">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          {t.common.cancel}
        </Button>
        <Button onClick={save} disabled={busy}>
          {saving ? f.saving : f.save}
        </Button>
      </div>
    </Modal>
  );
}
