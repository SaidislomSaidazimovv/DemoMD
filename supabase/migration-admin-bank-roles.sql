-- =============================================================
-- Optional migration: allow `admin` role to finalize bank acceptance.
-- Run ONCE in Supabase → SQL Editor if you want admins to be able to
-- click "Mark as bank accepted" / "Mark as bank rejected" in the UI.
--
-- Default seeded rows restrict these transitions to `bank_officer` only,
-- which is correct for real NBU use. This migration is a demo-testing
-- convenience mirror of the earlier APPROVE/REJECT/EXPORT admin widening.
--
-- Safe to skip if you have a real bank_officer account to test with.
-- Idempotent: running twice is a no-op.
-- =============================================================

update public.workflow_transitions
set required_role = array_append(required_role, 'admin')
where type = 'tranche_verification'
  and to_state in ('BANK_ACCEPTED', 'BANK_REJECTED')
  and not ('admin' = any(required_role));

-- Verify (optional):
-- select from_state, to_state, required_role
-- from public.workflow_transitions
-- where type = 'tranche_verification'
-- order by to_state;
