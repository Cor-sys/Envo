# Stockroom — Onboarding (frontend dev)

Welcome. Your scope is the **visual style** of Stockroom — components, pages, CSS. This doc gets you running locally in under five minutes with **no Supabase credentials**.

## What you need

- Git
- Node.js 18+ (`node --version`)
- An editor (VS Code is fine)
- Access to https://github.com/StoveGodCooks/Envo

## 1. Clone and install

```powershell
git clone https://github.com/StoveGodCooks/Envo.git
cd Envo
npm install
```

## 2. Switch on demo mode

Demo mode swaps in an in-memory mock client so you don't need a Supabase login. You get 8 realistic sample items (bulbs, tools, paint, chemicals, belts, supplies) and a fake signed-in session.

```powershell
Copy-Item .env.example .env.local
# Open .env.local, uncomment the VITE_DEMO_MODE line so it reads:
#   VITE_DEMO_MODE=true
```

You don't need to set `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` — leave them as the placeholders.

## 3. Run

```powershell
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). You should see the **Inventory** list immediately, with a yellow "Demo mode — all data is fake" banner at the top. Click any item to see its detail page, or "+ Item" to test the create form.

## 4. What you can and can't touch

**Fair game (visual scope):**
- `src/components/**` — buttons, pills, gates
- `src/pages/**` — Inventory, NewItem, ItemDetail, Labels (and Scan/Reports when they exist)
- `src/index.css` — Tailwind layer, custom utility classes, print styles
- Anything to do with layout, color, type, spacing, animation, responsive breakpoints, mobile polish

**Off-limits (lead-dev only):**
- `db/**` — Postgres schema
- `wrangler.jsonc`, `vite.config.js`, `package.json`, `package-lock.json` — infra and deploy
- `src/lib/supabase.js`, `src/lib/auth.jsx`, `src/lib/items.js`, `src/lib/demoClient.js` — core data layer
- `.github/**` — CI, CODEOWNERS

If you think a visual fix needs a backend or core-lib change, open an issue or a draft PR and tag the lead — don't push it directly.

## 5. Git workflow

```powershell
# Always start fresh on main
git checkout main
git pull origin main

# Branch per task — prefix with your name so it's obvious whose it is
git checkout -b ryder/short-name-of-change

# Work. Commit small, descriptive commits.
git add <only the files you actually changed>
git commit -m "ui: tighten spacing on inventory cards"

# Push and open a PR
git push -u origin ryder/short-name-of-change
gh pr create --fill   # or open one via the GitHub website
```

`main` is branch-protected: you cannot push directly to it and you cannot merge your own PRs. Every PR needs review and merge by the lead dev. That's the point — it's how schema/infra changes get blocked without you having to remember the off-limits list.

## 6. Quick reference

| Thing | Where |
|---|---|
| Brief / scope | [`BRIEF.md`](./BRIEF.md) |
| Backend off-limits | `db/**`, `wrangler.jsonc`, `package.json`, `src/lib/**` |
| Run the app | `npm run dev` |
| Build production bundle | `npm run build` |
| Sample data | `src/lib/demoClient.js` (read-only — change one of the seed items if you want to test a different status) |
| Lead dev | `@StoveGodCooks` |

## Common questions

**"My +1 / −1 click doesn't persist when I refresh."** Correct. Demo mode is in-memory only. Refresh resets everything to the seed. To persist, the real app talks to Supabase — but that's not part of your scope.

**"I want to test the login screen."** Click "Sign out" in the header. The mock client clears the session and you'll see the Login form. Any email + any password gets you back in.

**"I want to add a new sample item."** Either use the in-app "+ Item" form (won't persist) or edit the seed array in `src/lib/demoClient.js` (does persist for future page loads). Editing demoClient.js is OK for adding *demo seed data* even though it lives in `src/lib/` — that's the one exception to the off-limits list.

**"Tailwind class isn't applying."** Make sure the file path is matched by `content` in `tailwind.config.js`. New `.jsx` files under `src/` work by default; if you add a new directory, check the config.

**"`npm run build` fails."** Read the error — usually a missing import or unused variable. The same build runs on Cloudflare on every push, so fix locally before pushing.

**"How do I see my change on the deployed site?"** You don't — the deploy is the lead dev's responsibility. Your PR gets reviewed; once merged, Cloudflare auto-deploys to https://envo.corsys.workers.dev within ~30 seconds.
