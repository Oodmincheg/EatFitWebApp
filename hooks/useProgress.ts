'use client';

import { useCallback, useEffect, useState } from 'react';
import { addDays, dateKey, weekStart } from '@/lib/dates';
import type { DayProgress, MealSlot } from '@/lib/schemas';

// Progress keyed by local date for the given date range — defaults to the
// current calendar week (Mon–Sun). Toggles are optimistic and rolled back
// if the server rejects them.
export function useProgress(range?: { from: string; to: string }) {
  const [byDate, setByDate] = useState<Record<string, MealSlot[]>>({});
  const [loading, setLoading] = useState(true);

  const monday = weekStart(new Date());
  const from = range?.from ?? dateKey(monday);
  const to = range?.to ?? dateKey(addDays(monday, 6));

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/progress?from=${from}&to=${to}`)
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const data: { days: DayProgress[] } = await res.json();
        setByDate(Object.fromEntries(data.days.map((d) => [d.date, d.eaten])));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const toggle = useCallback(
    async (date: string, slot: MealSlot, eaten: boolean) => {
      setByDate((prev) => {
        const current = prev[date] ?? [];
        const next = eaten
          ? [...new Set([...current, slot])]
          : current.filter((s) => s !== slot);
        return { ...prev, [date]: next };
      });
      try {
        const res = await fetch('/api/progress', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, slot, eaten }),
        });
        if (!res.ok) throw new Error('toggle_failed');
        const data: { day: DayProgress } = await res.json();
        setByDate((prev) => ({ ...prev, [date]: data.day.eaten }));
      } catch {
        // Roll back the optimistic flip.
        setByDate((prev) => {
          const current = prev[date] ?? [];
          const next = eaten
            ? current.filter((s) => s !== slot)
            : [...new Set([...current, slot])];
          return { ...prev, [date]: next };
        });
      }
    },
    []
  );

  return { byDate, loading, toggle };
}
