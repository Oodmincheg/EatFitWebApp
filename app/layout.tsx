import type { Metadata } from 'next';
import { Bricolage_Grotesque, Instrument_Sans, Space_Mono } from 'next/font/google';
import './globals.css';
import { SessionProvider } from '@/hooks/useSession';
import { I18nProvider } from '@/hooks/useI18n';
import { ToastProvider } from '@/components/ui/Toast';
import { DICTIONARIES } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';

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
  return (
    <html lang={locale}>
      <body
        className={`${instrumentSans.variable} ${bricolage.variable} ${spaceMono.variable} min-h-screen bg-cream font-sans text-ink antialiased`}
      >
        <I18nProvider initial={locale}>
          <ToastProvider>
            <SessionProvider>{children}</SessionProvider>
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
