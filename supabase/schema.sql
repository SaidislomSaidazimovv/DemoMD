-- =============================================================
-- TASDIQ + BUTTERFLY — Core Platform Schema
-- Run ONCE in Supabase → SQL Editor → New query → paste all → Run.
-- Idempotent: safe to re-run (drops + recreates).
-- =============================================================

-- -------------------------------------------------------------
-- 1. CLEAN SLATE (only in a fresh project; do NOT run in prod)
-- -------------------------------------------------------------
drop table if exists public.export_packs cascade;
drop table if exists public.media cascade;
drop table if exists public.ledger_events cascade;
drop table if exists public.workflow_transitions cascade;
drop table if exists public.workflows cascade;
drop table if exists public.users cascade;
drop table if exists public.organizations cascade;

drop function if exists public.user_org_id cascade;
drop function if exists public.user_role cascade;

-- -------------------------------------------------------------
-- 2. CORE TABLES
-- -------------------------------------------------------------

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  product     text not null check (product in ('tasdiq', 'butterfly')),
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  org_id      uuid not null references public.organizations(id),
  email       text not null,
  full_name   text,
  role        text not null check (role in (
    'owner', 'admin', 'member', 'viewer',
    'bank_officer', 'inspector', 'supervisor',
    'hr_admin', 'manager', 'responder'
  )),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create unique index idx_users_email_active on public.users(email) where deleted_at is null;
create index idx_users_org on public.users(org_id);

create table public.workflows (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id),
  type            text not null,
  reference_id    text,
  reference_label text,
  current_state   text not null,
  meta            jsonb not null default '{}'::jsonb,
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz
);
create index idx_workflows_org on public.workflows(org_id);
create index idx_workflows_type on public.workflows(org_id, type);
create index idx_workflows_state on public.workflows(org_id, current_state);

create table public.workflow_transitions (
  id            uuid primary key default gen_random_uuid(),
  type          text not null,
  from_state    text not null,
  to_state      text not null,
  required_role text[] not null default '{}',
  unique (type, from_state, to_state)
);

create table public.ledger_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id),
  workflow_id uuid references public.workflows(id),
  event_type  text not null,
  actor_id    uuid references public.users(id),
  payload     jsonb not null default '{}'::jsonb,
  prev_hash   text,
  hash        text not null,
  created_at  timestamptz not null default now()
);
create index idx_ledger_org on public.ledger_events(org_id);
create index idx_ledger_workflow on public.ledger_events(workflow_id, created_at);
create index idx_ledger_created on public.ledger_events(org_id, created_at);

create table public.media (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id),
  workflow_id  uuid references public.workflows(id),
  storage_path text not null,
  file_type    text not null,
  sha256       text,
  phash        text,
  meta         jsonb not null default '{}'::jsonb,
  uploaded_by  uuid references public.users(id),
  created_at   timestamptz not null default now()
);
create index idx_media_workflow on public.media(workflow_id);
create index idx_media_phash on public.media(phash) where phash is not null;
create index idx_media_org_created on public.media(org_id, created_at);

create table public.export_packs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id),
  workflow_id   uuid references public.workflows(id),
  pack_type     text not null,
  storage_path  text not null,
  manifest_hash text not null,
  generated_by  uuid references public.users(id),
  created_at    timestamptz not null default now()
);
create index idx_export_packs_workflow on public.export_packs(workflow_id, created_at);

-- -------------------------------------------------------------
-- 3. HELPER FUNCTIONS FOR RLS
-- Live in public/ (not auth/ — Supabase reserves that schema).
-- Both call the built-in auth.uid() which is always available.
-- -------------------------------------------------------------

create or replace function public.user_org_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select org_id from public.users where id = auth.uid()
$$;

create or replace function public.user_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid()
$$;

grant execute on function public.user_org_id() to authenticated, anon;
grant execute on function public.user_role() to authenticated, anon;

-- -------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- -------------------------------------------------------------

alter table public.organizations        enable row level security;
alter table public.users                 enable row level security;
alter table public.workflows             enable row level security;
alter table public.workflow_transitions  enable row level security;
alter table public.ledger_events         enable row level security;
alter table public.media                 enable row level security;
alter table public.export_packs          enable row level security;

-- organizations: read own
create policy "orgs_select_own"
  on public.organizations for select
  using (id = public.user_org_id());

-- users: read org members
create policy "users_select_org"
  on public.users for select
  using (org_id = public.user_org_id());

-- workflows: full org-scoped CRUD (except delete)
create policy "workflows_select"
  on public.workflows for select
  using (org_id = public.user_org_id());
create policy "workflows_insert"
  on public.workflows for insert
  with check (org_id = public.user_org_id());
create policy "workflows_update"
  on public.workflows for update
  using (org_id = public.user_org_id());

-- workflow_transitions: public read (config data)
create policy "transitions_read_all"
  on public.workflow_transitions for select
  using (true);

-- ledger_events: append-only, org-scoped read
create policy "ledger_select"
  on public.ledger_events for select
  using (org_id = public.user_org_id());
create policy "ledger_insert"
  on public.ledger_events for insert
  with check (org_id = public.user_org_id());
-- No UPDATE, no DELETE policy => denied for all.

-- media
create policy "media_select"
  on public.media for select
  using (org_id = public.user_org_id());
create policy "media_insert"
  on public.media for insert
  with check (org_id = public.user_org_id());

-- export_packs
create policy "exports_select"
  on public.export_packs for select
  using (org_id = public.user_org_id());
create policy "exports_insert"
  on public.export_packs for insert
  with check (org_id = public.user_org_id());

-- -------------------------------------------------------------
-- 5. STORAGE BUCKETS + BUCKET-LEVEL RLS
-- Objects are keyed as <org_id>/<workflow_id>/<filename>.
-- -------------------------------------------------------------

insert into storage.buckets (id, name, public)
  values ('evidence', 'evidence', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('exports', 'exports', false)
  on conflict (id) do nothing;

drop policy if exists "evidence_read_own_org"  on storage.objects;
drop policy if exists "evidence_write_own_org" on storage.objects;
drop policy if exists "exports_read_own_org"   on storage.objects;
drop policy if exists "exports_write_own_org"  on storage.objects;

create policy "evidence_read_own_org"
  on storage.objects for select
  using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1]::uuid = public.user_org_id()
  );

create policy "evidence_write_own_org"
  on storage.objects for insert
  with check (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1]::uuid = public.user_org_id()
  );

create policy "exports_read_own_org"
  on storage.objects for select
  using (
    bucket_id = 'exports'
    and (storage.foldername(name))[1]::uuid = public.user_org_id()
  );

create policy "exports_write_own_org"
  on storage.objects for insert
  with check (
    bucket_id = 'exports'
    and (storage.foldername(name))[1]::uuid = public.user_org_id()
  );

-- -------------------------------------------------------------
-- 6. REALTIME (locked decision #3)
-- Enables live dashboard updates for these three tables.
-- -------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ledger_events'
  ) then
    execute 'alter publication supabase_realtime add table public.ledger_events';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workflows'
  ) then
    execute 'alter publication supabase_realtime add table public.workflows';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'media'
  ) then
    execute 'alter publication supabase_realtime add table public.media';
  end if;
end$$;

-- -------------------------------------------------------------
-- 7. SEED workflow_transitions (Tasdiq only — Butterfly skipped for V1)
-- -------------------------------------------------------------

delete from public.workflow_transitions where type = 'tranche_verification';

insert into public.workflow_transitions (type, from_state, to_state, required_role) values
  ('tranche_verification', 'DRAFT',              'EVIDENCE_REQUESTED', '{bank_officer,admin}'),
  ('tranche_verification', 'EVIDENCE_REQUESTED', 'CAPTURED',           '{inspector}'),
  ('tranche_verification', 'CAPTURED',           'AUTO_VERIFIED',      '{admin,supervisor}'),
  ('tranche_verification', 'CAPTURED',           'FLAGGED',            '{admin,supervisor}'),
  ('tranche_verification', 'AUTO_VERIFIED',      'APPROVED',           '{supervisor,bank_officer}'),
  ('tranche_verification', 'FLAGGED',            'APPROVED',           '{supervisor}'),
  ('tranche_verification', 'FLAGGED',            'REJECTED',           '{supervisor,bank_officer}'),
  ('tranche_verification', 'APPROVED',           'EXPORTED',           '{admin,bank_officer}'),
  ('tranche_verification', 'EXPORTED',           'BANK_ACCEPTED',      '{bank_officer}'),
  ('tranche_verification', 'EXPORTED',           'BANK_REJECTED',      '{bank_officer}');

-- Done. You should see all 7 tables in the Table Editor now.
