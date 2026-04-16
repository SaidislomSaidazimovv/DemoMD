# CORE PLATFORM SPEC — TASDIQ + BUTTERFLY
## The foundation you build once and never touch again.
## April 16, 2026

---

# STACK

| Layer | Choice | Why |
|-------|--------|-----|
| Database | Supabase PostgreSQL | RLS for multi-tenancy. Saidislom knows it. Paid plan. |
| Auth | Supabase Auth | Email/password + magic links. OTP for mobile. |
| Storage | Supabase Storage | Evidence media (Tasdiq), training assets (Butterfly). |
| Backend logic | Supabase Edge Functions (Deno/TS) | No server to maintain. Deploys with `supabase functions deploy`. |
| Frontend | Next.js 14+ on Vercel | React (Saidislom's strength). App Router. Server components for dashboards. |
| Realtime | Supabase Realtime | Live dashboard updates when evidence is uploaded or events fire. |
| PDF generation | @react-pdf/renderer (Edge Function) | Generates tranche packs and compliance reports. |
| Hash computation | Web Crypto API (SubtleCrypto.digest) | SHA-256 for ledger chain. Works in Edge Functions and browser. |

---

# DATABASE SCHEMA

## Naming convention
- All tables: `snake_case`, plural
- All columns: `snake_case`
- All UUIDs: `gen_random_uuid()` default
- All timestamps: `timestamptz`, default `now()`
- Soft deletes: `deleted_at timestamptz null`

---

## CORE TABLES (shared — both verticals use these)

### `organizations`
The tenant. A bank in Tasdiq. A company/school in Butterfly.

```sql
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,           -- URL-safe identifier
  product     text not null check (product in ('tasdiq', 'butterfly')),
  settings    jsonb default '{}',             -- product-specific config
  created_at  timestamptz default now(),
  deleted_at  timestamptz
);
```

### `users`
Anyone who logs in. Linked to exactly one org.

```sql
create table users (
  id          uuid primary key references auth.users(id),
  org_id      uuid not null references organizations(id),
  email       text not null,
  full_name   text,
  role        text not null check (role in (
    -- Core roles (both products)
    'owner', 'admin', 'member', 'viewer',
    -- Tasdiq-specific
    'bank_officer', 'inspector', 'supervisor',
    -- Butterfly-specific
    'hr_admin', 'manager', 'responder'
  )),
  created_at  timestamptz default now(),
  deleted_at  timestamptz
);
```

### `workflows`
The universal state machine. Every process in both products is a workflow.

```sql
create table workflows (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  type            text not null,  -- e.g. 'tranche_verification', 'protocol_deployment', 'training_completion'
  reference_id    text,           -- external ID (project number, deployment name)
  reference_label text,           -- human name ("Block 4 Floor 3", "Q3 Manager Training")
  current_state   text not null,
  meta            jsonb default '{}',  -- type-specific data
  created_by      uuid references users(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  completed_at    timestamptz
);

create index idx_workflows_org on workflows(org_id);
create index idx_workflows_type on workflows(org_id, type);
create index idx_workflows_state on workflows(org_id, current_state);
```

### `workflow_transitions`
Allowed state transitions per workflow type. Seeded at setup, not user-editable.

```sql
create table workflow_transitions (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,       -- matches workflows.type
  from_state  text not null,
  to_state    text not null,
  required_role text[],            -- which roles can trigger this
  auto_conditions jsonb,           -- conditions for auto-transition (optional)
  unique(type, from_state, to_state)
);
```

### `ledger_events`
Append-only. The audit trail that makes banks and HR departments trust you.

```sql
create table ledger_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  workflow_id   uuid references workflows(id),
  event_type    text not null,       -- e.g. 'evidence_uploaded', 'checkin_initiated', 'state_changed'
  actor_id      uuid references users(id),
  payload       jsonb default '{}',  -- event-specific data
  prev_hash     text,                -- SHA-256 of previous event in this org
  hash          text not null,       -- SHA-256(prev_hash + id + event_type + payload + created_at)
  created_at    timestamptz default now()
);

-- Append-only enforcement: no UPDATE or DELETE via RLS
-- Hash chain verified by export generator before producing packs

create index idx_ledger_org on ledger_events(org_id);
create index idx_ledger_workflow on ledger_events(workflow_id);
create index idx_ledger_created on ledger_events(org_id, created_at);
```

### `media`
Files attached to workflows. Evidence photos/videos (Tasdiq) or training materials (Butterfly).

```sql
create table media (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  workflow_id   uuid references workflows(id),
  storage_path  text not null,        -- Supabase Storage path
  file_type     text not null,        -- 'video', 'photo', 'document', 'sensor_log'
  sha256        text,                 -- hash of file bytes
  phash         text,                 -- perceptual hash (Tasdiq: duplicate detection)
  meta          jsonb default '{}',   -- sensor data, GPS, device info, fraud scores
  uploaded_by   uuid references users(id),
  created_at    timestamptz default now()
);

create index idx_media_workflow on media(workflow_id);
create index idx_media_phash on media(phash) where phash is not null;
```

### `export_packs`
Generated compliance packages. Bank tranche packs or HR reports.

```sql
create table export_packs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  workflow_id   uuid references workflows(id),
  pack_type     text not null,       -- 'tranche_pack', 'compliance_report', 'training_certificate'
  storage_path  text not null,       -- Supabase Storage path to ZIP/PDF
  manifest_hash text not null,       -- SHA-256 of the manifest JSON inside the pack
  generated_by  uuid references users(id),
  created_at    timestamptz default now()
);
```

---

## ROW LEVEL SECURITY

Every table gets the same pattern. Users only see rows belonging to their org.

```sql
-- Enable RLS on all tables
alter table organizations enable row level security;
alter table users enable row level security;
alter table workflows enable row level security;
alter table workflow_transitions enable row level security;
alter table ledger_events enable row level security;
alter table media enable row level security;
alter table export_packs enable row level security;

-- Helper function: get current user's org_id
create or replace function auth.user_org_id()
returns uuid as $$
  select org_id from users where id = auth.uid()
$$ language sql security definer stable;

-- Helper function: get current user's role
create or replace function auth.user_role()
returns text as $$
  select role from users where id = auth.uid()
$$ language sql security definer stable;

-- Organizations: users see only their own org
create policy "Users see own org"
  on organizations for select
  using (id = auth.user_org_id());

-- Users: see members of your org only
create policy "Users see org members"
  on users for select
  using (org_id = auth.user_org_id());

-- Workflows: org-scoped
create policy "Workflows org scoped"
  on workflows for select
  using (org_id = auth.user_org_id());

create policy "Workflows insert by members"
  on workflows for insert
  with check (org_id = auth.user_org_id());

create policy "Workflows update by members"
  on workflows for update
  using (org_id = auth.user_org_id());

-- Workflow transitions: public read (these are config, not data)
create policy "Transitions readable by all"
  on workflow_transitions for select
  using (true);

-- Ledger events: org-scoped, INSERT only (no update, no delete)
create policy "Ledger read own org"
  on ledger_events for select
  using (org_id = auth.user_org_id());

create policy "Ledger append only"
  on ledger_events for insert
  with check (org_id = auth.user_org_id());

-- NO update or delete policy on ledger_events. Ever.

-- Media: org-scoped
create policy "Media org scoped read"
  on media for select
  using (org_id = auth.user_org_id());

create policy "Media org scoped insert"
  on media for insert
  with check (org_id = auth.user_org_id());

-- Export packs: org-scoped
create policy "Exports org scoped"
  on export_packs for select
  using (org_id = auth.user_org_id());

create policy "Exports insert"
  on export_packs for insert
  with check (org_id = auth.user_org_id());
```

---

## WORKFLOW ENGINE

### Transition logic (Edge Function)

```
POST /functions/v1/transition
Body: { workflow_id, to_state, payload? }
```

The Edge Function does:
1. Fetch workflow + current_state
2. Check workflow_transitions for a valid (type, from_state, to_state) row
3. Check that the caller's role is in required_role[]
4. Update workflow.current_state and workflow.updated_at
5. If to_state is terminal, set workflow.completed_at
6. Write a ledger_event (type: 'state_changed', payload: {from, to, reason})
7. Compute hash chain: SHA-256(prev_hash + event_id + event_type + JSON.stringify(payload) + created_at)
8. Return the updated workflow

If any check fails, return 403 with a reason. No partial transitions.

### Seeded transitions

#### Tasdiq: `tranche_verification`

```
DRAFT → EVIDENCE_REQUESTED    (bank_officer, admin)
EVIDENCE_REQUESTED → CAPTURED  (inspector)
CAPTURED → AUTO_VERIFIED       (system — auto after fraud checks pass)
CAPTURED → FLAGGED             (system — auto if fraud score below threshold)
AUTO_VERIFIED → APPROVED       (supervisor, bank_officer)
FLAGGED → APPROVED             (supervisor — manual override with reason)
FLAGGED → REJECTED             (supervisor, bank_officer)
APPROVED → EXPORTED            (system — auto after pack generation)
EXPORTED → BANK_ACCEPTED       (bank_officer)
EXPORTED → BANK_REJECTED       (bank_officer — with reason)
```

#### Butterfly: `protocol_deployment`

```
SETUP → TRAINING_SCHEDULED     (hr_admin)
TRAINING_SCHEDULED → TRAINING_ACTIVE (system — on start date)
TRAINING_ACTIVE → DEPLOYED     (hr_admin — when training completion > threshold)
DEPLOYED → ACTIVE              (system — first check-in logged)
ACTIVE → REPORTING             (system — on quarter end)
REPORTING → ACTIVE             (system — after report generated)
```

#### Butterfly: `training_completion`

```
NOT_STARTED → IN_PROGRESS      (manager, responder — on first module opened)
IN_PROGRESS → COMPLETED        (system — all modules finished)
COMPLETED → CERTIFIED          (system — auto-generates certificate)
```

---

## LEDGER EVENT TYPES

### Core (both products)
- `workflow_created`
- `state_changed`
- `media_uploaded`
- `export_generated`
- `user_invited`
- `user_role_changed`

### Tasdiq-specific
- `evidence_captured` — includes sensor summary, GPS, device attestation
- `fraud_check_completed` — includes per-check scores
- `challenge_issued` — server-issued paper code for capture session
- `signature_requested` — E-IMZO deeplink sent
- `signature_verified` — PKCS#7 validated
- `tranche_released` — bank officer confirmed release

### Butterfly-specific
- `checkin_initiated` — aggregate only: org_id, timestamp, routing_type, accepted (boolean). NO PII.
- `training_module_completed` — user_id + module_id + timestamp
- `resource_routed` — routing_type (988, EAP, counselor, other), accepted
- `compliance_report_requested`

---

## HASH CHAIN IMPLEMENTATION

```typescript
// Edge Function: computeHash.ts
import { createHash } from 'https://deno.land/std/hash/mod.ts';

export function computeEventHash(
  prevHash: string | null,
  eventId: string,
  eventType: string,
  payload: object,
  createdAt: string
): string {
  const data = [
    prevHash ?? 'GENESIS',
    eventId,
    eventType,
    JSON.stringify(payload),
    createdAt
  ].join('|');

  return createHash('sha256').update(data).toString();
}

// Called before every ledger insert:
// 1. SELECT hash FROM ledger_events WHERE org_id = $1 ORDER BY created_at DESC LIMIT 1
// 2. newHash = computeEventHash(prevHash, newEventId, ...)
// 3. INSERT INTO ledger_events (..., prev_hash, hash) VALUES (..., prevHash, newHash)
```

### Chain verification (export time)

Before generating any export pack, the Edge Function walks the entire chain for that workflow and verifies every hash. If any hash breaks, the export is blocked and an alert fires. This is what makes the ledger tamper-evident.

---

## EXPORT GENERATOR

```
POST /functions/v1/export
Body: { workflow_id, pack_type }
```

### Pack contents (Tasdiq: tranche_pack)

```
/01_act/            — Generated acceptance act (PDF)
/02_manifest/       — evidence_manifest.json (list of media + sha256 + timestamps)
/03_media/          — All evidence files for this workflow
/04_reports/        — fraud_check_report.pdf, geo_report.pdf
/05_audit/          — ledger_events.jsonl (all events for this workflow)
/05_audit/          — hash_anchor.txt (final hash in the chain)
```

### Pack contents (Butterfly: compliance_report)

```
/01_report/         — Quarterly compliance report (PDF)
/02_data/           — aggregate_metrics.json (check-in counts, routing stats, training completion)
/03_audit/          — ledger_events.jsonl (all events for this deployment)
/03_audit/          — hash_anchor.txt
```

### Pack contents (Butterfly: training_certificate)

```
/certificate.pdf    — Individual training completion certificate
/verification.json  — hash of certificate + completion event + chain anchor
```

---

## API SURFACE (Edge Functions)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/auth/signup` | POST | none | Create account + org |
| `/auth/invite` | POST | admin | Invite user to org |
| `/workflows` | GET | member | List workflows for org |
| `/workflows` | POST | member | Create workflow |
| `/workflows/:id` | GET | member | Get workflow detail |
| `/transition` | POST | member | Trigger state transition |
| `/events` | GET | member | List ledger events (paginated) |
| `/events` | POST | system | Append event (called by other functions) |
| `/media/upload` | POST | member | Upload file + compute hashes |
| `/media/:id/verify` | POST | system | Run fraud checks on uploaded media |
| `/export` | POST | admin | Generate export pack |
| `/export/:id/download` | GET | member | Download generated pack |
| `/challenge/issue` | POST | admin | Generate random capture challenge (Tasdiq) |
| `/challenge/verify` | POST | system | Verify challenge code in captured frame (Tasdiq) |

---

## FRONTEND STRUCTURE (Next.js App Router)

```
app/
├── (auth)/
│   ├── login/page.tsx
│   └── signup/page.tsx
├── (dashboard)/
│   ├── layout.tsx              — Sidebar + header (shared shell)
│   ├── page.tsx                — Dashboard home (redirects by product)
│   ├── workflows/
│   │   ├── page.tsx            — Workflow list
│   │   └── [id]/page.tsx       — Workflow detail + timeline
│   ├── team/page.tsx           — Org members
│   └── settings/page.tsx       — Org settings
├── (tasdiq)/                   — Tasdiq-specific routes
│   ├── capture/page.tsx        — PWA capture interface (camera + sensors)
│   ├── projects/page.tsx       — Construction projects list
│   ├── projects/[id]/page.tsx  — Project detail + milestones
│   └── bank/page.tsx           — Bank officer dashboard
├── (butterfly)/                — Butterfly-specific routes
│   ├── deploy/page.tsx         — Deployment setup
│   ├── training/page.tsx       — Training module player
│   ├── checkin/page.tsx        — Check-in logging (minimal UI)
│   └── reports/page.tsx        — Compliance reports
├── components/
│   ├── core/                   — Shared: WorkflowTimeline, EventLog, ExportButton
│   ├── tasdiq/                 — Tasdiq: CaptureView, FraudScore, TrancheDashboard
│   └── butterfly/              — Butterfly: TrainingPlayer, CheckinButton, ComplianceChart
└── lib/
    ├── supabase.ts             — Client init
    ├── workflows.ts            — Workflow helpers
    ├── ledger.ts               — Event + hash helpers
    └── types.ts                — Shared TypeScript types
```

---

## THE "NEVER REBUILD" TEST

When Saidislom finishes the core and starts the Butterfly vertical, he should:

- Add ZERO new tables (only new rows in workflow_transitions + new event_type strings)
- Add ZERO new RLS policies
- Add ZERO new Edge Functions for core logic
- Add ONLY: new pages in `(butterfly)/`, new components in `components/butterfly/`, new export templates

If he has to touch the core schema, the core API, or the RLS policies to ship Butterfly, I designed it wrong. Flag it and I'll fix the spec.

---

## DEPLOYMENT

### Supabase project setup
1. Create project on supabase.com (paid plan — you already have this)
2. Run the SQL above in the SQL editor (or via migrations)
3. Deploy Edge Functions: `supabase functions deploy`
4. Create Storage buckets: `evidence` (Tasdiq), `training` (Butterfly), `exports` (both)
5. Set Storage policies: bucket-level RLS matching org_id

### Vercel setup
1. Create project linked to Git repo
2. Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
3. Deploy with `vercel --prod`

### Domain routing
- `tasdiq.uz` → Vercel project (Tasdiq routes)
- `butterfly.one/app` → Same Vercel project (Butterfly routes) OR separate deployment
- Both hit the same Supabase backend. Product differentiation is via `organizations.product` field.

---

## WHAT THIS SPEC DOES NOT COVER (vertical specs needed)

### Tasdiq vertical spec (next document)
- PWA capture flow (camera + DeviceMotion + DeviceOrientation APIs)
- Fraud detection pipeline (sensor fusion, perceptual hash, challenge-response)
- Bank dashboard design
- E-IMZO deeplink integration
- NBU pilot playbook
- 10-day MVP daily sprint plan

### Butterfly vertical spec (separate document)
- Training content and module structure
- Check-in UI (the 2-tap logging interface)
- Resource routing configuration per org
- Compliance report template design
- /deploy page integration with the SaaS backend
- How butterfly.one (marketing site) connects to butterfly.one/app (SaaS)

---

## LOCKED DECISIONS (April 16, 2026)

1. **Single Next.js app with route groups.** No Turborepo. No Nx. No monorepo tooling. One `app/` directory. Tasdiq and Butterfly are route groups `(tasdiq)/` and `(butterfly)/`. They share `components/core/` and `lib/` natively. Zero DevOps overhead.

2. **Vercel API routes (Node.js) for all logic.** No Deno. No Supabase Edge Functions except DB triggers that must fire before returning. Saidislom stays in the Node ecosystem he knows. PDF generation, image hashing, fraud checks — all in Vercel Serverless Functions.

3. **Supabase Realtime is non-negotiable for V1.** Inspector captures scan on phone → scan appears live on banker's dashboard with green checkmark. No F5. No polling. Hook Realtime into `ledger_events` and `workflows` tables. Worth the extra day.

---

*This is the core. Everything above is product-agnostic. Everything below is vertical-specific and lives in separate specs.*

*The bar: when we add Butterfly, we add zero tables, zero policies, zero core functions. Only new UI and new event types.*

*Build this first. Then we never come back.*
