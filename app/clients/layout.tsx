import type { Metadata } from 'next';

import ClientsShell from './ClientsShell';

export const metadata: Metadata = { title: { template: '%s · Клиенты · my.gov tracker', default: 'Клиенты' } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ClientsShell>{children}</ClientsShell>;
}
