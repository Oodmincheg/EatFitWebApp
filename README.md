# EatFit — AI Build Day team repo (Clauders)

Personalized weekly meal plans from what's already in your fridge. Hackathon MVP per
[SPEC_MealPlanner_MVP.md](./SPEC_MealPlanner_MVP.md) / [PRD_MealPlanner_MVP.md](./PRD_MealPlanner_MVP.md).

## Stack

Next.js 15 (App Router) + TypeScript + Tailwind · MongoDB Atlas (raw driver) ·
LiteLLM (OpenAI-compatible, key server-side only) · Firebase Auth (Google) + guest mode ·
zod validation on API input **and** model output · Silpo's official MCP server
(`@modelcontextprotocol/sdk`, OAuth 2.1 per user) for the real grocery cart.

## Setup

1. Create a MongoDB Atlas M0 cluster, a DB user, allow-list `0.0.0.0/0` (demo only).
2. `cp .env.local.example .env.local` and fill in:
   - `MONGODB_URI` (+ optional `MONGODB_DB`, defaults to `mealplanner`)
   - `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LITELLM_MODEL`
   - `NEXT_PUBLIC_FIREBASE_*` — optional; if unset the Google button is hidden and
     guest mode remains the demo-safe path.
   - `APP_BASE_URL` — optional; the public origin used for the Silpo OAuth redirect
     (`/api/auth/silpo/callback`). Defaults to the request origin, which is right for
     `localhost:3000` and for a single Vercel domain.
   - `SILPO_MCP_URL` — optional, defaults to `https://mcp.silpo.ua/mcp`.
3. Silpo needs no developer credentials: EatFit registers itself as an OAuth client
   on first use (dynamic client registration) and each user signs in on `silpo.ua`
   from the Cart page. Tokens live in the `silpo_oauth` collection, keyed by `mp_uid`.
4. Install and run:

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # unit tests for lib/calories.ts, lib/shopping.ts, lib/silpo/match.ts
npm run build        # production build
npm run silpo:tools  # log in to Silpo once and dump tools/list to docs/silpo-tools.json
```

Collections and indexes are created automatically on first use — no migrations.

## How it fits together

- Identity is an httpOnly `mp_uid` cookie (30 days) for both guests and Google users;
  Google sign-in on a device with a guest cookie upgrades the same user document.
- `GET /api/me` is the single bootstrap call: cookie → user + profile + latest plan.
- `POST /api/generate-plan` takes no body — the server loads the profile from the DB,
  prompts LiteLLM, validates the JSON with zod (one corrective retry), recomputes
  daily totals, persists the plan, and returns it.
- UI language: Ukrainian by default, English via the UA/EN toggle. Dictionaries live in
  `lib/i18n/{uk,en}.ts` (`uk` is the typed source of truth), the choice is a plain
  `eatfit_locale` cookie read by the root layout for `<html lang>` and by the generation
  routes, so menus are written in the same language as the UI.
- Own dishes and pinned slots: `dishes` collection (name, ingredients with grams, kcal,
  macros; `POST /api/dishes/estimate` asks the model for the numbers), and a weekly pin
  template on the user document (`pins[day][slot] = dishId`, `PUT /api/pins`). Generation
  and day regeneration receive the pinned meals (`lib/pins.ts`) and the model is asked
  only for the free slots, balancing the day around the fixed kcal; a fully pinned
  day or week never calls the model. Pinning while a plan exists swaps the slot in
  place for today and future days.
- The shopping list is derived client-side (`lib/shopping.ts`) — never persisted.
- `POST /api/cart/silpo` matches the to-buy list against Silpo's live catalog through
  the MCP (`lib/silpo/cart.ts`): resolves the user's cart and a live delivery slot,
  translates every item EN→UK (`lib/silpo/match.ts`; Silpo search is Ukrainian-only),
  runs `silpo_find_products_batch`, lets the LLM pick the variant, and sizes
  quantities from `weighted`/`step`/`displayRatio`. Read-only.
- `POST /api/cart/silpo/commit` writes the reviewed lines into the user's real Silpo
  cart (`silpo_add_or_update_cart_products`, fixing an expired slot first) and returns
  Silpo's totals, validations, and `checkoutWebLink`. Payment happens on silpo.ua; the
  MCP has no order-placement tool.
- Tool schemas as served by `mcp.silpo.ua` are in `docs/silpo-tools.json`; live
  findings in [RESEARCH_SilpoMCP.md](./RESEARCH_SilpoMCP.md) §11.

> ⚠️ Demo simplification (spec §5.1): Firebase ID tokens are decoded **without**
> signature verification (no `firebase-admin`). Auth is spoofable — fine for a jury
> demo, never for production.

## Demo script

Guest → onboarding (goal, params, "chicken, buckwheat, eggs, tomatoes" + gluten-free)
→ dashboard → Generate → 7-day plan with kcal → shopping list (owned items absent)
→ Build my Silpo cart → Connect Silpo (login on silpo.ua) → review real products,
prices and quantities → Add to my Silpo cart → Checkout on silpo.ua → refresh:
everything persists from MongoDB.
