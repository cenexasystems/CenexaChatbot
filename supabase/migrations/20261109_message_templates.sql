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
