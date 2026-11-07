-- ============================================================
-- Cenexa ChatFlow: WhatsApp Coexistence + Voice/Image AI
-- Migration: 20261013_coexistence_and_media_ai.sql
--
-- SAFE TO RE-RUN — every statement is idempotent.
-- ADDITIVE ONLY — no columns dropped, renamed, or type-changed.
-- All new columns have safe defaults so the currently-deployed
-- code keeps working before the new code ships.
--
-- Run on STAGING first. Verify live behaviour is unchanged.
-- Do NOT run on production until Phase 4 staging validation passes.
-- ============================================================

-- ── Feature flags ────────────────────────────────────────────────────────
-- These are THE safety mechanism. Both default false so every existing
-- business keeps the legacy path until you explicitly flip them.
alter table businesses
  add column if not exists coexistence_enabled boolean not null default false,
  add column if not exists media_ai_enabled     boolean not null default false;

-- Confirm: existing rows must have both flags = false after this runs.
-- You can verify with: SELECT id, name, coexistence_enabled, media_ai_enabled FROM businesses;

-- ── Coexistence identity & state ─────────────────────────────────────────
alter table businesses
  add column if not exists waba_id               text,
  add column if not exists onboarding_type       text not null default 'api'
      constraint businesses_onboarding_type_check
        check (onboarding_type in ('api', 'coexistence')),
  add column if not exists coexistence_synced_at timestamptz,
  add column if not exists disconnected_reason   text;

-- ── AI behaviour tuning ──────────────────────────────────────────────────
alter table businesses
  -- How many minutes the AI stays quiet after the owner replies from
  -- the WhatsApp Business app (coexistence). Only used when coexistence_enabled = true.
  add column if not exists handoff_minutes integer not null default 60,
  -- Per-business override for the image/voice analysis model (OpenRouter ID).
  -- Null = use VISION_MODEL env var.
  add column if not exists vision_model    text;

-- Index for account_update event matching (WABA ID → business row).
create index if not exists idx_businesses_waba_id on businesses(waba_id)
  where waba_id is not null;

-- ── Conversations: AI pause state ────────────────────────────────────────
-- Null = AI is active. Timestamp in the future = AI is paused until then.
-- Only checked when coexistence_enabled = true; ignored otherwise.
alter table conversations
  add column if not exists ai_paused_until timestamptz;

-- ── Messages: source tracking + media AI results ─────────────────────────
alter table messages
  -- Where did this message come from?
  -- customer     = inbound from WhatsApp customer
  -- ai           = sent by our AI (Cloud API)
  -- dashboard    = sent by team via Cenexa dashboard
  -- business_app = owner replied from WhatsApp Business app (coexistence echo)
  -- history      = imported from coexistence history sync
  -- null         = legacy rows (pre-migration); code must tolerate null
  add column if not exists source text
      constraint messages_source_check
        check (source in ('customer', 'ai', 'dashboard', 'business_app', 'history')),
  -- Voice note transcription (plain text, may be null if transcription is off/failed)
  add column if not exists transcript      text,
  -- Structured analysis JSON (VoiceAnalysis | ImageAnalysis from media-ai.ts)
  add column if not exists media_analysis  jsonb;

-- ── Source backfill ───────────────────────────────────────────────────────
-- The source column is nullable. Old rows stay null and the new code
-- tolerates null gracefully.
--
-- If you want to backfill existing rows, check the row count first:
--   SELECT count(*) FROM messages;
--
-- If the count is small (< 50 000 rows), use the inline UPDATE below
-- (uncomment it). For large tables, use scripts/backfill-source-column.js
-- which runs in batches of 5000 with a short sleep between each batch.
--
-- DO NOT UNCOMMENT until you have confirmed the row count with the team:
--
-- UPDATE messages
--    SET source = CASE WHEN role = 'user' THEN 'customer' ELSE 'ai' END
--  WHERE source IS NULL;
--
-- ─────────────────────────────────────────────────────────────────────────

-- ── Verification queries (run after migration to confirm) ─────────────────
-- SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--  WHERE table_name IN ('businesses', 'conversations', 'messages')
--    AND column_name IN (
--          'coexistence_enabled', 'media_ai_enabled', 'waba_id',
--          'onboarding_type', 'coexistence_synced_at', 'disconnected_reason',
--          'handoff_minutes', 'vision_model', 'ai_paused_until',
--          'source', 'transcript', 'media_analysis'
--        )
--  ORDER BY table_name, column_name;
--
-- SELECT id, name, coexistence_enabled, media_ai_enabled
--   FROM businesses;
-- Expected: coexistence_enabled = false, media_ai_enabled = false for all rows.
