import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Ссылки' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
