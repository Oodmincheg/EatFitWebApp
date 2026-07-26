'use client';

import { useCallback, useState } from 'react';
import { useSession } from './useSession';
import { dateKey } from '@/lib/dates';

export type PlanError = 'generation_failed' | 'upstream_error' | 'network' | null;

export function usePlan() {
  const { plan, setPlan } = useSession();
  const [generating, setGenerating] = useState(false);
  const [regeneratingDay, setRegeneratingDay] = useState<number | null>(null);
  const [error, setError] = useState<PlanError>(null);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      // The plan starts today in the user's timezone — tell the server
      // which local date that is.
      const res = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: dateKey(new Date()) }),
      });
      if (res.ok) {
        setPlan(await res.json());
      } else {
        const data = await res.json().catch(() => ({}));
        setError(
          data.error === 'generation_failed' ? 'generation_failed' : 'upstream_error'
        );
      }
    } catch {
      setError('network');
    } finally {
      setGenerating(false);
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
        if (res.ok) {
          setPlan(await res.json());
        } else {
          const data = await res.json().catch(() => ({}));
          setError(
            data.error === 'generation_failed' ? 'generation_failed' : 'upstream_error'
          );
        }
      } catch {
        setError('network');
      } finally {
        setRegeneratingDay(null);
      }
    },
    [setPlan]
  );

  return { plan, generating, regeneratingDay, error, generate, regenerateDay };
}
