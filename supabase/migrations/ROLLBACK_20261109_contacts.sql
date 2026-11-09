drop table if exists public.activity_events;
drop table if exists public.contact_group_members;
drop table if exists public.contact_groups;
drop table if exists public.contacts;
alter table public.conversations drop column if exists payment_amount;
