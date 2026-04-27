import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Convert "27.04.2026 15:48" → ISO string Postgres accepts, or null if empty/invalid
function parseMyGovDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min] = m;
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:00`;
}

export async function GET() {
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const row = {
    ...body,
    submission_date: parseMyGovDate(body.submission_date),
    last_changed_date: parseMyGovDate(body.last_changed_date),
  };

  const { data, error } = await supabase
    .from('applications')
    .insert([row])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Record initial status in history
  await supabase.from('status_history').insert([{
    application_id: data.id,
    status: data.status,
    current_action: data.current_action,
    acting_party: data.acting_party,
  }]);

  return NextResponse.json(data, { status: 201 });
}
