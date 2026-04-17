# Tasdiq — Architecture & Operations

Tamper-evident construction-milestone verification for banks. Built as an NBU pilot; architected as multi-bank-ready SaaS. This document is the single source of truth for how the system is structured, deployed, and operated.

---

## Table of contents

1. [What Tasdiq is](#1-what-tasdiq-is)
2. [The 3-minute demo](#2-the-3-minute-demo)
3. [Tech stack](#3-tech-stack)
4. [Directory layout](#4-directory-layout)
5. [Database schema](#5-database-schema)
6. [Row-level security](#6-row-level-security)
7. [Authentication & onboarding](#7-authentication--onboarding)
8. [Roles & permissions](#8-roles--permissions)
9. [Workflow state machine](#9-workflow-state-machine)
10. [Five-layer fraud detection](#10-five-layer-fraud-detection)
11. [Hash-chain ledger](#11-hash-chain-ledger)
12. [Tranche-pack export](#12-tranche-pack-export)
13. [Realtime](#13-realtime)
14. [API endpoints](#14-api-endpoints)
15. [Pages](#15-pages)
16. [Development setup](#16-development-setup)
17. [Supabase configuration checklist](#17-supabase-configuration-checklist)
18. [Vercel deployment](#18-vercel-deployment)
19. [Manual test flows](#19-manual-test-flows)
20. [Known limitations](#20-known-limitations)
21. [Troubleshooting](#21-troubleshooting)

---

## 1. What Tasdiq is

A bank loans a construction company money in tranches. Before each disbursement, the bank wants proof the building is actually progressing. Today that means a human on-site with a clipboard; tomorrow's fraud involves screen-recorded walkthroughs, reused photos, and fake GPS.

**Tasdiq is automated verification for that proof.** An inspector records 15 seconds of the construction site on their phone. Before upload, the phone collects accelerometer + gyroscope + GPS data. The server runs a 5-layer fraud pipeline. If verified, a banker approves with one click, downloads a cryptographically sealed ZIP containing the PDF acceptance act, manifest, media, audit log, and hash anchor. The bank can then disburse the next tranche, confident the evidence is genuine.

The ledger behind every project is append-only, SHA-256 hash-chained, and tamper-evident. Change a byte after the fact — the chain breaks, everyone sees it.

---

## 2. The 3-minute demo

Per [TASDIQ_VERTICAL_SPEC.md](../TASDIQ_VERTICAL_SPEC.md) Part 7. These four beats all work in the current build:

1. **Dashboard with mixed states.** Logged in as bank officer, projector shows the project list with KPIs (Total / Pending / Verified / Flagged), per-row fraud scores, realtime updates.
2. **Live capture.** Hand a phone to someone in the room. They open `/capture`, record for 15 seconds, submit. Within ~2 seconds, the evidence appears on the banker's dashboard. Audible reaction.
3. **Fraud test.** Hold a second phone in front of a laptop playing an old construction walkthrough. Upload. Dashboard flashes red — **FLAGGED**, 5-layer breakdown shows exactly why.
4. **Download the pack.** Approve the verified project, click **Generate tranche pack**, browser downloads a ZIP. Open it: PDF acceptance act, manifest with SHA-256 of every file, complete audit log, hash anchor.

End the pitch with: *"We shift you from believing a developer's story to relying on cryptographic evidence."*

---

## 3. Tech stack

Per the locked decisions in [CORE_PLATFORM_SPEC.md](../CORE_PLATFORM_SPEC.md):

| Layer | Choice | Why |
|---|---|---|
| Database | Supabase PostgreSQL | Managed Postgres with built-in auth, storage, realtime. RLS for multi-tenant isolation. |
| Auth | Supabase Auth | Email/password + email confirmation, Google OAuth, magic-link invitations |
| Storage | Supabase Storage | Evidence photos + videos, generated tranche-pack ZIPs. Bucket-level RLS by `org_id` prefix. |
| Backend logic | **Vercel Node.js Serverless Functions** (Next.js App Router `/api/*`) | No Deno, no Supabase Edge Functions. Single codebase with frontend. |
| Frontend | **Next.js 14 App Router** (TypeScript) | React Server Components + Turbopack in dev |
| Realtime | Supabase Realtime | Live dashboard updates via `postgres_changes` subscriptions |
| Hash (server) | Node `crypto.createHash("sha256")` | Ledger chain |
| Hash (browser) | Web Crypto `SubtleCrypto.digest` | File-byte SHA-256 at capture time |
| PDF generation | `pdfkit` | Tranche-pack acceptance act. Pure Node, no font files. |
| ZIP packaging | `archiver` | Streaming tranche-pack assembly |
| Styling | Tailwind CSS | |

**Critical runtime flag** in `next.config.mjs`:

```js
experimental: {
  serverComponentsExternalPackages: ["pdfkit", "archiver"],
}
```

Tells Next not to bundle these into the webpack graph — keeps dev compile fast.

---

## 4. Directory layout

```
.
├── app/
│   ├── (auth)/                       Route group: public auth pages
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   ├── verify-email/page.tsx
│   │   ├── accept-invite/page.tsx
│   │   └── complete-signup/page.tsx
│   ├── (dashboard)/                  Route group: org-level pages
│   │   ├── admin/page.tsx            Admin console + create project
│   │   └── team/page.tsx             Invite members, Pending/Active list
│   ├── (tasdiq)/                     Route group: Tasdiq vertical
│   │   ├── capture/page.tsx          Inspector PWA (camera + GPS + sensors + MediaRecorder)
│   │   ├── demo/page.tsx             NBU-pitch REAL / FRAUD simulator buttons
│   │   ├── dashboard/page.tsx        Bank officer overview
│   │   └── dashboard/project/[id]/page.tsx  Project detail + action buttons
│   ├── api/
│   │   ├── auth/
│   │   │   ├── invite/route.ts
│   │   │   ├── accept-invite/route.ts
│   │   │   ├── complete-signup/route.ts
│   │   │   └── finalize/route.ts     Called after client-side code-for-session exchange
│   │   ├── demo/
│   │   │   ├── simulate-real/route.ts
│   │   │   └── simulate-fraud/route.ts
│   │   ├── events/route.ts           GET ledger events
│   │   ├── events/append/route.ts    Server-side ledger append (hash chain)
│   │   ├── export/route.ts           Tranche-pack ZIP generator
│   │   ├── export/[id]/download/route.ts
│   │   ├── media/upload/route.ts     Server-side fraud pipeline
│   │   ├── transition/route.ts       Workflow state transitions
│   │   ├── workflows/route.ts        GET list, POST create
│   │   └── workflows/[id]/route.ts   GET detail
│   ├── auth/callback/page.tsx        Client-side OAuth + email-confirm exchange
│   ├── page.tsx                      Landing (redirects signed-in users)
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui.tsx                        Kpi, StateBadge, VerdictPill, FraudScoreBar, FraudCheckList
│   ├── state-stepper.tsx             6-step horizontal stepper for workflow state
│   └── toast.tsx                     Self-contained toast notifications
├── lib/
│   ├── supabase/
│   │   ├── browser.ts                createBrowserClient from @supabase/ssr
│   │   ├── server.ts                 createServerClient (cookies from next/headers)
│   │   └── admin.ts                  Service-role client (server-only, bypasses RLS)
│   ├── types.ts                      Shared domain types
│   ├── fraud.ts                      5 pure fraud-check functions + runAllChecks
│   ├── ledger.ts                     canonicalJSON + computeEventHash + verifyChain
│   ├── file-hash.ts                  sha256OfBlob (browser Web Crypto)
│   ├── pdf.ts                        generateActPdf with pdfkit
│   ├── actions.ts                    Client-side fetch helpers for /api routes
│   └── hooks.ts                      useSession, useRequireRole
├── supabase/
│   ├── schema.sql                    Full initial DDL (tables + RLS + storage buckets + seeded transitions)
│   ├── migration-accepted-at.sql     Adds accepted_at column + backfill
│   └── migration-admin-bank-roles.sql  Optional demo convenience
├── middleware.ts                     Auth-gate + route-level redirects
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── CORE_PLATFORM_SPEC.md             Architecture contract (shared with Butterfly vertical)
├── TASDIQ_VERTICAL_SPEC.md           Tasdiq-specific features + 10-day sprint
└── README.md
```

---

## 5. Database schema

Seven core tables, all defined in [supabase/schema.sql](../supabase/schema.sql):

| Table | Purpose |
|---|---|
| `organizations` | One per tenant (bank). `product = 'tasdiq' \| 'butterfly'`. Soft-delete via `deleted_at`. |
| `users` | One per auth user. FK to `auth.users.id`. Has `role`, `org_id`, `accepted_at` (null = pending invite). Soft-delete via `deleted_at`. |
| `workflows` | One per construction project. `type = 'tranche_verification'`. `current_state` is the state-machine position. `meta` JSONB holds project details. |
| `workflow_transitions` | Seeded state-machine config: `(type, from_state, to_state, required_role[])`. |
| `ledger_events` | Append-only. `prev_hash` + `hash` form the tamper-evident chain. No UPDATE/DELETE policy. |
| `media` | One per uploaded evidence photo. `sha256` of file bytes, `phash` for duplicate detection, `meta` JSONB with GPS, fraud result, video pointer. |
| `export_packs` | One per generated tranche pack. `storage_path` + `manifest_hash`. |

### Naming conventions

- snake_case tables + columns
- `id uuid primary key default gen_random_uuid()`
- `created_at timestamptz not null default now()`
- Soft deletes apply ONLY to `organizations` and `users` (auth-facing tables per spec revision)
- Business tables (`workflows`, `media`, `export_packs`) use state transitions, not soft deletes
- `ledger_events` + `workflow_transitions` are append-only / immutable

---

## 6. Row-level security

Every table has RLS enabled with org-scoped policies. The helper functions live in the `public` schema (not `auth`, which Supabase reserves):

```sql
create function public.user_org_id() returns uuid ...
create function public.user_role()   returns text ...
```

Policy pattern: `using (org_id = public.user_org_id())` on SELECT and INSERT. `ledger_events` has INSERT only — no UPDATE, no DELETE policy, so those are denied for any non-service-role caller.

**Storage RLS** on the `evidence` and `exports` buckets keyed on the first path segment:

```sql
(storage.foldername(name))[1]::uuid = public.user_org_id()
```

Uploads must be at `<org_id>/<workflow_id>/<filename>` or they're rejected.

---

## 7. Authentication & onboarding

### Three entry points

| Flow | Used by | URL |
|---|---|---|
| Signup with email verification | First admin of a new bank | `/signup` |
| Invitation magic link | Team members invited by admin | Email link → `/auth/callback` → `/accept-invite` |
| Google OAuth | Any returning user; first-time Google users go through `/complete-signup` | `/login` Continue with Google button |

### The unified callback

`/auth/callback` is a **client-side page**, not a server route. This is by design:

- `@supabase/ssr`'s browser client stores the PKCE code-verifier in browser storage
- `exchangeCodeForSession(code)` needs that verifier to complete
- Running the exchange server-side caused `PKCE code verifier not found` errors across tabs / browser redirects

After exchange succeeds, the client POSTs to `/api/auth/finalize`, which does the profile/org creation and returns the route to redirect to.

### Session management

- **Middleware** (`middleware.ts`) runs `supabase.auth.getUser()` (NOT `getSession()`) on every page request — verifies the token with Supabase Auth rather than trusting a locally-decoded cookie. Bypassed for `/api/*`, static assets, and `/auth/callback`.
- **Landing page** (`app/page.tsx`) uses the same `getUser()` pattern for server-side redirect decisions.
- **API routes** use `getUser()` inside each handler before any privileged operation.

---

## 8. Roles & permissions

Defined in `users.role`:

- `admin` — creates projects, invites team members, broad access
- `bank_officer` — approves milestones, generates tranche packs, confirms bank acceptance
- `supervisor` — reviews flagged evidence, approves with override reason
- `inspector` — uploads evidence via the capture PWA

Role enforcement happens at **two levels**:

1. **Client-side** — `useRequireRole([...])` redirects if the signed-in user's role isn't in the allowed list.
2. **Server-side** — `/api/transition` checks `workflow_transitions.required_role` for the specific state change.

Server-side is authoritative. Client-side is UX convenience.

The admin role has broad access by design — they can visit `/capture` and trigger `/demo` actions. The seeded state machine restricts some terminal actions (approve, reject, bank-accept, bank-reject) to specific roles; `migration-admin-bank-roles.sql` (optional) adds admin to the bank-accept/reject allow list for demo convenience.

---

## 9. Workflow state machine

For `type = 'tranche_verification'`:

```
DRAFT
  └─[admin,bank_officer]→ EVIDENCE_REQUESTED
         └─[inspector]→ CAPTURED
                  ├─[admin,supervisor]→ AUTO_VERIFIED
                  │         ├─[supervisor,bank_officer]→ APPROVED
                  │         │        └─[admin,bank_officer]→ EXPORTED
                  │         │                 ├─[bank_officer]→ BANK_ACCEPTED  ← terminal, emits tranche_released
                  │         │                 └─[bank_officer]→ BANK_REJECTED  ← terminal
                  │         └─[supervisor,bank_officer]→ REJECTED              ← terminal
                  └─[admin,supervisor]→ FLAGGED
                            ├─[supervisor]→ APPROVED (same as above)
                            └─[supervisor,bank_officer]→ REJECTED
```

Seeded via the `workflow_transitions` table in [supabase/schema.sql](../supabase/schema.sql). "Auto" transitions (e.g., from `CAPTURED` to `AUTO_VERIFIED`) are triggered by server code (specifically the fraud pipeline in `/api/media/upload`) using `system: true` to bypass the role check.

---

## 10. Five-layer fraud detection

Implemented in [lib/fraud.ts](../lib/fraud.ts) as pure functions. Called server-side in `/api/media/upload` after the client uploads photo + sensor data.

| # | Layer | Weight | Input | Pass when |
|---|---|---|---|---|
| 1 | **GPS Geofence** | 0.25 | `{lat, lng}` + project coords | Haversine distance ≤ `geofence_radius_meters` |
| 2 | **Human Motion** | 0.20 | Accelerometer magnitude samples | Variance in `[0.001, 1.0]` — human tremor |
| 3 | **Sensor-Camera Consistency** | 0.25 | Motion variance + lighting variance | Not both "phone stationary" (motion < 0.01) AND "uniform lighting" (var < 0.02). The screen-replay killer. |
| 4 | **Unique Photo** | 0.15 | dHash + prior submissions' hashes | No Hamming distance match within threshold (10 bits out of 64) |
| 5 | **Challenge Code** | 0.15 | Submitted code + stored code + issued-at timestamp | Match (case-insensitive) **and** age ≤ 30 seconds |

### Aggregate scoring

```
aggregate = Σ(score × weight)
verdict = aggregate ≥ 0.70 ? VERIFIED : FLAGGED
```

### Server-side pipeline flow

```
capture page → FormData { file, workflow_id, payload } → POST /api/media/upload
                                                               ↓
                                                        file SHA-256 server-computed
                                                               ↓
                                                        query existing phashes
                                                               ↓
                                                        runAllChecks() in fraud.ts
                                                               ↓
                                                        Storage upload (service role)
                                                               ↓
                                                        media row insert
                                                               ↓
                                                        ledger events: media_uploaded + evidence_captured (+fraud_detected if FLAGGED)
                                                               ↓
                                                        workflow transitions AUTO_VERIFIED or FLAGGED
                                                               ↓
                                                        response to client
```

The client-side capture page displays the result verbatim.

---

## 11. Hash-chain ledger

Every write to `ledger_events` goes through [lib/ledger.ts](../lib/ledger.ts)'s `computeEventHash`:

```
SHA-256( prev_hash ?? "GENESIS"
       | event.id
       | event.event_type
       | canonicalJSON(event.payload)
       | event.created_at (normalized to "...Z" format)
       )
```

### Why canonical JSON

`JSON.stringify` uses insertion order. Two semantically-equal payloads with different key order produce different hashes. `canonicalJSON` sorts keys at every nesting depth → byte-stable output → stable hashes → chain is verifiable.

### Why timestamp normalization matters

PostgREST returns timestamps as either `2026-04-18T01:30:16.123Z` or `2026-04-18T01:30:16.123+00:00` depending on version. The insert-time hash was computed with the `Z` form. On verify, `new Date(ev.created_at).toISOString()` re-normalizes — otherwise every verification would fail.

### Chain scope

**The chain is org-wide, not workflow-scoped.** Every event's `prev_hash` points to the previous event in the *entire organization*. This is deliberate: one tamper-evident ledger per bank, not per project.

`verifyChain()` walks the entire org's events, not just the workflow's. The project-detail page and `/api/export` both fetch the full org chain for verification. Exported tranche packs include the full org chain in `05_audit/ledger_events.jsonl` so the pack is self-verifiable offline.

### Event types emitted today

- `workflow_created`, `challenge_issued`, `state_changed`
- `media_uploaded`, `evidence_captured`, `fraud_detected`
- `export_generated`, `tranche_released`
- `user_invited`

---

## 12. Tranche-pack export

### Trigger

Bank officer clicks **📦 Generate tranche pack** on the project detail page when workflow is in `APPROVED` state.

### Server flow (`/api/export/route.ts`)

1. Verify hash chain over the full org ledger — abort with 409 if broken
2. Query workflow + media + both workflow-scoped and org-wide events
3. Generate PDF acceptance act via [lib/pdf.ts](../lib/pdf.ts) (pdfkit, pure Node)
4. Build evidence manifest JSON with SHA-256 of every media file
5. Download each media's photo + optional video from Storage in parallel
6. Assemble ZIP with `archiver`
7. Upload ZIP to `exports` bucket
8. Insert `export_packs` row + `manifest_hash`
9. Write `export_generated` ledger event through the chain
10. Transition workflow `APPROVED → EXPORTED` (also through the chain)
11. Return signed download URL (1-hour expiry)

### ZIP contents

```
pack-<timestamp>.zip
├── 01_act/
│   └── acceptance_act.pdf
├── 02_manifest/
│   └── evidence_manifest.json
├── 03_media/
│   ├── <media_id>.jpg           (still-frame photo)
│   └── <media_id>-video.webm    (15s video, if present)
└── 05_audit/
    ├── ledger_events.jsonl      (full org chain — for self-verification)
    ├── workflow_events.jsonl    (this workflow only — for convenience)
    └── hash_anchor.txt          (final SHA-256 of the org chain)
```

### Re-download later

`/api/export/[id]/download` re-issues a fresh signed URL for any previously-generated pack (useful if the original 1-hour URL expired).

---

## 13. Realtime

Supabase Realtime publications are enabled on `ledger_events`, `workflows`, `media` (in `supabase/schema.sql`).

### Subscriptions

- **Bank dashboard** — subscribes to `ledger_events` INSERT, `media` INSERT, `workflows` UPDATE. Fires toasts on `evidence_captured`, `fraud_detected`, `state_changed`, `export_generated` events.
- **Project detail** — same but filtered by `workflow_id=eq.<id>`.
- **Team page** — subscribes to `users` INSERT and UPDATE. Shows Pending → Active transitions in real time.
- **Demo panel** — refreshes on any `workflows` or `media` change.

### Toast component

`components/toast.tsx` — self-contained, no external dependency. Auto-dismiss after 5s. Four tones (info / success / warn / error).

---

## 14. API endpoints

All under `app/api/`. Auth rules enforced inside each route.

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/invite` | POST | admin | Invite teammate; emits `user_invited` ledger event |
| `/api/auth/accept-invite` | POST | self | Set password after magic-link acceptance |
| `/api/auth/complete-signup` | POST | self | Post-OAuth org creation |
| `/api/auth/finalize` | POST | self | Called from `/auth/callback` after browser code exchange |
| `/api/workflows` | GET | member | List workflows in caller's org |
| `/api/workflows` | POST | admin, bank_officer | Create project; emits `workflow_created` + `challenge_issued` |
| `/api/workflows/[id]` | GET | member | Joined workflow + media + events |
| `/api/transition` | POST | role-gated | State machine; emits `state_changed` (+ `tranche_released` on BANK_ACCEPTED) |
| `/api/events` | GET | member | Paginated ledger events; optional `workflow_id` filter |
| `/api/events/append` | POST | member | Append arbitrary event through the chain |
| `/api/media/upload` | POST | member | Server-side fraud pipeline — full upload + scoring + state transition |
| `/api/export` | POST | admin, bank_officer | Generate tranche pack (see section 12) |
| `/api/export/[id]/download` | GET | member of pack's org | Re-issue signed download URL |
| `/api/demo/simulate-real` | POST | admin, bank_officer | Inject a synthetic REAL evidence row (NBU demo button) |
| `/api/demo/simulate-fraud` | POST | admin, bank_officer | Inject a synthetic FRAUD evidence row (NBU demo button) |

No `/api/auth/signup` — signup runs client-side via `supabase.auth.signUp()` directly so Supabase email-verification handles delivery.

---

## 15. Pages

| Path | Who lands here | Notes |
|---|---|---|
| `/` | Everyone | Marketing page for anonymous; server-side redirect to role home for signed-in |
| `/login` | Anyone with credentials | Email/password + Google button |
| `/signup` | First admin of a new bank | Email/password with verification + Google button |
| `/verify-email` | Just-signed-up users | "Check your inbox" + resend button |
| `/accept-invite` | Invited users after email click | Set password |
| `/complete-signup` | Post-OAuth users with no org yet | Fill in org name + slug |
| `/auth/callback` | Every OAuth / email-confirmation return | Client-side code exchange → finalize |
| `/admin` | `admin` role | Org console, create projects, ledger summary |
| `/team` | `admin` role | Invite members, see Pending/Active status with live updates |
| `/dashboard` | `bank_officer`, `supervisor`, `admin` | KPIs + project list with fraud scores |
| `/dashboard/project/[id]` | Same roles | Evidence timeline, state stepper, approve/reject/export/bank-accept/bank-reject buttons |
| `/capture` | `inspector`, `admin` | 4-screen PWA (project → challenge → capture → upload) |
| `/demo` | `admin`, `bank_officer` | REAL / FRAUD simulator buttons for NBU pitch |

---

## 16. Development setup

### Prerequisites

- Node.js 20 or newer
- A Supabase project (paid plan recommended but not required for dev)
- Windows Defender exclusion on the project folder (huge dev-compile speedup on Windows)

### Environment variables (create `.env.local`, never commit)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

The first two come from Supabase → Settings → API (publishable/anon key). The service-role key is the "secret" key on that same page — keep it server-side only.

### First-time setup

```bash
npm install

# Paste supabase/schema.sql contents into Supabase SQL Editor → Run
# Paste supabase/migration-accepted-at.sql → Run
# (Optional) Paste supabase/migration-admin-bank-roles.sql → Run

npm run dev
```

Open http://localhost:3000.

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server with Turbopack on :3000 |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run typecheck` | `tsc --noEmit` |

### When `npm run dev` is slow on Windows

See [troubleshooting](#21-troubleshooting). Usually: stale `node.exe` processes from a prior run, or Defender scanning `node_modules`. Kill node + clear `.next` + restart.

---

## 17. Supabase configuration checklist

Once per project:

### Authentication → Providers

- ✅ **Email** provider enabled
- ✅ **Confirm email** toggle ON
- ✅ **Google** provider enabled with OAuth client ID + secret from Google Cloud Console

### Authentication → URL Configuration

- **Site URL** → your production URL (e.g. `https://your-app.vercel.app`)
- **Redirect URLs** (4 entries):
  - Production: `<site-url>/auth/callback`
  - Production: `<site-url>/accept-invite`
  - Dev: `http://localhost:3000/auth/callback`
  - Dev: `http://localhost:3000/accept-invite`

### Google Cloud Console (if using Google OAuth)

- Create OAuth Web client
- Authorized redirect URI: `https://<your-supabase-ref>.supabase.co/auth/v1/callback`
- Copy Client ID + Secret into Supabase provider settings

### SQL setup

Run in order in SQL Editor:

1. [supabase/schema.sql](../supabase/schema.sql) — creates all tables, RLS, buckets, seeded transitions
2. [supabase/migration-accepted-at.sql](../supabase/migration-accepted-at.sql) — adds invite-pending state tracking
3. (Optional) [supabase/migration-admin-bank-roles.sql](../supabase/migration-admin-bank-roles.sql) — admins can finalize bank acceptance

### Custom SMTP (optional, recommended before scale)

Supabase's default sender is `noreply@mail.app.supabase.io` with a 3-emails-per-hour rate limit. For pilot + production:

1. Sign up at resend.com (free tier)
2. Verify your domain (single DNS TXT record)
3. Supabase → Project Settings → Authentication → SMTP Settings
4. Paste Resend's SMTP host/user/password/from

Until this is set up, email deliverability is a known bottleneck. See the [troubleshooting](#21-troubleshooting) section on "email not arriving".

---

## 18. Vercel deployment

### One-time setup

1. Import project into Vercel (link to your git repo)
2. Vercel → Project Settings → Environment Variables, add all three keys from `.env.local`
3. Deploy

### After every push to `main`, Vercel auto-deploys

### Checking deploys

- Vercel dashboard → Deployments tab
- Click any deployment → Function Logs to see `/api/*` runtime logs

### Production URL gotcha

The `origin` value in `/api/auth/invite` is taken from the request URL. If an admin sends an invite from `localhost:3000/team`, the email will contain `localhost:3000/accept-invite` — useless on other devices. **Always send production invites from the Vercel URL.**

---

## 19. Manual test flows

### Flow A — Clean signup, create project, simulate, approve, export

1. `/signup` → create org as admin
2. Confirm email (click link in inbox)
3. Land on `/admin`
4. Click **+ Create project** → submit the prefilled Yashnobod form
5. Navigate to `/demo` → click **✅ Simulate REAL capture**
6. Dashboard updates in real time; project flips to `AUTO_VERIFIED`
7. Click the project → project detail page
8. Click **✅ Approve** → state flips to `APPROVED`
9. Click **📦 Generate tranche pack** → ZIP downloads
10. Unzip and inspect — PDF + manifest + photos + audit log

### Flow B — Inspect a fraud attempt

1. `/demo` → click **🚨 Simulate FRAUD capture**
2. Evidence row appears flagged
3. Open project detail → click **Details** on the flagged evidence
4. See 5 red ❌ with per-layer reasons (GPS off, motion flat, duplicate hash, stale code, replay detected)

### Flow C — Real camera capture from a phone

1. Deploy to Vercel and use the HTTPS URL (getUserMedia requires HTTPS except on localhost)
2. On the phone, sign in as the inspector role
3. Land on `/capture`
4. Select project → memorize challenge code → capture
5. Enter code → submit

### Flow D — End-to-end bank acceptance

After flow A reaches `EXPORTED`:

1. Project detail page → **🏦 Mark as bank accepted**
2. (If 403, run `migration-admin-bank-roles.sql` first)
3. State advances to `BANK_ACCEPTED`; state stepper fills step 6
4. Ledger grows by 2 events: `state_changed` + `tranche_released`
5. Chain still verifies valid

### Flow E — Invite a teammate

1. `/team` → fill invite form
2. Teammate receives email
3. They click link → `/auth/callback` → `/accept-invite` → set password
4. They land on their role's home page
5. Admin's `/team` page flips them from Pending (yellow) to Active (green) in real time

---

## 20. Known limitations

Per [TASDIQ_VERTICAL_SPEC.md](../TASDIQ_VERTICAL_SPEC.md) "What we skip in V1":

| Feature | Why skipped | Scheduled |
|---|---|---|
| E-IMZO digital signatures | Requires SICNT licensing contract | V2 |
| ARCore Depth API / 3D | Requires native Android app | V2 |
| Play Integrity attestation | Same | V2 |
| KS-2/KS-3 form generation | Requires 1C integration research | V2 |
| Multi-bank tenancy UX polish | One bank per pilot is enough | V2 |
| AI-based floor counting / material detection | Research-grade | V3 |

### Currently-built simplifications

| Spec calls for | Current build |
|---|---|
| 15-second video + server-side optical flow (sharp) | 15s video is captured and stored; optical flow is *proxied* via the lighting-variance check in Layer 3. True frame-by-frame optical flow is scheduled as the next task (Point 2 in the Phase B plan). |
| Manual supervisor confirmation of challenge code | Automated matching + 30-second expiry check. More robust than the spec's manual approach. |
| Hardcoded "any single layer fails = always FLAGGED" | Currently threshold-only. Planned as Point 5. |
| GPS map pin + sensor overlay graph on evidence cards | Not built. Cosmetic — numbers shown as text. Planned as Point 6. |

### Butterfly vertical

Not attempted. The Core spec's "never rebuild" design supports it — the DB, RLS, hash chain, and state machine engine are universal. Adding Butterfly would require: seed `workflow_transitions` for `protocol_deployment` + `training_completion`, new pages under `app/(butterfly)/`, new API routes under `app/api/butterfly/*`. Zero changes to core.

---

## 21. Troubleshooting

### Slow `npm run dev` compile on Windows

Three usual causes, in order of impact:

1. **Windows Defender scanning `node_modules`.** Add the project folder to exclusions (Settings → Privacy & Security → Virus & threat protection → Exclusions). This alone typically cuts compile time by 40–70%.
2. **Multiple `node.exe` processes from a crashed prior run.** Fix: `taskkill /F /IM node.exe` then `rm -rf .next` then `npm run dev`.
3. **Project on a slow HDD instead of an SSD.** Move to an SSD or accept 5–10× slowdown.

### Generic 404 storm on all routes (`main-app.js 404`, `_next/static/css 404`)

Multiple dev servers ran simultaneously and scrambled `.next`. Same fix as above — kill all node, clear `.next`, restart.

### "PKCE code verifier not found in storage"

The `/auth/callback` used to be a server route; this error came from the server client not seeing the browser's cookie. **Already fixed.** `/auth/callback` is now a client page and delegates profile creation to `/api/auth/finalize`.

### "Hash chain broken — export blocked"

Was caused by PostgREST returning timestamps with `+00:00` formatting while the insert-time hash used `Z`. **Already fixed** in `lib/ledger.ts` — `verifyChain` now normalizes via `new Date(s).toISOString()` before hashing.

### Email not arriving

Three possible causes:

1. **Supabase's default SMTP rate-limits to 3 emails per hour.** Set up Resend (see section 17).
2. **Gmail's link-preview scanner consumes the confirmation token before you click.** Symptom: you click the link, get "Email link is invalid or has expired." The token was already used by Gmail's crawler. Workaround: use a `+alias` email (`you+test1@gmail.com`) for testing, or switch to OTP flow (not yet built).
3. **Gmail Promotions tab.** Search `from:noreply@mail.app.supabase.io` across all mail.

### Invite email goes to wrong URL

If the admin sent the invite from `localhost:3000`, the email contains `localhost:3000/accept-invite`. That's unreachable from any other device. Always send production invites from your Vercel URL.

### "Cannot delete organization — foreign key constraint"

You're trying to hard-delete from `organizations` but `users.org_id` still references it. Either:

- Soft-delete: `UPDATE organizations SET deleted_at = now() WHERE id = '<id>'` (preferred)
- Cascade: delete children first (users, workflows, media, ledger_events, export_packs), then the org (destructive)

### Supabase Table Editor shows empty table but app shows data

Browser-cached view of the Table Editor. Click the refresh icon on the Editor's toolbar. Alternative: run `SELECT * FROM public.<table>` in the SQL Editor for an authoritative answer.

### Dev server's console shows `cz-shortcut-listen` React warning

Browser extension (typically ColorZilla) injects a DOM attribute. Harmless. Not our code. Ignore.

### Webpack serialization warning (215 kB big strings)

Webpack hint, not error. Performance unaffected. Ignore. Would only be worth fixing if the dev compile was genuinely slow — it's not.

---

## Who built what — decision log summary

- **Chain is org-wide, not per-workflow.** Spec's `prev_hash` says "previous event in this org." Preserves tamper evidence across a bank's entire operation.
- **Canonical JSON for hashing.** JSON.stringify is not byte-stable. Sorted keys are.
- **Timestamps re-normalize on verify.** PostgREST format varies; Date.toISOString() is stable.
- **`/auth/callback` is a client page, not a server route.** PKCE verifier lives in browser storage.
- **Middleware uses `getUser()`, not `getSession()`.** Supabase's security guidance; network cost is worth it.
- **Middleware bypasses `/api/*` + static assets.** No auth check on API routes (they do their own).
- **pdfkit over @react-pdf/renderer.** Simpler, fewer gotchas on Vercel serverless.
- **Server-side fraud pipeline.** Prevents client-side tampering with fraud scores.
- **Video uploads direct to Storage from browser.** Bypasses the 4.5 MB Vercel request-body limit.
- **Admin can broadly access inspector / banker pages.** Realistic for pilot-scale organizations where roles blur.
- **Soft-delete only on auth-facing tables.** Business tables (workflows, media) use state transitions.

---

## Where to change things

| Want to … | Edit … |
|---|---|
| Change fraud layer weights or thresholds | `lib/fraud.ts` constants at top |
| Change challenge-code expiry | `CHALLENGE_VALID_WINDOW_MS` in `lib/fraud.ts` |
| Change recording duration | `RECORD_SECONDS` in `app/(tasdiq)/capture/page.tsx` |
| Change VERIFIED threshold | `VERIFIED_THRESHOLD` in `lib/fraud.ts` |
| Change tranche-pack PDF content | `lib/pdf.ts` |
| Change tranche-pack ZIP structure | `app/api/export/route.ts` around the `zipFiles` array |
| Add a workflow state / transition | `supabase/schema.sql` workflow_transitions INSERT + re-run |
| Add a fraud layer | `lib/fraud.ts` + `app/api/media/upload/route.ts` |
| Change which events fire when | `app/api/media/upload/route.ts`, `app/api/transition/route.ts`, `app/api/workflows/route.ts` |
| Change role-based routing | `ROLE_ROUTE` constant in `app/(auth)/login/page.tsx`, `app/page.tsx`, `app/api/auth/finalize/route.ts` |

---

*Document version: first drafted at the end of the Phase-A + Phase-B + Point-7 session. Covers the state of the codebase as of that session. Update this file whenever architecture changes, not only when features ship.*
