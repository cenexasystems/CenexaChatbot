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
