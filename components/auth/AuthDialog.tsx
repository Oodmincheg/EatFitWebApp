'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/hooks/useSession';
import { firebaseAvailable, signInWithGoogle } from '@/lib/firebase';

export function AuthDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, startGuest, startGoogle } = useSession();
  const [busy, setBusy] = useState(false);

  const routeAfterAuth = (hasProfile: boolean) => {
    router.push(hasProfile ? '/dashboard' : '/onboarding');
  };

  const handleGuest = async () => {
    setBusy(true);
    try {
      await startGuest();
      routeAfterAuth(false);
    } catch {
      toast('Could not start a session. Try again.');
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    try {
      const { idToken } = await signInWithGoogle();
      await startGoogle(idToken);
      // profile may have been loaded by the session call; re-check via /api/me
      const me = await fetch('/api/me').then((r) => (r.ok ? r.json() : null));
      routeAfterAuth(Boolean(me?.profile ?? profile));
    } catch {
      // popup closed/blocked or Firebase error → non-blocking toast, stay here
      toast('Google sign-in was cancelled or blocked. You can continue as guest.');
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} labelledBy="auth-title">
      <h2 id="auth-title" className="font-display text-2xl font-extrabold">
        Get started
      </h2>
      <p className="mt-1 text-sm text-latte">
        Sign in to save your plan, or jump straight in as a guest.
      </p>
      <div className="mt-5 flex flex-col gap-3">
        {firebaseAvailable && (
          <Button variant="secondary" onClick={handleGoogle} disabled={busy}>
            <GoogleIcon />
            Continue with Google
          </Button>
        )}
        <Button onClick={handleGuest} disabled={busy}>
          Continue as guest
        </Button>
      </div>
      <button
        onClick={onClose}
        className="mt-4 text-sm font-semibold text-latte hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
      >
        Cancel
      </button>
    </Modal>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}
