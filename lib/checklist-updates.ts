import { readChecklist, saveChecklist } from './application-artifacts';
import { diffChecklist, parseChecklist, type Checklist, type ChecklistOrg } from './checklist';
import type { LocalDbApplication } from './local-db';

export interface ChecklistUpdate {
  checklist: Checklist;
  newVerdicts: ChecklistOrg[];
  newResult: boolean;
}

/** Parses the freshly fetched status page, stores the checklist and reports what is new. */
export async function refreshChecklist(application: LocalDbApplication, html: string): Promise<ChecklistUpdate | null> {
  const checklist = parseChecklist(html);
  if (!checklist) return null;
  const previous = await readChecklist(application.id);
  await saveChecklist(application.id, checklist);
  return { checklist, ...diffChecklist(previous, checklist) };
}

const STATUS_WORD: Record<ChecklistOrg['status'], string> = {
  ok: 'согласовано',
  bad: 'ОТКАЗ',
  other: 'ответ',
  wait: 'ожидается',
};

/** «Kadastr agentligi: согласовано · 8 из 10» / «+3 ответа · 9 из 10, 1 отказ». */
export function describeVerdicts(update: ChecklistUpdate): { title: string; body: string; urgent: boolean } {
  const { newVerdicts, checklist } = update;
  const { counts } = checklist;
  const progress = `${counts.ok} из ${counts.total} согласовано${counts.bad ? `, отказов: ${counts.bad}` : ''}`;
  const urgent = newVerdicts.some(v => v.status === 'bad');
  if (newVerdicts.length === 1) {
    const v = newVerdicts[0];
    return {
      title: `${v.name} — ${STATUS_WORD[v.status]}`,
      body: [v.verdict && v.verdict !== v.comment ? v.verdict : '', v.comment, progress].filter(Boolean).join(' · '),
      urgent,
    };
  }
  return {
    title: `Новых ответов комиссий: ${newVerdicts.length}`,
    body: [newVerdicts.map(v => `${v.name}: ${STATUS_WORD[v.status]}`).join('; '), progress].join(' · '),
    urgent,
  };
}

/** Failed criteria of a rejection, for the completion push. */
export function rejectionSummary(checklist: Checklist | null | undefined): string {
  const result = checklist?.result;
  if (!result || result.kind !== 'rejected') return '';
  const failed = result.criteria.filter(c => c.status === 'bad').map(c => c.label);
  return failed.length ? `Не выполнено: ${failed.join('; ')}` : '';
}
