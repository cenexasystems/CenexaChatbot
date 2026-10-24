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
  vision_model text
);

create index if not exists idx_businesses_waba_id on businesses(waba_id) where waba_id is not null;

-- 2. Profiles Table
create table if not exists profiles (
  id uuid default gen_random_uuid() primary key,
  business_id uuid references businesses(id) on delete cascade not null,
  name text,
  role text default 'admin' check (role in ('admin', 'support', 'sales', 'accounts')),
  created_at timestamptz default now()
);

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
  source text check (source in ('customer', 'ai', 'dashboard', 'business_app', 'history') or source is null),
  transcript text,
  media_analysis jsonb
);

create index if not exists idx_messages_conversation on messages(conversation_id);
create index if not exists idx_messages_created_at on messages(created_at desc);

-- 5. Enable Realtime Publications
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;
