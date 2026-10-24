-- ============================================================
-- ROLLBACK: 20261013_coexistence_and_media_ai.sql
--
-- ⚠️  DO NOT RUN THIS UNLESS INSTRUCTED.
--
-- This drops only the columns added in the forward migration.
-- It is safe ONLY if the new code has been reverted first —
-- running this while new code is live WILL cause errors.
--
-- The forward migration is additive; in almost all cases you
-- should rollback by reverting the code deployment and leaving
-- the columns in place (they are nullable/defaulted and harmless).
--
-- Only use this if you need to fully undo the schema change.
-- ============================================================

-- Drop columns from messages first (has check constraint referencing nothing, but cleaner order)
alter table messages
  drop column if exists media_analysis,
  drop column if exists transcript,
  drop column if exists source;

-- Drop columns from conversations
alter table conversations
  drop column if exists ai_paused_until;

-- Drop columns from businesses
alter table businesses
  drop column if exists vision_model,
  drop column if exists handoff_minutes,
  drop column if exists disconnected_reason,
  drop column if exists coexistence_synced_at,
  drop column if exists onboarding_type,
  drop column if exists waba_id,
  drop column if exists media_ai_enabled,
  drop column if exists coexistence_enabled;

-- Drop index
drop index if exists idx_businesses_waba_id;
