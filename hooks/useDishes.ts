'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from './useSession';
import { DishSchema, type Dish, type DishEstimate, type DishInput, type MealPlan, type Pins } from '@/lib/schemas';

async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}`);
  return res.json();
}

// The user's own dishes. Edits and deletes may change the current plan
// (pinned slots) and the pin template, so both are pushed into the session.
export function useDishes(enabled = true) {
  const { setPlan, setPins } = useSession();
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    send<{ dishes: Dish[] }>('/api/dishes', 'GET')
      .then((data) => !cancelled && setDishes(DishSchema.array().parse(data.dishes)))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const create = useCallback(async (input: DishInput): Promise<Dish> => {
    const { dish } = await send<{ dish: Dish }>('/api/dishes', 'POST', input);
    const valid = DishSchema.parse(dish);
    setDishes((prev) => [valid, ...prev]);
    return valid;
  }, []);

  const update = useCallback(
    async (id: string, input: DishInput): Promise<Dish> => {
      const data = await send<{ dish: Dish; plan: MealPlan | null }>(`/api/dishes/${id}`, 'PUT', input);
      const valid = DishSchema.parse(data.dish);
      setDishes((prev) => prev.map((d) => (d.id === id ? valid : d)));
      if (data.plan) setPlan(data.plan);
      return valid;
    },
    [setPlan]
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      const data = await send<{ pins: Pins; plan: MealPlan | null }>(`/api/dishes/${id}`, 'DELETE');
      setDishes((prev) => prev.filter((d) => d.id !== id));
      setPins(data.pins);
      if (data.plan) setPlan(data.plan);
    },
    [setPlan, setPins]
  );

  const estimate = useCallback(
    (input: { name?: string; ingredients: { name: string; grams: number }[] }) =>
      send<DishEstimate>('/api/dishes/estimate', 'POST', input),
    []
  );

  return { dishes, loading, create, update, remove, estimate };
}
