import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Архив' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
