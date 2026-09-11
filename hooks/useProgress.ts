'use client';

import { useCallback, useEffect, useState } from 'react';
import { addDays, dateKey, weekStart } from '@/lib/dates';
import type { DayProgress, EatenExtra, EatenExtraInput, ExtraEstimate, MealSlot } from '@/lib/schemas';

// Progress keyed by local date for the given date range — defaults to the
// current calendar week (Mon–Sun). Toggles are optimistic and rolled back
// if the server rejects them; extras wait for the server, since their id
// is minted there.
export function useProgress(range?: { from: string; to: string }) {
  const [byDate, setByDate] = useState<Record<string, MealSlot[]>>({});
  const [extrasByDate, setExtrasByDate] = useState<Record<string, EatenExtra[]>>({});
  const [loading, setLoading] = useState(true);

  const monday = weekStart(new Date());
  const from = range?.from ?? dateKey(monday);
  const to = range?.to ?? dateKey(addDays(monday, 6));

  const applyDay = useCallback((day: DayProgress) => {
    setByDate((prev) => ({ ...prev, [day.date]: day.eaten }));
    setExtrasByDate((prev) => ({ ...prev, [day.date]: day.extras ?? [] }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/progress?from=${from}&to=${to}`)
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const data: { days: DayProgress[] } = await res.json();
        setByDate(Object.fromEntries(data.days.map((d) => [d.date, d.eaten])));
        setExtrasByDate(Object.fromEntries(data.days.map((d) => [d.date, d.extras ?? []])));
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
        applyDay(data.day);
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
    [applyDay]
  );

  const addExtra = useCallback(
    async (date: string, input: EatenExtraInput) => {
      const res = await fetch('/api/progress/extras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, ...input }),
      });
      if (!res.ok) throw new Error('add_extra_failed');
      const data: { day: DayProgress } = await res.json();
      applyDay(data.day);
    },
    [applyDay]
  );

  const removeExtra = useCallback(
    async (date: string, id: string) => {
      const before = extrasByDate[date] ?? [];
      setExtrasByDate((prev) => ({ ...prev, [date]: (prev[date] ?? []).filter((e) => e.id !== id) }));
      try {
        const res = await fetch('/api/progress/extras', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, id }),
        });
        if (!res.ok) throw new Error('remove_extra_failed');
        const data: { day: DayProgress } = await res.json();
        applyDay(data.day);
      } catch {
        setExtrasByDate((prev) => ({ ...prev, [date]: before }));
        throw new Error('remove_extra_failed');
      }
    },
    [applyDay, extrasByDate]
  );

  const estimateExtra = useCallback(async (text: string): Promise<ExtraEstimate> => {
    const res = await fetch('/api/progress/extras/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error('estimate_failed');
    return res.json();
  }, []);

  return { byDate, extrasByDate, loading, toggle, addExtra, removeExtra, estimateExtra };
}
