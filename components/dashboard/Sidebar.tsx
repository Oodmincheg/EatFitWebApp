'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/dashboard', icon: '🍽️', label: 'Today' },
  { href: '/dashboard/plan', icon: '📅', label: 'Week plan' },
  { href: '/dashboard/ingredients', icon: '🥕', label: 'Ingredients' },
  { href: '/dashboard/cart', icon: '🛒', label: 'Cart' },
  { href: '/dashboard/history', icon: '🗂️', label: 'History' },
  { href: '/dashboard/account', icon: '👤', label: 'My account' },
] as const;

// Vertical nav on ≥sm screens; a fixed bottom tab bar on phones.
export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Dashboard"
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-peach-line bg-cream sm:static sm:z-auto sm:w-48 sm:shrink-0 sm:border-t-0 sm:bg-transparent"
    >
      <ul className="flex justify-around gap-1 px-2 py-1.5 sm:flex-col sm:justify-start sm:px-0 sm:py-0">
        {NAV_ITEMS.map(({ href, icon, label }) => {
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
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
