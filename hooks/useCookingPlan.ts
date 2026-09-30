'use client';

import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { useSession } from './useSession';
import { CookingPlanSchema, CookingResponseSchema, type CookingAction, type CookingPlan } from '@/lib/schemas';
import { validateCookingPlan } from '@/lib/cookingPlan';

export function useCookingPlan() {
  const { cookingPlan: plan, setCookingPlan, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  async function send(url: string, method: string, body: unknown): Promise<boolean> {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data: unknown = await res.json();
      if (!res.ok) {
        const parsed = z.object({ error: z.string() }).safeParse(data);
        const code = parsed.success ? parsed.data.error : 'server_error';
        if (code === 'plan_conflict') await refresh();
        setError(code);
        return false;
      }
      setCookingPlan(validateCookingPlan(CookingResponseSchema.parse(data).plan));
      return true;
    } catch {
      setError('server_error');
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return {
    plan, busy, error, clearError: () => setError(null),
    mutate: (action: CookingAction) => send('/api/cooking-plan', 'PUT', { planId: plan?.id, revision: plan?.revision, action }),
    generate: (experimentalDishIds: string[]) => send('/api/cooking-plan/generate', 'POST', { planId: plan?.id, revision: plan?.revision, experimentalDishIds }),
  };
}

export function useCookingHistory() {
  const [plans, setPlans] = useState<CookingPlan[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/cooking-plan')
      .then(async (res) => {
        if (!res.ok) throw new Error('history_failed');
        return z.object({ plans: z.array(CookingPlanSchema) }).parse(await res.json()).plans.map(validateCookingPlan);
      })
      .then((data) => { if (!cancelled) setPlans(data); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);
  return { plans, error };
}
