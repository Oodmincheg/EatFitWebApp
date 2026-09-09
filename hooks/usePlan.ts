'use client';

import { useCallback, useState } from 'react';
import { useSession } from './useSession';
import { dateKey } from '@/lib/dates';
import type { DayPlan, MealPlan, MealSlot } from '@/lib/schemas';

export type PlanError = 'generation_failed' | 'upstream_error' | 'network' | null;

// What the streaming generate route sends, one JSON object per line.
type StreamEvent =
  | { type: 'start'; totalDays: number; startDate: string }
  | { type: 'day'; index: number; day: DayPlan }
  | { type: 'done'; plan: MealPlan }
  | { type: 'error'; error: string; partial: boolean };

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
  const { plan, setPlan } = useSession();
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
          let event: StreamEvent;
          try {
            event = JSON.parse(line) as StreamEvent;
          } catch {
            continue;
          }
          if (event.type === 'start') {
            setDraft({ startDate: event.startDate, totalDays: event.totalDays, days: [] });
          } else if (event.type === 'day') {
            setDraft((prev) => (prev ? { ...prev, days: [...prev.days, event.day] } : prev));
          } else if (event.type === 'done') {
            setPlan(event.plan);
            finished = true;
          } else {
            setError(event.error === 'generation_failed' ? 'generation_failed' : 'upstream_error');
            finished = true;
          }
        }
      }
      if (!finished) setError('network');
    } catch {
      setError('network');
    } finally {
      setGenerating(false);
      setDraft(null);
    }
  }, [setPlan]);

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
