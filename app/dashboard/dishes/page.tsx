'use client';

import { useState } from 'react';
import { DishForm } from '@/components/dashboard/DishForm';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useDishes } from '@/hooks/useDishes';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';
import type { Dish, DishInput } from '@/lib/schemas';

export default function DishesPage() {
  const { t } = useI18n();
  const toast = useToast();
  const { profile } = useSession();
  const { dishes, loading, create, update, remove, estimate } = useDishes();
  // null = closed; 'new' = creating; a dish = editing it.
  const [editing, setEditing] = useState<Dish | 'new' | null>(null);
  // Two-step delete: the first click arms, the second deletes.
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (!profile) return null;

  const save = async (input: DishInput) => {
    if (editing === 'new') await create(input);
    else if (editing) await update(editing.id, input);
    setEditing(null);
  };

  const del = async (dish: Dish) => {
    if (confirmId !== dish.id) {
      setConfirmId(dish.id);
      return;
    }
    setConfirmId(null);
    try {
      await remove(dish.id);
    } catch {
      toast(t.dishes.removeFailed);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold">{t.dishes.title}</h1>
          <p className="mt-0.5 max-w-xl text-sm font-semibold text-latte">{t.dishes.subtitle}</p>
        </div>
        <Button onClick={() => setEditing('new')}>{t.dishes.add}</Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : dishes.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-sand py-16 text-center">
          <p className="text-3xl" aria-hidden="true">
            🍲
          </p>
          <p className="mt-3 font-display text-lg font-extrabold">{t.dishes.empty}</p>
          <p className="mt-1 text-sm text-latte">{t.dishes.emptyText}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {dishes.map((dish) => (
            <li
              key={dish.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-3xl border-2 border-ink bg-paper px-5 py-4"
            >
              <div className="min-w-0 flex-1">
                <p className="font-display text-[15px] font-extrabold">{dish.name}</p>
                <p className="mt-0.5 font-mono text-xs font-bold text-latte">
                  {t.pins.kcal(dish.kcal)} · {t.day.macrosShort(dish.protein_g, dish.fat_g, dish.carbs_g)}
                </p>
                <p className="mt-0.5 truncate text-xs text-latte">
                  {dish.ingredients.length > 0
                    ? dish.ingredients.map((i) => i.name).join(', ')
                    : t.dishes.ingredientsCount(0)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" className="px-4 py-2 text-xs" onClick={() => setEditing(dish)}>
                  {t.dishes.edit}
                </Button>
                <Button
                  variant={confirmId === dish.id ? 'primary' : 'ghost'}
                  className="px-4 py-2 text-xs"
                  onClick={() => del(dish)}
                  onBlur={() => confirmId === dish.id && setConfirmId(null)}
                >
                  {confirmId === dish.id ? t.dishes.confirmRemove(dish.name) : t.dishes.remove}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <DishForm
        open={editing !== null}
        dish={editing === 'new' ? null : editing}
        onSave={save}
        onEstimate={estimate}
        onClose={() => setEditing(null)}
      />
    </>
  );
}
