import type { Metadata } from 'next';
import { Bricolage_Grotesque, Instrument_Sans, Space_Mono } from 'next/font/google';
import './globals.css';
import { SessionProvider } from '@/hooks/useSession';
import { ToastProvider } from '@/components/ui/Toast';

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

export const metadata: Metadata = {
  title: 'EatFit',
  description: 'Fun, calorie-smart weekly meal plans from what’s already in your fridge',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${instrumentSans.variable} ${bricolage.variable} ${spaceMono.variable} min-h-screen bg-cream font-sans text-ink antialiased`}
      >
        <ToastProvider>
          <SessionProvider>{children}</SessionProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
