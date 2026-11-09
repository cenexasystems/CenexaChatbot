-- Destructive rollback: removes all uploaded assistant knowledge files.
drop function if exists public.get_business_conversation_summaries(uuid);
drop index if exists public.idx_messages_conversation_created_latest;
drop index if exists public.idx_messages_conversation_customer_created_latest;
drop index if exists public.idx_assistant_knowledge_chunks_business_terms;
drop index if exists public.idx_assistant_knowledge_chunks_business_file;
drop index if exists public.idx_assistant_knowledge_files_business;
drop table if exists public.assistant_knowledge_chunks;
drop table if exists public.assistant_knowledge_files;
