# Cenexa ChatFlow — Rollout Guide

> **Principle:** All new behaviour (coexistence, voice/image AI) is OFF for every existing
> business by default. Flags are flipped per tenant by the team, never automatically.
> The migration is additive-only and safe to run while the app is live.

---

## Feature Flags (all columns on `businesses` table)

| Column | Type | Default | What it controls |
|---|---|---|---|
| `coexistence_enabled` | `boolean` | `false` | AI pauses when owner replies from Business app; echo/history events processed |
| `media_ai_enabled` | `boolean` | `false` | Voice transcription + image vision analysis (instead of canned replies) |
| `handoff_minutes` | `integer` | `60` | How long AI stays quiet after an owner reply (coexistence) |
| `vision_model` | `text` | `null` (uses `VISION_MODEL` env) | Per-business override for image/voice analysis model |
| `waba_id` | `text` | `null` | WhatsApp Business Account ID — needed for account_update events |
| `onboarding_type` | `text` | `'api'` | `'api'` or `'coexistence'` — records how the number was registered |
| `coexistence_synced_at` | `timestamptz` | `null` | Guards the once-only contacts+history sync |
| `disconnected_reason` | `text` | `null` | Set by account_update PARTNER_REMOVED/ACCOUNT_OFFBOARDED |
| `modules_enabled` | `jsonb` | `{}` | Per-business module switches; absent/false keys stay off |

**Signature verification mode** (env var, not a DB flag):

| `META_APP_SIGNATURE_MODE` | Behaviour |
|---|---|
| `enforce` (production default) | Reject requests with invalid signatures (HTTP 401). Requires `META_APP_SECRET`. |
| `log` | Compute and log mismatches but still process every request. |
| `off` | No signature check. Local development only. |

---

## Rollout Order

### Phase 0 — Safety net ✅ (complete)
- [x] Branch `feat/coexistence-media-ai` created
- [x] `.env.example` scrubbed of real secrets; see **⚠️ Rotate Now** section below
- [x] `.gitignore` covers all `.env.*` except `.env.example`
- [x] `docs/ROLLOUT.md` written (this file)
- [x] Baseline behaviour spec written → `docs/BASELINE_SPEC.md`

### Phase 1 — Database (staging only)
- [ ] Run `supabase/migrations/<date>_coexistence_and_media_ai.sql` on **staging** Supabase project
- [ ] Verify old code still works against migrated DB (flag columns are nullable/defaulted)
- [ ] Ask for `messages` row count before deciding whether to run the backfill `UPDATE`
- [ ] Run WABA-ID dry-run backfill script; await team approval before writing

### Phase 2 — Code behind flags
- [ ] `src/lib/graph.ts` — centralised `GRAPH_VERSION`
- [ ] `src/lib/types.ts` — new optional fields added
- [ ] `src/lib/media-ai.ts` — new file (voice + image analysis)
- [ ] `src/lib/coexistence.ts` — new file (subscribe, sync helpers)
- [ ] `src/lib/whatsapp.ts` — `extractWamid`, `GRAPH_BASE`
- [ ] `src/lib/ai.ts` — `LEGACY_GLOBAL_INSTRUCTIONS` kept for flag-off; `MEDIA_GLOBAL_INSTRUCTIONS` added for flag-on
- [ ] `src/app/api/webhook/route.ts` — event router, tenant flag gate, `after()`, signature modes
- [ ] `src/app/api/onboard/callback/route.ts` — coexistence path, WABA verify, skip /register, sync guard
- [ ] `src/app/onboard/page.tsx` — WA_EMBEDDED_SIGNUP listener, coexistence featureType
- [ ] Dashboard — show `transcript`, `media_analysis`, `business_app` tag conditionally

### Phase 3 — Tests (must pass before any deployment)
- [ ] Regression suite: legacy path fixtures (7 scenarios)
- [ ] New-path suite: voice, image, echo, history, account_update, duplicate, invalid-sig
- [ ] Multi-tenant isolation tests
- [ ] Security: prompt-injection via transcript/image content

### Phase 4 — Staging deployment
- [ ] Deploy to staging with `META_APP_SIGNATURE_MODE=log`
- [ ] Create test business with both flags true on a spare number
- [ ] Walk through: signup, text, voice note, image, owner reply (AI pauses), history sync, disconnect

### Phase 5 — Production rollout (team executes)
See "Production Rollout Checklist" section below.

---

## ⚠️ Rotate Now

The following secrets were previously stored as real values in `.env.example` and may have been visible in version history or shared files. **Rotate all of them before merging to any shared branch or deploying.**

| Secret | Where to rotate |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Meta Business Suite → Users → System Users → \[user\] → Generate new token |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API → Rotate anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → Rotate service-role key |
| `OPENROUTER_API_KEY` | openrouter.ai → Keys → Delete + create new |

After rotating, update the values in:
1. Vercel (or your hosting platform) environment variables
2. Your local `.env.local`
3. Any CI/CD secrets

---

## Production Rollout Checklist

> **Rule:** Never skip a step. If anything is unclear, stop and confirm.

### Pre-flight (do before code deployment)

- [ ] **Export/backup** `businesses`, `conversations`, `messages` tables from Supabase Dashboard → SQL Editor → `\copy` or CSV export. Store locally and in a safe location.
- [ ] Confirm you are connected to **production** Supabase (check project URL in Supabase dashboard).

### Database migration

- [ ] Open Supabase SQL Editor (production project).
- [ ] Paste and run `supabase/migrations/<date>_coexistence_and_media_ai.sql`.
- [ ] Confirm: no errors, all `ALTER TABLE` rows returned `ALTER TABLE`.
- [ ] **Verify live app is unaffected:** send a test WhatsApp message from a team phone to each live client's number; confirm normal AI replies come back.
- [ ] Apply all other unapplied files in `supabase/migrations/` in date order. This includes `20261109_tenant_realtime_rls.sql` before onboarding outside businesses.

### Code deployment

- [ ] Deploy the `feat/coexistence-media-ai` branch to production (Vercel or your host).
- [ ] Configure production values from `.env.example`. Keep `META_APP_SIGNATURE_MODE=enforce`; do not use a shared WhatsApp registration PIN.
- [ ] **Verify existing clients are unaffected** (their `media_ai_enabled` and `coexistence_enabled` are `false`): send a harmless test message and confirm the reply.

### Signature verification

- [ ] Set `META_APP_SECRET` (from Meta App Dashboard → Settings → Basic → App Secret).
- [ ] Set `META_APP_SIGNATURE_MODE=log`. Monitor logs for 48 hours — look for `[webhook] signature mismatch`. Zero mismatches = safe to proceed.
- [ ] Set `META_APP_SIGNATURE_MODE=enforce`. Monitor for 30 minutes; confirm webhooks still land.

### WABA ID backfill (for existing clients)

- [ ] Review output of the dry-run backfill script (run separately, read-only).
- [ ] **Confirm the printed WABA IDs match** what you see in Meta Business Manager for each client.
- [ ] Only after confirmation: run the write pass of the backfill script.

### Canary: enable media_ai for first client

- [ ] Get explicit consent from the client.
- [ ] Run: `UPDATE businesses SET media_ai_enabled = true WHERE id = '<client-id>';`
- [ ] Monitor for 48 hours:
  - Error rate in Vercel logs (search `[media-ai]`, `[webhook]`)
  - Reply latency (Meta webhook dashboard)
  - OpenRouter/Transcription usage (provider dashboards)
  - Any reports of odd replies from the client
- [ ] If all clear: consider enabling for the second client (separate decision).

### Coexistence onboarding (new clients only)

> **Never convert an existing API-only client to coexistence automatically.**
> Doing so requires taking the number off the Cloud API, re-onboarding, and losing message history continuity.

- [ ] Test the full coexistence onboarding flow with a **spare number** (not a client's) first.
- [ ] Document the procedure for the client: they will need to keep the WhatsApp Business app open and use it at least once every ~14 days.
- [ ] Only proceed with a real client after staging validation is complete.

---

## Rollback

### Instant rollback (no redeploy needed)

If a live client sees unexpected behaviour after flag enablement:

```sql
-- Flag off: takes effect on the next webhook (no redeploy)
UPDATE businesses SET media_ai_enabled = false WHERE id = '<client-id>';
UPDATE businesses SET coexistence_enabled = false WHERE id = '<client-id>';
```

### Code rollback (redeploy to previous version)

1. In Vercel: go to Deployments → previous successful deployment → Redeploy.
2. The additive DB migration does **not** need to be rolled back (columns are nullable/defaulted; old code ignores new columns).

### Emergency rollback SQL (new columns only — run only if absolutely required)

File: `supabase/migrations/ROLLBACK_coexistence_and_media_ai.sql` (created in Phase 1, **do not run unless instructed**).

---

## Follow-up Work (out of scope for this release)

- Move media bucket from public to private with signed URLs.
- Remove hard-coded URL rewrite for bridal studio client (move to `businesses` config).
- Row-level security review.
- Job queue with retries (currently `after()` — Meta will not retry on failure).
- Billing / usage metering for voice/image analyses.
- Meta v4 Embedded Signup config (configured in Meta's dashboard, not in code).
# Phase 0: Module flags and permissions

The `businesses.modules_enabled` JSONB column stores per-business switches. A
missing key or `false` means the module is off. Current keys are `templates`,
`contacts`, `campaigns`, `automations`, `reports`, `team`, and `integrations`. Apply
`supabase/migrations/20261109_module_flags.sql` to staging before deploying code
that reads it; the migration is idempotent and leaves every module disabled by
default. The `/api/me` response includes the signed-in user's ID and role plus
the business module flags. Phase 0 permission checks preserve the existing
admin-only assistant and owner-alert settings actions.

The rollback companion removes the column. Use it only before enabling any
module flags; otherwise retain the column and disable individual modules by
setting their values to `false`.

For this rollout, apply each additive migration directly to production only
after confirming it has not already been applied. Do not run the staging
bootstrap file against production.

## Phase 1: Message templates

Apply `supabase/migrations/20261109_message_templates.sql` to production before
deploying Phase 1. The `message_templates` table has RLS enabled and no browser
policies; reads and writes use business-scoped server routes. Enable the module
only after deployment with:

```sql
update public.businesses
set modules_enabled = coalesce(modules_enabled, '{}'::jsonb) || '{"templates": true}'::jsonb
where id = '<business-uuid>';
```

Create, sync, and delete use the tenant's WABA and access token. Meta rejects
these operations if the token lacks WhatsApp Business Management permission.
Template send is available to all four tenant roles; management is admin/sales
only. Marketing sends remain blocked until Phase 2 adds recorded contact opt-in.
Roll back by setting the tenant flag to false; the table can remain in place.

## Phase 2: Contacts and customer timeline

Apply `supabase/migrations/20261109_contacts.sql` after the module-flags
migration and before deploying Phase 2. It creates contacts, groups, group
membership, and activity events with RLS on and no browser policies, adds the
optional payment amount, and backfills one record per distinct business/phone.
The final query must report `missing_contact_keys = 0`. Keep the module disabled
until a pilot business is ready:

```sql
update public.businesses
set modules_enabled = coalesce(modules_enabled, '{}'::jsonb) || '{"contacts": true}'::jsonb
where id = '<business-uuid>';
```

CSV imports require explicit opt-in confirmation and save the stated consent
source. Inbound `STOP` and `UNSUBSCRIBE` messages set `opt_out_at`. Payment
amounts are optional and start recording from this deployment onward; old
payment statuses have no historical amount or activity log.

## Phase 3: Campaigns

Production migration order is `20261109_module_flags.sql`,
`20261109_message_templates.sql`, `20261109_contacts.sql`, then
`20261109_campaigns_automations.sql`. The campaign migration depends on both
templates and contacts. Apply it only after the contacts migration's final
`missing_contact_keys` check reports zero.

The campaign feature stays off unless `modules_enabled.campaigns` is true.
Sending also requires an approved template, stored opt-in, an active WhatsApp
connection, and a per-business send cap. `campaign_sending_paused` is the
emergency stop. The migration creates an empty `campaign_pricing` table on
purpose: before enabling campaigns, insert verified current Meta rates and the
configured Cenexa fee by calling code and category. Update `as_of` whenever
the rate card changes. The preview is an estimate; it does not debit or collect
money. Confirm current WhatsApp rates in Meta's [official pricing page](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).

Campaign sends run from the existing `CRON_SECRET` protected five-minute
owner-alert job. Confirm the production host supports that schedule. Campaign
delivery receipts are matched by Meta message ID, and replies/payment
verification are attributed for seven days. Campaign recipients are not added
to the conversation history unless they reply.

## Phase 4: Automations

Automations are also off unless `modules_enabled.automations` is true. The
fixed rule catalog supports unanswered follow-up, payment reminder, review
request after verification, and a manually scheduled contact reminder. Every
send requires opt-in, respects Asia/Kolkata quiet hours and the 24-hour WhatsApp
customer-service window, and uses an approved template outside that window.
An atomic per-contact daily slot prevents concurrent workers from sending more
than one automated message to a contact per local day. Customer replies,
payment verification, and human takeover cancel queued runs. Start with the
rules disabled, review dry-run candidates, then enable only the selected rules
for a pilot business.

The rollback file `ROLLBACK_20261109_campaigns_automations.sql` removes these
tables and the added `messages.source` value. Prefer disabling both module
flags and pausing campaign sending before rolling back application code.

## Phase 5: Reports

Apply `20261109_reports_team.sql` after contacts, campaigns/automations, and
owner alerts. Reports are available to admin and accounts roles when
`modules_enabled.reports` is true. The SQL function aggregates metrics per
business and day using the existing `owner_alert_timezone` setting (Asia/
Kolkata by default). Payment and sales history is limited by
`reporting_history_start_date`; it defaults to the migration date because older
payment changes were not logged. If the contacts/payment-history launch date is
known and earlier, set this column to that date so the label reflects the real
start. CSV output comes from the same database rows shown in the UI.

## Phase 6: Team and roles

The same migration adds profile email/status fields, invitation timestamps,
the strict-role switch, assignment indexes, and a database-locked update that
prevents concurrent changes from removing the last active admin. The preflight
stops if a profile ID has no matching Supabase Auth user; resolve the
`profile_auth_id_mismatches` check before retrying. Invitations use Supabase
Auth email delivery and its redirect allowlist for `/login`. Invited members
become active on first sign-in. Deactivation marks the profile disabled and
applies an Auth ban; business API requests also reject disabled profiles.
Set the Supabase **Invite user** email link to
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` and include
the production `/auth/confirm` URL in the Auth redirect allowlist. The route
verifies the invite token, then asks the invited teammate to set a password.
Admins can resend an invitation while the teammate remains in Invited status;
the resend generates a fresh email link and updates the invitation timestamp.

`strict_roles` defaults to false so existing businesses retain their current
behavior. Admins can enable it in Settings → Team after reviewing the role
assignments:

| Action | Admin | Support | Sales | Accounts |
|---|---:|---:|---:|---:|
| Reply, notes, tags, assignment, reply mode | Yes | Yes | Yes | No |
| Verify payments | Yes | No | No | Yes |
| Manage templates | Yes | No | Yes | No |
| Send campaigns, manage automations | Yes | No | No | No |
| View reports | Yes | No | No | Yes |
| Manage team and assistant settings | Yes | No | No | No |

Enable Reports and Team only for the intended business after deploying the app:

```sql
update public.businesses
set modules_enabled = coalesce(modules_enabled, '{}'::jsonb)
  || '{"reports": true, "team": true}'::jsonb
where id = '<business-uuid>';
```

Strict enforcement is a separate per-business choice:

```sql
update public.businesses set strict_roles = true where id = '<business-uuid>';
```

The Phase 5/6 migration depends on contacts, activity events, campaigns,
automations, and owner alerts. Apply missing migrations in this order: module
flags, templates, contacts, campaigns/automations, reports/team. The rollback
companion is `ROLLBACK_20261109_reports_team.sql`; avoid it after inviting or
deactivating staff because it removes their stored status fields.

## Phase 7: Integrations and exports

Apply `20261109_integrations.sql` after Contacts. It creates `integration_links`
with RLS and no browser policies. Enable the `integrations` module per business
only after deploying the app. Admins can create source-specific `wa.me` links;
the browser generates the QR locally and the page provides a copyable website
button snippet. The webhook records a source only when the first message
contains an exact code owned by that business. Attribution is best effort
because customers can edit the prefilled text. Contacts and Reports export
UTF-8 CSV. Google Sheets sync is one-way contacts export: the authorized
business admin selects a spreadsheet and tab, tests with Sync now, and may
enable a five-minute cron sync. ChatFlow owns and replaces that tab's contents;
other tabs are not touched. Apply `20261112_google_sheets_sync.sql` after the
integrations migration. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_SHEETS_REDIRECT_URI` (exactly the deployed `/api/integrations/google/callback`
URL), and a randomly generated base64 32-byte
`GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY`. Add the callback URL to the Google OAuth
client, enable the Google Sheets API, configure the OAuth consent screen, and
complete Google's verification/publishing requirements before serving external
customers. The Vercel cron runs every five minutes and processes up to five
connected businesses per invocation. Shopify remains Later.

## Platform track: Cenexa administration

Apply `20261109_platform_admin.sql` after the campaign/automation migration.
It creates separate platform admin identities, append-only audit records,
cron heartbeats and daily usage rollups. New rows are RLS protected with no
browser policies. The platform console returns tenant metadata and counts only;
it does not return conversation bodies, access tokens, or provider API keys.
Tenant changes require confirmation and a reason. Database functions commit
each setting change with its audit row in one transaction.

The first owner is seeded manually after that Supabase Auth user signs in and
enrolls a TOTP factor. The user can open `/admin/mfa` while signed in to enroll.
Then insert the Auth user UUID in Supabase SQL Editor:

```sql
insert into public.platform_admins (user_id, role)
values ('<auth-user-uuid>', 'owner');
```

Every platform API request checks both the enabled `platform_admins` row and
the current `aal2` MFA level. Owner can manage plans, tenant suspension and
platform admins. Support can change feature modules. Read-only can view only.
Suspension sets `platform_suspended`, blocks tenant APIs and causes the
WhatsApp webhook to skip the business without changing its connection status.
The existing five-minute owner-alert cron records its heartbeat and refreshes
daily usage counts. AI-call counts are a reply-based proxy, and media AI counts
are recorded analyses; this is operational usage metering, not token-level
billing. If the cron schedule is not running, heartbeat remains
stale and queued campaigns/automations do not drain.

## Phase 8: Close-out

The Integrations settings replace the old Planned row. Wallet/payment collection
and invoices remain outside this release; Shopify and live Google Sheets are
shown as Later with the OAuth/review dependency. English and Tamil remain the
available translated navigation/Today/filter strings. Hindi is not offered
until translations and the rest of the new screens receive native-speaker
review. Platform administration uses the existing Supabase and `CRON_SECRET`
settings. Browser push and WhatsApp owner alerts require the optional settings
documented below.

Security boundaries: new tables have RLS and no browser policies; export routes
are tenant scoped; CSV import and queued sending have database-backed limits;
cron access requires `CRON_SECRET`; platform responses omit secrets and chat
content. Apply production migrations before deploying code that queries these
tables. For this final track, apply `20261109_integrations.sql` followed by
`20261109_platform_admin.sql`, then deploy. Keep Integrations disabled until a
business is ready. Review the platform owner seed UUID carefully before
running the one-time insert.

Rollback companions are `ROLLBACK_20261109_integrations.sql` and
`ROLLBACK_20261109_platform_admin.sql`. Disable the module and platform
controls before reverting code; the platform rollback removes audit history,
admin identities, usage rollups, and the suspension flag.

## Operational improvements: inbox, exports, and knowledge files

Before deploying the optimized inbox and knowledge-file code, apply
`supabase/migrations/20261110_chatflow_experience.sql` after the 20261109
migrations. It adds an indexed, tenant-scoped conversation-summary function and
private knowledge-file/chunk tables. The summary RPC is called only from
business-authenticated server routes; the knowledge tables have RLS enabled
with no browser policies. The rollback companion deletes uploaded knowledge
files, so export any needed source material before using it.

Contacts exports use the current search, tag, group, and consent-status filters.
Inbox CSV export is admin-only and follows the current chat status filter, Mine
switch, and search; it exports one row per conversation with its latest message.

Assistant knowledge files accept UTF-8 `.txt`, `.md`, `.csv`, and `.json` files,
plus text-based `.pdf` files, up to 1 MB each, with a 25-file per-business
limit. PDFs are limited to 100 pages and scanned PDFs need OCR before upload.
Uploads are split into searchable chunks and relevant keyword matches are
supplied to both live AI replies and the Assistant Studio test chat. This
release uses keyword matching, not semantic/vector search.

To enable browser push alerts, generate one VAPID key pair with
`npx web-push generate-vapid-keys`, then set these in the hosting environment:

```text
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key; server only>
VAPID_SUBJECT=mailto:<monitored-address>
CRON_SECRET=<random secret>
```

Redeploy after setting the variables. In Settings → Owner alerts, enable
notifications on each owner device and allow the browser prompt. The scheduled
job must call `/api/cron/owner-alerts` every five minutes with
`Authorization: Bearer <CRON_SECRET>` for re-alerts and queued sends. For
WhatsApp owner alerts, create and approve a Utility template with three body
parameters (alert type, customer phone, dashboard link), then set
`WHATSAPP_OWNER_ALERT_TEMPLATE` and its language before redeploying. Finally,
save the owner number and enable that channel in the settings panel.

Password changes are available in Settings → Change password for signed-in
business users. The login form includes a show/hide password control.
