import { NextRequest, NextResponse } from 'next/server';

import { readChecklist } from '@/lib/application-artifacts';
import { accessCard, daysInWork, formatDay, progressCard } from '@/lib/card-images';
import { stageSummary } from '@/lib/checklist';
import { getApplicationById, readLocalDb } from '@/lib/local-db';
import { isCompletedStatus } from '@/types';

export const runtime = 'nodejs';

/**
 * PNG card to send from the app or the site:
 *   ?type=access   — project, number, check password (for whoever checks the status)
 *   ?type=progress — title, number, submitted / changed, days in work, current stage
 * ?download=1 saves instead of opening.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = await getApplicationById(id);
  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  const type = req.nextUrl.searchParams.get('type') === 'access' ? 'access' : 'progress';
  const title = app.object_name || app.service_name;

  let image;
  if (type === 'access') {
    const project = app.project_id ? (await readLocalDb()).projects.find(p => p.id === app.project_id)?.name ?? '' : '';
    image = await accessCard({ project, title, number: app.application_number, password: app.verification_password });
  } else {
    const completed = isCompletedStatus(app.status);
    const checklist = await readChecklist(id);
    const step = checklist ? stageSummary(checklist) : null;
    image = await progressCard({
      title,
      service: app.service_name,
      number: app.application_number,
      status: app.status,
      submitted: formatDay(app.submission_date),
      changed: formatDay(app.last_changed_date),
      days: daysInWork(app.submission_date, completed ? app.last_changed_date : null),
      stage: step?.stage || app.current_action,
      stageLine: step?.stage && step.stageCount ? `Этап ${step.stageIndex} из ${step.stageCount}` : 'Текущий этап',
      completed,
    });
  }

  const name = `${type === 'access' ? 'Доступ' : 'Ход заявления'} ${app.application_number}.png`;
  const disposition = req.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline';
  const headers = new Headers(image.headers);
  headers.set('Content-Disposition', `${disposition}; filename="card-${app.application_number}.png"; filename*=UTF-8''${encodeURIComponent(name)}`);
  headers.set('Cache-Control', 'no-store');
  return new NextResponse(image.body, { status: 200, headers });
}
