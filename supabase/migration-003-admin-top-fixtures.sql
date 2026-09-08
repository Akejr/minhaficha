-- ApostAI — migration 003: team names + period filter on "jogos mais vistos"
--
-- Run this ONCE in the Supabase SQL editor, after migration-002.
-- Additive and idempotent. No data is touched.
--
-- What changes: admin_overview() gains a `top_days` argument and its
-- topFixtures list now carries team names (read out of the cached analysis
-- payload) instead of bare fixture ids.

-- The signature changes, so the old zero-argument version must go first —
-- otherwise `admin_overview()` would be ambiguous between two overloads.
drop function if exists public.admin_overview();
drop function if exists public.admin_overview(int);

create or replace function public.admin_overview(top_days int default 0)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select case
      -- 0 (the default) means "today", counted from midnight rather than
      -- as a rolling 24h window — that's what a person means by "hoje".
      when coalesce(top_days, 0) <= 0 then date_trunc('day', now())
      else now() - make_interval(days => top_days)
    end as since
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'topDays', coalesce(top_days, 0),

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
      'computedTotal', (select count(*) from events where type = 'analysis_computed'),
      'computedDay',   (select count(*) from events where type = 'analysis_computed' and created_at > now() - interval '1 day'),
      'computedWeek',  (select count(*) from events where type = 'analysis_computed' and created_at > now() - interval '7 days'),
      'blockedTotal',  (select count(*) from events where type = 'analysis_blocked'),
      'blockedWeek',   (select count(*) from events where type = 'analysis_blocked' and created_at > now() - interval '7 days')
    ),

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

    'revenue', jsonb_build_object(
      'centsTotal', coalesce((select sum(amount_cents) from checkout_orders where status = 'paid'), 0),
      'centsWeek',  coalesce((select sum(amount_cents) from checkout_orders where status = 'paid' and paid_at > now() - interval '7 days'), 0),
      'centsMonth', coalesce((select sum(amount_cents) from checkout_orders where status = 'paid' and paid_at > now() - interval '30 days'), 0),
      'ordersPaid',    (select count(*) from checkout_orders where status = 'paid'),
      'ordersPending', (select count(*) from checkout_orders where status = 'pending')
    ),

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

    'logins', jsonb_build_object(
      'okWeek',     (select count(*) from events where type = 'login_success' and created_at > now() - interval '7 days'),
      'failedWeek', (select count(*) from events where type = 'login_failed' and created_at > now() - interval '7 days')
    ),

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

    -- Most viewed fixtures within the selected window, now with team names.
    --
    -- The names come from the cached analysis payload (match_analyses), so
    -- there is no extra API call. LEFT JOIN because a fixture can be viewed
    -- and later fall out of the cache; in that case home/away come back NULL
    -- and the UI falls back to the id.
    'topFixtures', (
      select coalesce(jsonb_agg(row_to_json(f) order by f.views desc), '[]'::jsonb)
      from (
        select
          e.fixture_id as "fixtureId",
          count(*) as views,
          count(*) filter (where e.is_free) as "freeViews",
          max(ma.payload -> 'teams' -> 'home' ->> 'name') as home,
          max(ma.payload -> 'teams' -> 'away' ->> 'name') as away,
          max(ma.payload -> 'fixture' ->> 'league') as league,
          max(ma.kickoff_at) as "kickoffAt"
        from events e
        left join match_analyses ma on ma.fixture_id = e.fixture_id
        cross join bounds b
        where e.type = 'analysis_view'
          and e.fixture_id is not null
          and e.created_at >= b.since
        group by e.fixture_id
        order by count(*) desc
        limit 10
      ) f
    )
  );
$$;

revoke all on function public.admin_overview(int) from public;
grant execute on function public.admin_overview(int) to service_role;
