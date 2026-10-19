import { NextRequest, NextResponse } from 'next/server';

import { readLocalDb, type LocalDbApplication } from '@/lib/local-db';

// Walk to root following parent_id links, then collect all descendants from root
export function buildChain(all: LocalDbApplication[], id: string): LocalDbApplication[] {
  const byId = new Map(all.map(a => [a.id, a]));

  // parent_id -> children[], built once instead of rescanning `all` per node
  const childrenByParentId = new Map<string, LocalDbApplication[]>();
  for (const a of all) {
    if (!a.parent_id) continue;
    const siblings = childrenByParentId.get(a.parent_id);
    if (siblings) siblings.push(a);
    else childrenByParentId.set(a.parent_id, [a]);
  }

  // Find root — guard against cyclic parent_id chains so a bad row can't hang the request.
  let root = byId.get(id);
  if (!root) return [];
  const rootVisited = new Set<string>();
  while (root.parent_id && byId.has(root.parent_id) && !rootVisited.has(root.id)) {
    rootVisited.add(root.id);
    root = byId.get(root.parent_id)!;
  }

  // BFS from root to collect all descendants, guarded against cycles.
  const chain: LocalDbApplication[] = [];
  const seen = new Set<string>();
  const queue = [root.id];
  while (queue.length) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const node = byId.get(cur);
    if (!node) continue;
    chain.push(node);
    for (const child of childrenByParentId.get(cur) ?? []) {
      if (!seen.has(child.id)) queue.push(child.id);
    }
  }

  return chain.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await readLocalDb();
  return NextResponse.json(buildChain(db.applications as LocalDbApplication[], id));
}
