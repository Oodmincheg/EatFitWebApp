'use client';

import { useMemo, useState } from 'react';
import { DishPicker } from './DishPicker';
import { useDishes } from '@/hooks/useDishes';
import { useI18n } from '@/hooks/useI18n';
import { usePins } from '@/hooks/usePins';
import { useSession } from '@/hooks/useSession';
import { profileSlots } from '@/lib/profile';
import { DAY_NAMES, DEFAULT_MEAL_SLOTS, type DayName, type MealSlot } from '@/lib/schemas';

// The weekly pin template, shown before a plan exists: seven days × the
// profile's meal slots,
// each either one of the user's dishes or empty for the AI to fill.
export function WeekTemplate() {
  const { t } = useI18n();
  const { pins, pin } = usePins();
  const { profile } = useSession();
  const { dishes } = useDishes();
  const slots = profile ? profileSlots(profile) : DEFAULT_MEAL_SLOTS;
  const byId = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);
  const [picker, setPicker] = useState<{ day: DayName; slot: MealSlot } | null>(null);
  const currentId = picker ? pins[picker.day]?.[picker.slot] : undefined;

  return (
    <section className="rounded-3xl border-2 border-ink bg-paper p-4 sm:p-5">
      <h2 className="font-display text-lg font-extrabold">{t.pins.templateTitle}</h2>
      <p className="mt-1 text-sm font-semibold text-latte">{t.pins.templateText}</p>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {DAY_NAMES.map((day) => (
          <div key={day} className="rounded-2xl border-2 border-peach-line bg-cream p-3">
            <h3 className="font-display text-[15px] font-extrabold" title={t.days[day].label}>
              {t.days[day].short}
            </h3>
            <ul className="mt-2 flex flex-col gap-1.5">
              {slots.map((slot) => {
                const id = pins[day]?.[slot];
                const dish = id ? byId.get(id) : undefined;
                return (
                  <li key={slot}>
                    <button
                      onClick={() => setPicker({ day, slot })}
                      className={`w-full rounded-[9px] px-2 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato ${
                        dish ? 'bg-peach hover:brightness-[.97]' : 'border-2 border-dashed border-sand bg-paper hover:border-ink'
                      }`}
                    >
                      <span className="block text-[9px] font-bold tracking-wide text-latte">
                        {t.mealLabels[slot]}
                      </span>
                      {dish ? (
                        <>
                          <span className="block text-xs font-semibold leading-tight">📌 {dish.name}</span>
                          <span className="font-mono text-[10px] font-bold text-sand">
                            {t.pins.kcal(dish.kcal)}
                          </span>
                        </>
                      ) : (
                        <span className="block text-xs font-semibold text-latte">{t.pins.emptySlot}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <DishPicker
        open={picker !== null}
        title={picker ? t.pins.pickTitle(t.meals[picker.slot], t.days[picker.day].label) : ''}
        currentId={currentId}
        onPick={async (id) => {
          if (picker) await pin(picker.day, picker.slot, id);
          setPicker(null);
        }}
        onUnpin={async () => {
          if (picker) await pin(picker.day, picker.slot, null);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
    </section>
  );
}
