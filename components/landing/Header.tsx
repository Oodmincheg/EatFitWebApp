'use client';

import { Button } from '@/components/ui/Button';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Logo } from '@/components/ui/Logo';
import { useI18n } from '@/hooks/useI18n';

export function Header({ onLogin }: { onLogin: () => void }) {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-40 border-b-2 border-peach-line bg-cream/90 backdrop-blur">
      <div className="anim-drop mx-auto flex h-[72px] max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav className="flex items-center gap-4 sm:gap-6">
          <div className="hidden items-center gap-6 text-[14.5px] font-semibold text-latte md:flex">
            <a href="#how-it-works" className="transition-colors hover:text-ink">
              {t.landing.nav.how}
            </a>
            <a href="#features" className="transition-colors hover:text-ink">
              {t.landing.nav.features}
            </a>
          </div>
          <LanguageToggle />
          <ThemeToggle />
          <Button onClick={onLogin}>{t.landing.nav.start}</Button>
        </nav>
      </div>
    </header>
  );
}
