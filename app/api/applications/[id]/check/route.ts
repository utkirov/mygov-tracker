import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import {
  readLocalDb,
  writeLocalDb,
  type LocalDbApplication,
  type LocalDbApplicationChangeField,
} from '@/lib/local-db';
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

function getNextCheckAt(
  checkedAt: string,
  options: {
    enabled: boolean;
    interval_minutes: number | null;
  }
): string | null {
  if (!options.enabled || options.interval_minutes === null || options.interval_minutes <= 0) {
    return null;
  }

  const nextCheckAt = new Date(checkedAt);
  nextCheckAt.setMinutes(nextCheckAt.getMinutes() + options.interval_minutes);
  return nextCheckAt.toISOString();
}

function formatChangeValue(value: string | null): string {
  return value && value.trim() ? value : 'empty';
}

function buildChangeSummary(
  field: LocalDbApplicationChangeField,
  previousValue: string | null,
  nextValue: string | null
): string {
  const labels: Record<LocalDbApplicationChangeField, string> = {
    status: 'Status',
    current_action: 'Current action',
    acting_party: 'Acting party',
    last_changed_date: 'Last changed date',
  };

  return `${labels[field]} changed from "${formatChangeValue(previousValue)}" to "${formatChangeValue(nextValue)}"`;
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
  const now = new Date().toISOString();
  const nextCheckAt = getNextCheckAt(now, db.settings.auto_check);

  if (!checked) {
    application.sync_state = 'error';
    application.last_checked_at = now;
    application.next_check_at = nextCheckAt;
    application.last_error = 'Failed to fetch application status from my.gov.uz';
    application.updated_at = now;
    db.meta.updated_at = now;
    await writeLocalDb(db);

    return NextResponse.json(
      { error: application.last_error },
      { status: 502 }
    );
  }

  const previousValues: Pick<
    LocalDbApplication,
    'status' | 'current_action' | 'acting_party' | 'last_changed_date'
  > = {
    status: application.status,
    current_action: application.current_action,
    acting_party: application.acting_party,
    last_changed_date: application.last_changed_date,
  };
  const nextValues = {
    status: checked.status,
    current_action: checked.current_action,
    acting_party: checked.acting_party,
    last_changed_date: parseMyGovDate(checked.last_changed_date),
  };
  const trackedFields: LocalDbApplicationChangeField[] = [
    'status',
    'current_action',
    'acting_party',
    'last_changed_date',
  ];
  const changedFields = trackedFields.filter(
    (field) => previousValues[field] !== nextValues[field]
  );
  const changeSummary = changedFields.map((field) =>
    buildChangeSummary(field, previousValues[field], nextValues[field])
  );
  const statusChanged = previousValues.status !== nextValues.status;

  application.status = nextValues.status;
  application.current_action = nextValues.current_action;
  application.acting_party = nextValues.acting_party;
  application.last_changed_date = nextValues.last_changed_date;
  application.sync_state = 'success';
  application.last_checked_at = now;
  application.next_check_at = nextCheckAt;
  application.last_error = '';
  application.last_change_summary = changeSummary;
  application.last_change_fields = changedFields;
  if (changedFields.length > 0) {
    application.last_detected_change_at = now;
  }
  application.updated_at = now;

  if (statusChanged) {
    db.status_history.push({
      id: randomUUID(),
      application_id: application.id,
      status: nextValues.status,
      current_action: nextValues.current_action,
      acting_party: nextValues.acting_party,
      recorded_at: now,
    });
  }

  db.meta.updated_at = now;
  await writeLocalDb(db);

  return NextResponse.json({ application, statusChanged });
}
