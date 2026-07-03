-- Supabase Row Level Security draft for PartyFinder.
-- Assumption: profiles.id matches auth.uid() after Discord OAuth account linking.

alter table profiles enable row level security;
alter table recruitments enable row level security;
alter table threads enable row level security;
alter table replies enable row level security;
alter table likes enable row level security;
alter table reports enable row level security;
alter table inquiries enable row level security;
alter table direct_messages enable row level security;
alter table announcements enable row level security;
alter table ad_slots enable row level security;
alter table moderation_events enable row level security;
alter table deleted_items enable row level security;
alter table audit_logs enable row level security;

create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from profiles where id = auth.uid()), 'user');
$$;

create policy "profiles are readable"
on profiles for select
using (status = 'active' or id = auth.uid() or public.app_role() in ('moderator', 'admin'));

create policy "users update own profile"
on profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "open recruitments are readable"
on recruitments for select
using (status = 'open' or owner_id = auth.uid() or public.app_role() in ('moderator', 'admin'));

create policy "users create recruitments"
on recruitments for insert
with check (owner_id = auth.uid());

create policy "owners update recruitments"
on recruitments for update
using (owner_id = auth.uid() or public.app_role() in ('moderator', 'admin'))
with check (owner_id = auth.uid() or public.app_role() in ('moderator', 'admin'));

create policy "owners delete recruitments"
on recruitments for delete
using (owner_id = auth.uid() or public.app_role() in ('moderator', 'admin'));

create policy "open threads are readable"
on threads for select
using (status = 'open' or owner_id = auth.uid() or public.app_role() in ('moderator', 'admin'));

create policy "users create threads"
on threads for insert
with check (owner_id = auth.uid());

create policy "owners update threads"
on threads for update
using (owner_id = auth.uid() or public.app_role() in ('moderator', 'admin'))
with check (owner_id = auth.uid() or public.app_role() in ('moderator', 'admin'));

create policy "owners delete threads"
on threads for delete
using (owner_id = auth.uid() or public.app_role() in ('moderator', 'admin'));

create policy "visible replies are readable"
on replies for select
using (status = 'visible' or owner_id = auth.uid() or public.app_role() in ('moderator', 'admin'));

create policy "users create replies"
on replies for insert
with check (owner_id = auth.uid());

create policy "owners update replies"
on replies for update
using (owner_id = auth.uid() or public.app_role() in ('moderator', 'admin'))
with check (owner_id = auth.uid() or public.app_role() in ('moderator', 'admin'));

create policy "owners delete replies"
on replies for delete
using (owner_id = auth.uid() or public.app_role() in ('moderator', 'admin'));

create policy "likes are readable"
on likes for select
using (true);

create policy "users create own likes"
on likes for insert
with check (owner_id = auth.uid());

create policy "users delete own likes"
on likes for delete
using (owner_id = auth.uid());

create policy "users create reports"
on reports for insert
with check (reporter_id = auth.uid());

create policy "moderators read reports"
on reports for select
using (reporter_id = auth.uid() or public.app_role() in ('moderator', 'admin'));

create policy "moderators update reports"
on reports for update
using (public.app_role() in ('moderator', 'admin'))
with check (public.app_role() in ('moderator', 'admin'));

create policy "users create inquiries"
on inquiries for insert
with check (true);

create policy "admins read inquiries"
on inquiries for select
using (public.app_role() = 'admin');

create policy "admins update inquiries"
on inquiries for update
using (public.app_role() = 'admin')
with check (public.app_role() = 'admin');

create policy "dm participants read messages"
on direct_messages for select
using (from_profile_id = auth.uid() or to_profile_id = auth.uid() or public.app_role() in ('moderator', 'admin'));

create policy "users send own messages"
on direct_messages for insert
with check (from_profile_id = auth.uid() and to_profile_id <> auth.uid());

create policy "moderators hide direct messages"
on direct_messages for update
using (public.app_role() in ('moderator', 'admin'))
with check (public.app_role() in ('moderator', 'admin'));

create policy "active announcements are readable"
on announcements for select
using (is_active = true or public.app_role() in ('moderator', 'admin'));

create policy "admins manage announcements"
on announcements for all
using (public.app_role() = 'admin')
with check (public.app_role() = 'admin');

create policy "active ads are readable"
on ad_slots for select
using (is_active = true or public.app_role() in ('moderator', 'admin'));

create policy "admins manage ads"
on ad_slots for all
using (public.app_role() = 'admin')
with check (public.app_role() = 'admin');

create policy "admins read moderation events"
on moderation_events for select
using (public.app_role() = 'admin');

create policy "admins create moderation events"
on moderation_events for insert
with check (public.app_role() = 'admin');

create policy "admins manage deleted items"
on deleted_items for all
using (public.app_role() = 'admin')
with check (public.app_role() = 'admin');

create policy "admins read audit logs"
on audit_logs for select
using (public.app_role() = 'admin');

create policy "admins create audit logs"
on audit_logs for insert
with check (public.app_role() = 'admin');
