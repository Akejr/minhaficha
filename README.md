# ApostAI

Mobile-first Next.js app that analyses football fixtures with statistical
modelling (Dixon-Coles + form analysis) and an LLM-written narrative.

Target market: **Brazil**. All user-facing copy is Brazilian Portuguese
(`pt-BR`) and pricing is in Brazilian Reais (`BRL`).

## Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** with custom design tokens
- **Supabase** (Postgres only — analysis cache, access codes, history)
- **API-Football v3** (fixtures, stats, standings, odds, injuries)
- **OpenAI** Responses API (`gpt-5.4-mini` by default) for the narrative
- **InfinitePay** Integrated Checkout for payments (Pix / card)
- **Vitest** for the betting model unit tests

## Access model

There are **no accounts**: no email, no password, no Supabase Auth.

1. A visitor gets the three fixtures in the **"Análise grátis"** section on
   the home page for free, forever, without logging in.
2. Any other fixture requires a subscription: **R$ 15,00 for 30 days**.
3. Paying through the InfinitePay checkout issues a **12-character access
   code**, valid 30 days. The code is shown once on the success screen with a
   prominent "save this now" warning — it is the customer's only credential.
4. Logging in means typing that code at `/entrar`. It lands in an HttpOnly
   cookie and is re-validated against the database on every request.

The owner's master code is read from `MASTER_ACCESS_CODE` and never expires.
It has no default on purpose — it's a credential, so it lives only in the
environment, never in the repository. Leave it unset and there is simply no
master code.

Relevant modules:

| Path | Role |
|---|---|
| `lib/access/codes.ts` | Code generation, validation, master code, 30-day issuance |
| `lib/access/session.ts` | Cookie handling + `getCurrentAccess()` |
| `lib/free-fixtures.ts` | Single source of truth for what's free |
| `lib/infinitepay/client.ts` | Checkout link creation + payment verification |
| `app/api/session/route.ts` | Login (POST) / logout (DELETE) |
| `app/api/checkout/route.ts` | Starts a purchase |
| `app/api/webhooks/infinitepay/route.ts` | Confirms payment, issues the code |

### Security notes

- An access code is a **bearer credential**: anyone holding it has access, and
  it can be shared. There is no device binding. Revoke by deleting or expiring
  the row in `access_codes`.
- The webhook endpoint is public and unsigned, so it **verifies every payment
  against InfinitePay** (`payment_check`) before issuing a code, and rejects
  any `order_nsu` it didn't create. Do not set
  `INFINITEPAY_WEBHOOK_VERIFY=false` in production.
- Because Supabase Auth is gone, **RLS denies the anon role everywhere** and
  all access uses the service-role key server-side. Never import
  `serviceRoleClient()` from a client component.

## Local development

```bash
npm install
cp .env.example .env.local
# Fill in the keys listed in .env.example

npm run dev          # http://localhost:8080
npm run dev:fresh    # same, but clears .next first
npm run build        # production build
npm test             # 61 unit tests on the betting model
```

Note: `npm run build` and `npm run dev` share the `.next` directory. Running a
build while the dev server is up corrupts the dev CSS manifest — use
`npm run dev:fresh` afterwards.

Webhooks cannot reach `localhost`. In development the success page falls back
to querying `payment_check` directly, so the flow still completes; use a tunnel
(e.g. ngrok) and set `NEXT_PUBLIC_SITE_URL` if you want real webhook delivery.

## Database setup

Once per Supabase project, run the SQL in `supabase/schema.sql` from the SQL
editor. It creates `access_codes`, `checkout_orders`, `match_analyses` and
`code_analyses`, enables RLS with no permissive policies, seeds the master
code, and adds the `purge_expired_codes` helper.

> **Warning:** the script starts by dropping the legacy `profiles`,
> `user_analyses` and `daily_usage` tables from the old email/password model.
> Comment that block out if you still need to migrate data.

## Deploying to Vercel

1. Push the repo to GitHub.
2. Import the repo in Vercel.
3. Set environment variables in Vercel project settings:
   - `API_FOOTBALL_KEY`
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` (optional, defaults to `gpt-5.4-mini`)
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `INFINITEPAY_HANDLE`
   - `NEXT_PUBLIC_SITE_URL` (your production URL — used for the redirect and
     webhook callbacks)
   - `MASTER_ACCESS_CODE`
4. Enable Integrated Checkout in the InfinitePay app, otherwise link creation
   fails with `external_checkout_not_enabled`.

## Backtesting

```bash
npx tsx scripts/backtest-by-league.ts --perLeague=20 --days=180
```

Output goes to `backtest-results/by-league-<timestamp>.md`. Cache lives in
`.backtest-cache/` so re-runs cost no API quota.

Latest backtest summary lives in `backtest-results/RESUMO-FINAL.md`.

## Repository layout

```
app/                  Next.js routes (App Router)
components/           UI components
lib/access/           Access codes + cookie session
lib/api-football/     Wrapper for v3.football.api-sports.io
lib/betting/          Dixon-Coles, features, calibration, market models
lib/infinitepay/      Checkout link + payment verification
lib/openai/           Responses API wrapper + analysis prompt
lib/supabase/         Server client + analysis cache
lib/i18n/             PT→EN team-name translations for search
lib/free-fixtures.ts  Which fixtures are free
scripts/              Backtests + icon generator
supabase/schema.sql   Database schema, RLS, helpers
```

## License

Internal project.
