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
}: {
  plan: MealPlan;
  target: number;
  eatenByDay?: Record<DayName, MealSlot[]>;
  regeneratingDay?: number | null;
  regeneratingMeal?: { dayIndex: number; slot: MealSlot } | null;
  onRegenerateDay?: (dayIndex: number, preference: string) => void;
  onRegenerateMeal?: (dayIndex: number, slot: MealSlot, preference: string) => void;
  onPinSlot?: (dayIndex: number, slot: MealSlot, dishId: string | null) => void;
  // Placeholder cards for days the generator hasn't reached yet.
  pendingDays?: number;
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
        <DayCardSkeleton key={`pending-${i}`} />
      ))}
    </div>
  );
}

function DayCardSkeleton() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-sand bg-paper/60 p-3">
      <Skeleton className="h-4 w-12" />
      <Skeleton className="mt-3 h-14 w-full" />
      <Skeleton className="mt-2 h-14 w-full" />
      <Skeleton className="mt-2 h-14 w-full" />
    </div>
  );
}

export function WeekSkeleton({ days = 7 }: { days?: number }) {
  return (
    <div className={GRID}>
      {Array.from({ length: days }, (_, i) => (
        <DayCardSkeleton key={i} />
      ))}
    </div>
  );
}
