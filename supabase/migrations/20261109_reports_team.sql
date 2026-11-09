-- Phase 5: tenant-scoped reports. Phase 6: tenant team, strict roles, and assignments.
do $$ begin
  if to_regclass('public.contacts') is null or to_regclass('public.activity_events') is null
      or to_regclass('public.campaign_recipients') is null or to_regclass('public.automation_runs') is null
      or to_regclass('public.owner_alerts') is null then
    raise exception 'Apply contacts and campaign/automation migrations before reports/team';
  end if;
end $$;

do $$ begin
  if exists (
    select 1 from public.profiles p left join auth.users u on u.id = p.id
    where u.id is null
  ) then
    raise exception 'Profiles contains IDs without matching Supabase Auth users; resolve profile_auth_id_mismatches before applying Phase 6';
  end if;
end $$;

alter table public.businesses
  add column if not exists reporting_history_start_date date not null default current_date,
  add column if not exists strict_roles boolean not null default false;

alter table public.profiles
  add column if not exists email text,
  add column if not exists status text not null default 'active',
  add column if not exists invited_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Realtime and direct browser reads must stop immediately for a disabled profile.
drop policy if exists "profile_read_self" on public.profiles;
create policy "profile_read_self" on public.profiles as restrictive for select to public
  using (id = (select auth.uid()) and status = 'active');
drop policy if exists "conversation_read_own_business" on public.conversations;
create policy "conversation_read_own_business" on public.conversations as restrictive for select to public
  using (business_id = (select p.business_id from public.profiles p where p.id = (select auth.uid()) and p.status = 'active'));
drop policy if exists "message_read_own_business" on public.messages;
create policy "message_read_own_business" on public.messages as restrictive for select to public
  using (exists (
    select 1 from public.conversations c join public.profiles p on p.business_id = c.business_id
    where c.id = messages.conversation_id and p.id = (select auth.uid()) and p.status = 'active'
  ));

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null and u.email is not null;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_status_check
      check (status in ('invited','active','disabled'));
  end if;
end $$;

create unique index if not exists idx_profiles_email_lower_unique
  on public.profiles (lower(email)) where email is not null;
create index if not exists idx_profiles_business_status_role
  on public.profiles (business_id,status,role);
create index if not exists idx_conversations_business_assigned
  on public.conversations (business_id,assigned_to);
create index if not exists idx_owner_alerts_handoff_report
  on public.owner_alerts (business_id,created_at,resolved_at)
  where alert_type = 'handoff';
create index if not exists idx_campaign_recipients_business_sent
  on public.campaign_recipients (business_id,sent_at) where sent_at is not null;
create index if not exists idx_campaign_recipients_business_delivered
  on public.campaign_recipients (business_id,delivered_at) where delivered_at is not null;
create index if not exists idx_campaign_recipients_business_read
  on public.campaign_recipients (business_id,read_at) where read_at is not null;
create index if not exists idx_campaign_recipients_business_replied
  on public.campaign_recipients (business_id,replied_at) where replied_at is not null;
create index if not exists idx_campaign_recipients_business_paid
  on public.campaign_recipients (business_id,paid_at) where paid_at is not null;
create index if not exists idx_automation_runs_business_status_updated
  on public.automation_runs (business_id,status,updated_at);

create or replace function public.update_team_profile(
  p_business_id uuid,
  p_target_id uuid,
  p_role text,
  p_status text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing_role text;
  existing_status text;
  active_admins integer;
begin
  if p_role not in ('admin','support','sales','accounts') then
    raise exception 'Invalid team role' using errcode = '22023';
  end if;
  if p_status not in ('invited','active','disabled') then
    raise exception 'Invalid team status' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_business_id::text));
  select role, status into existing_role, existing_status
  from public.profiles
  where id = p_target_id and business_id = p_business_id
  for update;
  if not found then return false; end if;

  if existing_role = 'admin' and existing_status = 'active'
      and (p_role <> 'admin' or p_status <> 'active') then
    select count(*) into active_admins
    from public.profiles
    where business_id = p_business_id and role = 'admin' and status = 'active'
      and id <> p_target_id;
    if active_admins = 0 then
      raise exception 'A business must keep at least one active admin' using errcode = 'P0001';
    end if;
  end if;

  update public.profiles
  set role = p_role,
      status = p_status,
      updated_at = now()
  where id = p_target_id and business_id = p_business_id;
  return true;
end;
$$;

-- Aggregate all report series in the database using the tenant reporting timezone.
create or replace function public.get_business_report_series(
  p_business_id uuid,
  p_start_date date,
  p_end_date date
) returns table (
  report_date date,
  metric text,
  dimension text,
  value numeric,
  period_total numeric
)
language sql stable security definer set search_path = public, pg_temp as $$
  with tenant as (
    select coalesce(nullif(owner_alert_timezone::text,''),'Asia/Kolkata') as tz,
           reporting_history_start_date as history_start
    from public.businesses where id = p_business_id
  ),
  bounds as (
    select p_start_date as first_date, p_end_date as last_date, tz, history_start
    from tenant
  ),
  contact_metrics as (
    select (c.created_at at time zone b.tz)::date as day,
           'new_contacts'::text as metric, 'leads'::text as dimension, count(*)::numeric as value
    from public.contacts c cross join bounds b
    where c.business_id = p_business_id
      and c.created_at >= (b.first_date::timestamp at time zone b.tz)
      and c.created_at < ((b.last_date + 1)::timestamp at time zone b.tz)
    group by 1
  ),
  message_metrics as (
    select (m.created_at at time zone b.tz)::date as day,
      case when m.role = 'user' then 'messages_in' else 'messages_out' end as metric,
      case when m.role = 'user' then 'customer'
        when m.source = 'ai' then 'ai'
        when m.source = 'business_app' then 'phone_app'
        when m.source = 'automation' then 'automation'
        when m.source = 'dashboard' then 'team'
        else 'team' end as dimension,
      count(*)::numeric as value
    from public.messages m
    join public.conversations c on c.id = m.conversation_id and c.business_id = p_business_id
    cross join bounds b
    where m.created_at >= (b.first_date::timestamp at time zone b.tz)
      and m.created_at < ((b.last_date + 1)::timestamp at time zone b.tz)
    group by 1,2,3
  ),
  payment_metrics as (
    select (e.created_at at time zone b.tz)::date as day,
      case e.event_type
        when 'payment_pending' then 'payments_pending'
        when 'payment_verified' then 'payments_verified'
        when 'payment_rejected' then 'payments_rejected'
      end::text as metric,
      'payments'::text as dimension,
      count(*)::numeric as value
    from public.activity_events e cross join bounds b
    where e.business_id = p_business_id
      and e.event_type in ('payment_pending','payment_verified','payment_rejected')
      and e.created_at >= (greatest(b.first_date,b.history_start)::timestamp at time zone b.tz)
      and e.created_at < ((b.last_date + 1)::timestamp at time zone b.tz)
    group by 1,2
  ),
  sales_metrics as (
    select (e.created_at at time zone b.tz)::date as day,
      'sales_inr'::text as metric, 'verified_payments'::text as dimension,
      coalesce(sum(case when coalesce(e.details->>'amount','') ~ '^\d+(\.\d+)?$'
        then (e.details->>'amount')::numeric else 0 end),0)::numeric as value
    from public.activity_events e cross join bounds b
    where e.business_id = p_business_id and e.event_type = 'payment_verified'
      and e.created_at >= (greatest(b.first_date,b.history_start)::timestamp at time zone b.tz)
      and e.created_at < ((b.last_date + 1)::timestamp at time zone b.tz)
    group by 1
  ),
  campaign_metrics as (
    select (event_time at time zone b.tz)::date as day,
      'campaign_' || event_status as metric, 'campaigns'::text as dimension,
      count(*)::numeric as value
    from public.campaign_recipients r cross join bounds b
    cross join lateral (values
      ('sent', r.sent_at), ('delivered', r.delivered_at), ('read', r.read_at),
      ('replied', r.replied_at), ('paid', r.paid_at)
    ) status_event(event_status,event_time)
    where r.business_id = p_business_id and event_time is not null
      and event_time >= (b.first_date::timestamp at time zone b.tz)
      and event_time < ((b.last_date + 1)::timestamp at time zone b.tz)
    group by 1,2
  ),
  automation_metrics as (
    select (r.updated_at at time zone b.tz)::date as day,
      'automation_' || r.status as metric, 'automations'::text as dimension,
      count(*)::numeric as value
    from public.automation_runs r cross join bounds b
    where r.business_id = p_business_id and r.status in ('sent','skipped')
      and r.updated_at >= (b.first_date::timestamp at time zone b.tz)
      and r.updated_at < ((b.last_date + 1)::timestamp at time zone b.tz)
    group by 1,2
  ),
  handoff_rows as (
    select a.id, a.created_at, a.resolved_at,
      (a.created_at at time zone b.tz)::date as day,
      extract(epoch from (first_reply.reply_at - a.created_at)) / 60.0 as response_minutes
    from public.owner_alerts a cross join bounds b
    left join lateral (
      select min(m.created_at) as reply_at
      from public.messages m
      where m.conversation_id = a.conversation_id and m.role = 'assistant'
        and m.source in ('dashboard','business_app') and m.created_at >= a.created_at
    ) first_reply on true
    where a.business_id = p_business_id and a.alert_type = 'handoff'
      and ((a.created_at >= (b.first_date::timestamp at time zone b.tz)
            and a.created_at < ((b.last_date + 1)::timestamp at time zone b.tz))
        or (a.resolved_at >= (b.first_date::timestamp at time zone b.tz)
            and a.resolved_at < ((b.last_date + 1)::timestamp at time zone b.tz)))
  ),
  handoff_counts as (
    select day, 'handoffs_raised'::text as metric, 'handoff'::text as dimension, count(*)::numeric as value
    from handoff_rows cross join bounds b
    where created_at >= (b.first_date::timestamp at time zone b.tz)
      and created_at < ((b.last_date + 1)::timestamp at time zone b.tz)
    group by day
    union all
    select (resolved_at at time zone (select tz from bounds))::date,
      'handoffs_resolved', 'handoff', count(*)::numeric
    from handoff_rows cross join bounds b
    where resolved_at >= (b.first_date::timestamp at time zone b.tz)
      and resolved_at < ((b.last_date + 1)::timestamp at time zone b.tz)
    group by 1
  ),
  handoff_medians as (
    select day, 'handoff_response_median_minutes'::text as metric,
      'team_first_reply'::text as dimension,
      percentile_cont(0.5) within group (order by response_minutes)::numeric as value
    from handoff_rows cross join bounds b
    where response_minutes is not null
      and created_at >= (b.first_date::timestamp at time zone b.tz)
      and created_at < ((b.last_date + 1)::timestamp at time zone b.tz)
    group by day
  ),
  rows as (
    select * from contact_metrics union all select * from message_metrics
    union all select * from payment_metrics union all select * from sales_metrics
    union all select * from campaign_metrics union all select * from automation_metrics
    union all select * from handoff_counts union all select * from handoff_medians
  ),
  totals as (
    select metric, dimension,
      case when metric = 'handoff_response_median_minutes'
        then (select percentile_cont(0.5) within group (order by response_minutes)::numeric
              from handoff_rows cross join bounds b
              where response_minutes is not null
                and created_at >= (b.first_date::timestamp at time zone b.tz)
                and created_at < ((b.last_date + 1)::timestamp at time zone b.tz))
        else sum(value) end as total
    from rows group by metric,dimension
  )
  select r.day, r.metric, r.dimension, r.value, t.total
  from rows r join totals t using (metric,dimension)
  order by r.day, r.metric, r.dimension;
$$;

revoke all on function public.update_team_profile(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.get_business_report_series(uuid,date,date) from public, anon, authenticated;
grant execute on function public.update_team_profile(uuid,uuid,text,text) to service_role;
grant execute on function public.get_business_report_series(uuid,date,date) to service_role;

select * from public.get_business_report_series(gen_random_uuid(), current_date, current_date) limit 0;
select count(*) as profile_auth_id_mismatches
from public.profiles p left join auth.users u on u.id = p.id
where u.id is null;
