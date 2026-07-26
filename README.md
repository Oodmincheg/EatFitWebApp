# EatFit — AI Build Day team repo (Clauders)

Personalized weekly meal plans from what's already in your fridge. Hackathon MVP per
[SPEC_MealPlanner_MVP.md](./SPEC_MealPlanner_MVP.md) / [PRD_MealPlanner_MVP.md](./PRD_MealPlanner_MVP.md).

## Stack

Next.js 15 (App Router) + TypeScript + Tailwind · MongoDB Atlas (raw driver) ·
LiteLLM (OpenAI-compatible, key server-side only) · Firebase Auth (Google) + guest mode ·
zod validation on API input **and** model output.

## Setup

1. Create a MongoDB Atlas M0 cluster, a DB user, allow-list `0.0.0.0/0` (demo only).
2. `cp .env.local.example .env.local` and fill in:
   - `MONGODB_URI` (+ optional `MONGODB_DB`, defaults to `mealplanner`)
   - `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LITELLM_MODEL`
   - `NEXT_PUBLIC_FIREBASE_*` — optional; if unset the Google button is hidden and
     guest mode remains the demo-safe path.
3. Install and run:

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests for lib/calories.ts and lib/shopping.ts
npm run build      # production build
```

Collections and indexes are created automatically on first use — no migrations.

## How it fits together

- Identity is an httpOnly `mp_uid` cookie (30 days) for both guests and Google users;
  Google sign-in on a device with a guest cookie upgrades the same user document.
- `GET /api/me` is the single bootstrap call: cookie → user + profile + latest plan.
- `POST /api/generate-plan` takes no body — the server loads the profile from the DB,
  prompts LiteLLM, validates the JSON with zod (one corrective retry), recomputes
  daily totals, persists the plan, and returns it.
- The shopping list is derived client-side (`lib/shopping.ts`) — never persisted.
- Grocery ordering is a mock (spinner → success modal), no network calls.

> ⚠️ Demo simplification (spec §5.1): Firebase ID tokens are decoded **without**
> signature verification (no `firebase-admin`). Auth is spoofable — fine for a jury
> demo, never for production.

## Demo script

Guest → onboarding (goal, params, "chicken, buckwheat, eggs, tomatoes" + gluten-free)
→ dashboard → Generate → 7-day plan with kcal → shopping list (owned items absent)
→ Order basket → success modal → refresh: everything persists from MongoDB.
