# Feature Specification — Real Grocery Cart via Zakaz.ua

**Version:** 1.0
**Date:** July 10, 2026
**Type:** Feature spec (extends the MVP)
**Parent specs:** [SPEC_MealPlanner_MVP.md](./SPEC_MealPlanner_MVP.md) §5.4
**Research basis:** [RESEARCH_GroceryOrdering_Ukraine.md](./RESEARCH_GroceryOrdering_Ukraine.md) (Option 1) · [RESEARCH_ZakazUA_API.md](./RESEARCH_ZakazUA_API.md)

---

## 1. Purpose & Scope

Replace the **mock** grocery order (SPEC §5.4.3 — spinner + fake ETA) with a **real, ready-to-order cart**: match the derived shopping list against live products on **Zakaz.ua** (Novus / METRO / Auchan / Varus), show a review screen with real photos, prices, and stock, and give the user **one click per item straight to the product on the store**. Checkout happens on Zakaz.ua (its cart is account-bound; see §9).

**Goal:** from "here's your shopping list" to "here's a real cart you can order in ~3 clicks", with the user doing near-zero manual searching.

**In scope**
- Server-side matching pipeline: shopping-list item → Ukrainian query → real Zakaz.ua product.
- A cart-review UI: matched products with price, image, quantity, and per-item store link.
- Estimated total, store selection (default store per city), graceful fallback to search deep links.

**Out of scope**
- Writing to the user's Zakaz.ua cart or placing an order via API (not possible — §9; parent research §3.1).
- Real payment, delivery tracking.
- Silpo / ATB / Glovo / Bolt integrations (research Options 3–5; may follow later).
- Multi-store price comparison; per-user geolocation (default store is configured, not geolocated).

---

## 2. How it fits the current architecture

Reuses the existing pattern exactly (server route → server-only lib → zod → client hook/component):

```
app/dashboard/cart/page.tsx
  ├─ ShoppingList (existing)  — tick-off list, unchanged
  └─ ZakazCart (new)          — "Build real cart" → review screen
        │  POST /api/cart/zakaz { items }
        ▼
app/api/cart/zakaz/route.ts (new, runtime: nodejs)
  ├─ zod validate body (items: ShoppingItem[])
  ├─ lib/zakaz.ts  (new, server-only)
  │    ├─ translateQueries()   → reuse LiteLLM gateway (lib/llm.ts style)
  │    ├─ searchProduct()      → GET stores-api.zakaz.ua/.../search
  │    └─ buildCart()          → match, price, quantity, links
  └─ returns { store, matched[], unmatched[], totalKop }
```

- **No new dependency.** Uses `fetch` (Zakaz.ua backend) and the already-configured LiteLLM endpoint for translation.
- **No store credentials.** Zakaz.ua reads need no auth (research §3.1). The store is read-only to us.
- **Matching runs server-side** to avoid browser CORS against `stores-api.zakaz.ua` and to keep the LiteLLM key server-only.

### 2.1 Environment variables (additions)

| Var | Required | Default | Purpose |
|---|---|---|---|
| `ZAKAZ_DEFAULT_STORE_ID` | no | `482010105` (Novus SkyMall, Kyiv) | Store to match against for the MVP. |
| `ZAKAZ_API_BASE` | no | `https://stores-api.zakaz.ua` | Backend host (override for testing). |

Translation reuses existing `LITELLM_*` vars (SPEC §2.2). If LiteLLM is unset, translation degrades to a static dictionary (§5.2).

---

## 3. Data Models (TypeScript / zod)

Add to `lib/schemas.ts`:

```ts
// A real product matched from Zakaz.ua.
export interface ZakazProduct {
  ean: string;
  title: string;               // Ukrainian, from the catalog
  priceKop: number;            // kopecks (Zakaz returns kopecks)
  weightG: number | null;      // grams, may be null
  img: string | null;          // s350x350 preferred
  webUrl: string;              // canonical product deep link
  inStock: boolean;
}

// One shopping-list line resolved to a product (or not).
export interface CartLine {
  query: string;               // English source name (ShoppingItem.name)
  neededGrams: number;         // ShoppingItem.grams (0 = unknown)
  product: ZakazProduct | null;
  quantity: number;            // suggested packs; >=1
  searchUrl: string;           // fallback: prefilled store search for this item
}

export interface ZakazCart {
  store: { id: string; chain: string; name: string; searchBase: string };
  lines: CartLine[];           // one per input item, in input order
  matchedCount: number;
  totalKop: number;            // Σ matched priceKop * quantity
}

// POST /api/cart/zakaz body
export const ZakazCartBodySchema = z.object({
  items: z.array(OrderItemSchema).min(1).max(60), // reuse OrderItem {name, grams}
  storeId: z.string().optional(),
});
```

Input reuses the existing `OrderItem { name, grams }` (SPEC §4) — the same shape the tick-off list already emits (`toBuy.map(({name, grams}) => …)` in `ShoppingList.tsx`).

---

## 4. API contract

### `POST /api/cart/zakaz`

**Request**
```json
{ "items": [ { "name": "chicken breast", "grams": 900 }, { "name": "milk", "grams": 2000 } ] }
```

**Response `200`** — `ZakazCart` (see §3). Lines with no product still appear, with `product: null` and a usable `searchUrl`.
```jsonc
{
  "store": { "id": "482010105", "chain": "novus", "name": "NOVUS SkyMall DRIVE",
             "searchBase": "https://novus.zakaz.ua/uk/search/" },
  "lines": [
    { "query": "chicken breast", "neededGrams": 900,
      "product": { "ean": "…", "title": "Філе куряче охолоджене", "priceKop": 18900,
                   "weightG": 500, "img": "https://img…-s350x350.jpg",
                   "webUrl": "https://novus.zakaz.ua/uk/products/…/", "inStock": true },
      "quantity": 2, "searchUrl": "https://novus.zakaz.ua/uk/search/?q=%D1%84%D1%96%D0%BB%D0%B5%20%D0%BA%D1%83%D1%80%D1%8F%D1%87%D0%B5" }
  ],
  "matchedCount": 1, "totalKop": 37800
}
```

**Error responses** (mirror SPEC §7 conventions)

| Status | `error` | Cause |
|---|---|---|
| 401 | `no_session` | No `mp_uid` cookie / user gone. |
| 400 | `bad_request` | Body fails `ZakazCartBodySchema`. |
| 502 | `upstream_error` | Zakaz.ua backend unreachable / non-200 for the store list. |
| 200 | — | Partial matches are **not** an error: unmatched lines return `product: null`. |

Translation failure is **never fatal** — fall back to the raw English name as the query (§5.2).

---

## 5. Matching pipeline (`lib/zakaz.ts`, server-only)

Per request:

1. **Resolve store.** Use `storeId` from body else `ZAKAZ_DEFAULT_STORE_ID`. Fetch `/stores/` once (cached, §7) to resolve `chain`, `name`, and `searchBase = https://{chain}.zakaz.ua/uk/search/`.
2. **Translate queries.** Batch-translate all item names EN→UK in **one** LiteLLM call (§5.2). Cache by name.
3. **Search each item.** `GET {ZAKAZ_API_BASE}/stores/{storeId}/products/search/?q={uaQuery}` with headers `Accept-Language: uk` and a browser `User-Agent`. Run in parallel (bounded, e.g. `Promise.all` over ≤60 items). If a multiword query returns **zero orderable results** (Zakaz search chokes on some phrases, e.g. `горошок заморожений` → 0 hits), retry per word (≥4 chars) and merge the pools, deduped by EAN — the category filter disambiguates from there.
4. **Collect candidates** from `results`: up to 8 orderable products (`available_for_cart && in_stock`) **whose category matches the ingredient's expected department**, followed by up to 3 top unfiltered extras (§5.1). Within each group, products whose **title leads with a query word** rank first ("Рис Aro…" above "Борошно … рисове" for `рис`), then search-relevance order. Extras are only ever accepted via the LLM choice (§5.1a), never by default. No candidates → `product: null`.
4a. **Choose the variant.** For items with ≥2 candidates — or whose only candidates are out-of-department — one batched LLM call picks the best variant per item (§5.1a). Everything else, and any LLM failure, keeps the top **in-department** hit (out-of-department-only items stay unmatched).
5. **Quantity.** If `neededGrams > 0` and `weightG > 0`: `quantity = clamp(ceil(neededGrams / weightG), 1, 20)`; else `1`.
6. **Map fields** to `ZakazProduct` (price stays kopecks; `img = img.s350x350 ?? img.s150x150 ?? null`; `webUrl = result.web_url`).
7. **Always** compute `searchUrl` per line (works even when matched — lets the user swap the pick).
8. **Aggregate** `matchedCount`, `totalKop = Σ product.priceKop * quantity`.

### 5.1 Category-aware matching
Zakaz's search is relevance-ranked but happily returns processed products for raw-ingredient queries (`картопля` → potato chips, `яблука` → apple-flavoured yogurt/candy). Each search result carries `category_id` and `parent_category_id` (e.g. `fresh-potatoes` / `fruits-and-vegetables`), so matching is filtered by department:

- Each ingredient gets a coarse **category** (`produce`, `meat`, `fish`, `dairy_eggs`, `grains_pasta`, `bakery`, `oils_sauces`, `canned`, `frozen`, `drinks`, `sweets_snacks`, `other`) from the same LiteLLM call that translates it (§5.2), backfilled from the static dictionary.
- Each category maps to substrings matched against `category_id`/`parent_category_id` — substrings because ids are chain-suffixed (`apples-novus`) **and** because chains name departments differently: Консерви is `tins-jars-cooking` at Novus/Varus, `canned-food-oil-vinegar-metro` at Metro, `canned-food-auchan` at Auchan; Бакалія is `packets-cereals` vs `grocery-and-sweets-auchan`. Hint sets must cover every supported chain's naming.
- Each ingredient's category names the department where the item **as named** is sold (canned corn → `canned`, frozen berries → `frozen`) — not where its raw base product lives.
- Candidates = orderable results in the expected department, in relevance order (max 5), plus up to 3 unfiltered extras marked `out_of_dept`. The extras keep a correct product reachable when the LLM category misfires (e.g. `dried apricots` → produce shelf), but only the LLM choice step may accept one. Without an LLM verdict, an item whose candidates are all out-of-department is returned **unmatched** (search link) — an honest miss beats a confidently wrong product. Category `other`/unknown keeps all orderable results as in-department.

### 5.1a LLM variant choice
Generic queries return several valid in-department variants (`рис` → round / jasmine / basmati / parboiled). One batched LiteLLM call after all searches gets, per multi-candidate item, the English ingredient, `needed_grams`, and each candidate's title / weight / price / `out_of_dept` flag, and replies `{"picks": [index per item]}` — choosing the plain, unflavoured variant with a sensible pack size and price; an `out_of_dept` candidate only when its title clearly **is** the ingredient; `-1` = no candidate really is that ingredient (line becomes unmatched). Invalid or failed replies fall back to the top in-department hit, so the LLM step can only refine, never break matching. Cache stays at the search layer (per store + query + category); the choice call runs once per cart build, like translation.

### 5.2 Translation + categorization (EN → UK)
- **Primary:** one LiteLLM chat call — translates all item names EN→UK **and** assigns each a category from the §5.1 enum: `{"items": [{"uk": "...", "cat": "..."}]}`, same order, nouns only, no quantities. Reuse the `chatCompletion` shape from `lib/llm.ts` (same env, timeout, JSON parse). Cache results in-process by name.
- **Fallback:** if LiteLLM is unset or the call fails/malforms → a small static dictionary (`chicken→{куряче філе, meat}`, `potato→{картопля, produce}`, …, ~40 common items) with the raw English name (no category) as last resort (Zakaz.ua tolerates some Latin queries but matches poorly — dictionary first).

---

## 6. Client UI (`components/dashboard/ZakazCart.tsx`)

Rendered on `app/dashboard/cart/page.tsx` **below** the existing tick-off `ShoppingList`. It does not replace the tick-off list — it turns the "to buy" remainder into a real cart.

**Trigger.** Replace the current `Order in Silpo / Glovo` button behavior: clicking **`Build my cart in Novus`** posts the `toBuy` items to `/api/cart/zakaz` and renders the review inline (loading skeleton while matching; matching may take a few seconds due to translation + N searches).

**Review screen.**
- Header: `🛒 Your cart in {store.name} · {matchedCount}/{lines.length} matched · ≈₴{totalKop/100}`.
- One row per line:
  - Matched: product image, Ukrainian title, `₴{price}` × `{quantity}` stepper, and **`Open in {chain} ↗`** → `product.webUrl` (new tab). A subtle "not right? search" link → `searchUrl`.
  - Unmatched: item name + **`Search in {chain} ↗`** → `searchUrl`, muted styling.
- Footer actions:
  - Primary **`Open store to checkout ↗`** → the store home (`https://{chain}.zakaz.ua/`) in a new tab (the user reviews and orders there).
  - Note line: "Prices and availability are live from {chain}. Add items on the store to finish your order." (sets the expectation that we don't complete checkout — §9).

**States.** loading (skeleton rows) · loaded (rows) · error (banner + "Try again", per SPEC §7) · empty (`toBuy.length === 0` → the review button is hidden, as today).

**Formatting.** `₴{(kop/100).toFixed(2)}`. Reuse `formatWeight` from `lib/shopping.ts` for the needed-grams hint.

---

## 7. Non-functional

- **Caching.** Cache the `/stores/` response and per-`(storeId, uaQuery)` search results in-process (short TTL, e.g. 10 min) to be gentle on the undocumented backend and to keep repeat "Build cart" clicks instant.
- **Concurrency / limits.** Cap items at 60 (`ZakazCartBodySchema`); bound parallel searches. Treat any non-200 search as "no match" (line falls back to `searchUrl`), never throw the whole request.
- **Resilience.** The feature must degrade cleanly: LiteLLM down → dictionary; a store search down → search-link fallback; whole backend down → 502 with a "couldn't reach the store, here's your list" message keeping the tick-off list usable.
- **Security.** No new secrets. LiteLLM key stays server-side (translation runs in the route). Zakaz.ua calls are unauthenticated reads. Scope the route behind the `mp_uid` session like every other API (SPEC §8).
- **Legal/stability note.** `stores-api.zakaz.ua` is undocumented and unofficial (RESEARCH_ZakazUA_API.md). Acceptable for a demo/MVP; production needs a Zakaz.ua partnership. Keep all Zakaz specifics isolated in `lib/zakaz.ts` so it's swappable.

---

## 8. Acceptance criteria

- [ ] `POST /api/cart/zakaz` with the current `toBuy` items returns a `ZakazCart` with ≥1 matched product for a typical plan (chicken/milk/eggs/rice/vegetables).
- [ ] Each matched line shows a real photo, a real `₴` price, and an `Open in {chain}` link that resolves to a live product page (200).
- [ ] Unmatched lines still render with a working `Search in {chain}` deep link.
- [ ] Prices are correct (kopecks ÷ 100) and `totalKop` equals Σ(price × quantity) over matched lines.
- [ ] Quantity ≥ 1, and ≥ 2 when needed grams clearly exceed one pack's weight.
- [ ] LiteLLM disabled → translation falls back to the dictionary and the flow still produces matches for common items.
- [ ] Zakaz.ua backend unreachable → 502, the tick-off list stays usable, no crash.
- [ ] Route rejects a missing session (401) and a malformed body (400).

---

## 9. Known limitation — why "cart", not "order"

Zakaz.ua's cart is bound to the user's account and there is **no public write/checkout endpoint** (RESEARCH_GroceryOrdering_Ukraine.md §3.1, RESEARCH_ZakazUA_API.md §3). The maximum achievable without a partnership is: **matched products + prices + one-click links**, with the user adding to cart and paying on the store. The UI must communicate this honestly (§6 footer). This is the same ceiling every non-partner meal planner hits (Instacart/Whisk pattern, research §3.6) — the value is eliminating manual product search, not automating payment.

---

## 10. Build order & effort

| # | Task | Depends on | Budget |
|---|---|---|---|
| 1 | `lib/zakaz.ts`: store resolve + search + `buildCart` (no translation yet, English queries) | — | 1 h |
| 2 | `POST /api/cart/zakaz` route + zod body + error mapping | 1 | 0.5 h |
| 3 | `translateQueries()` (LiteLLM batch + dictionary fallback) | 1 | 0.5 h |
| 4 | `ZakazCart.tsx` review UI + wire into cart page + hook | 2 | 1–1.5 h |
| 5 | Caching, limits, resilience pass + manual verify against live store | all | 0.5 h |
| — | **Total** | | **~3.5–4 h** |

Fallback cut order under time pressure: match scoring (§5.1) → LLM translation (dictionary only) → quantity logic (default 1) → per-line "swap" search link.

---

## 11. Manual verification (live)

Run against the live backend during build (from research, confirmed 2026-07-10):
```
curl -s -H 'Accept-Language: uk' -A 'Mozilla/5.0' \
  'https://stores-api.zakaz.ua/stores/482010105/products/search/?q=молоко' | jq '.results[0] | {title, price, web_url, available_for_cart}'
```
Expect a product with a `web_url` that opens 200 in a browser. This is the ground truth the UI mirrors.
