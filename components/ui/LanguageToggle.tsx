'use client';

import { useI18n } from '@/hooks/useI18n';
import { LOCALES, type Locale } from '@/lib/i18n';

const LABELS: Record<Locale, string> = { uk: 'UA', en: 'EN' };

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t.shell.language}
      className="flex overflow-hidden rounded-full border-2 border-ink text-[11px] font-bold"
    >
      {LOCALES.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            aria-pressed={active}
            onClick={() => setLocale(code)}
            className={`px-2.5 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato ${
              active ? 'bg-ink text-white' : 'bg-white text-latte hover:bg-cream'
            }`}
          >
            {LABELS[code]}
          </button>
        );
      })}
    </div>
  );
}
