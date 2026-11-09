# Cenexa ChatFlow

Cenexa ChatFlow is a multi-tenant WhatsApp operations dashboard built with Next.js 16, Supabase, Meta's WhatsApp Business API, and OpenRouter. It includes an AI inbox, human handoff, payment screenshot verification, owner alerts, templates, contacts and customer timelines, campaigns, automations, reporting, team roles, tracked WhatsApp links, and an MFA-protected Cenexa platform console.

## Local setup

1. Install Node dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` and fill in the Supabase, Meta, AI, VAPID, and cron settings required for the features you use.
3. For a disposable staging database, use [`supabase/staging-schema.sql`](supabase/staging-schema.sql), which starts from the core schema and replays the dated migrations. For production, apply only the additive SQL files in `supabase/migrations/` in the documented dependency order; never run the staging bootstrap against production.
4. Start the app with `npm run dev`.

Useful checks are `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.

## Feature flags

The `businesses.modules_enabled` JSON object controls Templates, Contacts, Campaigns, Automations, Reports, Team, and Integrations per business. New modules default to off. Turn on a module only after its migration is applied and the production code is deployed. Campaign sending also requires recorded opt-in, an approved template, configured pricing, the per-business daily cap, and an active sending switch.

See [`docs/ROLLOUT.md`](docs/ROLLOUT.md) for production migration order, rollback files, per-business rollout guidance, and platform-console bootstrap. See [`docs/CLIENT_ONBOARDING.md`](docs/CLIENT_ONBOARDING.md) for WhatsApp setup, consent, templates, and tracked links.

## Security boundaries

- Tenant routes use `requireBusinessAccess` and scope database reads/writes to the authenticated business.
- New feature tables use RLS with no browser policies; privileged access stays on server routes.
- Platform access uses `platform_admins`, requires verified MFA (AAL2), and never exposes tenant tokens, provider keys, or customer message contents.
- Platform writes require a reason and confirmation and are audited transactionally in append-only `platform_audit_log`.
- The scheduled `/api/cron/owner-alerts` route requires `Authorization: Bearer $CRON_SECRET` and writes its latest heartbeat.
- CSV exports include a UTF-8 BOM for spreadsheet compatibility. Shopify and live Google Sheets integrations are labeled Later; exports do not require OAuth.

## Main routes

| Route | Purpose |
|---|---|
| `/today`, `/inbox` | Daily queue and WhatsApp conversations |
| `/templates`, `/contacts`, `/campaigns`, `/automations`, `/reports`, `/team`, `/integrations` | Tenant feature screens (per-business flags apply) |
| `/integrations` | Tracked click-to-chat links, local QR generation, CSV exports |
| `/admin` | MFA-gated Cenexa tenant operations console |
| `/admin/platform-admins` | Owner-only platform access management |
| `/api/webhook` | Meta WhatsApp webhook |
| `/api/cron/owner-alerts` | Owner alerts, campaign and automation queues, usage rollup and heartbeat |

## Language

The dashboard currently offers English and Tamil for its translated navigation, Today screen, and filters. Other screens remain in English. Hindi is not available in this release; new translations need review by native speakers before launch.
