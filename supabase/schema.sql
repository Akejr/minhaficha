-- ApostAI — Supabase schema (access-code model)
--
-- Run this once in the Supabase SQL editor (or via `psql` against the
-- project) AFTER creating the project.
--
-- AUTH MODEL: there is NO Supabase Auth in this app. Users don't have
-- accounts — they buy a subscription through the InfinitePay checkout and
-- receive a 12-character access code, which is the only credential. The
-- code lives in an HttpOnly cookie and is validated server-side on every
-- request.
--
-- Because there is no auth.uid(), NO table is reachable from the browser.
-- RLS is enabled everywhere with zero permissive policies, which denies
-- anon/authenticated by default. All access happens server-side through
-- the service-role key (lib/supabase/server.ts::serviceRoleClient).
--
-- Idempotent: safe to re-run.

-- =========================================================================
-- 0. Drop the legacy email/password tables
--
-- These belonged to the old Supabase Auth model and are no longer used:
--   profiles      → replaced by access_codes
--   user_analyses → replaced by code_analyses
--   daily_usage   → the free tier is now "the 3 featured fixtures", not a
--                   per-user daily quota, so no counter is needed
--
-- WARNING: this deletes the old accounts and their history. Comment this
-- block out if you need to migrate data first.
-- =========================================================================

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.increment_daily_usage(uuid);

drop table if exists public.daily_usage;
drop table if exists public.user_analyses;
drop table if exists public.profiles;

-- =========================================================================
-- 1. access_codes  (the only credential in the system)
--
-- `code` is the 12-character string handed to the customer after payment.
-- Stored uppercase; the app uppercases input before comparing.
--
-- `is_permanent` marks codes that never expire (the owner's master code).
-- For those, expires_at is NULL.
-- =========================================================================

create table if not exists public.access_codes (
  code text primary key,
  created_at timestamptz not null default now(),
  -- NULL means "never expires" (only for is_permanent codes).
  expires_at timestamptz,
  is_permanent boolean not null default false,
  -- Provenance: which checkout produced this code.
  order_nsu text,
  transaction_nsu text,
  amount_cents int,
  -- Free-form label, useful for manually issued codes.
  note text,
  last_used_at timestamptz,
  constraint access_codes_expiry_ck
    check (is_permanent or expires_at is not null)
);

create index if not exists access_codes_expires_idx
  on public.access_codes (expires_at);

create unique index if not exists access_codes_order_nsu_idx
  on public.access_codes (order_nsu)
  where order_nsu is not null;

-- =========================================================================
-- 2. checkout_orders  (one row per checkout attempt)
--
-- Created BEFORE redirecting the customer to InfinitePay so that the
-- webhook and the success page can both resolve the order by order_nsu.
-- `status` goes pending → paid. The generated code is linked back here.
-- =========================================================================

create table if not exists public.checkout_orders (
  order_nsu text primary key,
  status text not null default 'pending'
    check (status in ('pending', 'paid')),
  amount_cents int not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  transaction_nsu text,
  capture_method text,
  receipt_url text,
  -- The access code issued for this order (set when payment is confirmed).
  access_code text references public.access_codes (code) on delete set null
);

create index if not exists checkout_orders_status_idx
  on public.checkout_orders (status, created_at desc);

-- =========================================================================
-- 3. match_analyses  (shared cache of fixture analyses)
--
-- Unchanged from the previous schema — the cache is keyed by fixture and
-- shared across all users, which keeps API/OpenAI cost near zero on repeat
-- views.
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
-- 4. code_analyses  (history, scoped to an access code)
--
-- Replaces user_analyses. `snapshot` freezes what was shown so history
-- still renders after the shared cache expires.
-- =========================================================================

create table if not exists public.code_analyses (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.access_codes (code) on delete cascade,
  fixture_id bigint not null,
  viewed_at timestamptz not null default now(),
  snapshot jsonb not null
);

create index if not exists code_analyses_code_viewed_idx
  on public.code_analyses (code, viewed_at desc);

-- =========================================================================
-- Row Level Security
--
-- Enabled with NO policies on purpose: the anon and authenticated roles
-- get zero access. Every read/write goes through the service-role key on
-- the server, which bypasses RLS. This is what replaces the old
-- auth.uid()-based policies now that Supabase Auth is gone.
-- =========================================================================

alter table public.access_codes enable row level security;
alter table public.checkout_orders enable row level security;
alter table public.match_analyses enable row level security;
alter table public.code_analyses enable row level security;

-- Drop any policy inherited from the previous schema version.
drop policy if exists match_analyses_anyone_read on public.match_analyses;

-- =========================================================================
-- 5. Master access code  (MANUAL STEP — intentionally not seeded here)
--
-- The owner's permanent code is a CREDENTIAL, so it is deliberately absent
-- from this file: the repository is public and anything committed here would
-- grant permanent free access to whoever reads it.
--
-- Run the statement below yourself, replacing the placeholder with the same
-- value you put in MASTER_ACCESS_CODE. Use UPPERCASE with letters and digits
-- only — the app normalises input that way before comparing.
--
-- Having the row (as well as the env var) is useful: it makes the code work
-- even if the environment variable is missing, and lets history attach to it.
--
--   insert into public.access_codes (code, is_permanent, expires_at, note)
--   values ('REPLACE_WITH_YOUR_CODE', true, null, 'Master code (owner)')
--   on conflict (code) do update
--     set is_permanent = true,
--         expires_at = null,
--         note = 'Master code (owner)';
-- =========================================================================

-- =========================================================================
-- 6. Housekeeping helper
--
-- Optional: call periodically (pg_cron or manually) to clear codes that
-- expired long ago. Permanent codes are never touched.
-- =========================================================================

create or replace function public.purge_expired_codes(grace_days int default 30)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  removed int;
begin
  delete from public.access_codes
  where is_permanent = false
    and expires_at is not null
    and expires_at < now() - make_interval(days => grace_days);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_expired_codes(int) from public;
grant execute on function public.purge_expired_codes(int) to service_role;
