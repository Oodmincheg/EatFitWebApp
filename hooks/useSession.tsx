'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { clearUserStorage } from '@/lib/clientStorage';
import type { MealPlan, Profile, ProfileInput, Session } from '@/lib/schemas';

interface SessionState {
  loading: boolean;
  user: Session | null;
  profile: Profile | null;
  plan: MealPlan | null;
  startGuest: () => Promise<Session>;
  startGoogle: (idToken: string) => Promise<Session>;
  saveProfile: (input: ProfileInput) => Promise<Profile>;
  setPlan: (plan: MealPlan) => void;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within <SessionProvider>');
  return ctx;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [plan, setPlanState] = useState<MealPlan | null>(null);

  // One bootstrap call on app load: cookie → user + profile + latest plan.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/me')
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setProfile(data.profile);
          setPlanState(data.plan);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const createSession = useCallback(async (body: object): Promise<Session> => {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('session_failed');
    const data = await res.json();
    setUser(data.user);
    setProfile(data.profile);
    setPlanState(data.plan ?? null);
    return data.user;
  }, []);

  const startGuest = useCallback(() => createSession({}), [createSession]);
  const startGoogle = useCallback(
    (idToken: string) => createSession({ idToken }),
    [createSession]
  );

  const saveProfile = useCallback(async (input: ProfileInput): Promise<Profile> => {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error('profile_failed');
    const data = await res.json();
    setProfile(data.profile);
    return data.profile;
  }, []);

  const setPlan = useCallback((p: MealPlan) => setPlanState(p), []);

  const logout = useCallback(async () => {
    await fetch('/api/session', { method: 'DELETE' }).catch(() => {});
    clearUserStorage();
    setUser(null);
    setProfile(null);
    setPlanState(null);
  }, []);

  return (
    <SessionContext.Provider
      value={{
        loading,
        user,
        profile,
        plan,
        startGuest,
        startGoogle,
        saveProfile,
        setPlan,
        logout,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
