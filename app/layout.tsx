import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Bricolage_Grotesque, Instrument_Sans, Space_Mono } from 'next/font/google';
import './globals.css';
import { SessionProvider } from '@/hooks/useSession';
import { I18nProvider } from '@/hooks/useI18n';
import { ToastProvider } from '@/components/ui/Toast';
import { ThemeProvider } from '@/hooks/useTheme';
import { DICTIONARIES } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import { THEME_COOKIE, resolveTheme } from '@/lib/theme';

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument-sans',
});
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
});
const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
});

export async function generateMetadata(): Promise<Metadata> {
  const { meta } = DICTIONARIES[await getLocale()];
  return { title: meta.title, description: meta.description };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  // Stamped server-side so a pinned theme paints on the first frame; absent,
  // the CSS follows prefers-color-scheme.
  const theme = resolveTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang={locale} data-theme={theme ?? undefined}>
      <body
        className={`${instrumentSans.variable} ${bricolage.variable} ${spaceMono.variable} min-h-screen bg-cream font-sans text-ink antialiased`}
      >
        <I18nProvider initial={locale}>
          <ThemeProvider initial={theme}>
            <ToastProvider>
              <SessionProvider>{children}</SessionProvider>
            </ToastProvider>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
