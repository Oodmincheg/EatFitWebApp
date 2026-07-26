# Research — Turning a Shopping List into a Ready-to-Order Grocery Cart (Ukraine, 2026)

**Date:** July 10, 2026
**Context:** EatFit (this repo) generates a weekly meal plan → derives a shopping list (`lib/shopping.ts`). Today the "order" flow is a mock (`components/dashboard/OrderModal.tsx`, `/api/orders`). This document captures research into how to give the user a **real, ready-to-order cart** in an actual Ukrainian store/app with minimal effort.
**Method:** multi-agent deep-research (19 sources, 92 extracted claims, 25 adversarially verified) + direct live probing of endpoints on the research date. Claims below are tagged with their verification status.
**Companion doc:** [RESEARCH_ZakazUA_API.md](./RESEARCH_ZakazUA_API.md) — technical API notes for the recommended path.

---

## 1. Bottom line

**No Ukrainian grocery service lets a third party silently drop items into a logged-out user's cart and complete checkout via a public API.** The cart is always account-bound, and final checkout always happens on the retailer's own surface. So "maximum readiness with minimum effort" means:

> Match the shopping list to **real products with real prices and stock**, render them as a review screen, and hand the user **one-click links straight to each product (or a prefilled search)** on a store where checkout is easy.

The clear winner for this in Ukraine is **Zakaz.ua** (the delivery platform behind Novus, METRO, Auchan, Varus, and others). Its backend is publicly reachable, returns rich product data including a canonical product URL, and requires no partnership to read.

---

## 2. Ranked options

| # | Option | "Order readiness" | Dev effort | Key risk | Verdict |
|---|--------|-------------------|-----------|----------|---------|
| **1** | **Zakaz.ua product matching** (`stores-api.zakaz.ua`) → review screen with prices + per-item links | **High** — real products, prices, stock, 1 click to the store | ~2–4 h | Undocumented API; can change/rate-limit | **Recommended for MVP** |
| 2 | **Deep-link search fallback** (`{chain}.zakaz.ua/search?q=`, `megamarket.ua/search?q=`) | Medium — user adds items themselves | ~30 min | None | Ship as fallback |
| 3 | **ATB via Admitad affiliate** (Deeplink + product feed) | Medium + earns commission | 1–2 days (publisher onboarding) | Moderation, approval | Good for production monetization |
| 4 | **Silpo reverse-engineered server cart** (`/v1/my/shopping-cart/{basketId}`) | Highest — real prefilled cart in the user's Silpo cabinet | High | Needs the user's own token; Cloudflare; ToS | Avoid for MVP; partner path for prod |
| 5 | **Glovo / Bolt Food partner APIs** | None for this use case | — | — | Dead end (merchant/POS-only) |

---

## 3. Findings by path

### 3.1 Zakaz.ua — recommended (verified live, 2026-07-10)

Zakaz.ua aggregates several chains (Novus, METRO, Auchan, Varus, etc.) on per-chain subdomains and a shared backend `stores-api.zakaz.ua`. It is **publicly reachable without auth** — confirmed by direct request on the research date:

- `GET /stores/` → every store with `retail_chain`, `city`, `delivery_types`, coordinates → **200**.
- `GET /stores/{storeId}/products/search/?q=молоко` → real products with `price` (kopecks), `ean`, `weight`, `img` (4 sizes), `in_stock`, `available_for_cart`, and a canonical **`web_url`** deep link → **200**.
- Opening a product `web_url` (e.g. `https://metro.zakaz.ua/uk/products/…-04820086633727/`) → **200**.
- Search deep links `https://novus.zakaz.ua/uk/search/?q=…` → **200**.

Third-party projects have consumed this backend since at least March 2020 ([order-monitor](https://github.com/vladyslavmunin/order-monitor) — *verified 3-0*; endpoint form `stores-api.zakaz.ua/stores/{id}/delivery_schedule/plan/`).

**What it gives EatFit:** match each shopping-list item → the best real product → a review screen ("Your Novus cart: 14 items, ≈₴1,250") with photos, prices, and a link per item. Checkout stays on Zakaz.ua. See [RESEARCH_ZakazUA_API.md](./RESEARCH_ZakazUA_API.md) for exact endpoints and fields.

**Limitation:** you cannot prefill the user's Zakaz cart itself via public API — the cart is account-bound. The per-item link is the "add to cart" affordance.

### 3.2 Deep-link search — universal fallback

Prefilled **search** (not cart) works broadly:

- `https://{chain}.zakaz.ua/uk/search/?q=…` → 200
- `https://megamarket.ua/search?q=…` → 200
- `https://silpo.ua/search?find=…` and `https://www.atbmarket.com/sch?query=…` → **403 to bots** (Cloudflare) but open fine in a real user's browser.

No Ukrainian retailer supports a URL that prefills a **cart** — consistent with the Whisk/Samsung Food finding that cart transfer always needs a retailer-side endpoint, never a URL trick (*unverified — spend limit hit mid-run*; [Samsung Food grocer integration](https://support.samsungfood.com/hc/en-us/articles/360042276852-Grocer-Integration-Overview)).

### 3.3 ATB via Admitad — the only clean affiliate path (production)

[Admitad has an active ATB Ukraine offer](https://www.admitad.com/ua/store/offers/atb-ua/) whose publisher tools include **Deeplink** and a **product feed** (*verified 3-0*). That means legal catalog access for matching **and** commission on referred orders. Probing Admitad for other grocers found nothing: Zakaz.ua, Silpo, MegaMarket, Rozetka offer pages all 302-redirect to the catalog (no live offer); Salesdoubler had no matching offer either (checked on the research date).

### 3.4 Silpo — technically a real cart, practically a no

- **Verified (2-1):** a reverse-engineered endpoint `/v1/my/shopping-cart/{basketId}` with a Bearer token from `id.silpo.ua` (JWT `client_id: "profile--profile--cabinet"`) **can create and fill a server-side cart** visible in the user's Silpo cabinet ([silpo-mcp](https://lobehub.com/mcp/mit9-silpo-mcp)).
- **Verified (2-1):** checkout still requires the user to authorize on the Silpo site — max achievable is a **prefilled cart, not a completed order**.
- **Verified (3-0):** it's reverse-engineered, may break without notice, and Cloudflare blocks some operations.
- Blocker for MVP: it needs the **user's own Silpo token** (bad UX + security). [pysilpo](https://github.com/iYasha/pysilpo) is read-only (history + catalog), no cart (*unverified — spend limit*).
- Silpo has **no official public API** — reverse engineering is the only route (*verified 3-0*).

### 3.5 Glovo & Bolt Food — dead ends (all verified 3-0)

Their APIs are strictly merchant/POS-side; nothing lets a consumer app build a cart or place an order on a user's behalf:

- **Glovo Partners API** is for merchants/integrators to *receive* Glovo orders into a POS; order flow is Glovo→partner only, no create-order/cart endpoint ([docs](https://api-docs.glovoapp.com/partners/index.html)).
- **Glovo QCommerce** Admin API syncs catalog/prices; docs mention no deep links, affiliate, or cart prefill ([docs](https://qcommerce-integrations.glovoapp.com/)).
- **Bolt Food API** is merchant menu/order-fulfillment; the only create-order path is Dine-In waiter, and access is gated behind partner onboarding (integrator_id/secret_key + webhooks) ([docs](https://developer.bolt.eu/food)).
- The historical Glovo affiliate offer (Mobidea/Affplus) is **expired since 2016**.

### 3.6 Instacart pattern — the reference EatFit is replicating

[Instacart's Developer Platform](https://docs.instacart.com/developer_platform_api) productizes exactly this: create a "shoppable recipe" → hosted page with ingredient-to-product matching and checkout across 100k+ stores; the app only generates/shares a link (*unverified — spend limit*). But it's **US/Canada only** — unavailable in Ukraine. Zakaz.ua is the closest Ukrainian equivalent, minus the public API — hence we build the matching layer ourselves.

---

## 4. Recommendation

**Hackathon / MVP (today):** Options **1 + 2**. Match against `stores-api.zakaz.ua`, show a real cart-review screen with prices and per-product links; fall back to deep-link search for chains without a match (Silpo/ATB). This looks and feels like a real integration because the user can actually complete the order.

**Production:** open a B2B conversation with Zakaz.ua for an official partnership (you send them traffic), and register as an Admitad publisher for ATB (legal feed + commission). Undocumented APIs are fine for a demo; a signed agreement is needed to depend on them in production.

---

## 5. Caveats on verification

The research workflow hit a usage/spend limit partway through the adversarial-verification phase: **13 of 25 claims were fully verified (2-of-3 vote), 1 refuted, 11 left unverified** (Instacart, Whisk, Bolt Stores, pysilpo details). Those 11 are tagged *unverified* above and treated as background. The load-bearing conclusions about **Zakaz.ua** were re-checked by hand with live HTTP requests on 2026-07-10 and do not depend on the unverified claims.

### Sources
- [Glovo Partners API](https://api-docs.glovoapp.com/partners/index.html) · [Glovo QCommerce](https://qcommerce-integrations.glovoapp.com/) · [Bolt Food API](https://developer.bolt.eu/food) · [Bolt Stores API](https://developer.bolt.eu/stores)
- [silpo-mcp (LobeHub)](https://lobehub.com/mcp/mit9-silpo-mcp) · [pysilpo](https://github.com/iYasha/pysilpo) · [Silpo shop API notes](https://gebeto.github.io/info/6-apis/silpo-shop.html)
- [zakaz.ua order-monitor](https://github.com/vladyslavmunin/order-monitor) · [Zakaz help](https://zakaz.ua/en/page/help/)
- [Admitad ATB UA offer](https://www.admitad.com/ua/store/offers/atb-ua/)
- [Instacart Developer Platform](https://docs.instacart.com/developer_platform_api) · [Instacart recipe concept](https://docs.instacart.com/developer_platform_api/guide/concepts/recipe/) · [Samsung Food grocer integration](https://support.samsungfood.com/hc/en-us/articles/360042276852-Grocer-Integration-Overview)
