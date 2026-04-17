-- =============================================================
-- Migration: add `accepted_at` to public.users
-- Tracks invitation state: null = pending, set = user has activated.
-- Run ONCE in Supabase → SQL Editor. Idempotent.
-- =============================================================

alter table public.users
  add column if not exists accepted_at timestamptz;

-- Backfill: existing users who have ever signed in are marked as accepted.
-- Those who never signed in (invited, never clicked the link) stay pending.
update public.users u
set accepted_at = u.created_at
from auth.users au
where u.id = au.id
  and au.last_sign_in_at is not null
  and u.accepted_at is null;

-- Optional: see the result
-- select u.email, u.role, u.accepted_at, au.last_sign_in_at
-- from public.users u
-- join auth.users au on au.id = u.id
-- order by u.created_at;
