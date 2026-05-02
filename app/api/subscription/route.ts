import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { getUserPlan } from '@/lib/subscription';

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const plan = await getUserPlan();
  return NextResponse.json({ plan });
}
