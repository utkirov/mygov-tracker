import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import {
  insertStatusHistory,
  readLocalDb,
  touchMeta,
  updateApplicationFields,
  type LocalDbApplication,
  type LocalDbApplicationChangeField,
} from '@/lib/local-db';
import { fetchRepositoryFiles } from '@/lib/repository-files';
import { CHANGE_FIELD_LABELS, fetchApplicationStatusSession, parseMyGovDate } from '@/lib/status-checker';
import { captureApplicationStatusScreenshot } from '@/lib/status-screenshot';
import { buildStatusSnapshotPdf } from '@/lib/status-pdf';
import {
  buildApplicationErrorMessage,
  buildManualCheckResultMessage,
  isTelegramConfigured,
  sendApplicationChangeNotification,
  sendTelegramMessage,
} from '@/lib/telegram';
import { getStatusType, isCompletedStatus } from '@/types';

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
  return value && value.trim() ? value : 'пусто';
}

function buildChangeSummary(
  field: LocalDbApplicationChangeField,
  previousValue: string | null,
  nextValue: string | null
): string {
  return `${CHANGE_FIELD_LABELS[field]}: "${formatChangeValue(previousValue)}" → "${formatChangeValue(nextValue)}"`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isManual = req.nextUrl.searchParams.get('manual') === 'true';
  const db = await readLocalDb();
  const application = db.applications.find((entry) => entry.id === id);

  if (!application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  if (application.archived || getStatusType(application.acting_party, application.status) === 'completed') {
    const idleAt = new Date().toISOString();
    await updateApplicationFields(id, {
      sync_state: 'idle',
      next_check_at: null,
      last_error: '',
      updated_at: idleAt,
    });
    await touchMeta(idleAt);

    return NextResponse.json(
      { error: 'Archived and completed applications are excluded from checks' },
      { status: 409 }
    );
  }

  const startedAt = new Date().toISOString();
  await updateApplicationFields(id, {
    sync_state: 'checking',
    last_error: '',
    updated_at: startedAt,
  });
  await touchMeta(startedAt);

  let session: Awaited<ReturnType<typeof fetchApplicationStatusSession>> | null = null;
  let fetchError: string | null = null;

  try {
    session = await fetchApplicationStatusSession(
      application.application_number,
      application.verification_password
    );
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'Неизвестная ошибка при проверке';
  }
  const checked = session?.status ?? null;

  const now = new Date().toISOString();
  const nextCheckAt = getNextCheckAt(now, db.settings.auto_check);

  if (!checked) {
    const errorMessage = fetchError ?? 'Не удалось получить статус от my.gov.uz';
    const errorPatch: Partial<LocalDbApplication> = {
      sync_state: 'error',
      last_checked_at: now,
      next_check_at: nextCheckAt,
      last_error: errorMessage,
      updated_at: now,
    };
    await updateApplicationFields(id, errorPatch);
    await touchMeta(now);

    if (isTelegramConfigured(db.settings)) {
      try {
        await sendTelegramMessage(
          db.settings,
          buildApplicationErrorMessage({ ...application, ...errorPatch }, errorMessage)
        );
      } catch {
        // Ignore Telegram delivery errors and keep the primary API response.
      }
    }

    return NextResponse.json(
      { error: errorMessage },
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

  const patch: Partial<LocalDbApplication> = {
    status: nextValues.status,
    current_action: nextValues.current_action,
    acting_party: nextValues.acting_party,
    last_changed_date: nextValues.last_changed_date,
    sync_state: 'success',
    last_checked_at: now,
    next_check_at: nextCheckAt,
    last_error: '',
    last_change_summary: changeSummary,
    last_change_fields: changedFields,
  };
  if (changedFields.length > 0) {
    patch.last_detected_change_at = now;
  }
  if (isCompletedStatus(patch.status!)) {
    patch.archived = true;
    patch.sync_state = 'idle';
    patch.next_check_at = null;
  }
  patch.updated_at = now;

  await updateApplicationFields(id, patch);
  await touchMeta(now);

  if (statusChanged) {
    await insertStatusHistory({
      id: randomUUID(),
      application_id: application.id,
      status: nextValues.status,
      current_action: nextValues.current_action,
      acting_party: nextValues.acting_party,
      recorded_at: now,
    });
  }

  const updatedApplication: LocalDbApplication = { ...application, ...patch };

  if (isTelegramConfigured(db.settings)) {
    try {
      if (changedFields.length > 0) {
        const isNowCompleted = isCompletedStatus(updatedApplication.status) && !isCompletedStatus(previousValues.status ?? '');
        const [readablePdf, screenshotPng, repositoryFiles] = await Promise.all([
          buildStatusSnapshotPdf({ application: updatedApplication, changedFields, previousValues, nextValues }),
          session ? captureApplicationStatusScreenshot(session.page, application.verification_password) : null,
          isNowCompleted && session ? fetchRepositoryFiles(session.page.html) : [],
        ]);
        await sendApplicationChangeNotification({
          settings: db.settings,
          application: updatedApplication,
          changedFields,
          previousValues,
          nextValues,
          isNowCompleted,
          screenshotPng,
          readablePdf,
          repositoryFiles,
        });
      } else if (isManual) {
        await sendTelegramMessage(db.settings, buildManualCheckResultMessage(updatedApplication));
      }
    } catch (err) {
      console.error('[check route] Telegram error:', err);
      // Keep the primary API response even when Telegram delivery fails.
    }
  }

  return NextResponse.json({ application: updatedApplication, statusChanged });
}
