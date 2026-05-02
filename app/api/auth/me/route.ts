import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.user_metadata?.name ?? null,
  });
}
