# Tasdiq Demo — full spec implementation

A complete, self-contained implementation of the Tasdiq construction-verification system from
[CORE_PLATFORM_SPEC.md](CORE_PLATFORM_SPEC.md) and [TASDIQ_VERTICAL_SPEC.md](TASDIQ_VERTICAL_SPEC.md).

- Real PWA capture — camera (`getUserMedia`), GPS (`watchPosition`), motion (`DeviceMotionEvent`)
- All 5 fraud layers — geofence, tremor variance, **screen-replay**, dHash duplicate, challenge code
- Tamper-evident SHA-256 hash-chain ledger with canonical JSON serialization + chain verification
- Role-based auth and routing
- Realtime dashboard updates via `BroadcastChannel` (cross-tab, behaves like Supabase Realtime)
- Persistent state in `localStorage`
- **No external services** — `npm install && npm run dev`, that's it

---

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

---

## Demo accounts

All use password `demo123`. Login redirects by role.

| Email                        | Role           | Lands on        |
|------------------------------|----------------|-----------------|
| `admin@tasdiq.uz`            | `admin`        | `/admin`        |
| `inspector@tasdiq.uz`        | `inspector`    | `/capture`      |
| `banker@tasdiq.uz`           | `bank_officer` | `/dashboard`    |
| `supervisor@tasdiq.uz`       | `supervisor`   | `/dashboard`    |

---

## Demo flow (NBU pitch, ~3 minutes)

1. Open [/dashboard](http://localhost:3000/dashboard) in one tab, log in as `banker@tasdiq.uz`.
2. Open [/demo](http://localhost:3000/demo) in a second tab.
3. Click **🚨 Simulate FRAUD capture** — dashboard updates instantly via realtime; Yashnobod flips to `FLAGGED`. Click the project: 5 layers, 5 red ❌, clear explanation of each failure.
4. Click **Reset state** to clear, then **✅ Simulate REAL capture** — dashboard flips to `AUTO VERIFIED`, aggregate score 1.00.
5. Click **Approve milestone** → state → `APPROVED`. Click **Generate tranche pack** → state → `EXPORTED`, ledger event written and chain-verified.
6. Optional live demo: log in as `inspector@tasdiq.uz` on a phone, use [/capture](http://localhost:3000/capture) — real camera, real GPS, real motion sensors.

---

## Architecture

```
/lib
  types.ts        — shared domain types (Organization, Workflow, Media, LedgerEvent, ...)
  seed.ts         — initial DB state (1 org, 4 users, 3 projects, seeded transitions)
  ledger.ts       — canonical-JSON SHA-256 hash chain + chain verification
  fraud.ts        — 5 pure fraud-detection functions + aggregate
  realtime.ts     — Supabase-shaped channel API over BroadcastChannel
  mock-db.ts      — fake Supabase client: from().select().eq(), auth, storage, realtime
  simulate.ts     — REAL + FRAUD scenario generators used by /demo
  hooks.ts        — React hooks: useSession, useRequireRole

/components
  ui.tsx          — Kpi, StateBadge, VerdictPill, FraudScoreBar, FraudCheckList

/app
  page.tsx                         — landing
  login/page.tsx                   — email/password + role-based redirect
  capture/page.tsx                 — inspector PWA, 4 screens
  dashboard/page.tsx               — bank officer KPIs + project list + realtime
  dashboard/project/[id]/page.tsx  — 5-layer fraud detail + approve/reject + ledger + hash-chain status
  demo/page.tsx                    — control panel: REAL / FRAUD / Reset
  admin/page.tsx                   — users, workflows, recent ledger events
```

---

## Fraud pipeline — 5 layers

| # | Layer | Weight | Pure function |
|---|---|---|---|
| 1 | GPS geofence | 0.25 | `checkGeofence(gps, project)` — haversine vs `geofence_radius_meters` |
| 2 | Human tremor | 0.20 | `checkMotion(variance)` — accel magnitude variance in [0.001, 1.0] |
| 3 | **Screen replay** | 0.25 | `checkScreenReplay(motionVar, lightingVar)` — phone flat + uniform frame ⇒ fraud |
| 4 | Photo uniqueness | 0.15 | `checkDuplicate(phash, known)` — dHash + Hamming distance ≥ 10 |
| 5 | Challenge code | 0.15 | `checkChallenge(submitted, expected, issuedAt, capturedAt)` — match + ≤30 s age |

Aggregate = Σ (score × weight). Verdict: `≥ 0.7 ⇒ VERIFIED`, else `FLAGGED`.

### Layer 3 — the "screen replay killer"

The headline feature: if the phone is nearly stationary (motion variance < 0.01) **and** the captured frame shows uniform lighting (luma variance < 0.02), the camera is looking at a screen, not a real scene. Both signals are computed on device: motion variance from the accelerometer samples collected during the 5-second recording; lighting variance from the still frame's luma channel.

---

## Mock Supabase API

The `supabase` export from [lib/mock-db.ts](lib/mock-db.ts) matches the surface of `@supabase/supabase-js` closely enough that swapping to real Supabase is a one-line change:

```ts
// Swap the import — everything else works unchanged
// import { supabase } from "@/lib/mock-db";
import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(URL, KEY);
```

Supported:

- `supabase.from<Row>(table).select().eq(col, val).order(col, {ascending}).limit(n).single() / .maybeSingle()`
- `supabase.from(table).insert(row).select().single()`
- `supabase.from(table).update(patch).eq(col, val).select()`
- `supabase.from(table).delete().eq(col, val)`
- `supabase.auth.signInWithPassword({email, password})`, `.signOut()`, `.getSession()`, `.onAuthStateChange(cb)`
- `supabase.storage.from(bucket).upload(path, blobOrDataUrl)`, `.getPublicUrl(path)`, `.download(path)`
- `supabase.channel(topic).on("postgres_changes", {event, table, filter}, cb).subscribe()`

Ledger inserts automatically flow through `computeEventHash` — `prev_hash` and `hash` are always correct. [`verifyChain()`](lib/ledger.ts) walks a workflow's events and confirms every hash and every link; used by the project-detail page and the export action.

---

## Persistence + realtime

- All state lives in `localStorage` under `tasdiq-demo-db-v1` plus a session under `tasdiq-demo-session-v1`. Survives page reloads.
- Cross-tab realtime via `BroadcastChannel("tasdiq-demo-bus")`. Mutations from any tab are received by every open tab's subscriptions.
- **Reset state** (button on `/demo`) wipes `localStorage` and re-seeds the DB.

---

## Known demo constraints

- iOS Safari needs a user gesture to request `DeviceMotionEvent.requestPermission()`. The capture screen shows "Tap to enable motion sensors" when needed.
- `getUserMedia` requires HTTPS (or `localhost`). Testing on a phone over LAN requires either a tunnel (ngrok) or an HTTPS dev cert.
- This is a single-browser demo. Multi-browser sync would require a backend.
