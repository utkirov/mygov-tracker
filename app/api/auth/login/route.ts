import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  let email: string, password: string;
  try {
    ({ email, password } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Неверный формат запроса' }, { status: 400 });
  }
  if (!email || !password) {
    return NextResponse.json({ error: 'Email и пароль обязательны' }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return NextResponse.json({ error: 'Неверный email или пароль' }, { status: 401 });
  }

  return NextResponse.json({ ok: true, user: { id: data.user.id, email: data.user.email } });
}
