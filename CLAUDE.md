# Claude Session Context — Tasdiq Demo

This file is auto-loaded at the start of every session. If you are a Claude picking up this codebase mid-stream, read this first.

---

## The one-paragraph orientation

You are working on **Tasdiq**, a construction-milestone verification tool for banks. The user is in Uzbekistan building a pilot demo for NBU (Narodniy Bank of Uzbekistan). Next.js 14 App Router + TypeScript + Supabase + Tailwind. Supabase project is already set up in Asia region. Deployed to Vercel. The user is an admin-level operator who builds and pitches — not a hardcore engineer — so prefer short explanations, actionable steps, and real examples over theory. They speak English fluently but not as first language; avoid jargon when plain words work.

**Full architecture is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Read it if the answer isn't in this file.**

---

## Where we are right now

### Completed (Phase A + Phase B + Point 7 + bug fixes)

- ✅ Full Core spec: DB, RLS, hash chain (with canonical JSON + timestamp normalization), Storage, Realtime
- ✅ Full Tasdiq spec: 5-layer fraud, capture PWA, dashboard, tranche-pack download
- ✅ Real Supabase auth: email verification, Google OAuth, magic-link invites
- ✅ Server-side fraud pipeline (`/api/media/upload`) — client-side tampering blocked
- ✅ MediaRecorder 15-second video capture, browser uploads direct to Storage
- ✅ Gyroscope + accelerometer sensor capture
- ✅ Tranche pack ZIP generator with PDF + manifest + media + full org ledger chain
- ✅ Bank Accept / Bank Reject UI + `tranche_released` event emission
- ✅ Route groups `(auth)` / `(dashboard)` / `(tasdiq)`
- ✅ Toast notifications on dashboard + project detail
- ✅ Visual state stepper (6 steps)
- ✅ Fraud score column on dashboard
- ✅ Pending / Active invite tracking with realtime flip
- ✅ Middleware: `getUser()` (not `getSession()`), bypasses `/api/*` and static assets

### Currently pending (user's original Phase B priority list, minus Point 4 which was permanently skipped)

1. **Point 2** — Server-side frame extraction with `sharp` for Layer 3 optical-flow proxy (4 hours)
2. **Point 3** — Split challenge flow into `/api/challenge/issue` + `/api/challenge/verify` (1 hour)
3. **Point 5** — "Any single layer fails → always FLAGGED" hard rule (10 minutes)
4. **Point 6** — GPS map pin + sensor variance mini-graph on evidence cards (2 hours)

Plus optional:
- OTP email-code flow instead of magic link (Gmail pre-fetch makes current links unreliable)
- Custom SMTP via Resend (Supabase default has 3 emails/hour rate limit)
- Butterfly vertical (not needed for NBU pitch)

### Recent commits

- `8fd4c20` — First major commit: Phase A + Phase B (all on main). Everything between `0aaff3e` and now.
- MediaRecorder (Point 1), chain-fix, Bank Accept (Point 7) — **uncommitted** at end of the compaction session. User may want to commit these separately if they haven't already.

### Todo list (internal)

The user's active task list, in order:

```
[completed] Point 7: Bank Accept/Reject UI + tranche_released event
[pending]   Point 2: Server-side frame extraction with sharp
[pending]   Point 3: Split challenge flow into /api/challenge/issue + /api/challenge/verify
[pending]   Point 5: "Any single layer fails → always FLAGGED" hard rule
[pending]   Point 6: GPS map pin + sensor variance mini-graph on evidence cards
```

---

## The user's working style

- **"I confirm" or "lets fix" or "go"** = proceed with the last proposal
- **"do not change anything else"** = they want scope strictly limited to what they just pointed at; don't refactor, don't "improve while there"
- **"fix it" when pointing at an error** = they've read the explanation, want the patch, type-check, build
- They **prefer clarifying questions** when intent is ambiguous, over assumptions
- They want to **understand what they're building**, not just have it work — explain cause and effect
- They push to GitHub often; remind them when you're about to make big changes that a commit first is wise
- They test on Windows with Chrome + DevTools device emulation + real Samsung phone
- Project path: `F:\Main and Private\DemoMD` (F: is SSD)
- Windows Defender exclusion is already added for the project folder
- They use `.env.local` locally and have configured Vercel env vars for production
- They have a Vercel deployment live

**Never save credentials, API keys, or the GitHub repo URL to memory or docs.**

---

## Critical decisions made (and why)

| Decision | Why |
|---|---|
| Chain is **org-wide** (not per-workflow) | Every `prev_hash` points to the previous event in the whole org. One tamper-evident ledger per bank, not one per project. `verifyChain()` walks the full org chain. |
| **Canonical JSON** for hashing | `JSON.stringify` key order is insertion-order, not canonical. Two semantically-equal payloads would produce different hashes and silently break the chain. Canonical = sorted keys at every depth. |
| Timestamps **re-normalized** in `verifyChain` | PostgREST returns `2026-04-18T01:30:16.123+00:00`; the insert-time hash used `...Z`. `new Date(s).toISOString()` normalizes both to `Z` form. This is the fix for the "Hash chain broken" error. |
| `/auth/callback` is a **client page**, not a server route | `@supabase/ssr` stores the PKCE code-verifier in the browser. Server-side `exchangeCodeForSession` couldn't find it across cross-domain redirects. Client-side exchange works reliably. |
| Middleware uses **`getUser()`**, not `getSession()` | Supabase's security guidance. `getSession()` only validates the cookie signature locally; `getUser()` verifies with Supabase Auth. The ~200ms round-trip per page nav is worth it. Middleware still bypasses `/api/*` and static assets. |
| **Server-side fraud pipeline** (`/api/media/upload`) | Client-side was the original design. A malicious client could have tampered with scores. Now the server re-computes everything from raw sensor samples. |
| Video uploads go **direct browser → Supabase Storage** | Vercel default request body limit is 4.5 MB. A 15-second webm is 3–8 MB. Going through `/api/*` would hit the limit. Direct-to-Storage bypasses. |
| **pdfkit** instead of `@react-pdf/renderer` | Simpler. Pure Node. No font files needed. `@react-pdf/renderer` has known issues in Vercel serverless. |
| `serverComponentsExternalPackages: ["pdfkit", "archiver"]` | Tells Next not to try to bundle these into the webpack graph. Huge dev-compile speedup. Without this, 556 modules just for the landing page. |
| Admin added to **required_role** for approve/reject/export/bank-accept transitions | Demo convenience. The user runs one-time SQL migrations (in `supabase/*.sql`) to add admin to these transitions. Realistic for pilot scale where the same person does multiple roles. |

---

## Gotchas to remember

### Don't surprise the user with big restructures

Small, focused changes. If a task opens up a tempting refactor, **flag it separately** and let the user decide. Scope creep has burned them before.

### Always commit before big work

When planning a multi-file or architectural change, suggest `git add . && git commit && git push` first. Having a clean rollback point matters to them.

### Windows dev quirks

- Many errors with "Cannot find module './787.js'" or "_not-found 404" are just stale `.next` cache + multiple `node.exe` processes. Fix: `taskkill /F /IM node.exe && rm -rf .next && npm run dev`.
- HMR double-compile + Defender scanning = sometimes slow first-page compile even with Turbopack. Don't over-optimize unless they complain.

### SQL files go in Supabase SQL Editor, code files run automatically

The user occasionally asks "should I put this TypeScript in the SQL editor?" The answer is no. Only `.sql` files go there; `.ts` / `.tsx` files ship with the build.

### Invite URL depends on admin's current origin

If admin is on `localhost:3000/team` when clicking Send Invite, the invite email contains a localhost link. Tell them to sign in to the Vercel URL for real-world invites.

### Email deliverability is flaky

Supabase default SMTP: 3 emails/hour rate limit. Gmail link-preview: sometimes consumes the confirmation token before the user clicks. If the user reports "email not arriving" or "link expired," the first suggestion is "try a `+alias` email" and the second is "set up Resend."

### The `cz-shortcut-listen` console warning is a browser extension, not our code

ColorZilla injects attributes. Ignore it.

### The webpack "big strings serialization" warning is harmless

Just webpack's hint. Performance fine. Ignore.

---

## File layout cheat sheet

```
app/(auth)/*         login, signup, verify-email, accept-invite, complete-signup
app/(dashboard)/*    admin, team
app/(tasdiq)/*       capture, demo, dashboard, dashboard/project/[id]
app/api/*            All server routes (Vercel Node serverless)
app/auth/callback/   Client page for OAuth + email-confirm exchange
lib/supabase/*       browser.ts, server.ts, admin.ts (3 different clients)
lib/fraud.ts         5 pure fraud-check functions + runAllChecks
lib/ledger.ts        canonicalJSON, computeEventHash, verifyChain
lib/file-hash.ts     sha256OfBlob (browser Web Crypto)
lib/pdf.ts           generateActPdf (pdfkit)
lib/actions.ts       Client fetch helpers for /api routes
lib/hooks.ts         useSession, useRequireRole
lib/types.ts         Shared domain types
components/ui.tsx    Kpi, StateBadge, VerdictPill, FraudScoreBar, FraudCheckList
components/state-stepper.tsx
components/toast.tsx
middleware.ts        Auth gate, getUser() route guard
supabase/schema.sql  Full initial DDL
supabase/migration-*.sql  One-time migrations
next.config.mjs      serverComponentsExternalPackages + reactStrictMode
```

---

## Spec cross-reference

- **CORE_PLATFORM_SPEC.md** — shared architecture for Tasdiq + Butterfly. Recent revision: LOCKED DECISIONS moved to top, Deno replaced with Node, canonical JSON in hash chain, Storage RLS written out, `deleted_at` narrowed to auth tables, `auto_conditions` column dropped.
- **TASDIQ_VERTICAL_SPEC.md** — V1 skip list, 5-layer pipeline, bank dashboard, 10-day sprint plan, demo script. Unchanged from original.

If the user asks "does the spec say X?" — check these files via `Read` before answering.

---

## Common next-task recipes

### When user says "continue with Point 2"

Server-side frame extraction with `sharp`. Plan:
1. `npm install sharp`
2. In `/api/media/upload/route.ts`, after video upload, if a video is present: download the video bytes from Storage, use sharp or extract a few frames, compute pixel-diff between consecutive frames (proxy for optical flow), compare to gyro variance, refine Layer 3 score.
3. Caveat: `sharp` decodes still images, not video. For video frame extraction, need ffmpeg binary (too heavy for Vercel serverless default) OR use the browser to extract frames before upload and send them as additional form fields.
4. Discuss with the user: the "pure" approach is `ffmpeg-static` in a Vercel function (heavy, may hit 50MB function size limit); the "pragmatic" approach is browser-side frame extraction before upload.

### When user says "continue with Point 3"

Split challenge into dedicated endpoints:
- `POST /api/challenge/issue` — admin-only, generates 4-char code, writes `challenge_issued` ledger event, updates `workflow.meta.challenge_code` + `challenge_issued_at`.
- `POST /api/challenge/verify` — server-side re-check of submitted code + expiry. Called from `/api/media/upload`.

Today the code is baked into `workflow.meta` at project creation. These endpoints would enable issuing a fresh code right before capture.

### When user says "continue with Point 5"

"Any single layer fails ⇒ FLAGGED" hard rule. One-line change in `lib/fraud.ts` → `runAllChecks` verdict computation. Currently: `aggregate >= 0.7 → VERIFIED`. Change to: `(aggregate >= 0.7 && checks.every(c => c.passed)) → VERIFIED`. This aligns with the Tasdiq spec's "any single check with passed=false = always flag regardless of aggregate."

### When user says "continue with Point 6"

GPS map pin + sensor graph on evidence cards (`app/(tasdiq)/dashboard/project/[id]/page.tsx` → `EvidenceCard`). Static map pin via a free provider (e.g., `maps.google.com/maps?q=<lat>,<lng>&output=embed` in an iframe, or an OpenStreetMap tile). Sensor graph via a minimal inline SVG of the motion_samples array — no chart library needed.

---

## What Phase-B final state looks like

After Points 2/3/5/6 ship, the Tasdiq MD spec conformance goes from ~85% to ~95%. Remaining gaps at that point:
- Butterfly vertical (V2)
- E-IMZO signatures (V2, needs SICNT contract)
- Native Android app for ARCore / Play Integrity (V2)
- PWA manifest + install prompt (small polish — user said Point 4 was "skip for now but remember")

---

## If you, future Claude, need to pick up after compaction

1. Read this file (you're here)
2. Skim [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for anything not covered above
3. Check git log for recent commits
4. Ask the user: "Where did we leave off? Are we continuing with Point 2, or something else?"
5. Don't assume — verify by asking

**The user values careful execution over speed.** They'd rather hear "I want to verify one thing before starting" than see you plow into the wrong task.

---

*Written at the end of a long session that covered: full-spec implementation, Google OAuth, email verification, invite flows, Point 1 (MediaRecorder), Point 7 (Bank Accept), chain-verification bug fix, middleware optimization, route-group restructure. If anything here is stale or contradicts the code, trust the code.*
