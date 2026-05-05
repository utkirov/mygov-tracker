import { NextRequest, NextResponse } from 'next/server';

import { readLocalDb, writeLocalDb } from '@/lib/local-db';

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await readLocalDb();
  const index = db.projects.findIndex((project) => project.id === id);

  if (index === -1) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  db.projects.splice(index, 1);
  for (const application of db.applications) {
    if (application.project_id === id) {
      application.project_id = null;
      application.updated_at = new Date().toISOString();
    }
  }

  db.meta.updated_at = new Date().toISOString();
  await writeLocalDb(db);

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const db = await readLocalDb();
  const project = db.projects.find((entry) => entry.id === id);

  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (typeof body.name === 'string' && body.name.trim()) {
    project.name = body.name.trim();
  }

  if (typeof body.color === 'string' && body.color.trim()) {
    project.color = body.color.trim();
  }

  project.updated_at = new Date().toISOString();
  db.meta.updated_at = project.updated_at;

  await writeLocalDb(db);

  return NextResponse.json(project);
}
