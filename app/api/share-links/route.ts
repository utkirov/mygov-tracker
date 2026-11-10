import { NextResponse } from 'next/server';

import { getClient } from '@/lib/clients';
import { readLocalDb } from '@/lib/local-db';
import { serializeLinks } from '@/lib/share-link-api';
import { listAllShareLinks } from '@/lib/share-links';

export const runtime = 'nodejs';

/** Every share link with what it points to — the «Ссылки» page. */
export async function GET() {
  const [links, db] = await Promise.all([listAllShareLinks(), readLocalDb()]);
  const apps = new Map(db.applications.map(a => [a.id, a]));
  const clientNames = new Map<string, string>();
  for (const id of new Set(links.map(l => l.client_id).filter((v): v is string => !!v))) {
    clientNames.set(id, (await getClient(id).catch(() => null))?.name ?? '');
  }

  const serialized = await serializeLinks(links);
  return NextResponse.json({
    links: serialized.map(l => {
      if (l.client_id) {
        return { ...l, target: { kind: 'client' as const, id: l.client_id, title: clientNames.get(l.client_id) || 'Клиент удалён', number: '' } };
      }
      const app = apps.get(l.application_id);
      return {
        ...l,
        target: {
          kind: 'application' as const,
          id: l.application_id,
          title: app ? (app.object_name || app.service_name) : 'Заявление удалено',
          number: app?.application_number ?? '',
        },
      };
    }),
  });
}
