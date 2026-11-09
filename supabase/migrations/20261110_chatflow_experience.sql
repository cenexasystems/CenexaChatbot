-- Faster inbox summaries and tenant-scoped assistant knowledge files.

create index if not exists idx_messages_conversation_created_latest
  on public.messages (conversation_id, created_at desc);
create index if not exists idx_messages_conversation_customer_created_latest
  on public.messages (conversation_id, created_at desc) where role = 'user';

create or replace function public.get_business_conversation_summaries(p_business_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      to_jsonb(c) || jsonb_build_object(
        'last_message', latest.content,
        'last_message_type', latest.media_type,
        'last_message_role', latest.role,
        'last_message_source', latest.source,
        'last_inbound_at', inbound.created_at
      ) order by c.updated_at desc
    ),
    '[]'::jsonb
  )
  from public.conversations c
  left join lateral (
    select m.content, m.media_type, m.role, m.source
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) latest on true
  left join lateral (
    select m.created_at
    from public.messages m
    where m.conversation_id = c.id and m.role = 'user'
    order by m.created_at desc
    limit 1
  ) inbound on true
  where c.business_id = p_business_id;
$$;
revoke all on function public.get_business_conversation_summaries(uuid) from public, anon, authenticated;
grant execute on function public.get_business_conversation_summaries(uuid) to service_role;

create table if not exists public.assistant_knowledge_files (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  chunk_count integer not null default 0 check (chunk_count >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.assistant_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  file_id uuid not null references public.assistant_knowledge_files(id) on delete cascade,
  file_name text not null,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null,
  search_terms text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (file_id, chunk_index)
);

create index if not exists idx_assistant_knowledge_files_business
  on public.assistant_knowledge_files (business_id, created_at desc);
create index if not exists idx_assistant_knowledge_chunks_business_terms
  on public.assistant_knowledge_chunks using gin (search_terms);
create index if not exists idx_assistant_knowledge_chunks_business_file
  on public.assistant_knowledge_chunks (business_id, file_id);

alter table public.assistant_knowledge_files enable row level security;
alter table public.assistant_knowledge_chunks enable row level security;

-- No browser policies: tenant access is enforced by server routes using service_role.
select c.relname, c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policy_count
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('assistant_knowledge_files','assistant_knowledge_chunks')
order by c.relname;
