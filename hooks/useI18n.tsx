'use client';

import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { DICTIONARIES, LOCALE_COOKIE, LOCALE_MAX_AGE, type Dict, type Locale } from '@/lib/i18n';

interface I18nState {
  locale: Locale;
  t: Dict;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nState | null>(null);

export function useI18n(): I18nState {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>');
  return ctx;
}

// `initial` comes from the cookie read in the root layout, so the first
// client render matches the server's <html lang>.
export function I18nProvider({ initial, children }: { initial: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initial);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_MAX_AGE}; samesite=lax`;
    document.documentElement.lang = next;
  }, []);

  const value = useMemo(
    () => ({ locale, t: DICTIONARIES[locale], setLocale }),
    [locale, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
