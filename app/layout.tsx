import type { Metadata, Viewport } from 'next';
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

// A private tool behind a login: pages get clear tab titles («Доска · my.gov
// tracker») but stay out of search engines (also robots.ts). Icons come from
// app/icon.svg, app/apple-icon.tsx and app/favicon.ico; the PWA name from manifest.ts.
export const metadata: Metadata = {
  // Absolute URLs in previews (og:image of share links) point at the public domain.
  metadataBase: new URL(process.env.PUBLIC_BASE_URL?.trim() || 'https://tracker.turonproject.uz'),
  title: { template: '%s · my.gov tracker', default: 'my.gov tracker' },
  description: 'Отслеживание заявлений my.gov.uz: статусы, согласования, документы и уведомления.',
  applicationName: 'my.gov tracker',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'strict-origin-when-cross-origin',
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: { capable: true, title: 'Tracker', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F7F8' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0B0D' },
  ],
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
