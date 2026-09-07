import 'server-only';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, resolveLocale, type Locale } from './index';

// The user's UI language, also used as the language of generated menus.
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return resolveLocale(store.get(LOCALE_COOKIE)?.value);
}
