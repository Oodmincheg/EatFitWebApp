'use client';

import { useCallback, useState } from 'react';
import { useSession } from './useSession';
import { dateKey } from '@/lib/dates';
import { PlanStreamEventSchema, type DayPlan, type MealSlot } from '@/lib/schemas';

export type PlanError = 'generation_failed' | 'upstream_error' | 'network' | null;

export interface PlanDraft {
  startDate: string;
  totalDays: number;
  days: DayPlan[];
}

async function toError(res: Response): Promise<PlanError> {
  const data = await res.json().catch(() => ({}));
  return data.error === 'generation_failed' ? 'generation_failed' : 'upstream_error';
}

export function usePlan() {
  const { plan, setPlan, refresh } = useSession();
  const [generating, setGenerating] = useState(false);
  // Days that have landed so far, so the week fills in as the model works.
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [regeneratingDay, setRegeneratingDay] = useState<number | null>(null);
  const [regeneratingMeal, setRegeneratingMeal] = useState<{
    dayIndex: number;
    slot: MealSlot;
  } | null>(null);
  const [error, setError] = useState<PlanError>(null);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setDraft(null);
    // Days that arrived before a failure are already persisted server-side;
    // declared out here so a thrown read still reaches the sync below.
    let landed = 0;
    try {
      // The plan starts today in the user's timezone — tell the server
      // which local date that is.
      const res = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: dateKey(new Date()) }),
      });
      if (!res.ok || !res.body) {
        setError(await toError(res));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finished = false;

      // NDJSON: complete lines are events, the tail stays buffered.
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let payload: unknown;
          try {
            payload = JSON.parse(line);
          } catch {
            setError('generation_failed');
            finished = true;
            break;
          }
          const parsed = PlanStreamEventSchema.safeParse(payload);
          if (!parsed.success) {
            setError('generation_failed');
            finished = true;
            break;
          }
          const event = parsed.data;
          if (event.type === 'start') {
            setDraft({ startDate: event.startDate, totalDays: event.totalDays, days: [] });
          } else if (event.type === 'day') {
            landed += 1;
            setDraft((prev) => (prev ? { ...prev, days: [...prev.days, event.day] } : prev));
          } else if (event.type === 'done') {
            setPlan(event.plan);
            landed = 0;
            finished = true;
          } else {
            setError(event.error === 'generation_failed' ? 'generation_failed' : 'upstream_error');
            finished = true;
          }
        }
      }
      if (!finished) setError('network');
      // A run that died after some days left a shorter plan in Mongo; adopt
      // it, or the UI would keep showing the previous one while the server
      // has already moved on.
      if (landed > 0) await refresh();
      if (!finished) setError('network');
    } catch {
      setError('network');
    } finally {
      setGenerating(false);
      setDraft(null);
    }
  }, [setPlan, refresh]);

  // Replace a single day of the current plan (today or a future day only).
  // `preference` is the user's free-text wish for that day.
  const regenerateDay = useCallback(
    async (dayIndex: number, preference: string) => {
      setRegeneratingDay(dayIndex);
      setError(null);
      try {
        const trimmed = preference.trim();
        const res = await fetch('/api/regenerate-day', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dayIndex,
            today: dateKey(new Date()),
            ...(trimmed ? { preference: trimmed } : {}),
          }),
        });
        if (res.ok) setPlan(await res.json());
        else setError(await toError(res));
      } catch {
        setError('network');
      } finally {
        setRegeneratingDay(null);
      }
    },
    [setPlan]
  );

  // Replace one meal, leaving the rest of that day alone.
  const regenerateMeal = useCallback(
    async (dayIndex: number, slot: MealSlot, preference: string) => {
      setRegeneratingMeal({ dayIndex, slot });
      setError(null);
      try {
        const trimmed = preference.trim();
        const res = await fetch('/api/regenerate-meal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dayIndex,
            slot,
            today: dateKey(new Date()),
            ...(trimmed ? { preference: trimmed } : {}),
          }),
        });
        if (res.ok) setPlan(await res.json());
        else setError(await toError(res));
      } catch {
        setError('network');
      } finally {
        setRegeneratingMeal(null);
      }
    },
    [setPlan]
  );

  return {
    plan,
    draft,
    generating,
    regeneratingDay,
    regeneratingMeal,
    error,
    generate,
    regenerateDay,
    regenerateMeal,
  };
}
