# Butterfly email templates

Three branded HTML templates in the Butterfly aesthetic: pure white, near-black
text, one accent color (`#0A4AD6`), institutional tone. No emojis, no exclamation
marks, system font stack only.

## Where each template is used

| File | Purpose | Where to install |
|---|---|---|
| `invite.html` | Admin invites a teammate to a Butterfly workspace | Supabase Dashboard → Authentication → Email Templates → **Invite user** |
| `welcome.html` | First successful sign-in to a freshly created Butterfly org | Not an auth email — needs an app-level trigger (see §Welcome trigger below) |
| `report-ready.html` | A quarterly compliance report has been generated and is ready to download | Not an auth email — wire into `/api/butterfly/reports/generate` after the pack row is inserted (see §Report-ready trigger below) |

## Installing the invite template

1. Open Supabase Dashboard for your project
2. Navigate **Authentication → Email Templates**
3. Select the **Invite user** template
4. Paste the full contents of [`invite.html`](./invite.html) into the HTML body
5. Set the subject line to: `You've been invited to {{ .SiteURL }}`
6. Save

Supabase substitutes `{{ .ConfirmationURL }}`, `{{ .SiteURL }}`, and
`{{ .Email }}` at send time.

## Welcome trigger

The welcome email is NOT a Supabase Auth email — it fires after a user signs in
for the first time with a freshly created Butterfly profile. Two ways to wire it:

**(a) Resend / SendGrid from `/api/auth/finalize`** — after a Butterfly org is
created at case 3 in `app/api/auth/finalize/route.ts`, fire a POST to your SMTP
provider with the rendered `welcome.html`.

**(b) Supabase Edge Function hook** — create a Postgres trigger on `users`
INSERT where `role = 'hr_admin'` that calls a Supabase Edge Function which
relays to Resend.

Neither is wired today. The template is ready to use when you pick a provider.

## Report-ready trigger

Fires when `/api/butterfly/reports/generate` successfully inserts a row in
`export_packs` with `pack_type = 'compliance_report'`.

After the ledger events are written, add a Resend call that sends
`report-ready.html` to the org's `hr_admin` users. The template references
`{{ .DownloadURL }}`, `{{ .QuarterLabel }}`, and `{{ .OrgName }}` — your wiring
code fills those before sending.

## Custom SMTP setup (required for anything beyond 3 emails/hour)

Supabase's default SMTP rate-limits to 3 emails/hour. For anything approaching
real pilot scale:

1. Create a Resend account
2. Verify your sending domain with a DNS TXT record
3. In Supabase → Project Settings → Auth → SMTP Settings, paste Resend's SMTP
   host / user / password / from-address
4. Test with an invite — check headers for Resend's `X-Resend` trace

## Aesthetic rules followed

- `--bg: #FFFFFF`, `--ink: #0B0B0F`, `--accent: #0A4AD6`, `--hair: #E9E9EF`
- Maximum one accent-colored element per email (the CTA button)
- No stock photography, no illustrations of people, no emojis
- System font stack only (no web-font imports; many email clients block them)
- Max width 560 px, 32 px padding, 28 px border radius on card
