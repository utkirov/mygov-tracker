import { NextRequest, NextResponse } from 'next/server';

import { deletePdfFile } from '@/lib/local-storage';
import { readLocalDb, writeLocalDb, type LocalDbApplication } from '@/lib/local-db';
import { getStatusType } from '@/types';

function sortHistory(history: Array<{ recorded_at: string }>) {
  return [...history].sort((left, right) => right.recorded_at.localeCompare(left.recorded_at));
}

function toProjectId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await readLocalDb();
  const application = db.applications.find((entry) => entry.id === id);

  if (!application) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const history = sortHistory(db.status_history.filter((entry) => entry.application_id === id));
  return NextResponse.json({ application, history });
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
  const application = db.applications.find((entry) => entry.id === id);

  if (!application) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const allowedKeys: Array<keyof LocalDbApplication> = [
    'notes',
    'object_name',
    'application_number',
    'verification_password',
    'service_name',
    'organization',
    'sms_phone',
    'project_id',
    'archived',
  ];

  for (const key of allowedKeys) {
    if (!(key in body)) continue;

    if (key === 'project_id') {
      application.project_id = toProjectId(body.project_id);
      continue;
    }

    if (key === 'archived') {
      application.archived = body.archived === true;
      if (application.archived) {
        application.sync_state = 'idle';
        application.next_check_at = null;
        application.last_error = '';
      }
      continue;
    }

    const value = body[key];
    if (typeof value === 'string') {
      application[key] = value as never;
    }
  }

  application.updated_at = new Date().toISOString();
  if (getStatusType(application.acting_party, application.status) === 'completed') {
    application.next_check_at = null;
  }
  db.meta.updated_at = application.updated_at;

  await writeLocalDb(db);

  return NextResponse.json(application);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await readLocalDb();
  const index = db.applications.findIndex((entry) => entry.id === id);

  if (index === -1) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [application] = db.applications.splice(index, 1);
  db.status_history = db.status_history.filter((entry) => entry.application_id !== id);
  db.meta.updated_at = new Date().toISOString();

  const pdfStorageKey = application.pdf_storage_key ?? application.pdf_filename;
  await writeLocalDb(db);

  if (pdfStorageKey) {
    await deletePdfFile(pdfStorageKey);
  }

  return NextResponse.json({ ok: true });
}
