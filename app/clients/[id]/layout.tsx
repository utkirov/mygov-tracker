import type { Metadata } from 'next';

import { getClient } from '@/lib/clients';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const client = await getClient(id).catch(() => null);
  return { title: client?.name || 'Клиент' };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
