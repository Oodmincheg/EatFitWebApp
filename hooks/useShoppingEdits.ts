'use client';

import { useCallback, useEffect, useState } from 'react';
import { SHOPPING_EDITS_PREFIX } from '@/lib/clientStorage';
import { categorize } from '@/lib/shopping';
import type { ShoppingItem } from '@/lib/schemas';

// The user's changes to a derived list: extra rows they added, weights they
// corrected, rows they struck out. Kept per plan in localStorage, like the
// ticks — the list itself is derived from the plan and never persisted.
export interface ShoppingEdits {
  extra: { name: string; grams: number }[];
  weights: Record<string, number>;
  removed: string[];
}

const EMPTY: ShoppingEdits = { extra: [], weights: {}, removed: [] };

function read(key: string): ShoppingEdits {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<ShoppingEdits>;
    return {
      extra: Array.isArray(parsed.extra) ? parsed.extra : [],
      weights: parsed.weights && typeof parsed.weights === 'object' ? parsed.weights : {},
      removed: Array.isArray(parsed.removed) ? parsed.removed : [],
    };
  } catch {
    return EMPTY;
  }
}

export function useShoppingEdits(planKey: string, items: ShoppingItem[]) {
  const key = `${SHOPPING_EDITS_PREFIX}${planKey}`;
  const [edits, setEdits] = useState<ShoppingEdits>(EMPTY);

  useEffect(() => {
    setEdits(read(key));
    try {
      // Drop edits left over from previous plans.
      Object.keys(localStorage)
        .filter((k) => k.startsWith(SHOPPING_EDITS_PREFIX) && k !== key)
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      // Storage unavailable — edits just won't persist.
    }
  }, [key]);

  const persist = useCallback(
    (next: ShoppingEdits) => {
      setEdits(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Storage unavailable — keep in-memory state only.
      }
    },
    [key]
  );

  const addItem = useCallback(
    (name: string, grams: number) => {
      const clean = name.trim();
      if (!clean) return;
      persist({
        ...edits,
        removed: edits.removed.filter((n) => n !== clean),
        extra: [...edits.extra.filter((e) => e.name !== clean), { name: clean, grams }],
      });
    },
    [edits, persist]
  );

  const setWeight = useCallback(
    (name: string, grams: number) => persist({ ...edits, weights: { ...edits.weights, [name]: grams } }),
    [edits, persist]
  );

  const removeItem = useCallback(
    (name: string) =>
      persist({
        ...edits,
        removed: [...new Set([...edits.removed, name])],
        extra: edits.extra.filter((e) => e.name !== name),
      }),
    [edits, persist]
  );

  const restoreAll = useCallback(() => persist({ ...edits, removed: [] }), [edits, persist]);

  // The plan's items with the user's weights applied, plus their own rows.
  const effective: ShoppingItem[] = [
    ...items.map((item) =>
      edits.weights[item.name] !== undefined
        ? { ...item, grams: edits.weights[item.name] }
        : item
    ),
    ...edits.extra
      .filter((e) => !items.some((i) => i.name === e.name))
      .map((e) => ({
        name: e.name,
        grams: edits.weights[e.name] ?? e.grams,
        usedIn: [],
        category: categorize(e.name),
        custom: true as const,
      })),
  ].filter((item) => !edits.removed.includes(item.name));

  return { edits, effective, addItem, setWeight, removeItem, restoreAll };
}
