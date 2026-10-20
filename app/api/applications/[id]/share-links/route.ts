import { NextRequest, NextResponse } from 'next/server';

import { getApplicationById } from '@/lib/local-db';
import { readCreateBody, serializeLinks } from '@/lib/share-link-api';
import { createShareLink, listShareLinks } from '@/lib/share-links';

export const runtime = 'nodejs';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getApplicationById(id))) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  return NextResponse.json({ links: await serializeLinks(await listShareLinks(id)) });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getApplicationById(id))) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  const opts = await readCreateBody(request);
  if (opts instanceof NextResponse) return opts;
  const [link] = await serializeLinks([await createShareLink(id, opts)]);
  return NextResponse.json({ link }, { status: 201 });
}
