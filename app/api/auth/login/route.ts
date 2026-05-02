import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.json({ error: 'Неверный email или пароль' }, { status: 401 });

  return NextResponse.json({ ok: true, user: { id: data.user.id, email: data.user.email } });
}
