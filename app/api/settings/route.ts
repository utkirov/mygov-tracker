import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, getUser } from '@/lib/supabase-server';

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('settings')
    .select('key, value')
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.key] = row.value;
  return NextResponse.json(map);
}

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createSupabaseServer();
  const body = await request.json() as Record<string, string>;
  const rows = Object.entries(body).map(([key, value]) => ({
    key,
    value: String(value),
    user_id: user.id,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('settings').upsert(rows, { onConflict: 'user_id,key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Test Telegram connection — no user_id needed (just proxies to Telegram API)
export async function PUT(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token, chatId } = await request.json();
  if (!token || !chatId) return NextResponse.json({ error: 'Нужны token и chatId' }, { status: 400 });
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: '✅ my.gov tracker подключён!\n\nВы будете получать уведомления при изменении статуса заявлений.', parse_mode: 'HTML' }),
    });
    const data = await res.json();
    if (res.ok) return NextResponse.json({ ok: true });
    return NextResponse.json({ error: data.description ?? 'Ошибка Telegram' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Нет соединения' }, { status: 502 });
  }
}
