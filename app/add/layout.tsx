import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Новое заявление' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
