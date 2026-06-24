# Launch playbook — getting Stockroom out there

LSCO is a dead end; this is the plan to put it in front of people who *can* say
yes. The strategy: **open-source first.** Lowest friction to adoption, builds an
audience and credibility, and keeps a commercial lane open later (hosted version
/ support / dual license) because you own the copyright.

---

## WHO it's for (in priority order)

1. **Self-hosters / homelab crowd** — actively hunt for exactly this: open
   source, Docker, no SaaS. Warmest possible audience. *Start here.*
2. **Technical theater / stagecraft** — the original use case (lighting/bulb
   stockroom). Small, passionate, underserved by software.
3. **Makerspaces, small shops, labs, facilities/maintenance (MRO)** — supply
   closets full of consumables + chemicals. The SDS feature is a real hook.
4. **Other locked-down orgs** (schools, small agencies) that get blocked from
   cloud tools — the self-hosted, no-data-leaves-the-building angle is the pitch.

## WHERE to post it

| Channel | What to do | Effort |
|---|---|---|
| **GitHub (public)** | Make the repo public. This is home base. | 5 min |
| **Live demo (Cloudflare)** | Deploy a *separate* public demo Worker (`npm run deploy:demo` → `envo-demo.corsys.workers.dev`). Real app stays private; demo is sample-data only. | 10 min |
| **r/selfhosted** | Show-and-tell post (draft below). Best single channel. | 20 min |
| **r/homelab** | Same post, lightly retargeted. | 5 min |
| **awesome-selfhosted** | PR adding Stockroom to the Inventory section. Long-tail traffic. | 20 min |
| **selfh.st** | Submit to the newsletter/weekly — big self-hosted reach. | 10 min |
| **r/techtheatre** | Theater-flavored post (the origin story sells here). | 15 min |
| **AlternativeTo** | List as an alternative to Sortly / inFlow / Grocy. | 15 min |
| **Product Hunt** | One-time launch once the demo + screenshots are solid. | 1–2 hr |

## HOW — order of operations

1. **Polish the storefront.** Add 2–3 screenshots (or a short GIF of a barcode
   scan) to the README. *This matters more than anything else* — visuals convert.
2. **Make the repo public** and deploy the separate public demo (see below) so
   the live demo link works for strangers — your real app stays locked.
3. **Post to r/selfhosted** (draft below). Reply to every comment for the first
   48h — engagement drives the algorithm.
4. **Submit the awesome-selfhosted PR** and **selfh.st** the same week.
5. **Then** the niche communities (techtheatre, makerspaces) and AlternativeTo.
6. Save **Product Hunt** for when you have polish + a few GitHub stars behind you.

---

## Draft: r/selfhosted post

> **Title:** I built a self-hosted, mobile-first inventory app for consumables (barcode scanning, SDS tracking, no cloud)
>
> I needed to track a stockroom of supplies from my phone and didn't want a SaaS
> subscription with my data on someone else's server — so I built **Stockroom**.
>
> It's mobile-first: scan a barcode, check stock in/out, track quantities,
> locations, prices. It handles any consumable (bulbs, tools, paint, chemicals,
> belts), prints QR labels, has role-based access, and can attach chemical safety
> sheets (SDS) to items.
>
> The whole thing runs on one box via Docker — app + Postgres + auth + storage,
> no external cloud, data never leaves your network. Put it on an isolated VLAN
> and it's effectively air-gapped.
>
> Live demo (sample data, no signup): <link>
> Source (AGPL-3.0): <link>
>
> Stack: React/Vite + self-hosted Supabase. Feedback welcome — happy to answer
> anything about the setup.

## Draft: awesome-selfhosted entry

> - [Stockroom](https://github.com/cor-sys/Envo) - Mobile-first inventory app for
>   consumables: barcode scanning, check-in/out, locations, prices, QR labels,
>   and chemical safety (SDS) tracking. Runs entirely on your own hardware.
>   `AGPL-3.0` `Docker/Nodejs`

## Draft: r/techtheatre post

> **Title:** Made a free, self-hosted app for tracking a lighting/expendables stockroom (scan from your phone)
>
> Built this to manage our bulb/gel/expendables stockroom — scan a barcode on
> your phone to check things in and out, track counts and locations, print QR
> labels for bins. It's free and open source, runs on a cheap mini-PC (no cloud,
> no subscription). Demo + source in comments. Would love feedback from other
> folks managing a shop.

---

## Things only you can do
- Make the repo **public** (GitHub → Settings → General → Change visibility).
- **Deploy the public demo** (keeps your real app private): run
  `npm run deploy:demo` to ship a separate, sample-data-only Worker at
  `envo-demo.corsys.workers.dev` with no access gate. (Or in Cloudflare, create a
  new project `envo-demo` from this repo with build command `npm run build:demo`
  and output dir `dist-demo`.) Leave the real `envo` app's gate exactly as is.
- Add **screenshots** to the README (or send them to me and I'll wire them in).
- Decide the endgame: pure open-source project, or open-core with a paid hosted
  version later. Both start with the steps above — it only forks down the road.
