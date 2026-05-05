import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { readLocalDb, writeLocalDb, type LocalDbProject } from '@/lib/local-db';
import { canAddProject } from '@/lib/plans';
import { getUserPlan } from '@/lib/subscription';

function sortProjects(projects: LocalDbProject[]) {
  return [...projects].sort((left, right) => left.created_at.localeCompare(right.created_at));
}

export async function GET() {
  const db = await readLocalDb();
  return NextResponse.json(sortProjects(db.projects));
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const color = typeof body.color === 'string' ? body.color.trim() : '';

  if (!name || !color) {
    return NextResponse.json({ error: 'name and color are required' }, { status: 400 });
  }

  const db = await readLocalDb();
  const plan = await getUserPlan();

  if (!canAddProject(plan, db.projects.length)) {
    return NextResponse.json({ error: 'Project limit reached for the current plan' }, { status: 403 });
  }

  const now = new Date().toISOString();
  const project: LocalDbProject = {
    id: randomUUID(),
    name,
    color,
    created_at: now,
    updated_at: now,
  };

  db.projects.push(project);
  db.meta.created_at = db.meta.created_at ?? now;
  db.meta.updated_at = now;

  await writeLocalDb(db);

  return NextResponse.json(project, { status: 201 });
}
