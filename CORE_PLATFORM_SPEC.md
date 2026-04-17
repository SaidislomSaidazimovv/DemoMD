# CORE PLATFORM SPEC — TASDIQ + BUTTERFLY
## The foundation you build once and never touch again.
## April 16, 2026 (rev. April 17, 2026)

---

# LOCKED DECISIONS — READ FIRST

These three decisions override anything else in this document. If a code snippet or
section below contradicts them, the locked decision wins.

1. **Single Next.js app with route groups.** No Turborepo. No Nx. No monorepo tooling. One `app/` directory. Tasdiq and Butterfly are route groups `(tasdiq)/` and `(butterfly)/`. They share `components/core/` and `lib/` natively. Zero DevOps overhead.

2. **Vercel Node.js Serverless Functions for all logic.** No Deno. No Supabase Edge Functions except DB triggers that must fire inside Postgres. All routes live at `/api/...` in the Next.js App Router. PDF generation, image hashing, fraud checks, hash-chain writes — all in Vercel Serverless Functions. Saidislom stays in the Node ecosystem he knows.

3. **Supabase Realtime is non-negotiable for V1.** Inspector captures scan on phone → scan appears live on banker's dashboard with green checkmark. No F5. No polling. Hook Realtime into `ledger_events`, `workflows`, and `media` tables. Worth the extra day.

---

# STACK

| Layer | Choice | Why |
|-------|--------|-----|
| Database | Supabase PostgreSQL | RLS for multi-tenancy. Saidislom knows it. Paid plan. |
| Auth | Supabase Auth | Email/password + magic links. OTP for mobile. |
| Storage | Supabase Storage | Evidence media (Tasdiq), training assets (Butterfly). Bucket-level RLS keyed on `org_id`. |
| Backend logic | **Vercel Node.js Serverless Functions** (Next.js App Router `/api/*`) | Single codebase with the frontend. Deploys with `vercel --prod`. Node ecosystem Saidislom already knows. |
| Frontend | Next.js 14+ on Vercel | React (Saidislom's strength). App Router. Server components for dashboards. |
| Realtime | Supabase Realtime | Live dashboard updates when evidence is uploaded or events fire. Enabled on `ledger_events`, `workflows`, `media`. |
| PDF generation | `@react-pdf/renderer` (Node route) | Generates tranche packs and compliance reports. |
| Hash computation (server) | Node `crypto.createHash("sha256")` | SHA-256 for the ledger chain, computed inside `/api/*` routes. |
| Hash computation (browser) | Web Crypto API (`SubtleCrypto.digest`) | Hashing file bytes in the browser before upload, so the client-visible hash matches what the server records. |
| Image processing | `sharp` (Node) | Perceptual hashing (dHash), frame extraction, thumbnails. |
| ZIP packaging | `archiver` (Node) | Tranche-pack assembly. |

---

# DATABASE SCHEMA

## Naming convention
- All tables: `snake_case`, plural
- All columns: `snake_case`
- All UUIDs: `gen_random_uuid()` default
- All timestamps: `timestamptz`, default `now()`
- **Soft deletes: `deleted_at timestamptz null` — applies ONLY to auth-facing tables (`organizations`, `users`).** Business-data tables (`workflows`, `media`, `export_packs`) use state transitions and immutability instead of soft delete. `ledger_events` and `workflow_transitions` are append-only by design — never deleted, never updated.

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
Allowed state transitions per workflow type. Seeded at setup, immutable afterwards.

```sql
create table workflow_transitions (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,       -- matches workflows.type
  from_state  text not null,
  to_state    text not null,
  required_role text[] not null default '{}',  -- which roles can trigger this
  unique(type, from_state, to_state)
);
```

**Auto-transitions are NOT database-driven.** Transitions annotated `(system)` in the seeded
state machines (e.g. `CAPTURED → AUTO_VERIFIED` after fraud checks pass) are triggered by
server code in the `/api/*` routes — the fraud pipeline calls `POST /api/transition`
with the service-role key after it finishes scoring. There is no JSON DSL, no predicate
evaluator, and no cron job. If a "system" transition is needed, the feature that owns
that state writes the code that fires it.

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

## STORAGE RLS

Two buckets: `evidence` (Tasdiq media, Butterfly training assets) and `exports` (generated
tranche packs + compliance reports). Objects are keyed as `<org_id>/<workflow_id>/<filename>`
so the first path segment is always the org UUID. Policies below enforce that an authenticated
user can only read/write paths whose first segment matches their `auth.user_org_id()`.

```sql
-- Buckets (idempotent)
insert into storage.buckets (id, name, public)
  values ('evidence', 'evidence', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('exports', 'exports', false)
  on conflict (id) do nothing;

-- Evidence bucket: read + write within caller's org folder
create policy "evidence read own org"
  on storage.objects for select
  using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1]::uuid = auth.user_org_id()
  );

create policy "evidence write own org"
  on storage.objects for insert
  with check (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1]::uuid = auth.user_org_id()
  );

-- Exports bucket: same pattern
create policy "exports read own org"
  on storage.objects for select
  using (
    bucket_id = 'exports'
    and (storage.foldername(name))[1]::uuid = auth.user_org_id()
  );

create policy "exports write own org"
  on storage.objects for insert
  with check (
    bucket_id = 'exports'
    and (storage.foldername(name))[1]::uuid = auth.user_org_id()
  );

-- No UPDATE or DELETE policies on storage.objects.
-- Evidence files are immutable once uploaded (the ledger hashes them);
-- export packs can be regenerated but old objects stay in place for audit.
```

Server-side uploads that need to bypass RLS (e.g. the export generator writing a tranche pack)
must use the Supabase service-role key.

---

## WORKFLOW ENGINE

### Transition logic (Vercel Node route)

```
POST /api/transition
Body: { workflow_id, to_state, payload? }
```

The route does:
1. Fetch workflow + current_state
2. Check workflow_transitions for a valid (type, from_state, to_state) row
3. Check that the caller's role is in required_role[] (product-role gating happens here, not in RLS)
4. Update workflow.current_state and workflow.updated_at
5. If to_state is terminal, set workflow.completed_at
6. Write a ledger_event (type: 'state_changed', payload: {from, to, reason})
7. Compute hash chain: `SHA-256(prev_hash + event_id + event_type + canonicalJSON(payload) + created_at)` — see HASH CHAIN section
8. Return the updated workflow

If any check fails, return 403 with a reason. No partial transitions.

"System" transitions (e.g. `CAPTURED → AUTO_VERIFIED`) are made by server code calling this
same endpoint with the service-role key bypassing the role check.

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

The ledger chain is SHA-256 over a canonical (sorted-key) JSON serialization of the payload.
**Do not use `JSON.stringify(payload)` directly** — its key order is insertion order, not
canonical, so two semantically equal payloads can produce different hashes and silently break
chain verification at export time.

```typescript
// lib/canonical.ts — byte-stable JSON serialization
export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJSON).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + canonicalJSON(obj[k])).join(",") +
    "}"
  );
}
```

```typescript
// lib/ledger.ts — Node-side hash computation
import crypto from "node:crypto";
import { canonicalJSON } from "./canonical";

export function computeEventHash(args: {
  prevHash: string | null;
  eventId: string;
  eventType: string;
  payload: unknown;
  createdAt: string; // exact ISO string that will be written to the row
}): string {
  const data = [
    args.prevHash ?? "GENESIS",
    args.eventId,
    args.eventType,
    canonicalJSON(args.payload),
    args.createdAt,
  ].join("|");
  return crypto.createHash("sha256").update(data).digest("hex");
}

// Called before every ledger insert (inside /api/* routes):
// 1. SELECT hash FROM ledger_events WHERE org_id = $1 ORDER BY created_at DESC LIMIT 1
// 2. newHash = computeEventHash({prevHash, eventId, eventType, payload, createdAt})
// 3. INSERT INTO ledger_events (..., prev_hash, hash) VALUES (..., prevHash, newHash)
```

### Browser-side file hashing

For `media.sha256` (the hash of the uploaded file's bytes), use Web Crypto in the browser
before upload so the client-visible hash matches what the server records:

```typescript
// lib/file-hash.ts — runs in the browser
export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

### Chain verification (export time)

Before generating any export pack, the export endpoint walks the entire chain for that workflow
and recomputes every hash using `canonicalJSON`. If any hash breaks, the export is blocked and an
alert fires. This is what makes the ledger tamper-evident — and why canonical JSON is required,
not optional.

---

## EXPORT GENERATOR

```
POST /api/export
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

## API SURFACE — Vercel Node routes at `/api/*`

All routes are Next.js App Router handlers under `app/api/...`. "system" auth means the
route is called server-to-server with the Supabase service-role key and bypasses user-role
gating. All other routes expect a Supabase session cookie.

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/signup` | POST | none | Create account + org |
| `/api/auth/invite` | POST | admin | Invite user to org |
| `/api/workflows` | GET | member | List workflows for org |
| `/api/workflows` | POST | member | Create workflow |
| `/api/workflows/:id` | GET | member | Get workflow detail |
| `/api/transition` | POST | member or system | Trigger state transition |
| `/api/events` | GET | member | List ledger events (paginated) |
| `/api/events` | POST | system | Append event (called by other routes) |
| `/api/media/upload` | POST | member | Upload file + record hashes |
| `/api/media/:id/verify` | POST | system | Run fraud checks on uploaded media |
| `/api/export` | POST | admin | Generate export pack |
| `/api/export/:id/download` | GET | member | Download generated pack |
| `/api/challenge/issue` | POST | admin | Generate random capture challenge (Tasdiq) |
| `/api/challenge/verify` | POST | system | Verify challenge code in captured frame (Tasdiq) |

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
- Add ZERO new routes under `app/api/core/*` (core business logic stays untouched)
- Add ONLY: new pages in `(butterfly)/`, new components in `components/butterfly/`, new export templates, new vertical-specific routes under `app/api/butterfly/*`

If he has to touch the core schema, the core API, or the RLS policies to ship Butterfly, I designed it wrong. Flag it and I'll fix the spec.

---

## DEPLOYMENT

### Supabase project setup
1. Create project on supabase.com (paid plan — you already have this)
2. Run the DDL from DATABASE SCHEMA in the SQL editor
3. Run the RLS policies from ROW LEVEL SECURITY + STORAGE RLS
4. Seed `workflow_transitions` with the Tasdiq transitions (Butterfly added later)
5. Enable Realtime on the required tables:
   ```sql
   alter publication supabase_realtime add table public.ledger_events;
   alter publication supabase_realtime add table public.workflows;
   alter publication supabase_realtime add table public.media;
   ```
6. Storage buckets + policies are created by the SQL in STORAGE RLS above — no manual dashboard steps.

### Vercel setup
1. Create project linked to Git repo
2. Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
3. Deploy with `vercel --prod`

All server logic lives under `app/api/*` — there is nothing to deploy to Supabase beyond SQL.
No `supabase functions deploy`. No Edge Functions.

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

---

*This is the core. Everything in this document is product-agnostic. Everything vertical-specific lives in separate specs (Tasdiq, Butterfly).*

*The bar: when we add Butterfly, we add zero tables, zero policies, zero core functions. Only new rows in `workflow_transitions`, new event-type strings, new UI under `app/(butterfly)/`.*

*The locked decisions are at the top of this document — they override anything below. Re-read them before making architectural changes.*

*Build this first. Then we never come back.*
