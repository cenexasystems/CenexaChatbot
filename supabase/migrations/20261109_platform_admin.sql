-- Platform control plane, separated from tenant profiles.
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','support','read_only')),
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.platform_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id),
  action text not null,
  tenant_id uuid references public.businesses(id) on delete set null,
  before_values jsonb not null default '{}'::jsonb,
  after_values jsonb not null default '{}'::jsonb,
  reason text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.cron_runs (
  job text primary key,
  last_started_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
create table if not exists public.tenant_usage_daily (
  business_id uuid not null references public.businesses(id) on delete cascade,
  usage_date date not null,
  inbound_messages integer not null default 0,
  ai_calls integer not null default 0,
  ai_replies integer not null default 0,
  team_replies integer not null default 0,
  media_ai_analyses integer not null default 0,
  template_sends integer not null default 0,
  campaign_sends integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (business_id, usage_date)
);

alter table public.platform_admins enable row level security;
alter table public.platform_audit_log enable row level security;
alter table public.cron_runs enable row level security;
alter table public.tenant_usage_daily enable row level security;
alter table public.tenant_usage_daily add column if not exists ai_calls integer not null default 0;
alter table public.businesses add column if not exists platform_suspended boolean not null default false;
alter table public.messages drop constraint if exists messages_source_check;
alter table public.messages add constraint messages_source_check check (source in ('customer','ai','dashboard','business_app','history','automation','template') or source is null);

create or replace function public.reject_platform_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'platform_audit_log is append-only' using errcode = '42501';
end;
$$;
drop trigger if exists platform_audit_log_no_update on public.platform_audit_log;
create trigger platform_audit_log_no_update before update or delete on public.platform_audit_log
for each row execute function public.reject_platform_audit_mutation();

create or replace function public.platform_update_tenant(
  p_tenant_id uuid, p_updates jsonb, p_actor_id uuid, p_reason text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare old_row public.businesses%rowtype; new_row public.businesses%rowtype;
begin
  if length(trim(coalesce(p_reason,''))) < 8 then raise exception 'A change reason is required'; end if;
  select * into old_row from public.businesses where id=p_tenant_id for update;
  if not found then return null; end if;
  update public.businesses set
    modules_enabled = case when p_updates ? 'modules_enabled' then p_updates->'modules_enabled' else modules_enabled end,
    platform_suspended = case when p_updates ? 'platform_suspended' then (p_updates->>'platform_suspended')::boolean else platform_suspended end,
    plan = case when p_updates ? 'plan' then p_updates->>'plan' else plan end,
    coexistence_enabled = case when p_updates ? 'coexistence_enabled' then (p_updates->>'coexistence_enabled')::boolean else coexistence_enabled end,
    media_ai_enabled = case when p_updates ? 'media_ai_enabled' then (p_updates->>'media_ai_enabled')::boolean else media_ai_enabled end,
    dashboard_v2_enabled = case when p_updates ? 'dashboard_v2_enabled' then (p_updates->>'dashboard_v2_enabled')::boolean else dashboard_v2_enabled end,
    handoff_minutes = case when p_updates ? 'handoff_minutes' then (p_updates->>'handoff_minutes')::integer else handoff_minutes end,
    ai_model = case when p_updates ? 'ai_model' then p_updates->>'ai_model' else ai_model end,
    vision_model = case when p_updates ? 'vision_model' then p_updates->>'vision_model' else vision_model end,
    campaign_sending_paused = case when p_updates ? 'campaign_sending_paused' then (p_updates->>'campaign_sending_paused')::boolean else campaign_sending_paused end,
    campaign_daily_send_cap = case when p_updates ? 'campaign_daily_send_cap' then (p_updates->>'campaign_daily_send_cap')::integer else campaign_daily_send_cap end
  where id=p_tenant_id returning * into new_row;
  insert into public.platform_audit_log(actor_id,tenant_id,action,before_values,after_values,reason)
  values(p_actor_id,p_tenant_id,'tenant_settings_updated',
    to_jsonb(old_row) - array['access_token','openrouter_api_key','system_prompt','welcome_message'],
    to_jsonb(new_row) - array['access_token','openrouter_api_key','system_prompt','welcome_message'],trim(p_reason));
  return jsonb_build_object('id',new_row.id,'name',new_row.name,'plan',new_row.plan,'is_active',new_row.is_active,'platform_suspended',new_row.platform_suspended,
    'whatsapp_number',new_row.whatsapp_number,'phone_number_id',new_row.phone_number_id,'onboarding_type',new_row.onboarding_type,'coexistence_enabled',new_row.coexistence_enabled,
    'coexistence_synced_at',new_row.coexistence_synced_at,'disconnected_reason',new_row.disconnected_reason,'created_at',new_row.created_at,'modules_enabled',new_row.modules_enabled,
    'media_ai_enabled',new_row.media_ai_enabled,'dashboard_v2_enabled',new_row.dashboard_v2_enabled,'handoff_minutes',new_row.handoff_minutes,'ai_model',new_row.ai_model,
    'vision_model',new_row.vision_model,'campaign_sending_paused',new_row.campaign_sending_paused,'campaign_daily_send_cap',new_row.campaign_daily_send_cap);
end;
$$;
revoke all on function public.platform_update_tenant(uuid,jsonb,uuid,text) from public, anon, authenticated;
grant execute on function public.platform_update_tenant(uuid,jsonb,uuid,text) to service_role;

create or replace function public.platform_set_admin(
  p_user_id uuid,p_role text,p_disabled boolean,p_actor_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  old_values jsonb;
  row_value public.platform_admins%rowtype;
  old_role text;
  old_disabled boolean;
  owner_count integer;
begin
  if p_role not in ('owner','support','read_only') or length(trim(coalesce(p_reason,''))) < 8 then raise exception 'Valid role and reason are required'; end if;
  perform pg_advisory_xact_lock(hashtext('platform-admin-owner-guard'));
  select role,disabled,jsonb_build_object('role',role,'disabled',disabled) into old_role,old_disabled,old_values from public.platform_admins where user_id=p_user_id for update;
  if old_role='owner' and not old_disabled and (p_role<>'owner' or p_disabled) then
    select count(*) into owner_count from public.platform_admins where role='owner' and disabled=false and user_id<>p_user_id;
    if owner_count=0 then raise exception 'Keep at least one enabled platform owner'; end if;
  end if;
  insert into public.platform_admins(user_id,role,disabled,updated_at) values(p_user_id,p_role,p_disabled,now())
  on conflict(user_id) do update set role=excluded.role,disabled=excluded.disabled,updated_at=now()
  returning * into row_value;
  insert into public.platform_audit_log(actor_id,action,before_values,after_values,reason)
  values(p_actor_id,'platform_admin_updated',coalesce(old_values,'{}'::jsonb),jsonb_build_object('user_id',row_value.user_id,'role',row_value.role,'disabled',row_value.disabled),trim(p_reason));
  return jsonb_build_object('user_id',row_value.user_id,'role',row_value.role,'disabled',row_value.disabled,'created_at',row_value.created_at,'updated_at',row_value.updated_at);
end;
$$;
revoke all on function public.platform_set_admin(uuid,text,boolean,uuid,text) from public, anon, authenticated;
grant execute on function public.platform_set_admin(uuid,text,boolean,uuid,text) to service_role;

create or replace function public.get_platform_tenant_summary()
returns table (business_id uuid, last_customer_message_at timestamptz, messages_30d bigint, open_owner_alerts bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  with message_totals as (
    select c.business_id,
      max(m.created_at) filter (where m.role='user') as last_customer_message_at,
      count(m.id) filter (where m.created_at >= now() - interval '30 days') as messages_30d
    from public.conversations c join public.messages m on m.conversation_id=c.id
    group by c.business_id
  ), alert_totals as (
    select business_id,count(*) as open_owner_alerts from public.owner_alerts
    where resolved_at is null group by business_id
  )
  select b.id,mt.last_customer_message_at,coalesce(mt.messages_30d,0),coalesce(at.open_owner_alerts,0)
  from public.businesses b left join message_totals mt on mt.business_id=b.id
  left join alert_totals at on at.business_id=b.id;
$$;
revoke all on function public.get_platform_tenant_summary() from public, anon, authenticated;
grant execute on function public.get_platform_tenant_summary() to service_role;

create or replace function public.refresh_platform_usage_daily(p_day date)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.tenant_usage_daily (business_id, usage_date, inbound_messages, ai_calls, ai_replies, team_replies, media_ai_analyses, template_sends, campaign_sends, updated_at)
  select b.id, p_day,
    count(m.id) filter (where m.role = 'user')::integer,
    count(m.id) filter (where m.role = 'assistant' and m.source = 'ai')::integer,
    count(m.id) filter (where m.role = 'assistant' and m.source = 'ai')::integer,
    count(m.id) filter (where m.role = 'assistant' and m.source in ('dashboard','business_app'))::integer,
    count(m.id) filter (where m.role = 'user' and m.media_analysis is not null)::integer,
    count(m.id) filter (where m.role = 'assistant' and m.source = 'template' and m.whatsapp_msg_id is not null)::integer,
    (select count(*)::integer from public.campaign_recipients r where r.business_id = b.id and (r.sent_at at time zone 'UTC')::date = p_day),
    now()
  from public.businesses b
  left join public.conversations c on c.business_id = b.id
  left join public.messages m on m.conversation_id = c.id and (m.created_at at time zone 'UTC')::date = p_day
  group by b.id
  on conflict (business_id, usage_date) do update set
    inbound_messages = excluded.inbound_messages, ai_calls = excluded.ai_calls, ai_replies = excluded.ai_replies,
    team_replies = excluded.team_replies, media_ai_analyses = excluded.media_ai_analyses,
    template_sends = excluded.template_sends, campaign_sends = excluded.campaign_sends,
    updated_at = excluded.updated_at;
$$;
revoke all on function public.refresh_platform_usage_daily(date) from public, anon, authenticated;
grant execute on function public.refresh_platform_usage_daily(date) to service_role;

-- Verification: all new platform tables have RLS enabled; no browser policies are installed.
select c.relname, c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policy_count
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('platform_admins','platform_audit_log','cron_runs','tenant_usage_daily')
order by c.relname;
