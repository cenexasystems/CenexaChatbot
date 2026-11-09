-- ============================================================
-- Cenexa ChatFlow: Staging Database Full Schema
-- File: supabase/staging-schema.sql
--
-- This script sets up a complete, isolated STAGING Supabase database
-- matching Production + Coexistence + Voice/Image AI.
-- Run this in your new Staging Supabase project's SQL Editor.
-- ============================================================

-- 1. Businesses Table
create table if not exists businesses (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  phone_number_id text unique not null,
  whatsapp_number text not null,
  access_token text not null,
  openrouter_api_key text,
  ai_model text default 'openai/gpt-4o-mini',
  system_prompt text,
  welcome_message text,
  plan text default 'basic',
  is_active boolean default true,
  created_at timestamptz default now(),
  qr_image_url text,
  -- Coexistence & Media AI additions:
  coexistence_enabled boolean not null default false,
  media_ai_enabled boolean not null default false,
  waba_id text,
  onboarding_type text not null default 'api' check (onboarding_type in ('api', 'coexistence')),
  coexistence_synced_at timestamptz,
  disconnected_reason text,
  handoff_minutes integer not null default 60,
  vision_model text,
  reporting_history_start_date date not null default current_date,
  strict_roles boolean not null default false
);

alter table public.businesses
  add column if not exists modules_enabled jsonb not null default '{}'::jsonb;

create index if not exists idx_businesses_waba_id on businesses(waba_id) where waba_id is not null;

-- 2. Profiles Table
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid references businesses(id) on delete cascade not null,
  name text,
  role text default 'admin' check (role in ('admin', 'support', 'sales', 'accounts')),
  email text,
  status text not null default 'active' check (status in ('invited', 'active', 'disabled')),
  invited_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz default now()
);
create unique index if not exists idx_profiles_email_lower_unique on public.profiles (lower(email)) where email is not null;

-- 3. Conversations Table
create table if not exists conversations (
  id uuid default gen_random_uuid() primary key,
  business_id uuid references businesses(id) on delete cascade,
  phone text not null,
  name text,
  mode text not null default 'agent' check (mode in ('agent', 'human')),
  assigned_to text,
  tags text[] default '{}',
  payment_status text default 'none' check (payment_status in ('none', 'pending', 'verified', 'rejected')),
  internal_note text,
  payment_qr_sent boolean default false,
  msg_count_hour integer default 0,
  msg_count_day integer default 0,
  msg_count_month integer default 0,
  hour_reset_at timestamptz default now(),
  day_reset_at timestamptz default now(),
  month_reset_at timestamptz default now(),
  is_first_message boolean default true,
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  -- Coexistence addition:
  ai_paused_until timestamptz
);

create index if not exists idx_conversations_business_phone on conversations(business_id, phone);
create index if not exists idx_conversations_updated on conversations(updated_at desc);
create index if not exists idx_conversations_business_assigned on conversations(business_id, assigned_to);

-- 4. Messages Table
create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  whatsapp_msg_id text unique,
  media_url text,
  media_type text check (media_type in ('image', 'audio', 'document', 'video', 'sticker') or media_type is null),
  is_payment_screenshot boolean default false,
  created_at timestamptz default now(),
  -- Coexistence & Media AI additions:
  source text check (source in ('customer', 'ai', 'dashboard', 'business_app', 'history', 'automation') or source is null),
  transcript text,
  media_analysis jsonb
);

create index if not exists idx_messages_conversation on messages(conversation_id);
create index if not exists idx_messages_created_at on messages(created_at desc);

-- 5. Enable Realtime Publications
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;

-- Complete the staging bootstrap by replaying every dated additive migration below.
-- ===== BEGIN MIGRATION: 20261013_coexistence_and_media_ai.sql =====
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

-- ===== END MIGRATION: 20261013_coexistence_and_media_ai.sql =====

-- ===== BEGIN MIGRATION: 20261107_dashboard_v2_rollout.sql =====
-- Enable the new dashboard one business at a time after customer acceptance.
-- Existing businesses remain on the classic dashboard until explicitly enabled.
alter table public.businesses
  add column if not exists dashboard_v2_enabled boolean not null default false;

comment on column public.businesses.dashboard_v2_enabled is
  'Redirects this business from / to /today; keep false until the business has accepted the new dashboard.';

-- ===== END MIGRATION: 20261107_dashboard_v2_rollout.sql =====

-- ===== BEGIN MIGRATION: 20261107_message_delivery_status.sql =====
-- Store outbound WhatsApp delivery progress reported by Meta.
-- Additive and safe to run before deploying code that consumes these columns.
alter table messages
  add column if not exists delivery_status text
    constraint messages_delivery_status_check
      check (delivery_status in ('sent', 'delivered', 'read', 'failed')),
  add column if not exists delivery_error_code text;

-- ===== END MIGRATION: 20261107_message_delivery_status.sql =====

-- ===== BEGIN MIGRATION: 20261108_owner_alerts.sql =====
-- Owner notifications: opt-in Web Push, optional WhatsApp alerts, reminders.
alter table businesses
  add column if not exists owner_alerts_enabled boolean not null default true,
  add column if not exists owner_whatsapp_alerts_enabled boolean not null default false,
  add column if not exists owner_whatsapp_number text,
  add column if not exists owner_alert_realert_minutes integer not null default 15
    constraint businesses_owner_alert_realert_minutes_check
      check (owner_alert_realert_minutes between 1 and 1440),
  add column if not exists owner_alert_quiet_hours_start time not null default '22:00',
  add column if not exists owner_alert_quiet_hours_end time not null default '08:00',
  add column if not exists owner_alert_timezone text not null default 'Asia/Kolkata';

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id, endpoint)
);

create index if not exists idx_push_subscriptions_business on push_subscriptions(business_id);
alter table push_subscriptions enable row level security;

create table if not exists owner_alerts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  alert_type text not null check (alert_type in ('handoff', 'payment')),
  event_key text not null unique,
  status text not null default 'open' check (status in ('open', 'resolved')),
  attempt_count integer not null default 0,
  last_notified_at timestamptz,
  next_attempt_at timestamptz,
  processing_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_owner_alerts_due
  on owner_alerts(next_attempt_at)
  where status = 'open' and next_attempt_at is not null;
create index if not exists idx_owner_alerts_conversation_open
  on owner_alerts(business_id, conversation_id)
  where status = 'open';
create unique index if not exists idx_owner_alerts_one_open_type
  on owner_alerts(business_id, conversation_id, alert_type)
  where status = 'open';
alter table owner_alerts enable row level security;

-- ===== END MIGRATION: 20261108_owner_alerts.sql =====

-- ===== BEGIN MIGRATION: 20261109_ai_assistant_studio.sql =====
-- Per-business AI assistant configuration. Additive only.
alter table businesses
  add column if not exists handoff_rules text,
  add column if not exists handoff_keywords text[] not null default array[]::text[],
  add column if not exists greeting_phrases text[] not null default array['hi', 'hello', 'hey', 'hii', 'helo', 'hai', 'வணக்கம்', 'ஹலோ']::text[],
  add column if not exists url_rewrite_from text,
  add column if not exists url_rewrite_to text;

-- Preserve the existing rewrite only for businesses whose saved prompt content uses it.
update businesses
   set url_rewrite_from = 'https://b2-bridal-studio-upgraded.vercel.app',
       url_rewrite_to = 'https://b2bridalstudio.com'
 where url_rewrite_from is null
   and (
     system_prompt like '%https://b2-bridal-studio-upgraded.vercel.app%'
     or welcome_message like '%https://b2-bridal-studio-upgraded.vercel.app%'
   );

-- ===== END MIGRATION: 20261109_ai_assistant_studio.sql =====

-- ===== BEGIN MIGRATION: 20261109_campaigns_automations.sql =====
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null, template_id uuid not null references public.message_templates(id), audience jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','scheduled','sending','paused','completed','cancelled')),
  estimate jsonb not null default '{}'::jsonb, totals jsonb not null default '{}'::jsonb,
  creator_id uuid, scheduled_at timestamptz, started_at timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id), phone text not null, variables jsonb not null default '[]'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','sent','delivered','read','replied','paid','failed','skipped')),
  skip_reason text, meta_message_id text unique, error_code text, sent_at timestamptz, delivered_at timestamptz,
  read_at timestamptz, replied_at timestamptz, paid_at timestamptz, attempts integer not null default 0,
  locked_at timestamptz, next_attempt_at timestamptz not null default now(), created_at timestamptz not null default now(),
  unique (campaign_id, contact_id)
);
create table if not exists public.campaign_pricing (
  country_code text not null, category text not null check (category in ('UTILITY','MARKETING','AUTHENTICATION')),
  rate_inr numeric(12,6) not null check (rate_inr >= 0), cenexa_fee_inr numeric(12,6) not null default 0 check (cenexa_fee_inr >= 0),
  as_of date not null, primary key (country_code, category)
);
create table if not exists public.campaign_daily_usage (
  business_id uuid not null references public.businesses(id) on delete cascade, usage_date date not null,
  sent_count integer not null default 0, primary key (business_id, usage_date)
);
create or replace function public.consume_campaign_daily_slot(p_business_id uuid, p_usage_date date, p_cap integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed integer;
begin
  insert into public.campaign_daily_usage (business_id, usage_date, sent_count)
  values (p_business_id, p_usage_date, 1)
  on conflict (business_id, usage_date) do update
    set sent_count = campaign_daily_usage.sent_count + 1
    where campaign_daily_usage.sent_count < p_cap
  returning 1 into claimed;
  return claimed = 1;
end;
$$;
alter table public.businesses add column if not exists campaign_sending_paused boolean not null default false;
alter table public.businesses add column if not exists campaign_daily_send_cap integer not null default 500;

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  rule_type text not null check (rule_type in ('follow_up','payment_reminder','review_request','dated_reminder')),
  enabled boolean not null default false, config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (business_id, rule_type)
);
create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  trigger_event_key text not null, run_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued','processing','sent','skipped','cancelled','failed')),
  reason text, attempts integer not null default 0, meta_message_id text, locked_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (automation_id, trigger_event_key)
);
create table if not exists public.automation_daily_usage (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  usage_date date not null,
  created_at timestamptz not null default now(),
  primary key (contact_id, usage_date)
);

alter table public.messages drop constraint if exists messages_source_check;
alter table public.messages add constraint messages_source_check check (source in ('customer','ai','dashboard','business_app','history','automation') or source is null);
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.campaign_pricing enable row level security;
alter table public.campaign_daily_usage enable row level security;
alter table public.automations enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_daily_usage enable row level security;
create index if not exists idx_campaigns_business_status on public.campaigns (business_id,status,created_at desc);
create index if not exists idx_campaign_queue on public.campaign_recipients (next_attempt_at,created_at) where status in ('queued','processing');
create index if not exists idx_campaign_recipients_message on public.campaign_recipients (meta_message_id) where meta_message_id is not null;
create index if not exists idx_automation_runs_due on public.automation_runs (run_at,created_at) where status in ('queued','processing');
create index if not exists idx_automation_runs_contact_day on public.automation_runs (contact_id,created_at) where status='sent';

create or replace function public.claim_campaign_recipients(p_limit integer default 25)
returns setof public.campaign_recipients language sql security definer set search_path = public as $$
  with candidates as (
    select id from public.campaign_recipients
    where (status='queued' and next_attempt_at <= now()) or (status='processing' and locked_at < now() - interval '10 minutes')
    order by next_attempt_at, created_at for update skip locked limit greatest(1,least(p_limit,100))
  )
  update public.campaign_recipients r set status='processing', locked_at=now(), attempts=r.attempts+1
  from candidates c where r.id=c.id returning r.*;
$$;
create or replace function public.claim_automation_runs(p_limit integer default 25)
returns setof public.automation_runs language sql security definer set search_path = public as $$
  with candidates as (
    select id from public.automation_runs
    where (status='queued' and run_at <= now()) or (status='processing' and locked_at < now() - interval '10 minutes')
    order by run_at,created_at for update skip locked limit greatest(1,least(p_limit,100))
  )
  update public.automation_runs r set status='processing', locked_at=now(), attempts=r.attempts+1
  from candidates c where r.id=c.id returning r.*;
$$;
create or replace function public.consume_automation_daily_slot(p_contact_id uuid, p_usage_date date)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.automation_daily_usage (contact_id, usage_date)
  values (p_contact_id, p_usage_date)
  on conflict (contact_id, usage_date) do nothing;
  return found;
end;
$$;
revoke all on function public.claim_campaign_recipients(integer) from public, anon, authenticated;
revoke all on function public.claim_automation_runs(integer) from public, anon, authenticated;
revoke all on function public.consume_campaign_daily_slot(uuid,date,integer) from public, anon, authenticated;
revoke all on function public.consume_automation_daily_slot(uuid,date) from public, anon, authenticated;
grant execute on function public.claim_campaign_recipients(integer) to service_role;
grant execute on function public.claim_automation_runs(integer) to service_role;
grant execute on function public.consume_campaign_daily_slot(uuid,date,integer) to service_role;
grant execute on function public.consume_automation_daily_slot(uuid,date) to service_role;

select id, status from public.campaigns limit 0;
select id, status from public.automation_runs limit 0;

-- ===== END MIGRATION: 20261109_campaigns_automations.sql =====

-- ===== BEGIN MIGRATION: 20261109_contacts.sql =====
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  phone text not null,
  name text,
  source text not null default 'conversation',
  opt_in_at timestamptz,
  opt_in_source text,
  opt_out_at timestamptz,
  conversation_id uuid references public.conversations(id) on delete set null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, phone)
);
create table if not exists public.contact_groups (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (business_id, name)
);
create table if not exists public.contact_group_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  group_id uuid not null references public.contact_groups(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, contact_id)
);
create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.conversations add column if not exists payment_amount numeric(12,2);

alter table public.contacts enable row level security;
alter table public.contact_groups enable row level security;
alter table public.contact_group_members enable row level security;
alter table public.activity_events enable row level security;
create index if not exists idx_contacts_business_name on public.contacts (business_id, lower(name));
create index if not exists idx_contacts_business_updated on public.contacts (business_id, updated_at desc, id desc);
create index if not exists idx_contact_members_business_group on public.contact_group_members (business_id, group_id, contact_id);
create index if not exists idx_activity_events_business_time on public.activity_events (business_id, created_at desc);
create index if not exists idx_activity_events_contact_time on public.activity_events (contact_id, created_at desc);

-- Backfill one contact per business/phone; retain the newest conversation link.
insert into public.contacts (business_id, phone, name, source, conversation_id, tags, created_at, updated_at)
select distinct on (business_id, phone)
  business_id, phone, name, 'conversation', id, coalesce(tags, '{}'), created_at, updated_at
from public.conversations
where business_id is not null and phone is not null
order by business_id, phone, updated_at desc, id desc
on conflict (business_id, phone) do update set
  name = coalesce(excluded.name, contacts.name),
  conversation_id = coalesce(excluded.conversation_id, contacts.conversation_id),
  updated_at = greatest(contacts.updated_at, excluded.updated_at);

-- Verification: these counts should match (one contact per distinct business/phone).
select count(*) as distinct_conversation_keys,
       count(*) filter (where c.id is null) as missing_contact_keys
from (select distinct business_id, phone from public.conversations where business_id is not null) d
left join public.contacts c on c.business_id = d.business_id and c.phone = d.phone;

-- ===== END MIGRATION: 20261109_contacts.sql =====

-- ===== BEGIN MIGRATION: 20261109_integrations.sql =====
-- Phase 7: per-business click-to-chat sources. Additive; disabled by default.
create table if not exists public.integration_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  label text not null,
  source_code text not null,
  prefilled_text text not null default 'Hi, I would like to know more.',
  created_at timestamptz not null default now(),
  unique (business_id, source_code)
);
alter table public.integration_links enable row level security;
create index if not exists idx_integration_links_business on public.integration_links (business_id, created_at desc);
comment on table public.integration_links is 'Tenant-owned click-to-chat source links; accessed through scoped server routes only.';

-- Verification: no duplicate source codes within a tenant.
select business_id, source_code, count(*) from public.integration_links group by business_id, source_code having count(*) > 1;

-- ===== END MIGRATION: 20261109_integrations.sql =====

-- ===== BEGIN MIGRATION: 20261109_message_templates.sql =====
create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  language text not null,
  category text not null check (category in ('UTILITY', 'MARKETING')),
  header text,
  body text not null,
  footer text,
  buttons jsonb not null default '[]'::jsonb,
  examples jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected', 'paused')),
  meta_template_id text,
  rejection_reason text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name, language)
);

alter table public.message_templates enable row level security;
-- Deliberately no browser policies. Tenant-scoped server routes use the service role.

create index if not exists idx_message_templates_business_status
  on public.message_templates (business_id, status, name);

-- Verification: zero rows before the first template is created.
select id, business_id, name, language, status from public.message_templates order by created_at desc limit 5;

-- ===== END MIGRATION: 20261109_message_templates.sql =====

-- ===== BEGIN MIGRATION: 20261109_module_flags.sql =====
-- Per-business switches for the planned product modules. All remain off until
-- explicitly enabled for a tenant. Safe to re-run.
alter table public.businesses
  add column if not exists modules_enabled jsonb not null default '{}'::jsonb;

comment on column public.businesses.modules_enabled is
  'Per-business feature switches; missing keys and false values mean disabled.';

-- Verification: this should return one row with {} (or the tenant's current flags).
select id, modules_enabled from public.businesses order by created_at limit 5;

-- ===== END MIGRATION: 20261109_module_flags.sql =====

-- ===== BEGIN MIGRATION: 20261109_platform_admin.sql =====
-- Platform control plane, separated from tenant profiles.
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','support','read_only')),
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.platform_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id),
  action text not null,
  tenant_id uuid references public.businesses(id) on delete set null,
  before_values jsonb not null default '{}'::jsonb,
  after_values jsonb not null default '{}'::jsonb,
  reason text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.cron_runs (
  job text primary key,
  last_started_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
create table if not exists public.tenant_usage_daily (
  business_id uuid not null references public.businesses(id) on delete cascade,
  usage_date date not null,
  inbound_messages integer not null default 0,
  ai_calls integer not null default 0,
  ai_replies integer not null default 0,
  team_replies integer not null default 0,
  media_ai_analyses integer not null default 0,
  template_sends integer not null default 0,
  campaign_sends integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (business_id, usage_date)
);

alter table public.platform_admins enable row level security;
alter table public.platform_audit_log enable row level security;
alter table public.cron_runs enable row level security;
alter table public.tenant_usage_daily enable row level security;
alter table public.tenant_usage_daily add column if not exists ai_calls integer not null default 0;
alter table public.businesses add column if not exists platform_suspended boolean not null default false;
alter table public.messages drop constraint if exists messages_source_check;
alter table public.messages add constraint messages_source_check check (source in ('customer','ai','dashboard','business_app','history','automation','template') or source is null);

create or replace function public.reject_platform_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'platform_audit_log is append-only' using errcode = '42501';
end;
$$;
drop trigger if exists platform_audit_log_no_update on public.platform_audit_log;
create trigger platform_audit_log_no_update before update or delete on public.platform_audit_log
for each row execute function public.reject_platform_audit_mutation();

create or replace function public.platform_update_tenant(
  p_tenant_id uuid, p_updates jsonb, p_actor_id uuid, p_reason text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare old_row public.businesses%rowtype; new_row public.businesses%rowtype;
begin
  if length(trim(coalesce(p_reason,''))) < 8 then raise exception 'A change reason is required'; end if;
  select * into old_row from public.businesses where id=p_tenant_id for update;
  if not found then return null; end if;
  update public.businesses set
    modules_enabled = case when p_updates ? 'modules_enabled' then p_updates->'modules_enabled' else modules_enabled end,
    platform_suspended = case when p_updates ? 'platform_suspended' then (p_updates->>'platform_suspended')::boolean else platform_suspended end,
    plan = case when p_updates ? 'plan' then p_updates->>'plan' else plan end,
    coexistence_enabled = case when p_updates ? 'coexistence_enabled' then (p_updates->>'coexistence_enabled')::boolean else coexistence_enabled end,
    media_ai_enabled = case when p_updates ? 'media_ai_enabled' then (p_updates->>'media_ai_enabled')::boolean else media_ai_enabled end,
    dashboard_v2_enabled = case when p_updates ? 'dashboard_v2_enabled' then (p_updates->>'dashboard_v2_enabled')::boolean else dashboard_v2_enabled end,
    handoff_minutes = case when p_updates ? 'handoff_minutes' then (p_updates->>'handoff_minutes')::integer else handoff_minutes end,
    ai_model = case when p_updates ? 'ai_model' then p_updates->>'ai_model' else ai_model end,
    vision_model = case when p_updates ? 'vision_model' then p_updates->>'vision_model' else vision_model end,
    campaign_sending_paused = case when p_updates ? 'campaign_sending_paused' then (p_updates->>'campaign_sending_paused')::boolean else campaign_sending_paused end,
    campaign_daily_send_cap = case when p_updates ? 'campaign_daily_send_cap' then (p_updates->>'campaign_daily_send_cap')::integer else campaign_daily_send_cap end
  where id=p_tenant_id returning * into new_row;
  insert into public.platform_audit_log(actor_id,tenant_id,action,before_values,after_values,reason)
  values(p_actor_id,p_tenant_id,'tenant_settings_updated',
    to_jsonb(old_row) - array['access_token','openrouter_api_key','system_prompt','welcome_message'],
    to_jsonb(new_row) - array['access_token','openrouter_api_key','system_prompt','welcome_message'],trim(p_reason));
  return jsonb_build_object('id',new_row.id,'name',new_row.name,'plan',new_row.plan,'is_active',new_row.is_active,'platform_suspended',new_row.platform_suspended,
    'whatsapp_number',new_row.whatsapp_number,'phone_number_id',new_row.phone_number_id,'onboarding_type',new_row.onboarding_type,'coexistence_enabled',new_row.coexistence_enabled,
    'coexistence_synced_at',new_row.coexistence_synced_at,'disconnected_reason',new_row.disconnected_reason,'created_at',new_row.created_at,'modules_enabled',new_row.modules_enabled,
    'media_ai_enabled',new_row.media_ai_enabled,'dashboard_v2_enabled',new_row.dashboard_v2_enabled,'handoff_minutes',new_row.handoff_minutes,'ai_model',new_row.ai_model,
    'vision_model',new_row.vision_model,'campaign_sending_paused',new_row.campaign_sending_paused,'campaign_daily_send_cap',new_row.campaign_daily_send_cap);
end;
$$;
revoke all on function public.platform_update_tenant(uuid,jsonb,uuid,text) from public, anon, authenticated;
grant execute on function public.platform_update_tenant(uuid,jsonb,uuid,text) to service_role;

create or replace function public.platform_set_admin(
  p_user_id uuid,p_role text,p_disabled boolean,p_actor_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  old_values jsonb;
  row_value public.platform_admins%rowtype;
  old_role text;
  old_disabled boolean;
  owner_count integer;
begin
  if p_role not in ('owner','support','read_only') or length(trim(coalesce(p_reason,''))) < 8 then raise exception 'Valid role and reason are required'; end if;
  perform pg_advisory_xact_lock(hashtext('platform-admin-owner-guard'));
  select role,disabled,jsonb_build_object('role',role,'disabled',disabled) into old_role,old_disabled,old_values from public.platform_admins where user_id=p_user_id for update;
  if old_role='owner' and not old_disabled and (p_role<>'owner' or p_disabled) then
    select count(*) into owner_count from public.platform_admins where role='owner' and disabled=false and user_id<>p_user_id;
    if owner_count=0 then raise exception 'Keep at least one enabled platform owner'; end if;
  end if;
  insert into public.platform_admins(user_id,role,disabled,updated_at) values(p_user_id,p_role,p_disabled,now())
  on conflict(user_id) do update set role=excluded.role,disabled=excluded.disabled,updated_at=now()
  returning * into row_value;
  insert into public.platform_audit_log(actor_id,action,before_values,after_values,reason)
  values(p_actor_id,'platform_admin_updated',coalesce(old_values,'{}'::jsonb),jsonb_build_object('user_id',row_value.user_id,'role',row_value.role,'disabled',row_value.disabled),trim(p_reason));
  return jsonb_build_object('user_id',row_value.user_id,'role',row_value.role,'disabled',row_value.disabled,'created_at',row_value.created_at,'updated_at',row_value.updated_at);
end;
$$;
revoke all on function public.platform_set_admin(uuid,text,boolean,uuid,text) from public, anon, authenticated;
grant execute on function public.platform_set_admin(uuid,text,boolean,uuid,text) to service_role;

create or replace function public.get_platform_tenant_summary()
returns table (business_id uuid, last_customer_message_at timestamptz, messages_30d bigint, open_owner_alerts bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  with message_totals as (
    select c.business_id,
      max(m.created_at) filter (where m.role='user') as last_customer_message_at,
      count(m.id) filter (where m.created_at >= now() - interval '30 days') as messages_30d
    from public.conversations c join public.messages m on m.conversation_id=c.id
    group by c.business_id
  ), alert_totals as (
    select business_id,count(*) as open_owner_alerts from public.owner_alerts
    where resolved_at is null group by business_id
  )
  select b.id,mt.last_customer_message_at,coalesce(mt.messages_30d,0),coalesce(at.open_owner_alerts,0)
  from public.businesses b left join message_totals mt on mt.business_id=b.id
  left join alert_totals at on at.business_id=b.id;
$$;
revoke all on function public.get_platform_tenant_summary() from public, anon, authenticated;
grant execute on function public.get_platform_tenant_summary() to service_role;

create or replace function public.refresh_platform_usage_daily(p_day date)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.tenant_usage_daily (business_id, usage_date, inbound_messages, ai_calls, ai_replies, team_replies, media_ai_analyses, template_sends, campaign_sends, updated_at)
  select b.id, p_day,
    count(m.id) filter (where m.role = 'user')::integer,
    count(m.id) filter (where m.role = 'assistant' and m.source = 'ai')::integer,
    count(m.id) filter (where m.role = 'assistant' and m.source = 'ai')::integer,
    count(m.id) filter (where m.role = 'assistant' and m.source in ('dashboard','business_app'))::integer,
    count(m.id) filter (where m.role = 'user' and m.media_analysis is not null)::integer,
    count(m.id) filter (where m.role = 'assistant' and m.source = 'template' and m.whatsapp_msg_id is not null)::integer,
    (select count(*)::integer from public.campaign_recipients r where r.business_id = b.id and (r.sent_at at time zone 'UTC')::date = p_day),
    now()
  from public.businesses b
  left join public.conversations c on c.business_id = b.id
  left join public.messages m on m.conversation_id = c.id and (m.created_at at time zone 'UTC')::date = p_day
  group by b.id
  on conflict (business_id, usage_date) do update set
    inbound_messages = excluded.inbound_messages, ai_calls = excluded.ai_calls, ai_replies = excluded.ai_replies,
    team_replies = excluded.team_replies, media_ai_analyses = excluded.media_ai_analyses,
    template_sends = excluded.template_sends, campaign_sends = excluded.campaign_sends,
    updated_at = excluded.updated_at;
$$;
revoke all on function public.refresh_platform_usage_daily(date) from public, anon, authenticated;
grant execute on function public.refresh_platform_usage_daily(date) to service_role;

-- Verification: all new platform tables have RLS enabled; no browser policies are installed.
select c.relname, c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policy_count
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('platform_admins','platform_audit_log','cron_runs','tenant_usage_daily')
order by c.relname;

-- ===== END MIGRATION: 20261109_platform_admin.sql =====

-- ===== BEGIN MIGRATION: 20261109_reports_team.sql =====
-- Phase 5: tenant-scoped reports. Phase 6: tenant team, strict roles, and assignments.
do $$ begin
  if to_regclass('public.contacts') is null or to_regclass('public.activity_events') is null
      or to_regclass('public.campaign_recipients') is null or to_regclass('public.automation_runs') is null
      or to_regclass('public.owner_alerts') is null then
    raise exception 'Apply contacts and campaign/automation migrations before reports/team';
  end if;
end $$;

do $$ begin
  if exists (
    select 1 from public.profiles p left join auth.users u on u.id = p.id
    where u.id is null
  ) then
    raise exception 'Profiles contains IDs without matching Supabase Auth users; resolve profile_auth_id_mismatches before applying Phase 6';
  end if;
end $$;

alter table public.businesses
  add column if not exists reporting_history_start_date date not null default current_date,
  add column if not exists strict_roles boolean not null default false;

alter table public.profiles
  add column if not exists email text,
  add column if not exists status text not null default 'active',
  add column if not exists invited_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Realtime and direct browser reads must stop immediately for a disabled profile.
drop policy if exists "profile_read_self" on public.profiles;
create policy "profile_read_self" on public.profiles as restrictive for select to public
  using (id = (select auth.uid()) and status = 'active');
drop policy if exists "conversation_read_own_business" on public.conversations;
create policy "conversation_read_own_business" on public.conversations as restrictive for select to public
  using (business_id = (select p.business_id from public.profiles p where p.id = (select auth.uid()) and p.status = 'active'));
drop policy if exists "message_read_own_business" on public.messages;
create policy "message_read_own_business" on public.messages as restrictive for select to public
  using (exists (
    select 1 from public.conversations c join public.profiles p on p.business_id = c.business_id
    where c.id = messages.conversation_id and p.id = (select auth.uid()) and p.status = 'active'
  ));

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null and u.email is not null;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_status_check
      check (status in ('invited','active','disabled'));
  end if;
end $$;

create unique index if not exists idx_profiles_email_lower_unique
  on public.profiles (lower(email)) where email is not null;
create index if not exists idx_profiles_business_status_role
  on public.profiles (business_id,status,role);
create index if not exists idx_conversations_business_assigned
  on public.conversations (business_id,assigned_to);
create index if not exists idx_owner_alerts_handoff_report
  on public.owner_alerts (business_id,created_at,resolved_at)
  where alert_type = 'handoff';
create index if not exists idx_campaign_recipients_business_sent
  on public.campaign_recipients (business_id,sent_at) where sent_at is not null;
create index if not exists idx_campaign_recipients_business_delivered
  on public.campaign_recipients (business_id,delivered_at) where delivered_at is not null;
create index if not exists idx_campaign_recipients_business_read
  on public.campaign_recipients (business_id,read_at) where read_at is not null;
create index if not exists idx_campaign_recipients_business_replied
  on public.campaign_recipients (business_id,replied_at) where replied_at is not null;
create index if not exists idx_campaign_recipients_business_paid
  on public.campaign_recipients (business_id,paid_at) where paid_at is not null;
create index if not exists idx_automation_runs_business_status_updated
  on public.automation_runs (business_id,status,updated_at);

create or replace function public.update_team_profile(
  p_business_id uuid,
  p_target_id uuid,
  p_role text,
  p_status text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing_role text;
  existing_status text;
  active_admins integer;
begin
  if p_role not in ('admin','support','sales','accounts') then
    raise exception 'Invalid team role' using errcode = '22023';
  end if;
  if p_status not in ('invited','active','disabled') then
    raise exception 'Invalid team status' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_business_id::text));
  select role, status into existing_role, existing_status
  from public.profiles
  where id = p_target_id and business_id = p_business_id
  for update;
  if not found then return false; end if;

  if existing_role = 'admin' and existing_status = 'active'
      and (p_role <> 'admin' or p_status <> 'active') then
    select count(*) into active_admins
    from public.profiles
    where business_id = p_business_id and role = 'admin' and status = 'active'
      and id <> p_target_id;
    if active_admins = 0 then
      raise exception 'A business must keep at least one active admin' using errcode = 'P0001';
    end if;
  end if;

  update public.profiles
  set role = p_role,
      status = p_status,
      updated_at = now()
  where id = p_target_id and business_id = p_business_id;
  return true;
end;
$$;

-- Aggregate all report series in the database using the tenant reporting timezone.
create or replace function public.get_business_report_series(
  p_business_id uuid,
  p_start_date date,
  p_end_date date
) returns table (
  report_date date,
  metric text,
  dimension text,
  value numeric,
  period_total numeric
)
language sql stable security definer set search_path = public, pg_temp as $$
  with tenant as (
    select coalesce(nullif(owner_alert_timezone::text,''),'Asia/Kolkata') as tz,
           reporting_history_start_date as history_start
    from public.businesses where id = p_business_id
  ),
  bounds as (
    select p_start_date as first_date, p_end_date as last_date, tz, history_start
    from tenant
  ),
  contact_metrics as (
    select (c.created_at at time zone b.tz)::date as day,
           'new_contacts'::text as metric, 'leads'::text as dimension, count(*)::numeric as value
    from public.contacts c cross join bounds b
    where c.business_id = p_business_id
      and c.created_at >= (b.first_date::timestamp at time zone b.tz)
      and c.created_at < ((b.last_date + 1)::timestamp at time zone b.tz)
    group by 1
  ),
  message_metrics as (
    select (m.created_at at time zone b.tz)::date as day,
      case when m.role = 'user' then 'messages_in' else 'messages_out' end as metric,
      case when m.role = 'user' then 'customer'
        when m.source = 'ai' then 'ai'
        when m.source = 'business_app' then 'phone_app'
        when m.source = 'automation' then 'automation'
        when m.source = 'dashboard' then 'team'
        else 'team' end as dimension,
      count(*)::numeric as value
    from public.messages m
    join public.conversations c on c.id = m.conversation_id and c.business_id = p_business_id
    cross join bounds b
    where m.created_at >= (b.first_date::timestamp at time zone b.tz)
      and m.created_at < ((b.last_date + 1)::timestamp at time zone b.tz)
    group by 1,2,3
  ),
  payment_metrics as (
    select (e.created_at at time zone b.tz)::date as day,
      case e.event_type
        when 'payment_pending' then 'payments_pending'
        when 'payment_verified' then 'payments_verified'
        when 'payment_rejected' then 'payments_rejected'
      end::text as metric,
      'payments'::text as dimension,
      count(*)::numeric as value
    from public.activity_events e cross join bounds b
    where e.business_id = p_business_id
      and e.event_type in ('payment_pending','payment_verified','payment_rejected')
      and e.created_at >= (greatest(b.first_date,b.history_start)::timestamp at time zone b.tz)
      and e.created_at < ((b.last_date + 1)::timestamp at time zone b.tz)
    group by 1,2
  ),
  sales_metrics as (
    select (e.created_at at time zone b.tz)::date as day,
      'sales_inr'::text as metric, 'verified_payments'::text as dimension,
      coalesce(sum(case when coalesce(e.details->>'amount','') ~ '^\d+(\.\d+)?$'
        then (e.details->>'amount')::numeric else 0 end),0)::numeric as value
    from public.activity_events e cross join bounds b
    where e.business_id = p_business_id and e.event_type = 'payment_verified'
      and e.created_at >= (greatest(b.first_date,b.history_start)::timestamp at time zone b.tz)
      and e.created_at < ((b.last_date + 1)::timestamp at time zone b.tz)
    group by 1
  ),
  campaign_metrics as (
    select (event_time at time zone b.tz)::date as day,
      'campaign_' || event_status as metric, 'campaigns'::text as dimension,
      count(*)::numeric as value
    from public.campaign_recipients r cross join bounds b
    cross join lateral (values
      ('sent', r.sent_at), ('delivered', r.delivered_at), ('read', r.read_at),
      ('replied', r.replied_at), ('paid', r.paid_at)
    ) status_event(event_status,event_time)
    where r.business_id = p_business_id and event_time is not null
      and event_time >= (b.first_date::timestamp at time zone b.tz)
      and event_time < ((b.last_date + 1)::timestamp at time zone b.tz)
    group by 1,2
  ),
  automation_metrics as (
    select (r.updated_at at time zone b.tz)::date as day,
      'automation_' || r.status as metric, 'automations'::text as dimension,
      count(*)::numeric as value
    from public.automation_runs r cross join bounds b
    where r.business_id = p_business_id and r.status in ('sent','skipped')
      and r.updated_at >= (b.first_date::timestamp at time zone b.tz)
      and r.updated_at < ((b.last_date + 1)::timestamp at time zone b.tz)
    group by 1,2
  ),
  handoff_rows as (
    select a.id, a.created_at, a.resolved_at,
      (a.created_at at time zone b.tz)::date as day,
      extract(epoch from (first_reply.reply_at - a.created_at)) / 60.0 as response_minutes
    from public.owner_alerts a cross join bounds b
    left join lateral (
      select min(m.created_at) as reply_at
      from public.messages m
      where m.conversation_id = a.conversation_id and m.role = 'assistant'
        and m.source in ('dashboard','business_app') and m.created_at >= a.created_at
    ) first_reply on true
    where a.business_id = p_business_id and a.alert_type = 'handoff'
      and ((a.created_at >= (b.first_date::timestamp at time zone b.tz)
            and a.created_at < ((b.last_date + 1)::timestamp at time zone b.tz))
        or (a.resolved_at >= (b.first_date::timestamp at time zone b.tz)
            and a.resolved_at < ((b.last_date + 1)::timestamp at time zone b.tz)))
  ),
  handoff_counts as (
    select day, 'handoffs_raised'::text as metric, 'handoff'::text as dimension, count(*)::numeric as value
    from handoff_rows cross join bounds b
    where created_at >= (b.first_date::timestamp at time zone b.tz)
      and created_at < ((b.last_date + 1)::timestamp at time zone b.tz)
    group by day
    union all
    select (resolved_at at time zone (select tz from bounds))::date,
      'handoffs_resolved', 'handoff', count(*)::numeric
    from handoff_rows cross join bounds b
    where resolved_at >= (b.first_date::timestamp at time zone b.tz)
      and resolved_at < ((b.last_date + 1)::timestamp at time zone b.tz)
    group by 1
  ),
  handoff_medians as (
    select day, 'handoff_response_median_minutes'::text as metric,
      'team_first_reply'::text as dimension,
      percentile_cont(0.5) within group (order by response_minutes)::numeric as value
    from handoff_rows cross join bounds b
    where response_minutes is not null
      and created_at >= (b.first_date::timestamp at time zone b.tz)
      and created_at < ((b.last_date + 1)::timestamp at time zone b.tz)
    group by day
  ),
  rows as (
    select * from contact_metrics union all select * from message_metrics
    union all select * from payment_metrics union all select * from sales_metrics
    union all select * from campaign_metrics union all select * from automation_metrics
    union all select * from handoff_counts union all select * from handoff_medians
  ),
  totals as (
    select metric, dimension,
      case when metric = 'handoff_response_median_minutes'
        then (select percentile_cont(0.5) within group (order by response_minutes)::numeric
              from handoff_rows cross join bounds b
              where response_minutes is not null
                and created_at >= (b.first_date::timestamp at time zone b.tz)
                and created_at < ((b.last_date + 1)::timestamp at time zone b.tz))
        else sum(value) end as total
    from rows group by metric,dimension
  )
  select r.day, r.metric, r.dimension, r.value, t.total
  from rows r join totals t using (metric,dimension)
  order by r.day, r.metric, r.dimension;
$$;

revoke all on function public.update_team_profile(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.get_business_report_series(uuid,date,date) from public, anon, authenticated;
grant execute on function public.update_team_profile(uuid,uuid,text,text) to service_role;
grant execute on function public.get_business_report_series(uuid,date,date) to service_role;

select * from public.get_business_report_series(gen_random_uuid(), current_date, current_date) limit 0;
select count(*) as profile_auth_id_mismatches
from public.profiles p left join auth.users u on u.id = p.id
where u.id is null;

-- ===== END MIGRATION: 20261109_reports_team.sql =====

-- ===== BEGIN MIGRATION: 20261109_tenant_realtime_rls.sql =====
-- Keep direct Supabase reads and Realtime events inside each signed-in
-- user's business. The application API uses the service role and continues
-- to enforce business ownership through requireBusinessAccess().
-- Safe to re-run.

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "profile_read_authenticated" on public.profiles;
drop policy if exists "profile_read_self" on public.profiles;
create policy "profile_read_authenticated"
  on public.profiles as permissive for select to authenticated
  using (true);
create policy "profile_read_self"
  on public.profiles as restrictive for select to public
  using (id = (select auth.uid()));

drop policy if exists "conversation_read_authenticated" on public.conversations;
drop policy if exists "conversation_read_own_business" on public.conversations;
create policy "conversation_read_authenticated"
  on public.conversations as permissive for select to authenticated
  using (true);
create policy "conversation_read_own_business"
  on public.conversations as restrictive for select to public
  using (
    business_id = (
      select p.business_id
      from public.profiles p
      where p.id = (select auth.uid())
    )
  );

drop policy if exists "message_read_authenticated" on public.messages;
drop policy if exists "message_read_own_business" on public.messages;
create policy "message_read_authenticated"
  on public.messages as permissive for select to authenticated
  using (true);
create policy "message_read_own_business"
  on public.messages as restrictive for select to public
  using (
    exists (
      select 1
      from public.conversations c
      join public.profiles p on p.business_id = c.business_id
      where c.id = messages.conversation_id
        and p.id = (select auth.uid())
    )
  );

-- Deliberately no client policies for businesses: its rows include WhatsApp
-- access tokens. Server routes use the service role and return safe fields.
drop policy if exists "businesses_deny_browser_reads" on public.businesses;
create policy "businesses_deny_browser_reads"
  on public.businesses as restrictive for select to public
  using (false);

-- ===== END MIGRATION: 20261109_tenant_realtime_rls.sql =====
