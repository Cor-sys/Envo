# Stockroom

**A mobile-first, self-hostable inventory app for consumables.** Scan a barcode,
check stock in or out, track quantities, locations, prices, and chemical safety
sheets — from your phone. Runs entirely on your own hardware. No cloud, no
subscription, no vendor.

<!-- TODO: drop a screenshot or screen-capture GIF here — it sells the app
     faster than any paragraph. Scan screen + inventory list are the money shots. -->

## Why

Most inventory tools are SaaS: monthly fees, your data on someone else's server.
Stockroom is the opposite — it's open source (AGPL-3.0) and built to run on a
$150 mini-PC on your own network. Your data never leaves the building. That makes
it a fit for shops, labs, theaters, makerspaces, facilities/maintenance teams,
and anyone in a locked-down environment (schools, agencies) where cloud tools
get blocked.

## Features

- 📷 **Barcode/QR scanning** from the phone camera — instant item lookup, plus
  add-to-catalog for unknown codes.
- 📦 **Any inventory type** — bulbs, tools, paint, chemicals, belts, supplies.
  One flexible item model, zero migrations to add a new category.
- 🔁 **Atomic check-in / check-out** with an immutable activity log.
- 🧪 **Chemical safety (SDS)** — attach and track Safety Data Sheets per item.
- 🏷️ **Printable QR labels** and a building/location map.
- 💵 **Cost tracking** — prices, spend, and savings reporting.
- 👥 **Role-based access** — owner / admin / manager / staff, invite-based signup.
- 📱 **Installable PWA**, works on any phone, offline-tolerant.

## Run it

Two ways to deploy — pick whichever fits. Both run the same app; they only
differ in *where the backend lives*.

### Option A — Cloud (fastest, no hardware)

Host the database on Supabase's cloud and the app on any static host.

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Build the database** — in the Supabase SQL editor, run `db/schema.sql`,
   then each file in `db/migrations/` in order. (Edit the owner email in
   `206_*` / `211_*` first — see the `CHANGE this` note in those files.)
3. **Create two storage buckets**: `item-photos` and `sds` (for item photos and
   Safety Data Sheets).
4. **Deploy the edge functions** in `supabase/functions/` (`create-invite`,
   `redeem-invite`, `cache-sds`) with the Supabase CLI.
5. **Deploy the app**: copy `.env.example` to `.env.local`, fill in your project
   URL + anon key, then `npm run build` and serve `dist/` on any static host
   (Cloudflare, Netlify, Vercel, …).

### Option B — Self-host (no cloud, runs on one box)

Everything — app + database + auth + storage — on a machine you own:

```bash
node deploy/gen-keys.mjs              # generate secrets
cp deploy/.env.example deploy/.env    # paste them in, set your LAN URL
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
```

Open `http://<box-ip>:8080`. The schema and migrations apply automatically. Full
walkthrough — including how to propose it to a security-conscious IT department —
in **[SELF-HOST.md](./SELF-HOST.md)**.

## Tech

React + Vite + Tailwind on the front end; Supabase (Postgres + auth + storage +
edge functions) on the back end — hosted (Option A) or self-hosted (Option B).
See [`BRIEF.md`](./BRIEF.md) for the data model and design rules.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173 (and your LAN IP for phone testing)
# Want sample data with no backend? add VITE_DEMO_MODE=true to .env.local
```

See [`ONBOARDING.md`](./ONBOARDING.md) for the full dev setup.

## License & intended use

Licensed under the **GNU AGPL-3.0** — see [`LICENSE`](./LICENSE). You're free to
host, modify, and run it yourself. If you offer a modified version to others over
a network, those changes must be shared under the same license. (Want to use it
commercially without that obligation? The copyright is held in one place, so a
separate commercial license is possible — open an issue.)

**Scope:** built for *consumable* inventory — counts, locations, check-in/out.
It is **not** designed to hold sensitive or regulated data (no PII, student, or
financial records).
