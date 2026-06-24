# Self-hosting Stockroom (no cloud)

This runs the **entire app on one machine** — a mini-PC, an old desktop, or a
server — with **no external cloud and no data leaving the box.** It's the same
app you already have; it just talks to a local Supabase instead of the hosted
one.

Why this matters: the cloud version raises legitimate questions for any
locked-down environment (state agencies, schools, healthcare) — third-party
hosting, vendor certification, data leaving the org. **This version removes all
of that by design.** Nothing is in the cloud. Put the box on an isolated VLAN
with no internet and it's effectively air-gapped.

---

## What you need

- A machine with **Docker** + **Docker Compose** (Linux, Windows, or macOS).
- ~2 GB RAM free and a few GB of disk. A $150–250 mini-PC is plenty.
- Node.js (only to run the one-time key generator — or generate keys anywhere).

## First-time setup

```bash
# 1. Generate secrets.
node deploy/gen-keys.mjs

# 2. Create your env file and paste the generated block into it.
cp deploy/.env.example deploy/.env
#    - paste POSTGRES_PASSWORD / JWT_SECRET / ANON_KEY / SERVICE_ROLE_KEY
#    - set SUPABASE_PUBLIC_URL to this box's LAN address + port,
#      e.g. http://192.168.1.50:8080
#    - set HTTP_PORT if you don't want 8080

# 3. Bring it all up (builds the app, starts Supabase, applies the schema).
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build

# 4. Watch the one-time migration finish, then check everything is healthy.
docker compose -f deploy/docker-compose.yml logs -f migrate
docker compose -f deploy/docker-compose.yml ps
```

Open `http://<box-ip>:8080` from any phone or laptop on the same network.

## Creating the first user

Open signup is disabled (accounts come from invites). Create the first
owner account directly against the database:

```bash
# Make an account, then promote it to owner.
docker compose -f deploy/docker-compose.yml exec auth \
  gotrue admin createuser you@example.com 'a-strong-password' --confirm
# then, in psql, set the staff_profiles role for that user to 'owner'
docker compose -f deploy/docker-compose.yml exec db \
  psql -U postgres -c "update public.staff_profiles set role='owner' where ...;"
```

> The exact owner-bootstrap command depends on how `staff_profiles` rows get
> created (trigger on auth signup vs. invite). Confirm against `db/schema.sql`
> and migration `211_rbac_roles.sql` on your first run — this is the one step to
> verify on the target box.

## Day-2

- **Update the app:** `git pull`, then `up -d --build`. Re-running `migrate` is
  safe (schema + migrations are idempotent).
- **Back up:** the only state lives in the `db-data` and `storage-data` Docker
  volumes. `pg_dump` the database on a schedule and copy the storage volume.
- **HTTPS / nice hostname:** put Caddy or nginx in front for TLS and a name like
  `stockroom.yourorg.local`. Not required on a trusted LAN.

---

## If you're proposing this to IT

The earlier denial was about the **cloud** build. This deployment is a different
architecture, and it's worth saying so plainly:

- **No cloud service.** No TX-RAMP / HECVAT question — there's no external
  vendor or hosted service to assess.
- **Data never leaves the organization.** It lives on a box you place on your
  own network. Can run with no internet access at all.
- **Open source, you/they own the box.** No license fees, no personal hosting,
  no individual holding the data.
- **Low-sensitivity by design.** Consumable inventory only — counts, locations,
  check-in/out. No PII, student, or financial records.
- **They don't have to maintain it if they don't want to** — the maintainer runs
  it; IT just allows a low-risk appliance on the network.

That reframes the ask from "approve a cloud vendor" (which failed) to "allow a
self-contained, no-internet inventory appliance on the LAN" — a much smaller,
lower-risk question.

> **Status:** this deployment stack is new and should be validated end-to-end on
> the target hardware before you rely on it — image versions, the owner-bootstrap
> step, and the edge-function wiring are the spots to confirm on first boot.
