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

**Signature verification mode** (env var, not a DB flag):

| `META_APP_SIGNATURE_MODE` | Behaviour |
|---|---|
| `off` (default) | No verification. Safe until META_APP_SECRET is confirmed working. |
| `log` | Compute and log mismatches but still process every request. |
| `enforce` | Reject requests with invalid signatures (HTTP 401). Use only after 48h of `log` with zero mismatches. |

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

### Code deployment

- [ ] Deploy the `feat/coexistence-media-ai` branch to production (Vercel or your host).
- [ ] Set env vars: `META_APP_SIGNATURE_MODE=off` (will change later), all new keys from `.env.example` added with empty/default values.
- [ ] **Verify both live clients are unaffected** (their `media_ai_enabled` and `coexistence_enabled` are `false`): send harmless test messages from a team phone; replies must be byte-for-byte identical to before.

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
