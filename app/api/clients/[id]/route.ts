import { NextRequest, NextResponse } from 'next/server';

import { loadAnalytics } from '@/lib/analytics';
import { enrichApplications } from '@/lib/application-summary';
import { clientApplications, deleteClient, getClient, updateClient } from '@/lib/clients';

export const runtime = 'nodejs';

/** Client card: details, every application (active first) and the client's terms. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
  const apps = (await clientApplications(id))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || (b.submission_date ?? b.created_at).localeCompare(a.submission_date ?? a.created_at));
  const analytics = await loadAnalytics();
  return NextResponse.json({
    client,
    applications: await enrichApplications(apps),
    stats: analytics.clients.find(c => c.clientId === id) ?? null,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const client = await updateClient(id, { name: str(body.name), phone: str(body.phone), note: str(body.note) });
  return client ? NextResponse.json({ client }) : NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
}

/** Deletes the client (applications stay) and revokes the client's links. */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (await deleteClient(id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
}
