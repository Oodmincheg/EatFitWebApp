'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';
import { firebaseAvailable, signInWithGoogle } from '@/lib/firebase';

const ITEM =
  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-latte transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato disabled:cursor-not-allowed disabled:text-sand';

// The avatar is the only account affordance in the header; the name, the
// account page and sign-in/out live behind it so phones keep the bar short.
export function AccountMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const { t } = useI18n();
  const { user, startGoogle, logout } = useSession();
  const [open, setOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  if (!user) return null;

  const displayName = user.kind === 'google' ? user.displayName || user.email : t.shell.guest;
  const initial = (displayName || 'g').trim().charAt(0).toUpperCase();

  const handleGoogle = async () => {
    setAuthBusy(true);
    try {
      const { idToken } = await signInWithGoogle();
      const session = await startGoogle(idToken);
      toast(
        session.kind === 'google'
          ? t.shell.signedInAs(session.displayName || session.email)
          : t.shell.signedInGoogle,
      );
      setOpen(false);
    } catch {
      toast(t.shell.googleFailed);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    router.push('/');
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t.shell.accountMenu}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink bg-lime text-[13px] font-extrabold text-white transition-colors hover:bg-lime-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
      >
        <span aria-hidden="true">{initial}</span>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t.shell.accountMenu}
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-60 rounded-2xl border-2 border-ink bg-paper p-1.5 shadow-[0_16px_40px_-16px_rgba(42,26,18,.5)]"
        >
          <p className="truncate px-3 py-2 text-[13.5px] font-semibold text-latte">
            {t.shell.hello(displayName)}
          </p>
          <div className="my-1 border-t-2 border-peach-line" />
          <Link href="/dashboard/account" role="menuitem" className={ITEM}>
            <span aria-hidden="true" className="text-lg">
              👤
            </span>
            {t.shell.nav.account}
          </Link>
          {user.kind === 'guest' && firebaseAvailable && (
            <button
              type="button"
              role="menuitem"
              onClick={handleGoogle}
              disabled={authBusy}
              className={ITEM}
            >
              <span aria-hidden="true" className="text-lg">
                🔑
              </span>
              {t.shell.signInGoogle}
            </button>
          )}
          <button type="button" role="menuitem" onClick={handleLogout} className={ITEM}>
            <span aria-hidden="true" className="text-lg">
              🚪
            </span>
            {t.shell.logout}
          </button>
        </div>
      )}
    </div>
  );
}
