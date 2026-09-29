# Load test

Simulates many people using the app at once (opening Home, browsing, joining plans, chatting, creating plans)
with the same API calls the app makes, then checks the data stayed consistent.

**Never run this against the live Supabase project.** Use a local copy or a separate Supabase *test* project.

## What you need

- `psql` (Postgres client) and [k6](https://k6.io): `brew install postgresql@17 k6`
- A test database with all SQL files in `supabase/` applied (schema.sql, then 002 … 015)
- Its connection string (`DB_URL`), API URL (`BASE`) and JWT secret. For a Supabase test project:
  - `DB_URL`: Project Settings → Database → Connection string (direct)
  - `BASE`: `https://<ref>.supabase.co/rest/v1`, plus `APIKEY` = the anon key
  - JWT secret: Project Settings → API → JWT secret (legacy)

## Run it

```sh
# 1. Fake users (loadtest+N@example.com), plans, joins and chat around Bengaluru
psql "$DB_URL" -v users=1000 -v plans=20000 -v lat=12.97 -v lng=77.59 -f loadtest/seed.sql

# 2. One login token per test user (kept out of git)
psql "$DB_URL" -Atc "select id from auth.users where email like 'loadtest+%' order by email" \
  | python3 loadtest/make_tokens.py --secret "$JWT_SECRET" > loadtest/tokens.json

# 3. The test: ramps to 1,000 people over 3 min, holds 5 min (macOS: raise the open-files limit first)
ulimit -n 20000
k6 run -e BASE="$BASE" -e APIKEY="$APIKEY" -e TOKENS=./loadtest/tokens.json -e VUS=1000 loadtest/k6.js

# 4. Consistency checks + slowest queries
psql "$DB_URL" -f loadtest/check.sql

# 5. Remove all test data
psql "$DB_URL" -f loadtest/cleanup.sql
```

Smaller first run: `-e VUS=50 -e RAMP=30s -e HOLD=1m`.

## Reading the results

- `unexpected_errors`: should be 0. The first few are printed as `name -> status message`.
- `expected_refusals`: normal "plan got full / already started" answers the app shows to people.
- `http_req_duration{kind:read|write}`: `med` is a typical request, `p(95)` the slowest 5%.
- `check.sql`: every consistency line should show 0 problems.

## Not covered

- Live chat and alert connections (Supabase Realtime). The free plan allows about 200 at once.
- How the app feels on a phone (scrolling, images). Have a few people use real phones during a run.
