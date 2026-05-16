import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ToastProvider } from '@/components/ToastProvider';
import { TrayListeners } from '@/components/TrayListeners';
import './globals.css';

export const metadata: Metadata = {
  title: 'my.gov tracker — Local Monitor',
  description: 'Track my.gov.uz applications locally',
  icons: '/favicon.ico',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <TrayListeners />
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
