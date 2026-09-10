'use client';

import { useI18n } from '@/hooks/useI18n';
import { addDays, dateKey, weekStart } from '@/lib/dates';
import { DAY_NAMES, type MealSlot } from '@/lib/schemas';

// Mon–Sun overview of the current week: one dot per meal slot of the day.
export function WeekStrip({
  byDate,
  todayKey,
  slotCount = 3,
}: {
  byDate: Record<string, MealSlot[]>;
  todayKey: string;
  slotCount?: number;
}) {
  const { t } = useI18n();
  const monday = weekStart(new Date());

  return (
    <ol className="flex justify-between gap-1.5 sm:gap-2">
      {DAY_NAMES.map((name, i) => {
        const key = dateKey(addDays(monday, i));
        const eaten = byDate[key]?.length ?? 0;
        const isToday = key === todayKey;
        const isFuture = key > todayKey;
        return (
          <li
            key={name}
            className={`flex flex-1 flex-col items-center gap-1.5 rounded-xl border-2 px-1 py-2 ${
              isToday ? 'border-ink bg-peach' : 'border-transparent'
            } ${isFuture ? 'opacity-45' : ''}`}
            aria-label={t.today.stripAria(t.days[name].label, eaten, slotCount)}
          >
            <span className="text-[10px] font-bold tracking-wide text-latte uppercase">
              {t.days[name].short}
            </span>
            <span className="flex gap-1" aria-hidden="true">
              {Array.from({ length: slotCount }, (_, dot) => (
                <span
                  key={dot}
                  className={`h-2 w-2 rounded-full ${
                    dot < eaten ? 'bg-lime' : 'border border-sand/60 bg-paper'
                  }`}
                />
              ))}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
