# Tasdiq — real-auth build

Construction milestone verification for banks.
Real Supabase Postgres + Auth + Storage + Realtime.
Email-verified signup. Google Sign-in. Magic-link invitations.

---

## Required one-time Supabase dashboard setup

Before the auth flows will work correctly, configure these in your Supabase project
(https://supabase.com/dashboard → your project):

### 1. Email confirmation (required)

**Authentication → Providers → Email**
- **Enable Email provider:** ON
- **Confirm email:** ON ← critical; otherwise signups skip verification

**Authentication → URL Configuration**
- **Site URL:** `http://localhost:3000` (dev) or your production URL
- **Redirect URLs:** add both
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/accept-invite`
  - (and your production equivalents)

### 2. Google OAuth (required for "Sign in with Google")

Create the Google OAuth credentials first:

1. Go to https://console.cloud.google.com → APIs & Services → Credentials
2. **Create credentials → OAuth client ID** → Application type: **Web application**
3. **Authorized redirect URIs:** add the value Supabase shows in step 3 below —
   it looks like `https://<your-project-ref>.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client secret**

Then in Supabase:

1. **Authentication → Providers → Google**
2. Toggle **Enable**
3. Paste the Client ID and Client secret from Google
4. Save

You can test locally now — `Continue with Google` buttons on `/login` and `/signup` will work.

### 3. (Optional) Custom email sender

By default, Supabase sends confirmation emails from `noreply@mail.app.supabase.io`. For the NBU
pilot you'll want emails from your own domain:

1. Sign up for Resend (free tier: 100/day) — https://resend.com
2. Verify your domain in Resend (add DNS records)
3. In Supabase: **Project Settings → Authentication → SMTP Settings**
4. Paste Resend SMTP host + user + password + "From" address
5. Save — Supabase now sends all auth emails through your domain

This is cosmetic but important: corporate inboxes frequently filter Supabase's default sender.

---

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

---

## Auth flows

### Signing up (new organization)

1. Go to `/signup`
2. Fill in name, email, password, org name, slug (URL-safe identifier)
3. Or click **Continue with Google** — skips the password step
4. If email/password: we send a confirmation email. You see `/verify-email` ("Check your inbox").
5. Click the link in your email → land on `/auth/callback` → org + admin profile created → redirected to `/admin`.
6. If Google OAuth with a new email: Google auth → `/complete-signup` → fill in org info → redirected to `/admin`.

**Emails that don't exist will never be able to confirm.** Invalid/fake emails are blocked at the confirmation step — no way around it.

### Signing in

1. Go to `/login`
2. Enter email + password, OR click **Continue with Google**
3. If email was never confirmed, we show a resend link inline
4. On success, you're routed by role:
   - `admin` → `/admin`
   - `inspector` → `/capture`
   - `bank_officer` / `supervisor` → `/dashboard`

**Non-existent emails:** Supabase returns "Invalid login credentials" — identical to wrong password, so attackers can't enumerate accounts.

### Inviting teammates

1. As admin, go to `/team`
2. Enter email + full name + role
3. Teammate receives a magic-link email
4. They click → `/auth/callback` → `/accept-invite` to set a password
5. After setting password, they're routed to their role's home

---

## Architecture

### Auth stack

- `@supabase/ssr` for cookie-based sessions
- `middleware.ts` refreshes tokens on every request + gates protected routes
- `/auth/callback` (server route) is the single landing point for **every** auth token exchange — email confirmation, magic-link invites, and Google OAuth all come through it

### Tables

- `organizations` — tenants (one per bank)
- `users` — profile rows, keyed by `auth.users.id`
- `workflows` — construction projects
- `workflow_transitions` — state machine (seeded: 10 Tasdiq transitions)
- `ledger_events` — append-only, SHA-256 hash chain
- `media` — evidence photos, metadata includes 5-layer fraud result
- `export_packs` — tranche packs (server-generated)

### Routes

**Pages:**
- `/` · `/login` · `/signup` · `/verify-email` · `/accept-invite` · `/complete-signup`
- `/admin` · `/team` · `/dashboard` · `/dashboard/project/[id]`
- `/capture` (inspector PWA) · `/demo` (NBU pitch buttons)

**API:**
- `/api/auth/complete-signup` · `/api/auth/invite` · `/api/auth/accept-invite`
- `/api/workflows` (create project)
- `/api/transition` · `/api/events/append` (both write through hash chain with service role)
- `/api/demo/simulate-real` · `/api/demo/simulate-fraud`

**OAuth/email callback:**
- `/auth/callback` — exchanges code → creates org/profile if needed → routes by role

### 5-layer fraud pipeline ([lib/fraud.ts](lib/fraud.ts))

| # | Layer | Weight |
|---|---|---|
| 1 | GPS geofence | 0.25 |
| 2 | Human tremor (accelerometer variance) | 0.20 |
| 3 | Screen-replay detection (sensor-camera consistency) | 0.25 |
| 4 | Photo uniqueness (dHash + Hamming) | 0.15 |
| 5 | Challenge code + expiry | 0.15 |

Aggregate ≥ 0.7 → `AUTO_VERIFIED`, else `FLAGGED`.

### Hash chain ([lib/ledger.ts](lib/ledger.ts))

- Canonical JSON (sorted keys, byte-stable)
- SHA-256 via Node `crypto` server-side, Web Crypto browser-side
- Every ledger event links `prev_hash` → `hash`
- `verifyChain()` walks a workflow's events and produces an anchor hash
- Project detail page displays chain validity inline

---

## Known limits

- iOS Safari requires a user tap to unlock `DeviceMotionEvent.requestPermission()`. Capture page shows "Tap to enable motion sensors" when needed.
- `getUserMedia` requires HTTPS (or `localhost`). Testing on a phone over LAN needs a tunnel (e.g. ngrok) or an HTTPS dev cert.
- Custom SMTP is not configured by default. Confirmation emails come from Supabase's generic sender until you set up Resend (or equivalent) — see step 3 of one-time setup above.
