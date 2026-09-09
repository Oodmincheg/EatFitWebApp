'use client';

import { useCallback } from 'react';
import { useSession } from './useSession';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from './useI18n';
import { dateKey } from '@/lib/dates';
import type { DayName, MealPlan, MealSlot, Pins } from '@/lib/schemas';

// Pin one of the user's dishes into a day/slot of the weekly template (or
// unpin with null). The server also swaps the slot in the current plan when
// that day is today or later, and returns both.
export function usePins() {
  const { pins, setPins, setPlan } = useSession();
  const toast = useToast();
  const { t } = useI18n();

  const pin = useCallback(
    async (day: DayName, slot: MealSlot, dishId: string | null): Promise<boolean> => {
      try {
        const res = await fetch('/api/pins', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ day, slot, dishId, today: dateKey(new Date()) }),
        });
        if (!res.ok) throw new Error('pin_failed');
        const data: { pins: Pins; plan: MealPlan | null } = await res.json();
        setPins(data.pins);
        if (data.plan) setPlan(data.plan);
        return true;
      } catch {
        toast(t.pins.pinFailed);
        return false;
      }
    },
    [setPins, setPlan, toast, t]
  );

  return { pins, pin };
}
