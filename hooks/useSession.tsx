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
import {
  SessionPayloadSchema,
  type MealPlan,
  type Pins,
  type Profile,
  type ProfileInput,
  type Session,
  type SessionPayload,
} from '@/lib/schemas';

interface SessionState {
  loading: boolean;
  user: Session | null;
  profile: Profile | null;
  plan: MealPlan | null;
  pins: Pins;
  startGuest: () => Promise<Session>;
  startGoogle: (idToken: string) => Promise<Session>;
  saveProfile: (input: ProfileInput) => Promise<Profile>;
  setProfile: (profile: Profile) => void;
  setPlan: (plan: MealPlan) => void;
  // Re-read the server's copy — used when a stream leaves the client unsure
  // which plan is current.
  refresh: () => Promise<void>;
  setPins: (pins: Pins) => void;
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
  const [pins, setPinsState] = useState<Pins>({});

  const adopt = useCallback((payload: SessionPayload) => {
    setUser(payload.user);
    setProfile(payload.profile);
    setPlanState(payload.plan);
    setPinsState(payload.pins ?? {});
  }, []);

  // Every session payload is validated before it reaches state; a malformed
  // one leaves the session as it was rather than handing components a plan
  // they cannot render.
  const readPayload = useCallback(async (res: Response): Promise<SessionPayload | null> => {
    if (!res.ok) return null;
    const parsed = SessionPayloadSchema.safeParse(await res.json());
    if (!parsed.success) {
      console.error('invalid session payload', parsed.error.issues[0]);
      return null;
    }
    return parsed.data;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const payload = await readPayload(await fetch('/api/me'));
      if (payload) adopt(payload);
    } catch {
      // Offline or server error — keep whatever the session already holds.
    }
  }, [adopt, readPayload]);

  // One bootstrap call on app load: cookie → user + profile + latest plan + pins.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/me')
      .then(async (res) => {
        const payload = await readPayload(res);
        if (!cancelled && payload) adopt(payload);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [adopt, readPayload]);

  const createSession = useCallback(
    async (body: object): Promise<Session> => {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await readPayload(res);
      if (!payload) throw new Error('session_failed');
      adopt(payload);
      return payload.user;
    },
    [adopt, readPayload]
  );

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
  const setProfileValue = useCallback((p: Profile) => setProfile(p), []);
  const setPins = useCallback((p: Pins) => setPinsState(p), []);

  const logout = useCallback(async () => {
    await fetch('/api/session', { method: 'DELETE' }).catch(() => {});
    clearUserStorage();
    setUser(null);
    setProfile(null);
    setPlanState(null);
    setPinsState({});
  }, []);

  return (
    <SessionContext.Provider
      value={{
        loading,
        user,
        profile,
        plan,
        pins,
        startGuest,
        startGoogle,
        saveProfile,
        setProfile: setProfileValue,
        setPlan,
        refresh,
        setPins,
        logout,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
