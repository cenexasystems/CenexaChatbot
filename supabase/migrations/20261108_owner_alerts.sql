-- Owner notifications: opt-in Web Push, optional WhatsApp alerts, reminders.
alter table businesses
  add column if not exists owner_alerts_enabled boolean not null default true,
  add column if not exists owner_whatsapp_alerts_enabled boolean not null default false,
  add column if not exists owner_whatsapp_number text,
  add column if not exists owner_alert_realert_minutes integer not null default 15
    constraint businesses_owner_alert_realert_minutes_check
      check (owner_alert_realert_minutes between 1 and 1440),
  add column if not exists owner_alert_quiet_hours_start time not null default '22:00',
  add column if not exists owner_alert_quiet_hours_end time not null default '08:00',
  add column if not exists owner_alert_timezone text not null default 'Asia/Kolkata';

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id, endpoint)
);

create index if not exists idx_push_subscriptions_business on push_subscriptions(business_id);
alter table push_subscriptions enable row level security;

create table if not exists owner_alerts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  alert_type text not null check (alert_type in ('handoff', 'payment')),
  event_key text not null unique,
  status text not null default 'open' check (status in ('open', 'resolved')),
  attempt_count integer not null default 0,
  last_notified_at timestamptz,
  next_attempt_at timestamptz,
  processing_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_owner_alerts_due
  on owner_alerts(next_attempt_at)
  where status = 'open' and next_attempt_at is not null;
create index if not exists idx_owner_alerts_conversation_open
  on owner_alerts(business_id, conversation_id)
  where status = 'open';
create unique index if not exists idx_owner_alerts_one_open_type
  on owner_alerts(business_id, conversation_id, alert_type)
  where status = 'open';
alter table owner_alerts enable row level security;
