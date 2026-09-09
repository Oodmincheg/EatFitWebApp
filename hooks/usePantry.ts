'use client';

import { useCallback, useState } from 'react';
import { useSession } from './useSession';
import type { PantryItem } from '@/lib/schemas';

// The pantry lives on the profile; this hook only writes it, so the session
// keeps holding the single source of truth.
export function usePantry() {
  const { profile, setProfile } = useSession();
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (pantry: PantryItem[]) => {
      setSaving(true);
      try {
        const res = await fetch('/api/pantry', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pantry }),
        });
        if (!res.ok) throw new Error('pantry_failed');
        const data = await res.json();
        setProfile(data.profile);
      } finally {
        setSaving(false);
      }
    },
    [setProfile]
  );

  return { pantry: profile?.pantry ?? [], saving, save };
}
