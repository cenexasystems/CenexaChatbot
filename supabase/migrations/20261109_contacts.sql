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
