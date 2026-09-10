-- ApostAI — migration 005: ad attribution + conversion event log
--
-- Run ONCE in the Supabase SQL editor, after migration-004.
-- Additive and idempotent: no column is dropped or rewritten.
--
-- Two jobs:
--   1. Remember WHERE a buyer came from, attached to the order they created.
--   2. Keep a ledger of conversion events already sent to Meta / Google, so
--      the same purchase can never be reported twice.

-- =========================================================================
-- 1. checkout_orders — attribution captured on the visitor's first page view
--
-- All of these are attacker-controlled strings (they arrive in the query
-- string), so the application truncates and filters them before insert. They
-- are stored for reporting only and are never used in a security decision.
-- =========================================================================

alter table public.checkout_orders
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text,
  -- Click identifiers. fbclid → Meta, gclid → Google Ads,
  -- gbraid/wbraid → Google's privacy-preserving replacements for gclid.
  add column if not exists fbclid text,
  add column if not exists gclid text,
  add column if not exists gbraid text,
  add column if not exists wbraid text,
  -- Meta browser cookies. _fbp identifies the browser, _fbc encodes the ad
  -- click. Both are required for decent Conversions API match quality.
  add column if not exists fbp text,
  add column if not exists fbc text,
  -- First path the visitor landed on, e.g. /start. Tells us which entry point
  -- the campaign actually used.
  add column if not exists landing_path text,
  -- InfinitePay's invoice identifier, echoed by the webhook. Stored so a
  -- payment can be reconciled by hand later: payment_check stops recognising
  -- older transactions, and then this is the only handle left.
  add column if not exists invoice_slug text;

-- Campaign reporting reads by source over a date range.
create index if not exists checkout_orders_utm_source_idx
  on public.checkout_orders (utm_source, created_at desc)
  where utm_source is not null;

-- =========================================================================
-- 2. conversion_events — ledger of what we sent to the ad platforms
--
-- This table is the deduplication mechanism, not just a log. Before sending
-- anything we INSERT the row; the unique index below makes a second attempt
-- fail, and that failure is how we know the event was already claimed.
--
-- Consequence: a duplicated InfinitePay webhook, a refreshed success page and
-- a manual reconciliation can all race for the same purchase and exactly one
-- of them wins.
-- =========================================================================

create table if not exists public.conversion_events (
  id bigserial primary key,
  -- The id shared with the ad platform so it can dedupe on its side too.
  -- For purchases: purchase_<order_nsu>.
  event_id text not null,
  -- Each destination gets its own row: Meta may succeed while Google fails.
  destination text not null
    check (destination in ('meta_capi', 'google_ads')),
  event_name text not null,
  order_nsu text,
  amount_cents int,
  -- pending → claimed but not yet delivered (or delivery in flight)
  -- sent    → the platform accepted it
  -- failed  → the platform rejected it, or we never reached it
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  -- Error message or platform response summary. Never a token.
  detail text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- The dedup guarantee. One row per (destination, event_id), forever.
create unique index if not exists conversion_events_dedup_idx
  on public.conversion_events (destination, event_id);

create index if not exists conversion_events_order_idx
  on public.conversion_events (order_nsu);

create index if not exists conversion_events_status_idx
  on public.conversion_events (status, created_at desc);

-- =========================================================================
-- Row Level Security — deny everything to anon/authenticated, like every
-- other table here. All access goes through the service-role key.
-- =========================================================================

alter table public.conversion_events enable row level security;
