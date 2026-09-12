'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/hooks/useI18n';
import type { Dict } from '@/lib/i18n';

const NAV_ITEMS: { href: string; icon: string; key: keyof Dict['shell']['nav'] }[] = [
  { href: '/dashboard', icon: '🍽️', key: 'today' },
  { href: '/dashboard/plan', icon: '📅', key: 'plan' },
  { href: '/dashboard/dishes', icon: '🍲', key: 'dishes' },
  { href: '/dashboard/pantry', icon: '🧊', key: 'pantry' },
  { href: '/dashboard/ingredients', icon: '🥕', key: 'ingredients' },
  { href: '/dashboard/cart', icon: '🛒', key: 'cart' },
  { href: '/dashboard/history', icon: '🗂️', key: 'history' },
];

// Vertical nav on ≥sm screens; a fixed bottom tab bar on phones, where seven
// labels would wrap, so the icon carries the item and the label stays for
// screen readers. Account and sign-out are not here — they live behind the
// header avatar.
export function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav
      aria-label={t.shell.navLabel}
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-peach-line bg-cream sm:static sm:z-auto sm:w-48 sm:shrink-0 sm:border-t-0 sm:bg-transparent"
    >
      <ul className="flex items-center justify-around gap-0.5 px-1.5 py-1.5 sm:flex-col sm:items-stretch sm:justify-start sm:gap-0 sm:px-0 sm:py-0">
        {NAV_ITEMS.map(({ href, icon, key }) => {
          const active = pathname === href;
          return (
            <li key={href} className="sm:w-full">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                title={t.shell.nav[key]}
                className={`flex h-11 w-11 items-center justify-center rounded-xl font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato sm:h-auto sm:w-full sm:justify-start sm:gap-2.5 sm:px-4 sm:py-2.5 sm:text-sm ${
                  active
                    ? 'bg-peach text-ink sm:border-2 sm:border-ink'
                    : 'text-latte hover:bg-ink/5 hover:text-ink'
                }`}
              >
                <span aria-hidden="true" className="text-xl sm:text-lg">
                  {icon}
                </span>
                <span className="sr-only sm:not-sr-only">{t.shell.nav[key]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
