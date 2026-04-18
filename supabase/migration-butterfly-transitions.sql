-- =============================================================
-- Butterfly vertical — workflow_transitions seed
-- Adds the two Butterfly state machines per CORE_PLATFORM_SPEC.md §"Seeded transitions".
-- Run ONCE in Supabase → SQL Editor when you're ready to enable Butterfly orgs.
-- Idempotent: re-running is a no-op because (type, from_state, to_state) is unique.
-- =============================================================

-- -------------------------------------------------------------
-- 1. protocol_deployment
-- -------------------------------------------------------------
insert into public.workflow_transitions (type, from_state, to_state, required_role)
values
  ('protocol_deployment', 'SETUP',              'TRAINING_SCHEDULED', array['hr_admin']::text[]),
  ('protocol_deployment', 'TRAINING_SCHEDULED', 'TRAINING_ACTIVE',    array['hr_admin']::text[]),
  ('protocol_deployment', 'TRAINING_ACTIVE',    'DEPLOYED',           array['hr_admin']::text[]),
  ('protocol_deployment', 'DEPLOYED',           'ACTIVE',             array['hr_admin']::text[]),
  ('protocol_deployment', 'ACTIVE',             'REPORTING',          array['hr_admin']::text[]),
  ('protocol_deployment', 'REPORTING',          'ACTIVE',             array['hr_admin']::text[])
on conflict (type, from_state, to_state) do nothing;

-- -------------------------------------------------------------
-- 2. training_completion
-- -------------------------------------------------------------
insert into public.workflow_transitions (type, from_state, to_state, required_role)
values
  ('training_completion', 'NOT_STARTED', 'IN_PROGRESS', array['manager', 'responder']::text[]),
  ('training_completion', 'IN_PROGRESS', 'COMPLETED',   array['manager', 'responder']::text[]),
  ('training_completion', 'COMPLETED',   'CERTIFIED',   array['hr_admin']::text[])
on conflict (type, from_state, to_state) do nothing;

-- -------------------------------------------------------------
-- Verify (optional)
-- -------------------------------------------------------------
-- select type, from_state, to_state, required_role
-- from public.workflow_transitions
-- where type in ('protocol_deployment', 'training_completion')
-- order by type, from_state;
