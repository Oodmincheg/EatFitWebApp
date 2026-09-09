export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

// Readable by the client (the toggle writes it) and by the server (the root
// layout stamps data-theme so there is no flash). Not a secret.
export const THEME_COOKIE = 'eatfit_theme';
export const THEME_MAX_AGE = 60 * 60 * 24 * 365;

// No cookie means "follow the device", which the CSS handles on its own.
export function resolveTheme(value: unknown): Theme | null {
  return value === 'light' || value === 'dark' ? value : null;
}
