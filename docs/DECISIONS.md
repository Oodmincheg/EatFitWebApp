# Decisions

Dated, newest last. Each entry says what was decided, the fact that forced it, and what
it rules out. Add an entry when you change direction, not for routine work.

## 2026-07-10 · MongoDB Atlas instead of localStorage or SQLite

The PRD assumed localStorage. Persistence moved to a hosted document store so a guest
cookie plus a user document works on Vercel with no filesystem. Raw driver, no ODM: two
collections at the time did not justify Mongoose, and zod already validated the
boundaries. Firebase ID tokens are decoded without verification (no `firebase-admin`),
accepted as a demo shortcut and still open.

## 2026-09-04 · Replace Zakaz.ua with Silpo's official MCP

Silpo published an MCP server on 2026-08-13 that can write the user's real cart; the
Silpo AI Factory hackathon requires it and forbids unofficial retailer APIs. Zakaz.ua was
an undocumented backend with no cart write. All Zakaz code, the store picker and the
store logos were removed. Ceiling that remains: no order placement tool, the user pays via
`checkoutWebLink`.

## 2026-09-04 · MCP SDK v1 (`@modelcontextprotocol/sdk` 1.30.0), not v2

The server negotiates protocol `2025-11-25`, which v1 speaks and Silpo's own examples use.
The v2 packages target the 2026-07-28 spec that drops the `initialize` handshake; whether
Silpo is dual-era is unknown. Revisit when Silpo documents v2.

## 2026-09-04 · OAuth per user, dynamic client registration keyed by redirect URI

Silpo offers no API keys or service accounts: every tool needs a Silpo login. The app
implements `OAuthClientProvider` over Mongo (`silpo_oauth` per user, `silpo_clients` per
redirect URI). A new deploy origin registers a new client automatically; users re-link.
Guests can link too (keyed by `mp_uid`), at the cost of losing the link with the cookie.

## 2026-09-04 · Keep EN→UK translation and the LLM variant pick; drop the category filter

Live probes: English queries return brand noise (`potato` → Porto wine), so translation
stays. Search hits carry no category, so the Zakaz-era department filter has nothing to
read; instead the model vets every candidate with the expected department as a hint and
may return "none". Quantity math follows Silpo's model: weighted goods per kg in `step`
increments, piece goods per pack via `displayRatio`.

## 2026-09-07 · Hand-rolled i18n instead of next-intl

Every page is already a client component and the app needs no locale routing, so a typed
dictionary (`uk.ts` defines the type, `en.ts` must match) behind a context and a cookie
covers it with zero dependencies. Parameterized strings are functions, which also gives
type-checked arguments and Ukrainian plural forms. Ukrainian is the default locale.
Trade-off accepted: the three Google Fonts have no Cyrillic subset, so Ukrainian renders
in the system fallback.

## 2026-09-07 · Menus in the UI language, data keys in English

The generation routes read the locale cookie and instruct the model to write names in
that language, reusing the user's own wording for fridge items so owned-item matching
works. `day` values and JSON keys stay English because the zod schema and the
day-to-date mapping depend on them. `lib/shopping.ts` got Ukrainian stems for aisles
and matching, with dairy checked before meat so "яйця курячі" stays eggs.

## 2026-09-08 · Pins as a weekly template by day name

The user asked to place own dishes into slots and generate only the rest. Pins live on
the user document as `pins[day][slot] = dishId` rather than on a plan, so they exist
before the first generation and survive regeneration. Plan meals carry `dishId` when they
came from a pin. Pinning with a plan present swaps the slot in place, but only for today
and future days; past days are history. Unpinning keeps the meal and drops the link.

## 2026-09-08 · Ask the model only for free slots, with a per-request zod schema

The prompt lists per day which slots are fixed (name, kcal, macros) and which to
generate, and the zod schema is built so exactly the free slots are required; a missing
one becomes the corrective retry. A fully pinned day or week never calls the model.
Dish macros can be estimated by the model from the ingredient list and edited by hand.

## 2026-09-09 · OpenRouter instead of the corporate LiteLLM proxy

The proxy key expired on 2026-07-27 and belongs to the previous employer's cloud. The
code only needs an OpenAI-compatible endpoint with `response_format: json_object` and
image inputs. Anthropic's compatibility endpoint ignores `response_format`; OpenRouter
honors it and charges list price. Production model: `openai/gpt-5.6-luna`. Env names
keep the `LITELLM_` prefix to avoid churn.

## 2026-09-09 · Vercel Hobby with the repo under the owner's personal GitHub account

Hobby cannot import repositories owned by a GitHub organization, so `EatFitFood/EatFitWebApp`
was transferred to `Oodmincheg/EatFitWebApp`. Atlas and Firebase were already the team's
own and stayed. A duplicate Vercel project created during import (`eat-fit-web-application`)
was deleted; `eat-fit-web-app` is the one.

## 2026-09-09 · Pin the npm registry in the repo

The owner's `~/.npmrc` routes npm to a private Artifactory; 67 lockfile entries pointed
there and Vercel failed `npm install` with E401. `.npmrc` now pins `registry.npmjs.org`
and the lockfile was rewritten (same tarballs, same integrity hashes).

## 2026-09-09 · Meal slots are a per-profile list, days are a partial record

Fixed breakfast/lunch/dinner ruled out snacks, which are where most people lose the
calorie budget, and forced a seven-day horizon on users who only plan a few days ahead.
`MEAL_SLOTS` now holds five ordered slots and the profile picks a subset (two to five);
`DayPlan.meals` became `z.partialRecord(MealSlot, Meal)` and every consumer reads
`daySlots(day)` instead of assuming three. Old plans parse and render unchanged, and a
day keeps its own shape when regenerated, so changing the setting never reshapes history.

## 2026-09-09 · Generate day by day and stream the days out

One model call for the whole week meant 30–60 s of a skeleton, and a failure at the end
cost the whole run. Generation is now one call per day, streamed to the client as NDJSON
(`start` / `day` / `done` / `error`), and the plan document is written after every day —
so a run that dies halfway leaves a shorter, valid plan instead of nothing. Costs more
tokens than one big call and takes a similar wall-clock time; what changes is that the
user watches the week fill in. Note for Vercel: this is a long-lived response, and Hobby
caps function duration, so a seven-day run may need the plan-days setting lowered there.

## 2026-09-09 · The pantry is structured data; `ingredients` is derived

The fridge list was one free-text field editable only inside the generate dialog, so
"I bought milk" had nowhere to go and the shopping list could not know quantities. The
profile now carries `pantry: {name, grams?}[]` with its own page and its own route
(`PUT /api/pantry`, which deliberately does not restamp `createdAt` and so does not mark
the plan outdated). `profile.ingredients` is kept and derived from the pantry on every
write, because the prompt and the owned-item matching read that one string. Rows without
a weight behave exactly as the old list did; rows with one are subtracted from the
shopping list instead of removing the item. Amounts carry a unit (g/kg/ml/l/pcs) and are
converted to grams for that subtraction — millilitres count as grams, which is right for
water-like staples and close enough for milk or oil — while a count in pieces says nothing
about weight and so covers the item outright. The page saves as you type: an explicit save
button left people with a pantry that looked edited while everything else still read the
old one.

## 2026-09-10 · The pantry is the only source of the fridge list

The pre-generation dialog used to keep unconfirmed edits in sessionStorage so a half-typed
list survived a reload. Once the pantry became a saved, structured list that draft only
shadowed it: edit the pantry, open the dialog, and yesterday's text was still there. The
draft is gone and the dialog always opens on the current pantry.

## 2026-09-10 · Pantry stock is spent, not re-read

Two findings had the same root: the pantry was treated as a set of facts to
compare against rather than a stock to draw down. Several ingredients matching one
weighed row each consumed it in full, and groceries bought through the cart were
merged by name, so buying more of something already in the pantry changed nothing.
The shopping list now draws each row down once, and purchases go through
`replenishPantry`, which sums compatible units and falls back to an explicit
"no amount" — the app's word for "enough of it" — rather than inventing a number
when a count meets a weight. The cart hands over the lines it actually committed,
sized from the product (kg for weighed goods, pack contents × quantity otherwise),
so unmatched and excluded rows never reach the pantry.

## 2026-09-10 · An accepted Silpo write is not proof of what was bought

The cart writes through `silpo_add_or_update_cart_products`, which answers 200 and then
reports per-line problems in `validations` — `product.offer.stock.max` means the quantity
was trimmed. Feeding the requested quantities into the pantry after that would mark food
as at home that nobody has. So an error-level validation blocks the pantry import
entirely, and what does get imported is sized from the product itself: kilograms for
weighed goods, the pack's whole stated content times the number of packs otherwise
(`purchasedPantryItem`, sharing `parseDisplayRatio` with the matching code, which already
understood `10шт` and `5*80г/уп`). One commit can be imported once.

## 2026-09-09 · Regeneration checks its own output

Two failure modes were visible as soon as the flow was used in anger: "replace this meal"
could hand back the same meal, and a day could land far from the calorie target while the
UI dutifully showed it. Both are now checked server-side against recomputed totals, with
one corrective turn each — the meal swap is told the name it returned is the one being
replaced, the day is told its total and the target — and the closer attempt wins. One
retry only: a second call per miss is affordable, a loop is not.

## 2026-09-09 · Theme through CSS variables, not a Tailwind dark: variant

Every colour was already a `--color-*` token, so the cheapest dark mode was one level of
indirection: the palette lives on `:root`, `@theme inline` maps Tailwind's names onto it,
and `[data-theme]` plus `prefers-color-scheme` swap the values. `bg-white` became
`bg-paper` (a themed surface) everywhere except on the tomato and lime blocks, where
white is a fixed accent; `ink` is the foreground in both themes, hence `ink-contrast`
for the few elements that sit on top of it. The cookie is read in the root layout, so a
pinned theme paints on the first frame.

## Open

- Real token verification for Google sign-in (`firebase-admin` or Auth.js).
- A Cyrillic-capable font pairing.
- `silpo_create_shopping_cart` flow for users with no delivery address.
- Whether `checkoutWebLink` appears after a real commit (needs one write test on a real cart).
- Permanent LLM key for production; the current OpenRouter key is a 7-day test key.
