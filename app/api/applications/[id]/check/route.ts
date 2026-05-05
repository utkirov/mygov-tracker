import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { readLocalDb, writeLocalDb } from '@/lib/local-db';
import { fetchApplicationStatus } from '@/lib/status-checker';

function parseMyGovDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);

  if (!match) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const [, dd, mm, yyyy, hh = '00', min = '00'] = match;
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:00`;
}

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await readLocalDb();
  const application = db.applications.find((entry) => entry.id === id);

  if (!application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  const checked = await fetchApplicationStatus(
    application.application_number,
    application.verification_password
  );

  if (!checked) {
    return NextResponse.json(
      { error: 'Failed to fetch application status from my.gov.uz' },
      { status: 502 }
    );
  }

  const statusChanged = checked.status !== application.status;
  const now = new Date().toISOString();

  application.status = checked.status;
  application.current_action = checked.current_action;
  application.acting_party = checked.acting_party;
  application.last_changed_date = parseMyGovDate(checked.last_changed_date);
  application.updated_at = now;

  if (statusChanged) {
    db.status_history.push({
      id: randomUUID(),
      application_id: application.id,
      status: checked.status,
      current_action: checked.current_action,
      acting_party: checked.acting_party,
      recorded_at: now,
    });
  }

  db.meta.updated_at = now;
  await writeLocalDb(db);

  return NextResponse.json({ application, statusChanged });
}
