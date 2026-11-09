# Before onboarding a real client

This checklist is for production. Payment integration is not part of this release.

## 1. Update the production database

1. Back up the production Supabase project.
2. In Supabase SQL Editor, apply every migration in `supabase/migrations/` that is not already applied, in date order.
3. Apply `20261109_tenant_realtime_rls.sql` before a second business is allowed to connect. It limits browser reads and Realtime messages to the signed-in user's business.
4. Sign in and confirm the inbox, contacts, AI settings, and messages still load.

Do not run `staging-schema.sql` against production; it is a database bootstrap script, not an incremental migration.

Campaign and automation setup (Phases 3 and 4) depends on the contact timeline
schema. Apply migrations in this order when missing: module flags, templates,
contacts, then campaigns and automations. Leave both module flags off until a
business-specific pilot is ready. Before enabling campaigns, add verified
Meta rate rows to `campaign_pricing`; rates are intentionally not guessed or
seeded by the migration.

Reports and Team (Phases 5 and 6) depend on contacts, campaigns/automations,
and owner alerts. Apply `20261109_reports_team.sql` only after those tables are
present. Confirm the profile-to-Auth verification check is zero. Reports use
the owner-alert timezone and label payment history from
`reporting_history_start_date`. Team invitations require Supabase Auth email
delivery and an allowed `/login` redirect. Strict role enforcement stays off
until an admin opts in for a business.

For invite acceptance, set the Supabase Invite user email template link to
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` and allow
the production `/auth/confirm` redirect URL.

## 2. Set production app configuration

In Vercel, check the Production environment for the variables listed in `.env.example`. Keep secrets server-side. In particular:

- Set `META_APP_SECRET` and `META_APP_SIGNATURE_MODE=enforce`.
- Set `WHATSAPP_VERIFY_TOKEN` to the same value entered in Meta's webhook setup.
- Set the production Supabase URL, public key, and service-role key.
- Set the AI provider key and model if automatic replies are enabled.
- For push alerts, generate one VAPID pair with `npx web-push generate-vapid-keys`, then set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, server-only `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `CRON_SECRET` in the host and redeploy. Enable notifications on each owner device from Settings → Owner alerts. The scheduled `/api/cron/owner-alerts` request needs `Authorization: Bearer <CRON_SECRET>` every five minutes for re-alerts.
- Do not set a shared `WHATSAPP_REGISTER_PIN`. Each API-only client enters their own six-digit PIN during setup; coexistence clients leave it blank.

Redeploy Production after changing environment variables.

## 3. Check Meta settings

- The production webhook callback must be `https://cenexa-chatbot.vercel.app/api/webhook`.
- Its verify token must match `WHATSAPP_VERIFY_TOKEN`.
- Subscribe the app to the `messages` webhook field and subscribe each client's WhatsApp account to the app.
- Confirm the Meta app has the WhatsApp Embedded Signup configuration and permissions needed for the clients you plan to onboard.
- Use a Meta account that is allowed to use the app. If Meta still marks the app as in development/testing, only its allowed test users can connect.

## 4. Connect one client at a time

1. Create the client's login and have the client sign in.
2. Enter the business name and connect their WhatsApp account from `/onboard`.
3. For an API-only number, the number owner must enter their own WhatsApp two-step PIN. The app sends it to Meta during registration and does not save it.
4. The app must confirm Meta phone registration and webhook subscription before it marks the business connected.
5. Send a customer message to the connected number. Check that it appears in the correct business inbox and only that business's dashboard can see it.
6. Send a dashboard reply and confirm it arrives in WhatsApp.
7. Check Vercel logs for webhook processing errors.

The current self-service flow supports one WhatsApp phone number per business setup. If Meta returns more than one number, stop and contact support; the app will not guess which number to connect.

## Release gate

Do not onboard external businesses until the production migration is applied, Meta webhook signatures are enforced, and one complete inbound/outbound message cycle has been confirmed for the first client.

## Message templates

To manage templates, the connected business must have a `waba_id` and its
WhatsApp access token must include `whatsapp_business_management`. Templates
submitted through ChatFlow remain unavailable for sending until Meta marks them
approved. Marketing templates are not sendable until contact opt-in tracking
ships in Phase 2; use Utility templates for transactional updates in Phase 1.

When importing contacts, only include people who opted in to WhatsApp messages.
The importer requires the owner to confirm consent and records its source.
Customers can opt out by replying `STOP` or `UNSUBSCRIBE`; ChatFlow records the
opt-out and does not send an automated reply to that keyword.

## Tracked links and platform administration

- Enable the Integrations module for a business, then create source-specific
  click-to-chat links from **More → Integrations**. The screen generates a QR
  locally in the browser; source tracking is best effort because a customer can
  edit the prefilled message.
- Contacts exports apply the current search, tag, group, and consent-status filters. Inbox CSV export follows the selected chat-status filter, Mine switch, and search. Reports export UTF-8 CSV files. There is no Google sign-in or
  live Sheets connection. Shopify and live Sheets sync remain outside this
  release because they require separate OAuth apps and review.
- Platform access uses the separate `platform_admins` table and requires a
  verified TOTP factor. The initial owner must first sign in and open
  `/admin/mfa` to enroll, then an operator seeds that Auth user ID as `owner`.
  All tenant changes require a reason and confirmation and appear in the
  append-only platform audit log.
