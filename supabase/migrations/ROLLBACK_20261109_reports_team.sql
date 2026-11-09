drop function if exists public.get_business_report_series(uuid,date,date);
drop function if exists public.update_team_profile(uuid,uuid,text,text);
drop index if exists public.idx_owner_alerts_handoff_report;
drop index if exists public.idx_automation_runs_business_status_updated;
drop index if exists public.idx_campaign_recipients_business_paid;
drop index if exists public.idx_campaign_recipients_business_replied;
drop index if exists public.idx_campaign_recipients_business_read;
drop index if exists public.idx_campaign_recipients_business_delivered;
drop index if exists public.idx_campaign_recipients_business_sent;
drop index if exists public.idx_conversations_business_assigned;
drop index if exists public.idx_profiles_business_status_role;
drop index if exists public.idx_profiles_email_lower_unique;
drop policy if exists "profile_read_self" on public.profiles;
create policy "profile_read_self" on public.profiles as restrictive for select to public
  using (id = (select auth.uid()));
drop policy if exists "conversation_read_own_business" on public.conversations;
create policy "conversation_read_own_business" on public.conversations as restrictive for select to public
  using (business_id = (select p.business_id from public.profiles p where p.id = (select auth.uid())));
drop policy if exists "message_read_own_business" on public.messages;
create policy "message_read_own_business" on public.messages as restrictive for select to public
  using (exists (
    select 1 from public.conversations c join public.profiles p on p.business_id = c.business_id
    where c.id = messages.conversation_id and p.id = (select auth.uid())
  ));
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles drop column if exists updated_at;
alter table public.profiles drop column if exists invited_at;
alter table public.profiles drop column if exists status;
alter table public.profiles drop column if exists email;
alter table public.businesses drop column if exists strict_roles;
alter table public.businesses drop column if exists reporting_history_start_date;
