/** What list views show next to each application: approvals, stage, forecast, client. */
import { loadAnalytics } from './analytics';
import { readArtifacts, readChecklist } from './application-artifacts';
import { stageSummary } from './checklist';
import { loadClientIndex } from './clients';
import type { LocalDbApplication } from './local-db';

export async function enrichApplications(applications: LocalDbApplication[], opts: { resultDocuments?: boolean } = {}) {
  const [analytics, clients] = await Promise.all([loadAnalytics(), loadClientIndex()]);
  const forecasts = new Map(analytics.forecasts.map(f => [f.applicationId, f]));
  return Promise.all(applications.map(async (application) => {
    const checklist = await readChecklist(application.id);
    const summary = checklist
      ? { ...checklist.counts, result: checklist.result?.kind ?? null, failed: checklist.result?.criteria.filter(c => c.status === 'bad').length ?? 0, ...stageSummary(checklist) }
      : null;
    const client = clients.byApplication.get(application.id);
    return {
      ...application,
      checklist_summary: summary,
      forecast: application.archived ? null : forecasts.get(application.id) ?? null,
      client: client ? { id: client.id, name: client.name } : null,
      ...(opts.resultDocuments ? { result_documents: (await readArtifacts(application.id)).results.length } : {}),
    };
  }));
}
