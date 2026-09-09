# EatFit

Weekly meal plans from what is already in your fridge, with the missing groceries added
straight to your real Silpo cart. Ukrainian-first UI, English toggle.

Live: https://eat-fit-web-app.vercel.app · Silpo AI Factory hackathon entry (submission
due 2026-09-14 23:59 Kyiv, video pitch mandatory).

## What it does

1. Onboarding: goal, age, weight, height, sex, activity → Harris-Benedict daily kcal target.
2. Fridge contents and dietary tags (typed, or scanned from a photo by the model).
3. The model writes a 7-day plan, 3 meals a day, with kcal, macros and per-ingredient
   grams, in the UI language. Any day can be regenerated with a free-text wish.
4. Own dishes: the user's recipes with known kcal and macros (or a model estimate),
   pinned into slots of the week. Generation fills only the unpinned slots.
5. Shopping list = plan ingredients minus what the user owns, grouped by aisle.
6. Silpo cart: the list is matched against Silpo's live catalog through Silpo's official
   MCP server, reviewed with real prices and pack sizes, then written into the user's
   Silpo cart. The review lets users choose another search result, leave items out,
   and see purchased weight, leftovers or shortages. Its summary lists unmatched and
   excluded ingredients and the estimated product total. Payment happens on silpo.ua
   (the MCP has no order-placement tool).
7. Daily check-off of eaten meals, plan history.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind 4 · MongoDB Atlas (raw
driver, no ODM) · zod on every boundary (API input and model output) · any
OpenAI-compatible chat endpoint for the LLM (OpenRouter in production) · Firebase Auth
(Google) plus a guest mode · `@modelcontextprotocol/sdk` 1.x for Silpo MCP over
Streamable HTTP with OAuth 2.1 + PKCE per user · Vitest.

## Quick start

```bash
cp .env.local.example .env.local   # fill MONGODB_URI and the three LITELLM_* values
npm install
npm run dev                        # http://localhost:3000
```

Other commands:

```bash
npm test             # vitest: lib/*.test.ts and lib/silpo/match.test.ts
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run build        # production build (no env needed)
npm run silpo:tools  # log in to Silpo once, dump tools/list to docs/silpo-tools.json
npm run silpo:probe  # read-only probes against the MCP (cart, search, promotions)
```

Environment variables (all in `.env.local.example`):

| Variable | Purpose |
|---|---|
| `MONGODB_URI`, `MONGODB_DB` | Atlas connection string, database name (default `mealplanner`). Collections and indexes are created on first connect, no migrations. |
| `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LITELLM_MODEL` | Any endpoint with `POST {base}/chat/completions`, Bearer auth, `response_format: json_object` and `image_url` parts. Production uses OpenRouter with `openai/gpt-5.6-luna`. The `LITELLM_` prefix is historical. |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID` | Firebase web config, public by design. Leave empty to hide the Google button and run guest-only. Inlined at build time. |
| `SILPO_MCP_URL` | Optional, default `https://mcp.silpo.ua/mcp`. |
| `APP_BASE_URL` | Optional. Public origin for the Silpo OAuth redirect; defaults to the request origin. Set only when two domains serve the same deployment. |

Silpo needs no developer credentials: the app registers itself as an OAuth client on
first use (dynamic client registration, one registration per redirect URI) and each user
signs in on silpo.ua from the Cart page.

## How it fits together

- Identity is an httpOnly `mp_uid` cookie (30 days) for guests and Google users alike.
  Google sign-in on a device with a guest cookie upgrades the same user document.
  `GET /api/me` is the single bootstrap call: cookie → user, profile, latest plan, pins.
- `POST /api/generate-plan` reads the profile, pins and dishes from Mongo (the client
  sends only its local `startDate`), resolves pinned slots to meals, asks the model for
  the free slots with a zod schema built for exactly those slots, retries once with the
  validation error, recomputes every total server-side, stores the plan.
  `POST /api/regenerate-day` does the same for one day and keeps that day's pins.
- i18n: `lib/i18n/uk.ts` is the typed source of truth, `en.ts` must match it key for
  key; parameterized strings are functions. The locale is the `eatfit_locale` cookie,
  read by the root layout for `<html lang>` and metadata, and by the generation routes so
  menus come out in the UI language. JSON keys and `day` values stay English.
- Own dishes live in `dishes`; pins are a weekly template on the user document
  (`pins[day][slot] = dishId`, `PUT /api/pins`). Pinning while a plan exists swaps the
  slot in place for today and future days. Pure helpers in `lib/pins.ts`.
- The shopping list is derived client-side in `lib/shopping.ts` (bilingual stems for
  aisles and owned-item matching), never persisted.
- Cart review state and requests live in `hooks/useSilpoCart.ts`. Quantity helpers
  are shared by the server and browser; identical selected products are combined before
  commit and checked against stock. After commit, checkout links lead to Silpo for further edits because the
  add/update tool does not remove previously added products.
- Silpo (`lib/silpo/`): `auth.ts` is a Mongo-backed `OAuthClientProvider` per user;
  `client.ts` wraps the MCP client and validates tool results with zod; `match.ts`
  translates item names to Ukrainian (Silpo search is Ukrainian-only) and lets the model
  vet candidates (hits carry no category); `cart.ts` builds the review cart read-only and
  commits it (`silpo_add_or_update_cart_products`, fixing an expired delivery slot
  first). Tool schemas as served live are in `docs/silpo-tools.json`.
- Every API route follows one shape: `getUid()` → 401, `readJsonBody()` → 400/413, zod
  `safeParse` → 400 with issues, then a try/catch mapping domain errors to
  snake_case codes (`generation_failed` 422, `upstream_error` 502, `silpo_unlinked` 401,
  `no_cart` 409, `server_error` 500).

Data lives in seven collections: `users` (profile and pins embedded), `plans`,
`progress`, `orders`, `dishes`, `silpo_oauth` (per-user MCP tokens), `silpo_clients`
(OAuth client registration per redirect URI).

## Deployment and operations

- Hosting: Vercel Hobby, project `eat-fit-web-app` in the owner's personal team, Git
  integration on `Oodmincheg/EatFitWebApp`. Every push to `main` deploys to production,
  so work lands on branches and the owner merges. Deployment URLs
  (`eat-fit-web-*-vlads-projects-*.vercel.app`) sit behind Vercel SSO; the public alias
  is `eat-fit-web-app.vercel.app`.
- Environment variables are managed with the Vercel CLI (`vercel env ls`, `vercel env
  add NAME production`). `NEXT_PUBLIC_*` values need `--type config` and are baked in at
  build time: after changing one, redeploy (`vercel redeploy <deployment-url>`).
  `vercel link` rewrites `.env.local` (adds `VERCEL_OIDC_TOKEN`) and appends `.env*` to
  `.gitignore`; revert the `.gitignore` line, it would hide `.env.local.example`.
- MongoDB Atlas M0 pauses after inactivity and drops its DNS records while paused, so
  `mongodb+srv://` fails with `querySrv ENOTFOUND`. Resume the cluster in the Atlas
  console; the data is intact.
- Firebase: the deploy domain must be listed under Authentication → Settings →
  Authorized domains, or the Google popup fails with `auth/unauthorized-domain`.
- Silpo: a new origin means a new OAuth client registration (automatic) and every user
  re-links once. Local dev tokens from `npm run silpo:tools` live in the gitignored
  `.silpo-oauth.local.json`; production tokens in the `silpo_oauth` collection.
- npm: `.npmrc` pins `registry.npmjs.org`. A user-level `~/.npmrc` pointing at a private
  registry would otherwise write private URLs into `package-lock.json` and break
  `npm install` on Vercel (E401). Grep the lockfile for `artifactory` before pushing.

## Known limitations

- Firebase ID tokens are decoded without signature verification (no `firebase-admin`).
  Auth is spoofable; acceptable for a demo, not for production.
- The three Google Fonts (Bricolage Grotesque, Instrument Sans, Space Mono) have no
  Cyrillic subset, so Ukrainian text renders in the system fallback font.
- Silpo cannot place or pay for the order through the MCP; the app hands the user
  `checkoutWebLink`. Silpo's minimum order is enforced at checkout, and weighted goods
  come in the store's step (0.55 kg of bananas for 120 g needed; the cart explains this).
- Users without a Silpo delivery address see a notice to set one in the Silpo app;
  `silpo_create_shopping_cart` is not wired.

## Documentation

| File | Status |
|---|---|
| [AGENTS.md](./AGENTS.md) | Working rules for teammates and coding agents |
| [docs/DECISIONS.md](./docs/DECISIONS.md) | Why things are the way they are, dated |
| [RESEARCH_SilpoMCP.md](./RESEARCH_SilpoMCP.md) | Silpo MCP capabilities, auth, hackathon rules, live probe results. Current |
| [RESEARCH_MoveToOwnInfra.md](./RESEARCH_MoveToOwnInfra.md) | Moving off the original hackathon infrastructure. Mostly executed, see its status block |
| [docs/silpo-tools.json](./docs/silpo-tools.json) | `tools/list` from `mcp.silpo.ua` with input and output schemas |
| [PRD_MealPlanner_MVP.md](./PRD_MealPlanner_MVP.md), [SPEC_MealPlanner_MVP.md](./SPEC_MealPlanner_MVP.md) | Historical: the July 2026 MVP as designed; the app has moved on |
| [SPEC_ZakazCart_Feature.md](./SPEC_ZakazCart_Feature.md), [RESEARCH_GroceryOrdering_Ukraine.md](./RESEARCH_GroceryOrdering_Ukraine.md), [RESEARCH_ZakazUA_API.md](./RESEARCH_ZakazUA_API.md) | Superseded by the Silpo integration; kept for the matching-pipeline rationale |

## Demo script

Guest → onboarding → "Мої страви": add a dish, estimate its macros → "План на
тиждень": pin it into a slot, generate → 7 days with the pinned meal marked 📌 →
regenerate one day with a wish → "Продукти": tick what you own → "Зібрати кошик у
Сільпо" → connect Silpo once → review real products and quantities → add to the Silpo
cart → checkout link. Refresh: everything persists.
