-- Enable the new dashboard one business at a time after customer acceptance.
-- Existing businesses remain on the classic dashboard until explicitly enabled.
alter table public.businesses
  add column if not exists dashboard_v2_enabled boolean not null default false;

comment on column public.businesses.dashboard_v2_enabled is
  'Redirects this business from / to /today; keep false until the business has accepted the new dashboard.';
