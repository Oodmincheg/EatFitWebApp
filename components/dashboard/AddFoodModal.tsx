'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/hooks/useI18n';
import { num, optNum } from '@/lib/num';
import type { EatenExtraInput, ExtraEstimate } from '@/lib/schemas';

const inputCls =
  'rounded-xl border-2 border-peach-line bg-paper px-3 py-2 text-sm font-medium focus:border-ink focus:outline-none';

// Log food eaten off the plan: describe it and let the model fill in kcal,
// or type the numbers by hand.
export function AddFoodModal({
  open,
  onSave,
  onEstimate,
  onClose,
}: {
  open: boolean;
  onSave: (input: EatenExtraInput) => Promise<void>;
  onEstimate: (text: string) => Promise<ExtraEstimate>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const f = t.today.addFoodForm;
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [carbs, setCarbs] = useState('');
  const [saving, setSaving] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setText('');
    setName('');
    setKcal('');
    setProtein('');
    setFat('');
    setCarbs('');
    setSaving(false);
    setEstimating(false);
    setError(null);
  }, [open]);

  const estimate = async () => {
    if (!text.trim()) return;
    setEstimating(true);
    setError(null);
    try {
      const est = await onEstimate(text.trim());
      setName(est.name);
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
    const finalName = name.trim() || text.trim();
    if (!finalName) {
      setError(f.nameRequired);
      return;
    }
    if (kcal.trim() === '') {
      setError(f.kcalRequired);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: finalName.slice(0, 120),
        kcal: num(kcal),
        protein_g: optNum(protein),
        fat_g: optNum(fat),
        carbs_g: optNum(carbs),
      });
    } catch {
      setError(f.saveFailed);
      setSaving(false);
    }
  };

  const busy = saving || estimating;

  return (
    <Modal open={open} onClose={onClose} labelledBy="add-food-title">
      <h2 id="add-food-title" className="font-display text-xl font-extrabold">
        {f.title}
      </h2>

      <label className="mt-4 block text-sm font-bold">
        {f.text}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={f.textPlaceholder}
          maxLength={300}
          rows={2}
          autoFocus
          className={`mt-1.5 w-full resize-none ${inputCls}`}
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-latte">{f.estimateHint}</p>
        <Button
          variant="secondary"
          onClick={estimate}
          disabled={busy || !text.trim()}
          className="px-3 py-1.5 text-xs"
        >
          {estimating ? f.estimating : f.estimate}
        </Button>
      </div>

      <label className="mt-5 block text-sm font-bold">
        {f.name}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={f.textPlaceholder}
          maxLength={120}
          className={`mt-1.5 w-full ${inputCls}`}
        />
      </label>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
