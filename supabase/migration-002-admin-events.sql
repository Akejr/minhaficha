-- ApostAI — migration 002: event log, code kinds, admin aggregates
--
-- Run this ONCE in the Supabase SQL editor, on top of the existing schema.
-- It is additive and idempotent: no existing table is dropped and no data is
-- touched. supabase/schema.sql carries the same objects for fresh installs.

-- =========================================================================
-- 1. access_codes: kind / source / revocation
--
-- Until now every code was a 30-day purchase. The owner can now mint codes
-- by hand, so we record WHAT a code is (monthly / annual / lifetime) and
-- WHERE it came from (checkout vs admin panel), plus allow revoking one
-- without deleting the row (keeps the history attached to it).
-- =========================================================================

alter table public.access_codes
  add column if not exists kind text not null default 'monthly';

alter table public.access_codes
  add column if not exists source text not null default 'checkout';

alter table public.access_codes
  add column if not exists revoked_at timestamptz;

-- Re-create the constraints idempotently.
alter table public.access_codes drop constraint if exists access_codes_kind_ck;
alter table public.access_codes
  add constraint access_codes_kind_ck
  check (kind in ('monthly', 'annual', 'lifetime'));

alter table public.access_codes drop constraint if exists access_codes_source_ck;
alter table public.access_codes
  add constraint access_codes_source_ck
  check (source in ('checkout', 'admin'));

create index if not exists access_codes_created_idx
  on public.access_codes (created_at desc);

-- =========================================================================
-- 2. events: the audit log behind the admin panel
--
-- One row per meaningful action. Deliberately denormalised — the columns we
-- filter and group by are real columns, everything else goes in `meta`.
--
-- `code` is intentionally NOT a foreign key: we also log failed logins,
-- where the typed value doesn't exist. Those are stored masked (see
-- lib/analytics/events.ts), never in full.
-- =========================================================================

create table if not exists public.events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  -- See EventType in lib/analytics/events.ts
  type text not null,
  -- Access code involved, when there is one.
  code text,
  fixture_id bigint,
  order_nsu text,
  amount_cents int,
  -- True when an analysis was served through the free tier.
  is_free boolean,
  -- Outcome for attempt-style events (login, payment, checkout).
  ok boolean,
  -- Short human-readable note (error message, market, plan kind...).
  detail text,
  path text,
  -- Salted hash, never the raw address (LGPD).
  ip_hash text,
  user_agent text,
  meta jsonb
);

create index if not exists events_created_idx
  on public.events (created_at desc);

create index if not exists events_type_created_idx
  on public.events (type, created_at desc);

create index if not exists events_code_created_idx
  on public.events (code, created_at desc);

create index if not exists events_order_idx
  on public.events (order_nsu);

-- =========================================================================
-- Row Level Security — deny everything to anon/authenticated.
-- All access goes through the service-role key on the server.
-- =========================================================================

alter table public.events enable row level security;

-- =========================================================================
-- 3. admin_overview(): every dashboard number in one round trip
--
-- Doing this in SQL instead of ~20 PostgREST calls keeps the panel fast and
-- lets Postgres do the sums. Returns a single jsonb document; the shape is
-- mirrored by AdminOverview in lib/admin/stats.ts.
-- =========================================================================

create or replace function public.admin_overview()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'generatedAt', now(),

    -- Analyses served, split by free vs paid, over three windows.
    'analyses', jsonb_build_object(
      'total',      (select count(*) from events where type = 'analysis_view'),
      'day',        (select count(*) from events where type = 'analysis_view' and created_at > now() - interval '1 day'),
      'week',       (select count(*) from events where type = 'analysis_view' and created_at > now() - interval '7 days'),
      'month',      (select count(*) from events where type = 'analysis_view' and created_at > now() - interval '30 days'),
      'freeTotal',  (select count(*) from events where type = 'analysis_view' and is_free),
      'freeDay',    (select count(*) from events where type = 'analysis_view' and is_free and created_at > now() - interval '1 day'),
      'freeWeek',   (select count(*) from events where type = 'analysis_view' and is_free and created_at > now() - interval '7 days'),
      'paidTotal',  (select count(*) from events where type = 'analysis_view' and is_free is not true),
      'paidDay',    (select count(*) from events where type = 'analysis_view' and is_free is not true and created_at > now() - interval '1 day'),
      'paidWeek',   (select count(*) from events where type = 'analysis_view' and is_free is not true and created_at > now() - interval '7 days'),
      -- Cache misses: these are the ones that actually cost API + OpenAI money.
      'computedTotal', (select count(*) from events where type = 'analysis_computed'),
      'computedDay',   (select count(*) from events where type = 'analysis_computed' and created_at > now() - interval '1 day'),
      'computedWeek',  (select count(*) from events where type = 'analysis_computed' and created_at > now() - interval '7 days'),
      'blockedTotal',  (select count(*) from events where type = 'analysis_blocked'),
      'blockedWeek',   (select count(*) from events where type = 'analysis_blocked' and created_at > now() - interval '7 days')
    ),

    -- Checkout funnel.
    'funnel', jsonb_build_object(
      'clicksTotal',   (select count(*) from events where type = 'checkout_click'),
      'clicksWeek',    (select count(*) from events where type = 'checkout_click' and created_at > now() - interval '7 days'),
      'createdTotal',  (select count(*) from events where type = 'checkout_created'),
      'createdWeek',   (select count(*) from events where type = 'checkout_created' and created_at > now() - interval '7 days'),
      'failedTotal',   (select count(*) from events where type = 'checkout_failed'),
      'failedWeek',    (select count(*) from events where type = 'checkout_failed' and created_at > now() - interval '7 days'),
      'paidTotal',     (select count(*) from events where type = 'payment_confirmed'),
      'paidWeek',      (select count(*) from events where type = 'payment_confirmed' and created_at > now() - interval '7 days'),
      'rejectedTotal', (select count(*) from events where type in ('payment_underpaid', 'payment_unconfirmed'))
    ),

    -- Money, straight from the orders table (source of truth for revenue).
    'revenue', jsonb_build_object(
      'centsTotal', coalesce((select sum(amount_cents) from checkout_orders where status = 'paid'), 0),
      'centsWeek',  coalesce((select sum(amount_cents) from checkout_orders where status = 'paid' and paid_at > now() - interval '7 days'), 0),
      'centsMonth', coalesce((select sum(amount_cents) from checkout_orders where status = 'paid' and paid_at > now() - interval '30 days'), 0),
      'ordersPaid',    (select count(*) from checkout_orders where status = 'paid'),
      'ordersPending', (select count(*) from checkout_orders where status = 'pending')
    ),

    -- Access codes inventory.
    'codes', jsonb_build_object(
      'total',    (select count(*) from access_codes),
      'active',   (select count(*) from access_codes where revoked_at is null and (is_permanent or expires_at > now())),
      'expired',  (select count(*) from access_codes where revoked_at is null and not is_permanent and expires_at <= now()),
      'revoked',  (select count(*) from access_codes where revoked_at is not null),
      'monthly',  (select count(*) from access_codes where kind = 'monthly'),
      'annual',   (select count(*) from access_codes where kind = 'annual'),
      'lifetime', (select count(*) from access_codes where kind = 'lifetime'),
      'fromAdmin',    (select count(*) from access_codes where source = 'admin'),
      'fromCheckout', (select count(*) from access_codes where source = 'checkout')
    ),

    -- Logins.
    'logins', jsonb_build_object(
      'okWeek',     (select count(*) from events where type = 'login_success' and created_at > now() - interval '7 days'),
      'failedWeek', (select count(*) from events where type = 'login_failed' and created_at > now() - interval '7 days')
    ),

    -- Daily series for the last 14 days, for the little bar chart.
    'daily', (
      select coalesce(jsonb_agg(row_to_json(d) order by d.day), '[]'::jsonb)
      from (
        select
          to_char(gs.day, 'YYYY-MM-DD') as day,
          (select count(*) from events e
             where e.type = 'analysis_view'
               and e.created_at >= gs.day
               and e.created_at < gs.day + interval '1 day') as analyses,
          (select count(*) from events e
             where e.type = 'checkout_click'
               and e.created_at >= gs.day
               and e.created_at < gs.day + interval '1 day') as clicks,
          (select count(*) from events e
             where e.type = 'payment_confirmed'
               and e.created_at >= gs.day
               and e.created_at < gs.day + interval '1 day') as payments
        from generate_series(
          date_trunc('day', now()) - interval '13 days',
          date_trunc('day', now()),
          interval '1 day'
        ) as gs(day)
      ) d
    ),

    -- Most viewed fixtures.
    'topFixtures', (
      select coalesce(jsonb_agg(row_to_json(f) order by f.views desc), '[]'::jsonb)
      from (
        select e.fixture_id as "fixtureId", count(*) as views
        from events e
        where e.type = 'analysis_view' and e.fixture_id is not null
        group by e.fixture_id
        order by count(*) desc
        limit 8
      ) f
    )
  );
$$;

revoke all on function public.admin_overview() from public;
grant execute on function public.admin_overview() to service_role;
