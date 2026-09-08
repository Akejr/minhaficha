-- ApostAI — migration 004: runtime settings (promo switch)
--
-- Run ONCE in the Supabase SQL editor, after migration-003.
-- Additive and idempotent.
--
-- Why a table instead of an env var: the owner needs to flip the promo on and
-- off from /admin without a redeploy.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
-- No policies: anon/authenticated get nothing. Server-side service role only.

-- First-month promo shown to visitors reading a FREE analysis.
--
-- `priceCents` is what the checkout actually charges while `enabled` is true —
-- advertising R$ 10 and billing R$ 15 would be plain false advertising, so the
-- two are driven by this single value.
insert into public.app_settings (key, value)
values (
  'promo_first_month',
  jsonb_build_object('enabled', false, 'priceCents', 1000)
)
on conflict (key) do nothing;
