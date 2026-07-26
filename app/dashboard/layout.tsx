'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/hooks/useSession';
import { firebaseAvailable, signInWithGoogle } from '@/lib/firebase';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const { loading, user, profile, startGoogle, logout } = useSession();
  const [authBusy, setAuthBusy] = useState(false);

  const handleGoogle = async () => {
    setAuthBusy(true);
    try {
      const { idToken } = await signInWithGoogle();
      const session = await startGoogle(idToken);
      toast(
        session.kind === 'google'
          ? `Signed in as ${session.displayName || session.email}`
          : 'Signed in with Google'
      );
    } catch {
      toast('Google sign-in was cancelled or blocked.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  // §3.1 guards: no session → landing; session but no profile → onboarding.
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/');
    else if (!profile) router.replace('/onboarding');
  }, [loading, user, profile, router]);

  if (loading || !user || !profile) {
    return <main className="p-8 text-center text-sm font-medium text-sand">Loading…</main>;
  }

  const displayName = user.kind === 'google' ? user.displayName || user.email : 'guest';
  const initial = (displayName || 'g').trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen">
      <header className="border-b-2 border-peach-line bg-cream">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-4">
          <Link
            href="/"
            className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
          >
            <Logo size="sm" />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-[13.5px] font-semibold text-latte sm:inline">
              Hey, {displayName} 👋
            </span>
            {user.kind === 'guest' && firebaseAvailable && (
              <Button variant="secondary" onClick={handleGoogle} disabled={authBusy}>
                Sign in with Google
              </Button>
            )}
            <Button variant="ghost" onClick={handleLogout}>
              Log out
            </Button>
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink bg-lime text-[13px] font-extrabold text-white"
            >
              {initial}
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-8 pb-24 sm:pb-8">
        <Sidebar />
        <main className="min-w-0 flex-1 space-y-6">{children}</main>
      </div>
    </div>
  );
}
