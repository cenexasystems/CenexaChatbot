-- Keep direct Supabase reads and Realtime events inside each signed-in
-- user's business. The application API uses the service role and continues
-- to enforce business ownership through requireBusinessAccess().
-- Safe to re-run.

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "profile_read_authenticated" on public.profiles;
drop policy if exists "profile_read_self" on public.profiles;
create policy "profile_read_authenticated"
  on public.profiles as permissive for select to authenticated
  using (true);
create policy "profile_read_self"
  on public.profiles as restrictive for select to public
  using (id = (select auth.uid()));

drop policy if exists "conversation_read_authenticated" on public.conversations;
drop policy if exists "conversation_read_own_business" on public.conversations;
create policy "conversation_read_authenticated"
  on public.conversations as permissive for select to authenticated
  using (true);
create policy "conversation_read_own_business"
  on public.conversations as restrictive for select to public
  using (
    business_id = (
      select p.business_id
      from public.profiles p
      where p.id = (select auth.uid())
    )
  );

drop policy if exists "message_read_authenticated" on public.messages;
drop policy if exists "message_read_own_business" on public.messages;
create policy "message_read_authenticated"
  on public.messages as permissive for select to authenticated
  using (true);
create policy "message_read_own_business"
  on public.messages as restrictive for select to public
  using (
    exists (
      select 1
      from public.conversations c
      join public.profiles p on p.business_id = c.business_id
      where c.id = messages.conversation_id
        and p.id = (select auth.uid())
    )
  );

-- Deliberately no client policies for businesses: its rows include WhatsApp
-- access tokens. Server routes use the service role and return safe fields.
drop policy if exists "businesses_deny_browser_reads" on public.businesses;
create policy "businesses_deny_browser_reads"
  on public.businesses as restrictive for select to public
  using (false);
