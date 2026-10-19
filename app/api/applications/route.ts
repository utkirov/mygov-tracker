import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import {
  insertApplication,
  insertStatusHistory,
  readLocalDb,
  touchMeta,
  type LocalDbApplication,
} from '@/lib/local-db';
import { canAddApplication } from '@/lib/plans';
import { parseMyGovDate } from '@/lib/status-checker';
import { getUserPlan } from '@/lib/subscription';

function sortByUpdatedAtDesc(applications: LocalDbApplication[]): LocalDbApplication[] {
  return [...applications].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

export async function GET(request: NextRequest) {
  const db = await readLocalDb();
  const showArchived = request.nextUrl.searchParams.get('archived') === 'true';
  const applications = db.applications.filter((application) => application.archived === showArchived);

  return NextResponse.json(sortByUpdatedAtDesc(applications));
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const applicationNumber = typeof body.application_number === 'string' ? body.application_number.trim() : '';
  const verificationPassword = typeof body.verification_password === 'string' ? body.verification_password.trim() : '';
  const pdfFilename = typeof body.pdf_filename === 'string' ? body.pdf_filename.trim() : '';
  const pdfStorageKey = typeof body.pdf_storage_key === 'string' ? body.pdf_storage_key.trim() : '';

  if (!applicationNumber || !verificationPassword) {
    return NextResponse.json(
      { error: 'application_number and verification_password are required' },
      { status: 400 }
    );
  }

  if (!pdfFilename || !pdfStorageKey) {
    return NextResponse.json(
      { error: 'pdf_filename and pdf_storage_key are required' },
      { status: 400 }
    );
  }

  const db = await readLocalDb();
  const plan = await getUserPlan();

  if (!canAddApplication(plan, db.applications.filter((application) => !application.archived).length)) {
    return NextResponse.json(
      { error: 'Application limit reached for the current plan' },
      { status: 403 }
    );
  }

  const now = new Date().toISOString();
  const application: LocalDbApplication = {
    id: randomUUID(),
    application_number: applicationNumber,
    object_name: typeof body.object_name === 'string' ? body.object_name : '',
    service_name: typeof body.service_name === 'string' ? body.service_name : '',
    organization: typeof body.organization === 'string' ? body.organization : '',
    status: typeof body.status === 'string' ? body.status : '',
    submission_date: parseMyGovDate(body.submission_date as string | undefined),
    last_changed_date: parseMyGovDate(body.last_changed_date as string | undefined),
    current_action: typeof body.current_action === 'string' ? body.current_action : '',
    acting_party: typeof body.acting_party === 'string' ? body.acting_party : '',
    verification_password: verificationPassword,
    sms_phone: typeof body.sms_phone === 'string' ? body.sms_phone : '',
    notes: typeof body.notes === 'string' ? body.notes : '',
    pdf_filename: pdfFilename,
    pdf_storage_key: pdfStorageKey,
    project_id: typeof body.project_id === 'string' ? body.project_id : null,
    parent_id: typeof body.parent_id === 'string' && body.parent_id.trim() ? body.parent_id.trim() : null,
    archived: body.archived === true,
    sync_state: 'idle',
    last_checked_at: null,
    next_check_at: null,
    last_error: '',
    last_detected_change_at: null,
    last_change_summary: [],
    last_change_fields: [],
    created_at: now,
    updated_at: now,
  };

  await insertApplication(application);
  await insertStatusHistory({
    id: randomUUID(),
    application_id: application.id,
    status: application.status,
    current_action: application.current_action,
    acting_party: application.acting_party,
    recorded_at: now,
  });
  await touchMeta(now);

  return NextResponse.json(application, { status: 201 });
}
