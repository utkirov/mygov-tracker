import { readArtifacts, saveArtifacts } from './application-artifacts';
import type { LocalDbApplication, LocalDbApplicationChangeField } from './local-db';
import { fetchRepositoryFiles, type RepositoryFileRef } from './repository-files';
import type { StatusCheckSession } from './status-checker';
import { captureApplicationStatusScreenshot } from './status-screenshot';
import { buildStatusSnapshotPdf } from './status-pdf';
import { isCompletedStatus } from '@/types';

type TrackedValues = Record<LocalDbApplicationChangeField, string | null>;

export interface CheckOutputs {
  readablePdf: Buffer | null;
  screenshotPng: Buffer | null;
  repositoryFiles: Array<{ ref: RepositoryFileRef; file: Buffer }>;
}

/**
 * Builds the screenshot / status PDF / result documents for a finished check
 * and stores them for the site and the app (lib/application-artifacts.ts).
 * Rendering a screenshot launches Chrome, so it only happens when something
 * changed, when the user asked for the check, or when the application has no
 * screenshot yet — not on every quiet background cycle.
 */
export async function produceCheckOutputs(args: {
  application: LocalDbApplication;
  session: StatusCheckSession | null;
  changedFields: LocalDbApplicationChangeField[];
  previousValues: TrackedValues;
  nextValues: TrackedValues;
  manual?: boolean;
}): Promise<CheckOutputs> {
  const { application, session, changedFields, previousValues, nextValues, manual } = args;
  const empty: CheckOutputs = { readablePdf: null, screenshotPng: null, repositoryFiles: [] };
  if (!session) return empty;

  const existing = await readArtifacts(application.id);
  const wantSnapshot = manual || changedFields.length > 0 || !existing.screenshot;
  const completed = isCompletedStatus(application.status);
  const wantResults = completed && (changedFields.includes('status') || existing.results.length === 0);
  if (!wantSnapshot && !wantResults) return empty;

  const [readablePdf, screenshotPng, repositoryFiles] = await Promise.all([
    wantSnapshot ? buildStatusSnapshotPdf({ application, changedFields, previousValues, nextValues }) : null,
    wantSnapshot ? captureApplicationStatusScreenshot(session.page, application.verification_password) : null,
    wantResults ? fetchRepositoryFiles(session.page.html) : [],
  ]);

  await saveArtifacts(application.id, { screenshotPng, statusPdf: readablePdf, results: repositoryFiles })
    .catch(err => console.error('[CheckOutputs] Failed to save artifacts:', err));

  return { readablePdf, screenshotPng, repositoryFiles };
}
