import { en } from './en';
import { uk, type Dict } from './uk';

export type { Dict };

export const LOCALES = ['uk', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'uk';

// Readable by the client (the toggle writes it) and by the server (layout,
// metadata, generation routes). Not a secret.
export const LOCALE_COOKIE = 'eatfit_locale';
export const LOCALE_MAX_AGE = 60 * 60 * 24 * 365;

export const DICTIONARIES: Record<Locale, Dict> = { uk, en };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
