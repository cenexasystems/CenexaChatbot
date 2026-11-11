-- Keep inbox summary reads efficient as tenants accumulate conversations.
-- The lateral latest-message lookups are covered by the existing
-- idx_messages_conversation_created_latest indexes in the prior migration.
create index if not exists idx_conversations_business_updated_latest
  on public.conversations (business_id, updated_at desc);
