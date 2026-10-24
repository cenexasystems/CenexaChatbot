-- ============================================================
-- Cenexa ChatFlow: Seed Staging Test Business
-- File: supabase/seed-staging-test-business.sql
--
-- Run this in your Staging Supabase project after creating the schema.
-- Replace the placeholders with your test WhatsApp credentials.
-- ============================================================

insert into businesses (
  id,
  name,
  phone_number_id,
  whatsapp_number,
  access_token,
  ai_model,
  system_prompt,
  welcome_message,
  is_active,
  coexistence_enabled,
  media_ai_enabled,
  handoff_minutes
) values (
  '11111111-2222-3333-4444-555555555555',
  'Cenexa Staging Test Store',
  'REPLACE_WITH_TEST_PHONE_NUMBER_ID',     -- e.g. from Meta App > WhatsApp > API Setup
  '+91XXXXXXXXXX',                         -- Your test WhatsApp phone number
  'REPLACE_WITH_WHATSAPP_ACCESS_TOKEN',    -- Permanent access token
  'openai/gpt-4o-mini',
  'You are a friendly AI assistant for Cenexa Staging Test Store. Answer customer questions about products, pricing, and services. Keep answers concise and helpful.',
  'Hello! 👋 Welcome to Cenexa Staging Test Store. How can I help you today?',
  true,
  true,                                    -- coexistence_enabled: ON for testing
  true,                                    -- media_ai_enabled: ON for testing
  60                                       -- handoff_minutes: owner reply pauses AI for 60m
) on conflict (id) do nothing;
