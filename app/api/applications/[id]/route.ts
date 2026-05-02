import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, getUser } from '@/lib/supabase-server';
import { supabase as adminSupabase } from '@/lib/supabase';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createSupabaseServer();
  const { data: app, error } = await supabase
    .from('applications')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: history } = await supabase
    .from('status_history')
    .select('*')
    .eq('application_id', id)
    .order('recorded_at', { ascending: false });

  return NextResponse.json({ application: app, history: history ?? [] });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createSupabaseServer();
  const body = await request.json();

  const allowed = ['notes', 'object_name', 'application_number', 'verification_password',
                   'service_name', 'organization', 'sms_phone', 'project_id', 'archived'];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await supabase
    .from('applications')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: error ? 500 : 404 });
  return NextResponse.json(data);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createSupabaseServer();

  // Verify ownership before deletion
  const { data: app } = await supabase
    .from('applications')
    .select('id, pdf_filename')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (app.pdf_filename) {
    await adminSupabase.storage.from('pdfs').remove([app.pdf_filename]);
  }

  await adminSupabase.from('status_history').delete().eq('application_id', id);
  const { error } = await adminSupabase.from('applications').delete().eq('id', id).eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
