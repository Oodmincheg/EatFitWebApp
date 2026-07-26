# Technical Notes — Zakaz.ua Backend API

**Date probed:** July 10, 2026 (live requests from this machine)
**Status:** Undocumented / unofficial. Publicly reachable, no auth required for reads. Not covered by any partnership. Treat as best-effort for a demo; do not build production dependencies without a signed agreement with Zakaz.ua.
**Parent doc:** [RESEARCH_GroceryOrdering_Ukraine.md](./RESEARCH_GroceryOrdering_Ukraine.md)

> ⚠️ These endpoints are reverse-engineered from the public site. They can change or rate-limit at any time. Everything here was confirmed by direct HTTP request on the date above, but re-verify before relying on it.

---

## 1. Hosts

| Host | Purpose |
|------|---------|
| `stores-api.zakaz.ua` | JSON backend (stores, products, search, categories). No auth for reads. |
| `{chain}.zakaz.ua` | Customer-facing storefront per chain, e.g. `novus.zakaz.ua`, `metro.zakaz.ua`, `auchan.zakaz.ua`, `varus.zakaz.ua`. Product `web_url`s and search deep links live here. |

Send `Accept-Language: uk` (or `ru`) to get localized titles. A browser-like `User-Agent` avoids being filtered.

---

## 2. Endpoints (verified 2026-07-10)

### 2.1 List stores — pick one by city/chain
```
GET https://stores-api.zakaz.ua/stores/
```
Returns an array of stores. Relevant fields per store:
```jsonc
{
  "id": "482010105",              // store id used in all product paths
  "name": "NOVUS SkyMall DRIVE",
  "retail_chain": "novus",         // novus | metro | auchan | varus | ...
  "city": "kiev",
  "delivery_types": ["pickup", "plan"],
  "address": { "city": "Kyiv", "coords": { "lat": 50.49, "lng": 30.55 } },
  "is_active": true
}
```
Use this to choose a `storeId` for the user's city/chain (or hardcode one per city for the MVP).

### 2.2 Product search — the core call for matching
```
GET https://stores-api.zakaz.ua/stores/{storeId}/products/search/?q={query}
```
Example: `/stores/48215611/products/search/?q=молоко` → `{ "count": 218, "count_available": 184, "results": [ … ] }`.

Relevant fields per result:
```jsonc
{
  "ean": "04820086633727",
  "title": "Молоко Rioba ультрапастеризоване 2,5% 950г",
  "price": 5600,                   // KOPECKS → ₴56.00 (divide by 100)
  "weight": 950.0,                 // grams (may be null)
  "volume": null,
  "unit": "pcs",
  "in_stock": true,
  "available_for_cart": true,      // false ⇒ cannot be added on the site
  "img": {
    "s150x150": "https://img3.zakaz.ua/…-s150x150.jpg",
    "s350x350": "https://img2.zakaz.ua/…-s350x350.jpg"
  },
  "producer": { "trademark": "Rioba" },
  "web_url": "https://metro.zakaz.ua/uk/products/moloko-rioba-950g-ukrayina--04820086633727/",
  "discount": { "status": false, "old_price": 5600 }
}
```
`web_url` is the canonical, ready deep link to the product page — prefer it over constructing a URL from the EAN.

### 2.3 Categories (optional)
```
GET https://stores-api.zakaz.ua/stores/{storeId}/categories/   → 200
```

### 2.4 Product deep link (fallback construction)
If `web_url` is ever missing, both of these resolve (200):
```
https://{chain}.zakaz.ua/uk/products/{ean}/
https://{chain}.zakaz.ua/products/{ean}/
```
Note: the single-product backend call `/stores/{storeId}/products/{sku}/` did **not** return usable data in probing — rely on search results + `web_url` instead.

---

## 3. What is and isn't possible

| Capability | Possible? | Notes |
|------------|-----------|-------|
| Read catalog / search products | ✅ Yes | Public, no auth. |
| Get real prices, stock, images, weights | ✅ Yes | From search results. |
| Deep link to a product page | ✅ Yes | `web_url` per product. |
| Deep link to a prefilled **search** | ✅ Yes | `{chain}.zakaz.ua/uk/search/?q=` → 200. |
| Prefill the user's **cart** via API | ❌ No | Cart is account-bound; no public write endpoint found. |
| Place an order programmatically | ❌ No | Checkout happens on the storefront, logged in. |

So the maximum for EatFit is: **matched products + prices + per-item links**. The user clicks through and adds to cart on Zakaz.ua themselves — one click per item, no manual searching.

---

## 4. Practical notes for implementation

- **Prices are in kopecks** — divide by 100 for hryvnia.
- **Filter to `available_for_cart === true && in_stock === true`** before showing a match; skip or mark others.
- **Query language:** the meal-plan ingredients are lowercase English (see `lib/llm.ts` / `lib/schemas.ts`). Zakaz.ua is a Ukrainian catalog, so ingredient names must be **translated to Ukrainian** before searching (e.g. `chicken breast` → `куряче філе`). Do this in the matching layer (LLM translation or a static dictionary for common items).
- **Match quality:** search returns many candidates; pick by first available result or a lightweight score (title similarity + `is_hit`). Keep it simple for the MVP.
- **Rate/stability:** cache store list and per-query results; be gentle. Treat any non-200 as "no match" and fall back to a search deep link.
- **Store selection:** for the MVP, hardcode one store id per supported city (or a single default Kyiv store) rather than doing geolocation.
