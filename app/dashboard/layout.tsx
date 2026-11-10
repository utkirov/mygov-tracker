import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Доска' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
