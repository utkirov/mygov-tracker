import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ToastProvider } from '@/components/ToastProvider';
import { SoundNotificationProvider } from '@/components/SoundNotificationProvider';
import { AppShell } from '@/components/AppShell';
import './globals.css';

// Self-hosted at build time by next/font — no request to Google Fonts at
// runtime (faster first paint, works offline on the LAN).
const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin', 'cyrillic'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  title: 'my.gov tracker',
  description: 'Track my.gov.uz applications locally',
  icons: '/favicon.ico',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning className={`${inter.variable} ${jetbrains.variable}`}>
      <body style={{ fontFamily: 'var(--font-ui)' }}>
        <ThemeProvider>
          <SoundNotificationProvider />
          <ToastProvider>
            <AppShell>
              {children}
            </AppShell>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
