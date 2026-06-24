# Stockroom

Mobile-first inventory app for a small lighting/bulb stockroom. See
[`BRIEF.md`](./BRIEF.md) for goals, scope, data model, and build order.

## Stack

- React + Vite + Tailwind (mobile-first UI)
- Supabase (Postgres + auth + RLS) — fully self-hostable
- Render free tier for hosting (any static host works)

## Quick start

```powershell
# 1. Install dependencies
npm install

# 2. Create a Supabase project, then run db/schema.sql in its SQL editor.
#    (Self-host alternative: psql -f db/schema.sql against your own Postgres.)

# 3. Copy env template and fill in your project URL + anon key.
Copy-Item .env.example .env.local
# then edit .env.local

# 4. Run the dev server. Open on your phone via the LAN URL Vite prints.
npm run dev
```

The dev server binds to all interfaces (`vite.config.js`) so phones on the same
Wi-Fi can hit it during development — e.g. `http://192.168.x.x:5173`.

## Project layout

```
db/schema.sql        Postgres schema, RLS, and the record_movement() RPC
                     that does atomic check-in/out (see BRIEF.md §8.1).
src/lib/supabase.js  Client + recordMovement() helper.
src/App.jsx          Mobile shell with a bottom tab bar.
BRIEF.md             Project brief — source of truth for v1 scope.
```

## Self-host escape hatch

If a hosted free tier ever changes its terms, every piece of this stack runs on
a mini-PC:

- App: `npm run build` produces a static bundle servable by any web server.
- DB + auth: Supabase is itself open source; `db/schema.sql` also imports
  cleanly into a vanilla Postgres if you skip the `auth.users` references.

## License & intended use

Licensed under the **GNU AGPL-3.0** — see [`LICENSE`](./LICENSE). You're free to
**host it on your own servers, modify it, and run/service it internally.** The
AGPL's only catch: if you distribute it or offer a modified version to others
over a network, those changes must be shared under the same license.

**Scope / data sensitivity:** this app is built for *consumable* inventory —
item counts, locations, and check-in/check-out for things like lighting and bulb
stock. It is **not** designed to hold sensitive or regulated data (no student
records, PII, or financial data), and it should not be used for that purpose.

For on-prem/self-hosted deployments, see the **Self-host escape hatch** above.
