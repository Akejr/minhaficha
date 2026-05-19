-- Ficha AI — Supabase schema
--
-- Run this once in the Supabase SQL editor (or via `psql` against the
-- project) AFTER creating the project. It creates the four tables we need
-- plus the row-level-security policies that scope each user to their own
-- data while keeping the analysis cache shared (cheaper for everyone).
--
-- Idempotent: safe to re-run, drops and recreates policies. Tables use
-- IF NOT EXISTS so existing data is preserved.

-- =========================================================================
-- 1. profiles  (1:1 with auth.users)
-- =========================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text,
  display_name text,
  plan text not null default 'free' check (plan in ('free','weekly','monthly')),
  plan_expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row when a new auth.user is inserted.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, phone, display_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'display_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- 2. match_analyses  (shared cache of fixture analyses)
-- =========================================================================

create table if not exists public.match_analyses (
  fixture_id bigint primary key,
  payload jsonb not null,
  ai_output jsonb not null,
  kickoff_at timestamptz not null,
  computed_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists match_analyses_kickoff_idx
  on public.match_analyses (kickoff_at);

-- =========================================================================
-- 3. user_analyses  (history per user)
-- =========================================================================

create table if not exists public.user_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  fixture_id bigint not null,
  viewed_at timestamptz not null default now(),
  -- Snapshot for fast history rendering even after the cache expires.
  snapshot jsonb not null
);

create index if not exists user_analyses_user_viewed_idx
  on public.user_analyses (user_id, viewed_at desc);

-- =========================================================================
-- 4. daily_usage  (free-tier rate limit)
-- =========================================================================

create table if not exists public.daily_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  analyses_count int not null default 0,
  primary key (user_id, day)
);

-- =========================================================================
-- Row Level Security
-- =========================================================================

alter table public.profiles enable row level security;
alter table public.match_analyses enable row level security;
alter table public.user_analyses enable row level security;
alter table public.daily_usage enable row level security;

-- profiles: each user sees / updates their own row only.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (auth.uid() = id);

-- match_analyses: any authenticated user can read; only service role writes.
drop policy if exists match_analyses_anyone_read on public.match_analyses;
create policy match_analyses_anyone_read on public.match_analyses
  for select using (auth.role() = 'authenticated');

-- user_analyses: each user sees / inserts their own rows only.
drop policy if exists user_analyses_self_read on public.user_analyses;
create policy user_analyses_self_read on public.user_analyses
  for select using (auth.uid() = user_id);

drop policy if exists user_analyses_self_insert on public.user_analyses;
create policy user_analyses_self_insert on public.user_analyses
  for insert with check (auth.uid() = user_id);

-- daily_usage: each user sees their own row only.
drop policy if exists daily_usage_self_read on public.daily_usage;
create policy daily_usage_self_read on public.daily_usage
  for select using (auth.uid() = user_id);
-- writes go through the service role from the server only.

-- =========================================================================
-- Helper RPCs
-- =========================================================================

-- Atomically increment today's analyses_count and return the new value.
-- Used by the server when serving an analysis to a free user.
create or replace function public.increment_daily_usage(target_user uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count int;
begin
  insert into public.daily_usage (user_id, day, analyses_count)
  values (target_user, current_date, 1)
  on conflict (user_id, day)
  do update set analyses_count = public.daily_usage.analyses_count + 1
  returning analyses_count into current_count;
  return current_count;
end;
$$;

revoke all on function public.increment_daily_usage(uuid) from public;
grant execute on function public.increment_daily_usage(uuid) to service_role;
