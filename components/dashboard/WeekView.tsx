'use client';

import { DayCard } from './DayCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { addDays, dateKey, planStart } from '@/lib/dates';
import type { DayName, MealPlan, MealSlot } from '@/lib/schemas';

const GRID = 'grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

export function WeekView({
  plan,
  target,
  eatenByDay,
  regeneratingDay,
  regeneratingMeal,
  onRegenerateDay,
  onRegenerateMeal,
  onPinSlot,
  pendingDays = 0,
  pendingSlots = 3,
}: {
  plan: MealPlan;
  target: number;
  eatenByDay?: Record<DayName, MealSlot[]>;
  regeneratingDay?: number | null;
  regeneratingMeal?: { dayIndex: number; slot: MealSlot } | null;
  onRegenerateDay?: (dayIndex: number, preference: string) => void;
  onRegenerateMeal?: (dayIndex: number, slot: MealSlot, preference: string) => void;
  onPinSlot?: (dayIndex: number, slot: MealSlot, dishId: string | null) => void;
  // Placeholder cards for days the generator hasn't reached yet, shaped like
  // the real ones so nothing shifts when a day lands.
  pendingDays?: number;
  pendingSlots?: number;
}) {
  const start = planStart(plan);
  const todayKey = dateKey(new Date());
  return (
    <div className={GRID}>
      {plan.days.map((day, i) => {
        // Only today and future days can be edited — the past is history.
        const editable = dateKey(addDays(start, i)) >= todayKey;
        return (
          <DayCard
            key={day.day}
            day={day}
            target={target}
            eaten={eatenByDay?.[day.day]}
            regenerating={regeneratingDay === i}
            onRegenerate={
              onRegenerateDay && editable
                ? (preference) => onRegenerateDay(i, preference)
                : undefined
            }
            onRegenerateMeal={
              onRegenerateMeal && editable
                ? (slot, preference) => onRegenerateMeal(i, slot, preference)
                : undefined
            }
            regeneratingSlot={regeneratingMeal?.dayIndex === i ? regeneratingMeal.slot : null}
            onPin={
              onPinSlot && editable ? (slot, dishId) => onPinSlot(i, slot, dishId) : undefined
            }
          />
        );
      })}
      {Array.from({ length: pendingDays }, (_, i) => (
        <DayCardSkeleton key={`pending-${i}`} slots={pendingSlots} />
      ))}
    </div>
  );
}

// Mirrors DayCard's box model — same padding, header, macros line and one
// block per meal — so a landed day replaces it without resizing the row.
function DayCardSkeleton({ slots = 3 }: { slots?: number }) {
  return (
    <div className="flex flex-col rounded-2xl border-2 border-dashed border-sand bg-paper/60 p-3">
      <div className="flex items-baseline justify-between">
        <Skeleton className="h-[18px] w-10" />
        <Skeleton className="h-[13px] w-8" />
      </div>
      <Skeleton className="mt-1 h-3 w-24" />
      <div className="mt-3 flex flex-1 flex-col gap-2">
        {Array.from({ length: slots }, (_, i) => (
          <Skeleton key={i} className="h-[54px] w-full" />
        ))}
      </div>
    </div>
  );
}

export function WeekSkeleton({ days = 7, slots = 3 }: { days?: number; slots?: number }) {
  return (
    <div className={GRID}>
      {Array.from({ length: days }, (_, i) => (
        <DayCardSkeleton key={i} slots={slots} />
      ))}
    </div>
  );
}
