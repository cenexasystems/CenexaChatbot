create table if not exists public.google_sheets_integrations (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  google_email text,
  refresh_token_ciphertext text not null,
  spreadsheet_id text,
  worksheet_title text not null default 'Cenexa Contacts',
  sync_enabled boolean not null default false,
  last_synced_at timestamptz,
  last_error text,
  sync_locked_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.google_sheets_integrations enable row level security;
revoke all on public.google_sheets_integrations from anon, authenticated;
comment on table public.google_sheets_integrations is 'Encrypted Google OAuth refresh tokens and tenant-owned Sheets sync settings; accessed only by server routes.';

create or replace function public.claim_google_sheets_syncs(p_limit integer default 5)
returns setof public.google_sheets_integrations
language sql
security definer
set search_path = public, pg_temp
as $$
  with due as (
    select i.business_id
    from public.google_sheets_integrations i
    where i.sync_enabled = true
      and i.spreadsheet_id is not null
      and exists (
        select 1 from public.businesses b
        where b.id = i.business_id
          and b.modules_enabled ->> 'integrations' = 'true'
      )
      and (i.sync_locked_at is null or i.sync_locked_at < now() - interval '15 minutes')
      and (i.last_synced_at is null or i.last_synced_at < now() - interval '5 minutes')
    order by i.last_synced_at nulls first
    limit least(greatest(coalesce(p_limit, 5), 1), 20)
    for update skip locked
  )
  update public.google_sheets_integrations i
    set sync_locked_at = now(), updated_at = now()
    from due
    where i.business_id = due.business_id
    returning i.*;
$$;
revoke all on function public.claim_google_sheets_syncs(integer) from public, anon, authenticated;
grant execute on function public.claim_google_sheets_syncs(integer) to service_role;
