-- Per-business switches for the planned product modules. All remain off until
-- explicitly enabled for a tenant. Safe to re-run.
alter table public.businesses
  add column if not exists modules_enabled jsonb not null default '{}'::jsonb;

comment on column public.businesses.modules_enabled is
  'Per-business feature switches; missing keys and false values mean disabled.';

-- Verification: this should return one row with {} (or the tenant's current flags).
select id, modules_enabled from public.businesses order by created_at limit 5;
