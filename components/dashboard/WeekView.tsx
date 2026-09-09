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
  onRegenerateDay,
  onPinSlot,
}: {
  plan: MealPlan;
  target: number;
  eatenByDay?: Record<DayName, MealSlot[]>;
  regeneratingDay?: number | null;
  onRegenerateDay?: (dayIndex: number, preference: string) => void;
  onPinSlot?: (dayIndex: number, slot: MealSlot, dishId: string | null) => void;
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
            onPin={
              onPinSlot && editable ? (slot, dishId) => onPinSlot(i, slot, dishId) : undefined
            }
          />
        );
      })}
    </div>
  );
}

export function WeekSkeleton() {
  return (
    <div className={GRID}>
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="rounded-2xl border-2 border-ink bg-white p-3">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="mt-3 h-14 w-full" />
          <Skeleton className="mt-2 h-14 w-full" />
          <Skeleton className="mt-2 h-14 w-full" />
        </div>
      ))}
    </div>
  );
}
