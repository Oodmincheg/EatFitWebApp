'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/hooks/useI18n';
import type { Dict } from '@/lib/i18n';

const NAV_ITEMS: { href: string; icon: string; key: keyof Dict['shell']['nav'] }[] = [
  { href: '/dashboard', icon: '🍽️', key: 'today' },
  { href: '/dashboard/plan', icon: '📅', key: 'plan' },
  { href: '/dashboard/ingredients', icon: '🥕', key: 'ingredients' },
  { href: '/dashboard/cart', icon: '🛒', key: 'cart' },
  { href: '/dashboard/history', icon: '🗂️', key: 'history' },
  { href: '/dashboard/account', icon: '👤', key: 'account' },
];

// Vertical nav on ≥sm screens; a fixed bottom tab bar on phones.
export function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav
      aria-label={t.shell.navLabel}
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-peach-line bg-cream sm:static sm:z-auto sm:w-48 sm:shrink-0 sm:border-t-0 sm:bg-transparent"
    >
      <ul className="flex justify-around gap-1 px-2 py-1.5 sm:flex-col sm:justify-start sm:px-0 sm:py-0">
        {NAV_ITEMS.map(({ href, icon, key }) => {
          const active = pathname === href;
          return (
            <li key={href} className="sm:w-full">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[11px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato sm:flex-row sm:gap-2.5 sm:px-4 sm:py-2.5 sm:text-sm ${
                  active
                    ? 'bg-peach text-ink sm:border-2 sm:border-ink'
                    : 'text-latte hover:bg-ink/5 hover:text-ink'
                }`}
              >
                <span aria-hidden="true" className="text-base sm:text-lg">
                  {icon}
                </span>
                {t.shell.nav[key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
