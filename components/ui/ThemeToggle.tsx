'use client';

import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';

// Two states only: whatever the device prefers is the starting point, and
// one click pins the opposite for this browser.
export function ThemeToggle() {
  const { t } = useI18n();
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? t.shell.themeLight : t.shell.themeDark}
      title={dark ? t.shell.themeLight : t.shell.themeDark}
      className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink bg-paper text-[13px] transition-colors hover:bg-peach focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
    >
      <span aria-hidden="true">{dark ? '☀️' : '🌙'}</span>
    </button>
  );
}
