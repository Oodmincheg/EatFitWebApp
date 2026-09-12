'use client';

import { ReactNode, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AccountMenu } from '@/components/dashboard/AccountMenu';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Logo } from '@/components/ui/Logo';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { t } = useI18n();
  const { loading, user, profile } = useSession();

  // §3.1 guards: no session → landing; session but no profile → onboarding.
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/');
    else if (!profile) router.replace('/onboarding');
  }, [loading, user, profile, router]);

  if (loading || !user || !profile) {
    return <main className="p-8 text-center text-sm font-medium text-sand">{t.common.loading}</main>;
  }

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
            <LanguageToggle />
            <ThemeToggle />
            <AccountMenu />
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
