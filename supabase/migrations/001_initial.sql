-- supabase/migrations/001_initial.sql
create extension if not exists "pgcrypto";

create table applications (
  id uuid primary key default gen_random_uuid(),
  application_number text unique not null,
  service_name text not null default '',
  organization text not null default '',
  status text not null default '',
  submission_date timestamptz,
  last_changed_date timestamptz,
  current_action text not null default '',
  acting_party text not null default '',
  verification_password text not null default '',
  sms_phone text not null default '',
  notes text not null default '',
  pdf_filename text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table status_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  status text not null,
  current_action text not null default '',
  acting_party text not null default '',
  recorded_at timestamptz not null default now()
);

create index on status_history(application_id);
