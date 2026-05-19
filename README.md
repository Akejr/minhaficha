# Ficha AI

Mobile-first Next.js app that analyses football fixtures with statistical
modelling (Dixon-Coles + form analysis) and an LLM-written narrative.

## Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** with custom design tokens
- **Supabase** (auth, profile, analysis cache, history, daily quota)
- **API-Football v3** (fixtures, stats, standings, odds, injuries)
- **OpenAI** Responses API (`gpt-5.4-mini` by default) for the narrative
- **Vitest** for the betting model unit tests

## Local development

```bash
npm install
cp .env.example .env.local
# Fill in API_FOOTBALL_KEY, OPENAI_API_KEY, OPENAI_MODEL,
# NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY in .env.local

npm run dev          # http://localhost:3000
npm run build        # production build
npm test             # 60+ unit tests on the betting model
```

## Database setup

Once per Supabase project, run the SQL in `supabase/schema.sql` from the
SQL editor. It creates the four tables (profiles, match_analyses,
user_analyses, daily_usage), the auto-profile trigger, the RLS policies,
and the `increment_daily_usage` RPC.

## Deploying to Vercel

1. Push the repo to GitHub (already done if you're reading this on GitHub).
2. Import the repo in Vercel.
3. Set environment variables in Vercel project settings:
   - `API_FOOTBALL_KEY`
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` (optional, defaults to `gpt-5.4-mini`)
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. First deploy will pick everything up automatically.

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
lib/api-football/     Wrapper for v3.football.api-sports.io
lib/betting/          Dixon-Coles, features, calibration, market models
lib/openai/           Responses API wrapper + analysis prompt
lib/supabase/         Server / browser clients + analysis cache
lib/i18n/             PT→EN team-name translations for search
scripts/              Backtests + icon generator
supabase/schema.sql   Database schema, RLS policies, RPC
```

## License

Internal project.
