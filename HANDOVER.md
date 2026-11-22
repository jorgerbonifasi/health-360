# Health 360 — Session Handover

Last updated: 2026-11-22

Personal single-user health dashboard: aggregates Withings (weight), Strava (exercise), and
Apple Health (steps) into Supabase, computes a daily 0–100 Health 360 score, serves a React
dashboard, and includes an AI running coach powered by Claude.

**Status: fully built, deployed, and live.** All three data sources auto-sync; a year of history
is backfilled; the dashboard is deployed on Render.

---

## Key coordinates

| Thing | Value |
|---|---|
| Code | `/Users/jorgebonifasi/Python/health-360` |
| GitHub | `github.com/jorgerbonifasi/health-360` (private, branch `main`) |
| Supabase project ref | `dsdxvlmkftlqzqadvhsa` (org JRB LLC, region eu-central-1 / Frankfurt) |
| Supabase URL | `https://dsdxvlmkftlqzqadvhsa.supabase.co` |
| Frontend host | Render static site, auto-deploys on push to `main` |
| Local dev | `cd web && npm run dev` → http://localhost:5173 |

**Render config:** Root Directory `web`, Build `npm install && npm run build`, Publish `dist`,
env vars `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.

---

## Architecture

```
Withings scale ──notify──▶ withings-webhook ─┐
Strava activity ─webhook─▶ strava-webhook ───┤
Health Auto Export ─POST─▶ apple-health ─────┼──▶ Supabase Postgres ──▶ React dashboard (anon read)
                                             │              ▲
nightly pg_cron ─▶ reconcile ────────────────┘              │
nightly pg_cron ─▶ compute-scores ──────────────────────────┘
dashboard button ─▶ run-plan ──▶ Claude API (AI coach) ──▶ run_plans
dashboard button ─▶ run-review ─▶ Claude API (grades a plan vs. what you ran) ──▶ run_plans
dashboard ⚙️ ─────▶ update-goals
```

**Security model:** anon key is read-only via RLS (`SELECT` on data tables only). `oauth_tokens`
has **no** anon policy — service-role only. All writes go through Edge Functions using the
auto-injected service role. The Anthropic API key lives only in function secrets.

> ⚠️ **"Automatically expose new tables" is OFF** on this project, so the schema grants
> privileges **explicitly** (`anon` SELECT on data tables/views; `service_role` full DML).
> **If you add a new table, you must add its grants** or the functions get
> `permission denied` — this bit us once already.

---

## Database (9 Edge Functions, 7 tables)

Tables: `weight_logs`, `daily_steps`, `activities`, `goals`, `daily_scores`, `oauth_tokens`,
`run_plans`.
All ingestion is idempotent via unique constraints:
`activities(strava_id)`, `weight_logs(source, external_id)`, `daily_steps(source, date)`,
`daily_scores(date)`.

| Function | Purpose | Auth |
|---|---|---|
| `strava-webhook` | GET handshake + POST activity → upsert | `verify_jwt=false` (Strava verify token) |
| `withings-webhook` | notify → `getmeas` → upsert weight | `verify_jwt=false` |
| `apple-health` | Health Auto Export JSON → `daily_steps` | `verify_jwt=false` + `?token=` shared secret |
| `oauth-callback` | One-time OAuth for both providers | `verify_jwt=false` |
| `reconcile` | Backfill from Strava+Withings; `?days=N` (max 365) | anon JWT |
| `compute-scores` | Compute daily scores; `?days=N` (max 400) | anon JWT |
| `update-goals` | Settings panel writes (allow-listed metrics) | anon JWT |
| `run-plan` | AI running coach → Claude; stores the plan in `run_plans` | anon JWT |
| `run-review` | Grades a stored plan against that day's activities | anon JWT |

**Cron:** `health360-reconcile` (03:10 UTC) + `health360-compute-scores` (03:20 UTC), via
pg_cron + pg_net, posting with the anon key as bearer.

### The Health 360 score
Three pillars: **Movement 40%** (steps ÷ daily goal), **Exercise 40%** (rolling 7-day active
hours ÷ weekly goal), **Weight 20%** (7-day rolling-avg trend vs goal direction: toward 100 /
flat 70 / away 40). Capped at 120%. **Missing pillars are dropped and remaining weights
renormalized — never scored as zero.** All goals *and* pillar weights live in the `goals` table
(editable from the ⚙️ settings panel — no redeploy).

---

## Integrations — all live

- **Strava** — OAuth done, webhook subscription id **360934**. Client ID `209564`.
  Gotcha: the *Authorization Callback Domain* in the Strava app settings must be
  `dsdxvlmkftlqzqadvhsa.supabase.co` (domain only). Wrong value = `redirect_uri invalid`.
- **Withings** — OAuth done; notification auto-subscribed by the callback. Registered URLs
  include both the oauth-callback and the withings-webhook.
- **Apple Health** — Health Auto Export iOS app posts steps daily to
  `…/functions/v1/apple-health?token=<APPLE_HEALTH_TOKEN>` (metric `step_count`, JSON, daily
  aggregation). **Push-only — cannot be pulled server-side.**
  The endpoint keeps `max(stored, incoming)` per day, so a partial push can never lower a day's
  count (a late-night push once left 8 and 44 steps on two days). To correct a figure DOWNWARD,
  delete the row first. The dashboard shows a banner if steps are 2+ days old.

**Backfilled data:** ~86 activities + ~31 weigh-ins (full year, via `reconcile?days=365`),
~1,217 days of steps (Nov 2022→) imported from a native Apple Health `export.zip`, deduped by
source priority **Apple Watch > Connect/Garmin > iPhone** with interval-level gap filling
(naive summing over-counted by 46%), and 365 days of computed scores.

---

## Dashboard features

Day / Week / Month toggle · **‹ › time-machine navigation** (view any past period; anchor date
threaded through every panel) · score gauge with pillar bars, sparkline and WoW/MoM delta ·
expandable "How this score works" · summary stats with deltas · weight (in **lb**) · steps ·
training load by sport · running (km + pace) · this-week activity log · per-source "last synced"
footer · ↻ manual sync button · ⚙️ goals/scoring settings · 🏃 **AI coach**.

**Conventions worth knowing:**
- Weight is stored canonically in **kg**; `WEIGHT_UNIT` in `web/src/lib/metrics.ts` converts to
  lb at display time only. Flip that one constant to switch back.
- The score headline shows the **last complete day** (today is partial → Movement would read low).
- Delta comparisons use a **rolling** window (last 7/30d vs prior), not the calendar bucket, so a
  partial current period doesn't make every delta negative. Charts use calendar buckets.
- All time bucketing is **client-side** in `metrics.ts` (the old weekly SQL views were retired).
- Demo mode: `VITE_USE_MOCK=1` in `web/.env.local` renders 13 months of fake data, no backend.

---

## AI running coach (`run-plan`)

Summarizes the last 14 days (runs with distance/pace, avg+max HR, cross-training, rest days,
weekly km goal, days since last run) and asks **Claude Opus 4.8** (`claude-opus-4-8`, adaptive
thinking, official `npm:@anthropic-ai/sdk`) for **one** run today. Returns:
`Workout / Distance / Target pace / Target HR / Why / Reminder`.

Frontend: `RunPlanCard` with an optional "how do you feel today?" box. Cost ≈ 2–5¢ per click.

**Plan history + review (added 2026-11-01).** `run-plan` returns structured JSON
(`output_config.format`), renders the six-line text from it, and upserts one row per day into
`run_plans` (so plans survive a reload). `run-review` (Sonnet 5.5) compares a stored plan with
that day's activities; actual distance/pace/HR are computed in code, the model supplies only the
prose and an `adherence` enum (also a DB check constraint). The card shows "How did yesterday
go?" for any past, unreviewed plan; today's can be reviewed by passing `{"date":"YYYY-MM-DD"}`.
Regenerating a day's plan clears its review. **Not yet exercised live:** the review happy path.

**Optional secrets that improve it:**
- `RACE_GOAL` — free text (e.g. `half-marathon, Sept 20, sub-1:45`) → enables periodization
  (build vs. taper). Not set yet.
- `MAX_HR` — known max heart rate → switches Target HR from *inferred* to proper zone-based
  (easy 65–75%, tempo 80–88%, intervals 90–95%). Not set yet.

---

## Secrets

Set as **Supabase Edge Function secrets** (mirrored in gitignored `health-360/.env`):
`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_VERIFY_TOKEN`, `STRAVA_REDIRECT_URI`,
`WITHINGS_CLIENT_ID`, `WITHINGS_CLIENT_SECRET`, `WITHINGS_REDIRECT_URI`, `APPLE_HEALTH_TOKEN`,
`ANTHROPIC_API_KEY`.

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are **auto-injected** by Supabase — do not set them.

Frontend: `web/.env.local` holds `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (anon key is
public by design; RLS restricts it).

---

## How to deploy / operate

```bash
# Deploy a function (CLI is a local dev-dependency; no Docker needed)
cd health-360
export SUPABASE_ACCESS_TOKEN=<supabase PAT>
npx supabase functions deploy <name> --project-ref dsdxvlmkftlqzqadvhsa

# Run DDL / queries without the DB password (Management API)
curl -X POST "https://api.supabase.com/v1/projects/dsdxvlmkftlqzqadvhsa/database/query" \
  -H "Authorization: Bearer <supabase PAT>" -H "Content-Type: application/json" \
  -d '{"query":"select 1;"}'

# Backfill
curl -X POST ".../functions/v1/reconcile?days=365"      -H "Authorization: Bearer <ANON_KEY>"
curl -X POST ".../functions/v1/compute-scores?days=365" -H "Authorization: Bearer <ANON_KEY>"

# Frontend: push to main → Render auto-deploys
git push origin main
```

**Git push:** plain `git push origin main:main` works (the old keychain/other-account problem
is gone). **Deploy:** run `npx supabase login` once, then
`npx supabase functions deploy <name> --project-ref dsdxvlmkftlqzqadvhsa` (Docker warning is
harmless). Run DDL in the dashboard SQL editor, or via the Management API with a PAT.
**New tables need explicit grants** (`anon` SELECT, `service_role` DML) - see `0003_run_plans.sql`.

---

## Open items / next steps

**Housekeeping:** the setup tokens are still active by choice (so work can continue) — a GitHub
classic PAT + 2 fine-grained PATs, and a Supabase PAT. Revoke at github.com/settings/tokens and
supabase.com/dashboard/account/tokens when done. Nothing running depends on them (cron uses the
anon key; Render has its own GitHub connection).

**Ideas not yet built:**
- **Body-fat %** — `weight_logs.fat_ratio` is already stored but unused. Cheapest win.
- **Resting HR / sleep ingestion** — the Apple Health `export.zip` contains both; would be the
  biggest upgrade to what "Health 360" actually measures (possible 4th pillar).
- **Half-marathon training view** — weekly mileage ramp toward a race date, long-run tracking.
- **Stale-source alerts** — *partly built:* a dashboard banner covers steps (2+ days) and weight
  (14+ days). Not covered: Strava, and anything pushing a notification instead of waiting for
  you to open the page.
- **Coach learns from history** — feed the last few plan -> review pairs into `run-plan`'s prompt.
- **PWA install** — manifest + icon so it installs to the iPhone home screen.

**Incident log (read before debugging "no data"):**
- *Strava, 28-31 Jul 2026:* the Strava API app went Inactive (403 `Application ... Inactive` on every
  call, even with just client id + secret). Reactivate at strava.com/settings/api; the webhook
  subscription survives. Then `reconcile?days=10` and `compute-scores?days=14`.
- *Steps, 14 Sep - 22 Nov 2026 (68 days):* the Health Auto Export automation had an EMPTY URL, and
  the app had lost its Health read permission. The server was fine (`apple-health` answers 200 to a
  valid-token no-op POST, 401 to a bad one) - check the phone first. Automation is now REST API,
  JSON v2, Summarize Data on, every 5 min, with the Home Screen Automation widget.
- *Backfilling steps:* the automation has no custom date range. Use Export -> Manual (custom dates,
  Step Count only, Summarize Data ON, Time Grouping Days), AirDrop the JSON to the Mac, then POST it
  to `apple-health` with the token. Start after the last carefully-deduped import, or re-sent
  totals may exceed the correct ones and the keep-the-higher rule would keep them.

**Known behaviors (not bugs):**
- The Weight pillar shows "no data" whenever there's been no weigh-in in the trailing 7 days;
  it reactivates on the next weigh-in.
- In Day view early in the morning, stats can read 0 / ▼100% until the day's data syncs.
