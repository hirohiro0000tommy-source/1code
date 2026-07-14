-- PartyFinder production schema draft
-- Target: PostgreSQL / Supabase

create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'local',
  provider_user_id text,
  display_name text not null,
  discord_handle text,
  role text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  status text not null default 'active' check (status in ('active', 'banned')),
  ban_reason text,
  ban_note text,
  banned_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_user_id)
);

create table if not exists recruitments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete set null,
  title text not null,
  game text not null,
  platform text not null,
  voice text not null,
  rank_label text,
  play_time text,
  play_style text,
  capacity integer not null default 4 check (capacity between 1 and 99),
  participants jsonb not null default '[]'::jsonb,
  body text not null,
  status text not null default 'open' check (status in ('open', 'closed', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete set null,
  title text not null,
  category text not null check (category in ('雑談', '大会観戦', '攻略相談')),
  body text not null,
  status text not null default 'open' check (status in ('open', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists replies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete set null,
  target_type text not null check (target_type in ('recruitment', 'thread')),
  target_id uuid not null,
  body text not null,
  status text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at timestamptz not null default now()
);

create table if not exists likes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('recruitment', 'thread')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (owner_id, target_type, target_id)
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles(id) on delete set null,
  target_type text not null check (target_type in ('recruitment', 'thread', 'reply', 'message')),
  target_id uuid not null,
  parent_type text check (parent_type in ('recruitment', 'thread')),
  parent_id uuid,
  reply_id uuid,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists inquiries (
  id uuid primary key default gen_random_uuid(),
  account_id text,
  name text not null,
  contact text,
  category text not null check (category in ('不具合', '要望', 'βフィードバック', '削除依頼', '広告', 'その他')),
  request_id text,
  beta_feedback_type text,
  beta_feedback_priority text,
  beta_feedback_note text,
  resolution_note text,
  message text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table inquiries add column if not exists request_id text;
alter table inquiries add column if not exists beta_feedback_type text;
alter table inquiries add column if not exists beta_feedback_priority text;
alter table inquiries add column if not exists beta_feedback_note text;
alter table inquiries add column if not exists resolution_note text;
alter table inquiries drop constraint if exists inquiries_category_check;
alter table inquiries add constraint inquiries_category_check check (category in ('不具合', '要望', 'βフィードバック', '削除依頼', '広告', 'その他'));

create table if not exists direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null,
  recruitment_id uuid references recruitments(id) on delete set null,
  recruitment_title text,
  from_profile_id uuid references profiles(id) on delete set null,
  to_profile_id uuid references profiles(id) on delete set null,
  body text not null,
  status text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at timestamptz not null default now()
);

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  tone text not null default 'info' check (tone in ('info', 'warning', 'maintenance')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ad_slots (
  id uuid primary key default gen_random_uuid(),
  slot_key text not null unique,
  label text not null,
  placement text not null check (placement in ('left_rail', 'right_rail', 'feed_inline', 'footer')),
  kind text not null default 'affiliate' check (kind in ('affiliate', 'sponsor', 'community')),
  html text,
  image_url text,
  target_url text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ad_slots add column if not exists kind text not null default 'affiliate';
alter table ad_slots drop constraint if exists ad_slots_kind_check;
alter table ad_slots add constraint ad_slots_kind_check check (kind in ('affiliate', 'sponsor', 'community'));

create table if not exists moderation_events (
  id uuid primary key default gen_random_uuid(),
  account_id text,
  display_name text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists deleted_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('recruitments', 'threads', 'reply')),
  payload jsonb not null default '{}'::jsonb,
  deleted_by_account_id text,
  deleted_by_name text not null,
  deleted_at timestamptz not null default now(),
  restored_at timestamptz
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  actor_name text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists recruitments_created_at_idx on recruitments(created_at desc);
create index if not exists recruitments_game_idx on recruitments(game);
create index if not exists threads_created_at_idx on threads(created_at desc);
create index if not exists threads_category_idx on threads(category);
create index if not exists replies_target_idx on replies(target_type, target_id, created_at);
create index if not exists likes_target_idx on likes(target_type, target_id);
create index if not exists reports_status_idx on reports(status, created_at desc);
create index if not exists inquiries_status_idx on inquiries(status, created_at desc);
create index if not exists inquiries_request_id_idx on inquiries(request_id);
create index if not exists direct_messages_conversation_idx on direct_messages(conversation_id, created_at);
create index if not exists direct_messages_from_idx on direct_messages(from_profile_id, created_at desc);
create index if not exists direct_messages_to_idx on direct_messages(to_profile_id, created_at desc);
create index if not exists announcements_active_idx on announcements(is_active, created_at desc);
create index if not exists ad_slots_placement_idx on ad_slots(placement, is_active);
create index if not exists moderation_events_created_at_idx on moderation_events(created_at desc);
create index if not exists moderation_events_account_idx on moderation_events(account_id, created_at desc);
create index if not exists deleted_items_deleted_at_idx on deleted_items(deleted_at desc);
create index if not exists audit_logs_created_at_idx on audit_logs(created_at desc);
