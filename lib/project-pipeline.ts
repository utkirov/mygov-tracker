/**
 * A construction project goes through the same services in the same order:
 * АПЗ → согласование ПСД → разрешение на СМР → приёмка → кадастр. From the
 * project's applications this builds that chain: which step is approved, which
 * is in work, which was rejected and waits for a new submission. Pure — used
 * by the pages (no server code).
 */
import { canonicalService } from './service-names';

export type StepState = 'done' | 'active' | 'rejected' | 'none';

export interface PipelineStep {
  id: string;
  label: string;
  state: StepState;
  /** Applications of this step, newest first. */
  applicationIds: string[];
  attempts: number;
}

const STEPS: Array<{ id: string; label: string; services: string[] }> = [
  { id: 'apz', label: 'АПЗ / перепрофилирование', services: ['reprofile'] },
  { id: 'psd', label: 'Согласование ПСД', services: ['psd-arch-tashkent', 'psd-arch', 'psd-tashkent', 'psd'] },
  { id: 'smr', label: 'Разрешение на СМР', services: ['smr-start'] },
  { id: 'acceptance', label: 'Приёмка объекта', services: ['acceptance'] },
  { id: 'cadastre', label: 'Кадастр', services: ['cadastre-nonres', 'cadastre-res'] },
];

interface AppLike { id: string; service_name: string; status: string; archived?: boolean; submission_date?: string | null; created_at?: string }

function outcome(app: AppLike): 'approved' | 'rejected' | 'cancelled' | 'active' {
  const s = app.status.toLowerCase();
  if (/обработан|выдан|исполнен|bajarildi/.test(s)) return 'approved';
  if (/отклон|отказ|rad etil/.test(s)) return 'rejected';
  if (/аннулир|отозван|bekor/.test(s)) return 'cancelled';
  return app.archived ? 'cancelled' : 'active';
}

export function projectPipeline(apps: AppLike[]): PipelineStep[] {
  return STEPS.map(step => {
    const mine = apps
      .filter(a => step.services.includes(canonicalService(a.service_name).key))
      .sort((a, b) => (b.submission_date ?? b.created_at ?? '').localeCompare(a.submission_date ?? a.created_at ?? ''));
    const outcomes = mine.map(outcome);
    const state: StepState = outcomes.includes('approved') ? 'done'
      : outcomes.includes('active') ? 'active'
        : outcomes.includes('rejected') ? 'rejected' : 'none';
    return { id: step.id, label: step.label, state, applicationIds: mine.map(a => a.id), attempts: mine.filter(a => outcome(a) !== 'cancelled').length };
  });
}

/** «2 из 5», counting approved steps. */
export function pipelineProgress(steps: PipelineStep[]): { done: number; total: number } {
  return { done: steps.filter(s => s.state === 'done').length, total: steps.length };
}
