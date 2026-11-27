-- PRAMAAN — Supabase schema (free tier). Run once in Supabase → SQL Editor.
-- All access goes through the Next.js server with the service-role key; RLS stays ON with no
-- public policies, so the anon key cannot read or write anything.

create table if not exists public.pramaan_kv (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists pramaan_kv_prefix on public.pramaan_kv (key text_pattern_ops);
alter table public.pramaan_kv enable row level security;

-- Private bucket for uploaded documents and call photos.
insert into storage.buckets (id, name, public, file_size_limit)
values ('pramaan-files', 'pramaan-files', false, 10485760)
on conflict (id) do nothing;
