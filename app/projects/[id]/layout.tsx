import type { Metadata } from 'next';

import { readLocalDb } from '@/lib/local-db';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const db = await readLocalDb().catch(() => null);
  return { title: db?.projects.find(p => p.id === id)?.name || 'Проект' };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
