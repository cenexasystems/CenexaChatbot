create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null, template_id uuid not null references public.message_templates(id), audience jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','scheduled','sending','paused','completed','cancelled')),
  estimate jsonb not null default '{}'::jsonb, totals jsonb not null default '{}'::jsonb,
  creator_id uuid, scheduled_at timestamptz, started_at timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id), phone text not null, variables jsonb not null default '[]'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','sent','delivered','read','replied','paid','failed','skipped')),
  skip_reason text, meta_message_id text unique, error_code text, sent_at timestamptz, delivered_at timestamptz,
  read_at timestamptz, replied_at timestamptz, paid_at timestamptz, attempts integer not null default 0,
  locked_at timestamptz, next_attempt_at timestamptz not null default now(), created_at timestamptz not null default now(),
  unique (campaign_id, contact_id)
);
create table if not exists public.campaign_pricing (
  country_code text not null, category text not null check (category in ('UTILITY','MARKETING','AUTHENTICATION')),
  rate_inr numeric(12,6) not null check (rate_inr >= 0), cenexa_fee_inr numeric(12,6) not null default 0 check (cenexa_fee_inr >= 0),
  as_of date not null, primary key (country_code, category)
);
create table if not exists public.campaign_daily_usage (
  business_id uuid not null references public.businesses(id) on delete cascade, usage_date date not null,
  sent_count integer not null default 0, primary key (business_id, usage_date)
);
create or replace function public.consume_campaign_daily_slot(p_business_id uuid, p_usage_date date, p_cap integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed integer;
begin
  insert into public.campaign_daily_usage (business_id, usage_date, sent_count)
  values (p_business_id, p_usage_date, 1)
  on conflict (business_id, usage_date) do update
    set sent_count = campaign_daily_usage.sent_count + 1
    where campaign_daily_usage.sent_count < p_cap
  returning 1 into claimed;
  return claimed = 1;
end;
$$;
alter table public.businesses add column if not exists campaign_sending_paused boolean not null default false;
alter table public.businesses add column if not exists campaign_daily_send_cap integer not null default 500;

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  rule_type text not null check (rule_type in ('follow_up','payment_reminder','review_request','dated_reminder')),
  enabled boolean not null default false, config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (business_id, rule_type)
);
create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  trigger_event_key text not null, run_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued','processing','sent','skipped','cancelled','failed')),
  reason text, attempts integer not null default 0, meta_message_id text, locked_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (automation_id, trigger_event_key)
);
create table if not exists public.automation_daily_usage (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  usage_date date not null,
  created_at timestamptz not null default now(),
  primary key (contact_id, usage_date)
);

alter table public.messages drop constraint if exists messages_source_check;
alter table public.messages add constraint messages_source_check check (source in ('customer','ai','dashboard','business_app','history','automation') or source is null);
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.campaign_pricing enable row level security;
alter table public.campaign_daily_usage enable row level security;
alter table public.automations enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_daily_usage enable row level security;
create index if not exists idx_campaigns_business_status on public.campaigns (business_id,status,created_at desc);
create index if not exists idx_campaign_queue on public.campaign_recipients (next_attempt_at,created_at) where status in ('queued','processing');
create index if not exists idx_campaign_recipients_message on public.campaign_recipients (meta_message_id) where meta_message_id is not null;
create index if not exists idx_automation_runs_due on public.automation_runs (run_at,created_at) where status in ('queued','processing');
create index if not exists idx_automation_runs_contact_day on public.automation_runs (contact_id,created_at) where status='sent';

create or replace function public.claim_campaign_recipients(p_limit integer default 25)
returns setof public.campaign_recipients language sql security definer set search_path = public as $$
  with candidates as (
    select id from public.campaign_recipients
    where (status='queued' and next_attempt_at <= now()) or (status='processing' and locked_at < now() - interval '10 minutes')
    order by next_attempt_at, created_at for update skip locked limit greatest(1,least(p_limit,100))
  )
  update public.campaign_recipients r set status='processing', locked_at=now(), attempts=r.attempts+1
  from candidates c where r.id=c.id returning r.*;
$$;
create or replace function public.claim_automation_runs(p_limit integer default 25)
returns setof public.automation_runs language sql security definer set search_path = public as $$
  with candidates as (
    select id from public.automation_runs
    where (status='queued' and run_at <= now()) or (status='processing' and locked_at < now() - interval '10 minutes')
    order by run_at,created_at for update skip locked limit greatest(1,least(p_limit,100))
  )
  update public.automation_runs r set status='processing', locked_at=now(), attempts=r.attempts+1
  from candidates c where r.id=c.id returning r.*;
$$;
create or replace function public.consume_automation_daily_slot(p_contact_id uuid, p_usage_date date)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.automation_daily_usage (contact_id, usage_date)
  values (p_contact_id, p_usage_date)
  on conflict (contact_id, usage_date) do nothing;
  return found;
end;
$$;
revoke all on function public.claim_campaign_recipients(integer) from public, anon, authenticated;
revoke all on function public.claim_automation_runs(integer) from public, anon, authenticated;
revoke all on function public.consume_campaign_daily_slot(uuid,date,integer) from public, anon, authenticated;
revoke all on function public.consume_automation_daily_slot(uuid,date) from public, anon, authenticated;
grant execute on function public.claim_campaign_recipients(integer) to service_role;
grant execute on function public.claim_automation_runs(integer) to service_role;
grant execute on function public.consume_campaign_daily_slot(uuid,date,integer) to service_role;
grant execute on function public.consume_automation_daily_slot(uuid,date) to service_role;

select id, status from public.campaigns limit 0;
select id, status from public.automation_runs limit 0;
