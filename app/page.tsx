'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/landing/Header';
import { Hero } from '@/components/landing/Hero';
import { Marquee } from '@/components/landing/Marquee';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Features } from '@/components/landing/Features';
import { Cta } from '@/components/landing/Cta';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { useSession } from '@/hooks/useSession';

export default function LandingPage() {
  const router = useRouter();
  const { loading, user, profile } = useSession();
  const [authOpen, setAuthOpen] = useState(false);

  // §3.1: a signed-in user never sees the landing — straight to today
  // (or onboarding when the profile is missing).
  useEffect(() => {
    if (loading || !user) return;
    router.replace(profile ? '/dashboard' : '/onboarding');
  }, [loading, user, profile, router]);

  const openAuth = () => setAuthOpen(true);

  if (user) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <Header onLogin={openAuth} />
      <main className="flex-1">
        <Hero onCta={openAuth} />
        <Marquee />
        <HowItWorks />
        <Features />
        <Cta onCta={openAuth} />
      </main>
      <footer className="border-t-2 border-peach-line py-6 text-center text-sm font-semibold text-latte">
        EatFit · {new Date().getFullYear()}
      </footer>
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
