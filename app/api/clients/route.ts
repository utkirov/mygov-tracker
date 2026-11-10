import { NextRequest, NextResponse } from 'next/server';

import { createClient, listClients, loadClientIndex, setApplicationClient, suggestClients } from '@/lib/clients';
import { listApplications } from '@/lib/local-db';
import { isShareLinkActive, listAllShareLinks } from '@/lib/share-links';

export const runtime = 'nodejs';

/** Clients with counts, plus names found in object names of unassigned applications. */
export async function GET() {
  const apps = await listApplications({});
  const [clients, index] = await Promise.all([listClients(), loadClientIndex(undefined, apps)]);
  const suggestions = suggestClients(apps, new Set(index.byApplication.keys()));
  // Links per client: client-wide ones plus links of the client's applications.
  const linkStats = new Map<string, { active: number; views: number; last_viewed_at: string | null }>();
  for (const link of await listAllShareLinks()) {
    const clientId = link.client_id ?? index.byApplication.get(link.application_id)?.id;
    if (!clientId) continue;
    const s = linkStats.get(clientId) ?? { active: 0, views: 0, last_viewed_at: null };
    if (isShareLinkActive(link)) s.active += 1;
    s.views += link.views;
    if (link.last_viewed_at && (!s.last_viewed_at || link.last_viewed_at > s.last_viewed_at)) s.last_viewed_at = link.last_viewed_at;
    linkStats.set(clientId, s);
  }
  return NextResponse.json({
    clients: clients.map(c => ({ ...c, links: linkStats.get(c.id) ?? { active: 0, views: 0, last_viewed_at: null } })),
    suggestions,
  });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  try {
    const client = await createClient({ name: String(body.name ?? ''), phone: String(body.phone ?? ''), note: String(body.note ?? '') });
    const ids = Array.isArray(body.applicationIds) ? body.applicationIds.filter((x): x is string => typeof x === 'string') : [];
    for (const id of ids) await setApplicationClient(id, client.id);
    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Не удалось создать клиента' }, { status: 400 });
  }
}
