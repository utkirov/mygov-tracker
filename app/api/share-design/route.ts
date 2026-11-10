import { NextRequest, NextResponse } from 'next/server';

import { getShareDesign, parseShareDesign, setShareDesign, SHARE_DESIGNS } from '@/lib/share-design';

/** Default look of client share pages (owner only — /api is behind the session in proxy.ts). */
export async function GET() {
  return NextResponse.json({ design: await getShareDesign(), designs: SHARE_DESIGNS });
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { design?: unknown };
  const design = parseShareDesign(body.design);
  if (!design) return NextResponse.json({ error: 'Неизвестный вид страницы' }, { status: 400 });
  await setShareDesign(design);
  return NextResponse.json({ design });
}
