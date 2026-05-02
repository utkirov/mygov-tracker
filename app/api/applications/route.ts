import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, getUser } from '@/lib/supabase-server';

function parseMyGovDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min] = m;
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:00`;
}

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createSupabaseServer();
  const { searchParams } = request.nextUrl;
  const showArchived = searchParams.get('archived') === 'true';

  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .eq('user_id', user.id)
    .eq('archived', showArchived)
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createSupabaseServer();
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const row = {
    ...body,
    user_id: user.id,
    submission_date: parseMyGovDate(body.submission_date as string),
    last_changed_date: parseMyGovDate(body.last_changed_date as string),
  };

  const { data, error } = await supabase
    .from('applications')
    .insert([row])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('status_history').insert([{
    application_id: data.id,
    status: data.status,
    current_action: data.current_action,
    acting_party: data.acting_party,
  }]);

  return NextResponse.json(data, { status: 201 });
}
