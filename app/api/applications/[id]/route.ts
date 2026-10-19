import { NextRequest, NextResponse } from 'next/server';

import { deleteArtifacts } from '@/lib/application-artifacts';
import { deletePdfFile } from '@/lib/local-storage';
import {
  deleteApplicationRow,
  getApplicationById,
  getStatusHistory,
  readLocalDb,
  touchMeta,
  updateApplicationFields,
  type LocalDbApplication,
} from '@/lib/local-db';
import { getStatusType } from '@/types';

function toProjectId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** True if walking parent_id links from `startId` ever reaches `targetId`. */
function ancestorChainReaches(
  all: LocalDbApplication[],
  startId: string,
  targetId: string
): boolean {
  const byId = new Map(all.map((entry) => [entry.id, entry]));
  const visited = new Set<string>();
  let currentId: string | null = startId;

  while (currentId && !visited.has(currentId)) {
    if (currentId === targetId) return true;
    visited.add(currentId);
    currentId = byId.get(currentId)?.parent_id ?? null;
  }

  return false;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const application = await getApplicationById(id);

  if (!application) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ application, history: await getStatusHistory(id) });
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
    'parent_id',
    'archived',
  ];

  const patch: Partial<LocalDbApplication> = {};

  for (const key of allowedKeys) {
    if (!(key in body)) continue;

    if (key === 'project_id') {
      patch.project_id = toProjectId(body.project_id);
      continue;
    }

    if (key === 'parent_id') {
      const nextParentId = toProjectId(body.parent_id);

      if (nextParentId) {
        if (nextParentId === id) {
          return NextResponse.json(
            { error: 'An application cannot be its own parent' },
            { status: 400 }
          );
        }

        if (ancestorChainReaches(db.applications, nextParentId, id)) {
          return NextResponse.json(
            { error: 'This parent would create a circular chain' },
            { status: 400 }
          );
        }
      }

      patch.parent_id = nextParentId;
      continue;
    }

    if (key === 'archived') {
      const archived = body.archived === true;
      patch.archived = archived;
      if (archived) {
        patch.sync_state = 'idle';
        patch.next_check_at = null;
        patch.last_error = '';
      }
      continue;
    }

    const value = body[key];
    if (typeof value === 'string') {
      (patch as Record<string, unknown>)[key] = value;
    }
  }

  const updatedAt = new Date().toISOString();
  patch.updated_at = updatedAt;
  if (getStatusType(application.acting_party, application.status) === 'completed') {
    patch.next_check_at = null;
  }

  await updateApplicationFields(id, patch);
  await touchMeta(updatedAt);

  const updatedApplication: LocalDbApplication = { ...application, ...patch };
  return NextResponse.json(updatedApplication);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await readLocalDb();
  const application = db.applications.find((entry) => entry.id === id);

  if (!application) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const pdfStorageKey = application.pdf_storage_key ?? application.pdf_filename;

  await deleteApplicationRow(id);
  await touchMeta(new Date().toISOString());

  if (pdfStorageKey) {
    await deletePdfFile(pdfStorageKey);
  }
  await deleteArtifacts(id);

  return NextResponse.json({ ok: true });
}
