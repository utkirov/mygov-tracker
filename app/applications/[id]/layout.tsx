import type { Metadata } from 'next';

import { getApplicationById } from '@/lib/local-db';

/** «№ 352219390 · Жилой дом» in the tab — easy to tell several open applications apart. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const app = await getApplicationById(id).catch(() => null);
  if (!app) return { title: 'Заявление' };
  const name = app.object_name || app.service_name;
  return { title: `№ ${app.application_number}${name ? ` · ${name.slice(0, 60)}` : ''}` };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
