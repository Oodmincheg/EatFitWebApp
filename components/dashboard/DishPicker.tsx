'use client';

import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useDishes } from '@/hooks/useDishes';
import { useI18n } from '@/hooks/useI18n';

// Pick one of the user's dishes for a day/slot; `currentId` marks the dish
// already pinned there and enables "Unpin".
export function DishPicker({
  open,
  title,
  currentId,
  onPick,
  onUnpin,
  onClose,
}: {
  open: boolean;
  title: string;
  currentId?: string;
  onPick: (dishId: string) => void;
  onUnpin?: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { dishes, loading } = useDishes(open);

  return (
    <Modal open={open} onClose={onClose} labelledBy="dish-picker-title">
      <h2 id="dish-picker-title" className="font-display text-xl font-extrabold">
        {title}
      </h2>
      <p className="mt-1 text-sm font-semibold text-latte">{t.pins.pickText}</p>

      {loading ? (
        <ul className="mt-4 flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-14 animate-pulse rounded-xl bg-peach/60" />
          ))}
        </ul>
      ) : dishes.length === 0 ? (
        <div className="mt-4 rounded-xl border-2 border-dashed border-sand p-4 text-center text-sm text-latte">
          {t.pins.pickEmpty}{' '}
          <Link
            href="/dashboard/dishes"
            className="font-bold text-tomato underline-offset-2 hover:underline"
          >
            {t.pins.pickEmptyLink}
          </Link>
        </div>
      ) : (
        <ul className="mt-4 flex max-h-80 flex-col gap-2 overflow-y-auto">
          {dishes.map((d) => {
            const active = d.id === currentId;
            return (
              <li key={d.id}>
                <button
                  onClick={() => onPick(d.id)}
                  aria-pressed={active}
                  className={`w-full rounded-xl border-2 px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato ${
                    active ? 'border-ink bg-peach' : 'border-peach-line bg-white hover:border-ink'
                  }`}
                >
                  <span className="block text-sm font-semibold text-ink">{d.name}</span>
                  <span className="block font-mono text-xs font-bold text-latte">
                    {t.pins.kcal(d.kcal)} · {t.day.macrosShort(d.protein_g, d.fat_g, d.carbs_g)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-6 flex justify-end gap-3">
        {currentId && onUnpin && (
          <Button variant="secondary" onClick={onUnpin}>
            {t.pins.unpin}
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          {t.common.cancel}
        </Button>
      </div>
    </Modal>
  );
}
