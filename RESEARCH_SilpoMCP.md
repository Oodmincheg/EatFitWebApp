> **Status (2026-09-09): implemented and verified.** `lib/silpo/*`, the auth and cart routes and `SilpoCart.tsx` shipped; the build order in §8 is done except `DeliverySetup` (users without a Silpo cart get a notice instead). Verified live from localhost against Atlas: OAuth linking, cart resolution, batch search, LLM variant pick, quantity sizing. Not yet exercised: a real commit on a user cart, so the presence of `checkoutWebLink` after commit (§12) is still open. §6.2 (LiteLLM MCP gateway) is moot, LiteLLM was dropped for OpenRouter. Effort figures in §8 and §9 were planning estimates and are left as written.

# Research: Silpo official MCP as the EatFit ordering backend

**Date:** September 4, 2026
**Context:** EatFit matches the weekly shopping list against Zakaz.ua's undocumented backend (`lib/zakaz.ts`, `POST /api/cart/zakaz`, `ZakazCart.tsx`) and hands the user per-product links; the cart itself cannot be written. Silpo published an official MCP server on 2026-08-13 with cart write tools and runs the "Silpo AI Factory" hackathon on top of it. This document answers: can Silpo MCP replace Zakaz and turn "links" into "order", what the migration costs, which upgrades the tools support, and what the hackathon requires.
**Method:** read every page of ai-factory.silpo.ua (docs, home incl. client-rendered FAQ, terms, cabinet), probed `mcp.silpo.ua` live (JSON-RPC handshake, OAuth metadata, dynamic client registration), checked npm for the MCP SDKs, read the MCP spec (2026-07-28) and LiteLLM MCP docs. Tags: [verified: source] read on the owning page, [probed] observed live today, [unverified] inferred.
**Companion docs:** [RESEARCH_GroceryOrdering_Ukraine.md](./RESEARCH_GroceryOrdering_Ukraine.md) §3.4 (Silpo as of 2026-07-10), [SPEC_ZakazCart_Feature.md](./SPEC_ZakazCart_Feature.md).

---

## 1. Bottom line

- Silpo MCP **can write to the logged-in user's real Silpo cart**: create it, add/update/remove products, set delivery type, address, time slot, promo code, payment method and loyalty bonuses. It **cannot place the order**: there is no checkout or create-order tool; `silpo_get_shopping_cart_by_id` returns `checkoutWebLink` and `checkoutMobileLink` and the user pays on silpo.ua. [verified: docs/mcp tool list and "Типові сценарії"]. That is one step short of "one-click order" but a full step past Zakaz (RESEARCH_GroceryOrdering_Ukraine.md §3.4 rated Silpo "avoid": that verdict is now obsolete).
- Auth is **OAuth 2.1 Authorization Code + PKCE, user-delegated**, no API keys, no sandbox, no service account. Every tool requires a Silpo guest logged in at `auth.silpo.ua` (phone + OTP or password). EatFit must run the OAuth flow per user and store the MCP token server-side. [verified: docs/mcp "Як працює авторизація"; probed: 401 + `WWW-Authenticate`, `/.well-known/oauth-authorization-server`, `POST /register` returned 201].
- **MCP only.** No REST API is documented; the hackathon rules forbid unofficial APIs. [verified: docs/mcp "Використання на хакатоні"].
- **Hackathon: registration closed 2026-09-01; submission deadline 2026-09-14 23:59 Kyiv; participants must be Ukraine residents 18+, solo or team up to 10.** If nobody on the team registered, the only path is asking `mcp@silpo.club`. [verified: live page "Реєстрацію завершено", terms 5.3/6.1, FAQ].
- Migration estimate: ~15 h to replace Zakaz with Silpo including OAuth linking and the "Add to my Silpo cart" step (§8). The cheapest high-value upgrade after that is out-of-stock substitution via `silpo_get_replacements` (1.5 h); the most jury-relevant is promo-driven planning via `silpo_get_promotions` (3 h) (§9).

---

## 2. Server facts

| Item | Value | Tag |
|---|---|---|
| Endpoint | `https://mcp.silpo.ua/mcp` | [verified: docs/mcp]; [probed: POST and GET both answer 401 JSON `{"error":"invalid_token"}` with `WWW-Authenticate: Bearer realm="OAuth", resource_metadata="https://mcp.silpo.ua/.well-known/oauth-protected-resource/mcp"`] |
| Transport | Streamable HTTP, single URL | [verified: docs/mcp header "Транспорт: Streamable HTTP"] |
| Protocol version | Not stated. Docs' TypeScript example uses the v1 SDK (`client.connect()` sends `initialize`), so the server speaks a legacy `initialize`-based revision (2025-11-25 or earlier). Which exact versions it accepts needs an authenticated `initialize`. | [unverified] |
| Tool count | "40 доступних" on docs; press on 2026-08-13 and 2026-08-18 said 39. Docs: "Точні назви, аргументи та JSON Schema завжди повертає сам сервер після авторизації. Читай tools/list на старті агента". | [verified: docs/mcp; dou.ua topic 61352; dev.ua] |
| Auth server | Issuer `https://mcp.silpo.ua`; `authorization_endpoint /authorize`, `token_endpoint /token`, `registration_endpoint /register`, `revocation_endpoint /token`; grants `authorization_code`, `refresh_token`; PKCE `S256` and `plain`; `token_endpoint_auth_methods_supported: client_secret_basic, client_secret_post, none`; `client_id_metadata_document_supported: false` | [probed: `/.well-known/oauth-authorization-server`] |
| Protected resource metadata | `{"resource":"https://mcp.silpo.ua/mcp","authorization_servers":["https://mcp.silpo.ua"],"bearer_methods_supported":["header"]}` | [probed] |
| Dynamic client registration | `POST /register` with `redirect_uris: ["http://localhost:3000/api/auth/silpo/callback"]`, `token_endpoint_auth_method: "none"` returned **201** and a `client_id` (public client, localhost redirect accepted). `GET /authorize` without params: 400 `Invalid redirect URI`. | [probed] |
| End-user login | `auth.silpo.ua` (phone + OTP or password); "AI-клієнт ніколи не бачить Silpo JWT гостя". | [verified: docs/mcp]; [probed: `https://auth.silpo.ua/` → 200 at `/login`] |
| Token use | `Authorization: Bearer <mcp_token>`; refresh via `refresh_token`; "MCP-токен зберігай на бекенді або у secure storage, не у публічному фронтенді" | [verified: docs/mcp "Помилки та обмеження"] |
| Errors | `401 invalid_token`, `403` (no access to a tool), `429` rate limit "per-user через Cookie: mcp-user={userId}", exponential backoff advised; `-32601 Method not found` | [verified: docs/mcp]. No numeric limits published. |
| Sandbox, pricing, commercial terms | None documented. `/terms` covers only the hackathon. Contact `mcp@silpo.club`. | [verified: docs/mcp, /terms] |
| Starter kit | "Зареєструйся на хакатон, і ми надішлемо starter kit, приклади готових агентів та актуальний перелік tools" (registered participants only) | [verified: docs/mcp] |
| Client configs | Claude Desktop/Cursor/Kiro: `{"mcpServers":{"silpo":{"url":"https://mcp.silpo.ua/mcp"}}}`; Claude Code: `claude mcp add --transport http silpo https://mcp.silpo.ua/mcp` | [verified: docs/mcp] |

Live `tools/list` was **not** obtainable: `initialize` is rejected before any JSON-RPC processing (401), and completing OAuth needs a real Silpo account login in a browser, which I did not do. The tool list below is the docs' list, not a probe.

## 3. Tool list (40, per docs/mcp; descriptions translated from Ukrainian)

Flags: `ctx` = needs cart context (`branchId`, `deliveryType`, `timeslot`) obtained via `silpo_get_my_shopping_cart` → `silpo_get_shopping_cart_by_id`; `write` = mutates state. All tools require auth. [verified: docs/mcp "Доступні tools (40)"]

| Group | Tool | Flags | What the docs say (inputs/outputs where stated) |
|---|---|---|---|
| Location & delivery (6) | `silpo_find_address` | | Text address → `addresses[].latitude/.longitude`, `city`, `street`, `houseNumber`, `district` |
| | `silpo_get_available_delivery_types` | | `(lat, lng)` → delivery types `DeliveryHome, WideAssortDelivery, SelfPickup, NovaPoshta, B2B` (+ `LongDelivery, DeliveryExpressByPromise, PreOrder` in the enum) and `branchId` (null for SelfPickup/NovaPoshta) |
| | `silpo_list_branches` | | Store list; filters `hasPickup`, `hasNovaPoshta` |
| | `silpo_get_time_slots` | | `(branchId, deliveryType)` → slots; "ОБОВ'ЯЗКОВО викликати після отримання кошика" |
| | `silpo_find_nova_poshta_settlements`, `silpo_find_nova_poshta_offices` | | Nova Poshta settlement search; offices/lockers by `settlementId` |
| Product search (7) | `silpo_find_products_batch` | ctx | "Пошук до 30 товарів паралельно. Основний tool для заповнення кошика зі списку покупок." Returns `productId + companyId + branchId` per item |
| | `silpo_get_products` | ctx | Filters: category, promo, search query, pagination |
| | `silpo_get_product_details` | ctx | Full card: composition, nutrition ("харчова цінність"), attributes, images |
| | `silpo_get_similar_products` | ctx | Alternatives by product `slug` |
| | `silpo_get_replacements` | ctx | Substitutes for out-of-stock products |
| | `silpo_get_my_favorites`, `silpo_add_or_update_favorite_products` | write (2nd) | Favorites read / add-remove |
| Catalog (6) | `silpo_get_promotions` | ctx | Active promotions and discounts in the given store |
| | `silpo_get_popular_categories`, `silpo_get_category`, `silpo_get_categories_tree` | ctx | Popular categories; one category (subcategories, product count); full tree |
| | `silpo_get_categories` | | Flat list of all categories (no cart context needed) |
| | `silpo_get_product_sets` | | Curated collections (thematic, seasonal) |
| Cart (8) | `silpo_get_my_shopping_cart` | | Active cart id, `exists: true/false`. "Завжди перший крок." |
| | `silpo_create_shopping_cart` | write | Idempotent. Params table in docs: `addressType` enum `house, flat, office, point, self-pickup, nova-poshta` (req.), `latitude/longitude` number (req.), `city, street, house, district` (opt.), `deliveryType` enum (req.), `timeslot.start/.end` ISO (req.), `branchId` (req.). `companyId` is a server constant. Response `{"success":true,"summary":"Shopping cart created","shoppingCartId":"e7fb..."}` |
| | `silpo_get_shopping_cart_by_id` | | Products, delivery, timeslot, totals, `validations[]`, `loyalty.{bonusAvailable, bonusRequested, isEnabled}`, express option, `checkoutWebLink`, `checkoutMobileLink` |
| | `silpo_add_or_update_cart_products` | write | Add or set quantity; needs `productId + companyId + branchId` from search |
| | `silpo_remove_cart_products`, `silpo_clear_shopping_cart` | write | Remove specific products; empty the cart |
| | `silpo_update_shopping_cart` | write | Delivery type, slot, address, promo code, payment method, `bonusRequested` |
| | `silpo_add_or_update_certificates` | write | Gift certificates on/off the cart |
| Orders (2) | `silpo_get_my_online_orders` | | Online order history (silpo.ua/app); "дає змогу повторити замовлення одним викликом cart.add" |
| | `silpo_get_my_offline_orders` | | In-store receipts: items, discounts, earned bonuses |
| Profile (4) | `silpo_get_my_profile`, `silpo_get_my_delivery_addresses`, `silpo_get_my_family`, `silpo_get_my_food_restrictions` | | Name/phone/email/birthdate; saved addresses; children (with age) and pets; dietary restrictions and preferences |
| Loyalty (7) | `silpo_get_loyalty_info` | | "Власний Рахунок" card: number, status, current and accrued balabonus balance |
| | `silpo_get_my_coupons`, `silpo_get_coupon_details`, `silpo_get_my_promos`, `silpo_get_promo_codes`, `silpo_get_my_certificates`, `silpo_get_my_premium_subscription` | | Coupons (+ details with barcode), personal offers, promo codes, gift certificates, Silpo Premium status |

Not in the list: recipes, order placement/payment, product reviews, price history. JSON Schemas for inputs and outputs are only published through `tools/list` after auth [verified: docs/mcp]; price units, image URL host, category fields on search hits are all [unverified]. A DOU commenter (Roman, 2026-08-14) reported that search results lack category metadata and a "гречка" search took ~10 tool calls [verified: dou.ua/forums/topic/61352].

## 4. Documented workflows (verbatim order)

Fill cart from a shopping list: `silpo_get_my_shopping_cart` → `silpo_get_shopping_cart_by_id` (branchId, deliveryType, timeslot) → `silpo_get_time_slots` (slot validation, mandatory) → `silpo_find_products_batch(items[])` → `silpo_add_or_update_cart_products` → `silpo_get_shopping_cart_by_id` (check `validations[]`, offer bonuses if `loyalty.bonusAvailable > 0`, show `checkoutWebLink`). [verified: docs/mcp "Типові сценарії"]

New cart (no existing cart): `silpo_find_address` → `silpo_get_available_delivery_types(lat,lng)` → (`silpo_list_branches` if branchId null) → `silpo_get_time_slots` → `silpo_create_shopping_cart` → `silpo_get_shopping_cart_by_id`. [verified: docs/mcp "Детально: silpo_create_shopping_cart"]

## 5. What is and isn't possible vs Zakaz

| Capability | Zakaz (today) | Silpo MCP | Tag |
|---|---|---|---|
| Search catalog, prices, stock, images | yes, no auth | yes, auth required, batch of 30 | [verified: docs] |
| Deep link per product | `web_url` | not documented; `slug` exists (used by `silpo_get_similar_products`); `checkoutWebLink` is for the cart | [unverified] |
| Write user's cart | no | yes (`silpo_add_or_update_cart_products` etc.) | [verified: docs] |
| Set delivery slot, address, payment, promo, bonuses | no | yes (`silpo_update_shopping_cart`) | [verified: docs] |
| Place order / pay | no | **no tool**; user opens `checkoutWebLink` | [verified: docs, absence in list] |
| Nutrition facts | no | `silpo_get_product_details` "харчова цінність" (fields unknown) | [verified: docs; shape unverified] |
| Substitutes for out-of-stock | no | `silpo_get_replacements`, `silpo_get_similar_products` | [verified: docs] |
| Promotions feed | no | `silpo_get_promotions`, `silpo_get_products(promo)` | [verified: docs] |
| User's purchase history | no | `silpo_get_my_online_orders`, `silpo_get_my_offline_orders` | [verified: docs] |
| Works for logged-out / guest EatFit users | yes | no, Silpo account required | [verified: docs "Усі tools потребують авторизації"] |
| English search queries | no (EN→UK translation in `lib/zakaz.ts`) | unknown; all docs examples are Ukrainian | [unverified] |

## 6. Calling it from Next.js

### 6.1 Direct: `@modelcontextprotocol/sdk` v1 (what Silpo's docs show)

Silpo's example (verbatim) [verified: docs/mcp]:

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const transport = new StreamableHTTPClientTransport(new URL("https://mcp.silpo.ua/mcp"), { authProvider: mySilpoAuthProvider });
const client = new Client({ name: "hackathon-agent", version: "0.1.0" }, { capabilities: {} });
await client.connect(transport);
const { tools } = await client.listTools();
```

- `@modelcontextprotocol/sdk` latest is **1.30.0** (2026-07-27), Node >= 18, `LATEST_PROTOCOL_VERSION = '2025-11-25'`, `SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25','2025-06-18','2025-03-26','2024-11-05','2024-10-07']`. [probed: `npm view`, jsdelivr `dist/esm/types.js`]
- OAuth pieces in `@modelcontextprotocol/sdk/client/auth.js`: `interface OAuthClientProvider { redirectUrl; clientMetadata; clientInformation(); saveClientInformation?; tokens(); saveTokens(); redirectToAuthorization(url); saveCodeVerifier(); codeVerifier(); state?(); invalidateCredentials?(); ... }`, `class UnauthorizedError`, `auth(provider, {serverUrl, authorizationCode?, ...})`, `registerClient`, `exchangeAuthorization`, `refreshAuthorization`. Transport docs: on `connect()` it uses stored tokens, refreshes if expired, else calls `redirectToAuthorization`; after the callback call `transport.finishAuth(code)` then reconnect. [probed: jsdelivr `client/auth.d.ts`, `client/streamableHttp.d.ts`]
- v2 exists: `@modelcontextprotocol/client` 2.0.0 + `@modelcontextprotocol/node` 2.0.0 (2026-07-28, Node >= 20), imports `import { Client } from '@modelcontextprotocol/client'` and `import { StreamableHTTPClientTransport } from '@modelcontextprotocol/node'`, targets the 2026-07-28 spec which replaces the `initialize` handshake with per-request `_meta` and errors `-32022 UnsupportedProtocolVersionError`. [verified: ts.sdk.modelcontextprotocol.io/v2, spec "Versioning"; probed: npm]. Whether Silpo's server is dual-era is [unverified], so **use v1 1.30.0**, which is what Silpo documents. v1 keeps security fixes for at least six months after v2 [verified: github.com/modelcontextprotocol/typescript-sdk].
- Alternative shown by Silpo: Vercel `@ai-sdk/mcp` 2.0.44 (Node >= 22) `createMCPClient({ transport: { type: "http", url, authProvider } })` [verified: docs/mcp; probed: npm]. Not needed; EatFit calls LiteLLM over raw fetch.

Server-side shape for EatFit (design, [unverified] until built): a Mongo-backed `OAuthClientProvider` per `uid` (`silpo_oauth` collection: `clientInformation` shared from one DCR call, `tokens`, `codeVerifier`, `state`); `redirectToAuthorization` cannot open a browser in a route handler, so it stores the URL and the route returns `{ authorizeUrl }` for the client to `window.location = ...`; `GET /api/auth/silpo/callback?code&state` → `transport.finishAuth(code)` → redirect to `/dashboard/cart`. One `Client` per request is acceptable (stateless server per docs' error list; session reuse [unverified]).

### 6.2 Via LiteLLM MCP gateway (the model calls tools)

LiteLLM registers MCP servers in `config.yaml` (`mcp_servers: silpo: { url: "https://mcp.silpo.ua/mcp", transport: "http", auth_type: ... }`), supports Streamable HTTP, and lets a `/chat/completions` or `/v1/responses` call pass `tools: [{ "type": "mcp", "server_url": "litellm_proxy", "server_label": "silpo", "require_approval": "never" }]`; with `"never"` "the proxy automatically executes the returned tool calls and feeds the results back into the model before returning the assistant response", otherwise tool calls come back to the client. Per-user credentials go in request headers `x-mcp-{server_alias}-{header_name}`, e.g. `x-mcp-silpo-authorization: Bearer <user_mcp_token>`. LiteLLM's own `auth_type: oauth2` / `oauth2_flow: authorization_code` is a proxy-level interactive login (UI-driven, token not persisted server-side), not a per-EatFit-user flow. [verified: docs.litellm.ai/docs/mcp]. Whether our deployed LiteLLM proxy version has the MCP gateway enabled: [unverified].

| | Direct SDK in `lib/silpo.ts` | LiteLLM MCP tools (`require_approval: never`) |
|---|---|---|
| Who orchestrates | our code (deterministic pipeline, zod on every tool result) | the model, in one agentic loop |
| OAuth | we run it either way; token stored per uid in Mongo | same, then forwarded per request as `x-mcp-silpo-authorization` |
| Fits current UI | yes: review screen, per-line edits, then one commit call | poorly: results arrive as prose unless we force JSON at the end |
| Latency/cost | N parallel tool calls, one LLM pick | many sequential LLM turns (DOU report: ~10 calls for one search) |
| Jury "agentness" | medium (agent picks variants, code does the rest) | high (visible tool-call trace) |
| Risk | low; matches Silpo's own docs | depends on proxy version and model tool-use quality |
| Verdict | **build the cart flow on this** | add as a demo mode ("Silpo as the meal-plan agent", §9 #11) if time remains |

## 7. Migration map (Zakaz → Silpo)

Delete: `lib/zakaz.ts` (561 lines), `lib/zakaz.test.ts` (228), `app/api/cart/zakaz/route.ts`, `components/dashboard/StorePicker.tsx`, `STORE_OPTIONS`/`DEFAULT_STORE` in `lib/stores.ts` (keep `PENDING_CART_KEY`), `public/images/stores/*`, `remotePatterns` for `**.zakaz.ua` in `next.config.ts`, env `ZAKAZ_API_BASE`, `ZAKAZ_DEFAULT_STORE_ID`. Keep and move: `DICTIONARY`, `translateQueries`, `chooseCandidates`, `parsePicks`, `suggestQuantity`, the TTL cache (all Zakaz-independent). Drop `CATEGORY_HINTS`/`pickProduct` (Zakaz taxonomy ids); keep `IngredientCategory` as an LLM hint.

Add: `lib/silpo/auth.ts` (Mongo `OAuthClientProvider`), `lib/silpo/client.ts` (`withSilpo(uid, fn)`, `callTool(name, args, zodSchema)`), `lib/silpo/cart.ts` (`buildCart`, `commitCart`), routes `app/api/auth/silpo/{start,callback,status}`, `app/api/cart/silpo` (build, read-only) and `app/api/cart/silpo/commit` (writes), `components/dashboard/SilpoCart.tsx`, `components/dashboard/DeliverySetup.tsx` (address → delivery type → slot, only when `exists: false`), env `SILPO_MCP_URL=https://mcp.silpo.ua/mcp`, `APP_BASE_URL` (redirect URI), optional `SILPO_OAUTH_CLIENT_ID` if Silpo issues a fixed one.

Schemas (`lib/schemas.ts`): `ZakazProduct` → `SilpoProduct { productId; companyId; branchId; slug; title; price (unit per tools/list); weightG|null; img|null; inStock; promo?: boolean }`; `CartLine.product: SilpoProduct | null`, drop `searchUrl` (no per-product deep link documented) or keep as `https://silpo.ua/search?find=...` (403 to bots, fine in browsers per RESEARCH_GroceryOrdering_Ukraine.md §3.2); `ZakazCart` → `SilpoCart { cartId; branchId; deliveryType; timeslot; lines; matchedCount; total; validations: string[]; loyalty?: {bonusAvailable, isEnabled}; checkoutWebLink }`; `ZakazCartBodySchema` → `SilpoCartBodySchema { items (max 60 → two batches of 30) }`; add `SilpoCommitBodySchema { cartId; lines: {productId, companyId, branchId, quantity}[] }`. `OrderItem` unchanged; `Order` gains `silpoCartId?`, `checkoutWebLink?`.

UI: `SilpoCart.tsx` phases: `unlinked` (button "Connect Silpo account" → `/api/auth/silpo/start`), `loading`, `review` (same list as today; a line's action becomes a quantity stepper instead of "Open in novus"), `committed` (footer "Checkout on Silpo ↗" → `checkoutWebLink`, totals from the cart itself, "Apply N balabonuses" toggle, `validations[]` shown as warnings). Footer text before commit: "Add all to my Silpo cart" (writes) instead of "Open store to checkout". `cart/page.tsx` and `ingredients/page.tsx`: replace `StorePicker` with a direct push to `/dashboard/cart`; `useOrders.placeOrder` runs on commit, not on link click.

Translation and matching pipeline: keep EN→UK translation (Silpo's examples and catalog are Ukrainian; English support [unverified], test on day one with `silpo_find_products_batch(["chicken breast"])`). Keep the LLM variant-choice step: search hits reportedly carry no category (DOU), so "potato" vs "potato chips" still needs vetting; the candidates list per item comes from the batch tool's returned variants (count [unverified]). Optional stricter filter: `silpo_get_categories` once, then `silpo_get_products(category, query)` per ambiguous item. Nutrition: `silpo_get_product_details` per matched product (N extra calls), only for the upgrade in §9 #5.

Guest sessions: Silpo linking requires a Silpo account; key tokens by EatFit `uid` (guest cookie uid works but dies with the cookie). Simplest: require Google sign-in before "Connect Silpo".

## 8. Build order and effort (hackathon style, like SPEC_ZakazCart_Feature.md §10)

| # | Task | Depends on | Budget |
|---|---|---|---|
| 1 | `lib/silpo/auth.ts`: Mongo `OAuthClientProvider`, DCR once, per-uid tokens/verifier/state; `/api/auth/silpo/start`, `/callback`, `/status` | | 3 h |
| 2 | `lib/silpo/client.ts`: connect with `authProvider`, `callTool` + zod on `structuredContent`/text JSON, `UnauthorizedError` → 401 `silpo_unlinked`; first authenticated `tools/list` saved to `docs/silpo-tools.json` | 1 | 1.5 h |
| 3 | `lib/silpo/cart.ts` `buildCart`: ensure cart (`get_my_shopping_cart` → `get_shopping_cart_by_id` → `get_time_slots`), translate, `find_products_batch` in chunks of 30, LLM pick, quantities | 2 | 2.5 h |
| 4 | `DeliverySetup.tsx` + `create_shopping_cart` path for users with no cart | 3 | 2 h |
| 5 | `commitCart`: `add_or_update_cart_products` → `get_shopping_cart_by_id` → totals, `validations[]`, `checkoutWebLink`; `POST /api/cart/silpo/commit` | 3 | 1.5 h |
| 6 | `SilpoCart.tsx` (unlinked / review / committed), page wiring, remove StorePicker, `next.config.ts` image host | 2, 5 | 2.5 h |
| 7 | Schemas, delete Zakaz files, port `zakaz.test.ts` cases for `parsePicks`/`fromDictionary`/`suggestQuantity`, README env | all | 1 h |
| 8 | Live verification with a real Silpo account, 429 backoff, token refresh path | all | 1 h |
| | **Total** | | **~15 h** |

Cut order under time pressure: #4 (require an existing Silpo cart; show "open the Silpo app once and set your address") → LLM pick (top hit only) → bonus toggle → `validations[]` display.

## 9. Upgrade ideas, ranked by demo value per hour

| # | Idea | Tools | Change in EatFit | Effort | Jury value |
|---|---|---|---|---|---|
| 1 | Cart write + checkout link (§7) | cart group, `find_products_batch` | "links" → "your Silpo cart is filled, pay here" | 15 h | Required baseline; direct hit on "агент, який робить, а не радить" (FAQ) |
| 2 | Cook what's discounted | `silpo_get_promotions`, `silpo_get_products(promo)` | Fetch promo proteins/produce for the user's branch, inject "prefer these ingredients" into `userPrompt()` in `lib/llm.ts`; badge promo lines in the cart | 3 h | High: visible price delta week over week, uses a tool nobody else will |
| 3 | Out-of-stock substitution | `silpo_get_replacements`, `silpo_get_similar_products`, `validations[]` | After commit, for each invalid line propose a replacement and re-add | 1.5 h | High per hour: shows a multi-step agent loop on real data |
| 4 | Budget-aware plan | prices from `find_products_batch`, `get_similar_products` | Weekly cost estimate on the plan page; "cheaper swap" per ingredient; regenerate day with `preference` = "cheaper" | 3 h | High: "бюджет" is listed verbatim under "AI-помічники для покупок" |
| 5 | Nutrition from product cards | `silpo_get_product_details` | Replace LLM macro estimates with label data for matched products; show variance | 3 h | Medium-high: measurable accuracy claim for the validation criterion; field shape [unverified] |
| 6 | Fridge from receipts | `silpo_get_my_offline_orders`, `silpo_get_my_online_orders` | Prefill `profile.ingredients` with last 7 days of purchases instead of the fridge photo | 2.5 h | High wow, low effort; unique to Silpo |
| 7 | Profile import | `silpo_get_my_food_restrictions`, `silpo_get_my_family` | Prefill dietary tags and household size at onboarding | 1.5 h | Medium: "реалістичність інтеграції" |
| 8 | Loyalty | `silpo_get_loyalty_info`, `silpo_update_shopping_cart(bonusRequested)` | "Apply N balabonuses" toggle on the committed cart | 1 h | Medium, cheap |
| 9 | Delivery slot in-app | `silpo_get_time_slots`, `silpo_update_shopping_cart` | Slot picker on the cart page | 2 h | Medium |
| 10 | Auto "delivered" | `silpo_get_my_online_orders` | Cron/poll flips EatFit `Order.status`; unlocks "cooked it?" follow-ups | 1 h | Low-medium |
| 11 | Silpo as the meal-plan agent | LiteLLM MCP gateway, all read tools + cart writes | One agentic run composes plan and cart; stream the tool-call trace in the UI | 5 h | Highest "агентність" score, riskiest; demo mode only |
| 12 | Recipes from Silpo | none | No recipe tool in the official list; `silpo_get_product_sets` is the nearest | n/a | Drop |
| 13 | Per-store availability | `silpo_list_branches` + cart context per branch | Compare branches for pickup users | 2 h | Low for a delivery product |

Recommended two-week scope: #1, then #3, #2, #6, #8. That yields a demo that plans from this week's promos, fills the real cart, repairs out-of-stock lines, applies bonuses, and ends on Silpo's checkout page.

## 10. The hackathon (Silpo AI Factory: Хакатон ідей)

| Item | Fact | Tag |
|---|---|---|
| Organizer | ТОВ «СІЛЬПО-ФУД» (ЄДРПОУ 40720198) with Fozzy Group; online only; free | [verified: /terms 1.1, 2.1; FAQ "Участь безкоштовна"] |
| Registration | 2026-08-01 to 2026-08-31. Live page today: "Реєстрацію завершено. Реєстрація на хакатон закрилася 1 вересня 2026 року." Existing applicants manage submissions at `/cabinet` | [verified: /terms 5.2; probed: live page] |
| Kick-off | 2026-09-01 (online, rules, jury, mentors) | [verified: /terms 5.3] |
| Development and submission | 2026-09-01 to 2026-09-14; last day for video pitch and demo materials 2026-09-14, deadlines at 23:59 Kyiv (site: "14 вересня 23:59:59") | [verified: /terms 5.3, 5.4; home] |
| Judging | 2026-09-15 to 09-28; up to 10 finalists notified by 09-29; online final with live pitches and results 2026-09-30 | [verified: /terms 5.3, 9.5; home] |
| Eligibility | Natural persons, Ukraine residents, 18+, able to receive payments from a Ukrainian legal entity; no legal entities; solo or team ("до 10 людей"), team can form after registration; each member must accept the terms | [verified: /terms 6.1, 6.2, 6.4, 4.5; FAQ] |
| Mandatory | Project built on the official MCP (`/terms` 8.1; docs: connect to `https://mcp.silpo.ua/mcp`, call at least one tool from `tools/list` in a working scenario, show the call in a recording/JSON-RPC log/traces, keep tokens server-side); **video pitch 3 to 5 min** covering problem, solution, role of AI/MCP, value, scenario, implementation, prototype demo | [verified: /terms 8.1, 8.3; docs/mcp] |
| Optional deliverables | presentation, Figma, screenshots, working demo, no-code prototype, repository, docs, architecture, business model; code is not required ("Чи обов'язково писати код? Ні.") | [verified: /terms 8.4; FAQ] |
| Disclosure duties | list third-party libraries/models/datasets and their licenses; disclose substantial generative-AI or third-party code use and the human contribution; no secrets/tokens in materials; keep materials accessible 90 days after results | [verified: /terms 8.6, 8.7, 8.9, 14.2, 9.3] |
| Judging weights | Innovation 25%, feasibility 20%, guest/business impact 25%, presentation 15%, technical (architecture, justified AI/MCP use, prototype quality) 15%; ties broken by impact then innovation | [verified: /terms 10.3, 10.4] |
| Site criteria wording | value for guest/business; quality of MCP use; agentness ("послідовність дій, а не лише генерувати відповідь"); realism of integration; prototype/demo quality; validation and scaling | [verified: home "Критерії"] |
| Explicitly rejected | no official MCP; idea-only; AI used only for text/image generation; FAQ bot; no defined user/problem; no value; no demo. FAQ: another chat assistant "найімовірніше, ні" (Silpo already has "Машрум Геннадійович") | [verified: home "Обмеження"; FAQ] |
| Tracks (informal, "Що можна створити") | shopping assistants (cart planning, products for a dish/event/budget), task-executing agents, integrations into Silpo products, external integrations (messengers, voice), new digital products, internal-process tools | [verified: home] |
| Prizes | 100,000 ₴ total: 50k / 30k / 20k, paid net of PDFO and military levy to a bank account within ~30 working days after documents; team prize goes to the representative | [verified: /terms 11.1 to 11.10] |
| IP | Authorship stays with participants; no automatic transfer of exclusive rights, but submission lets Silpo and Fozzy Group "використовувати, розвивати, змінювати й упроваджувати" the solution without extra compensation; ideas/concepts unprotected; Silpo may build similar products independently | [verified: FAQ; /terms 13.1, 13.2, 13.5] |
| Support | Q&A sessions with Silpo engineers and AI architects; DOU listing mentions Discord community, mentor schedule, starter kit, presentation and demo templates (registered participants) | [verified: FAQ; dou.ua/calendar/58019] |
| Jury | Ihor Drozd (CTO), Ruslan Mamedov (CPO), Mykhailo Mironov, Yana Lytvynova, Oleksandr Tryhub (Chief Architect), Yurii Panaiotov, Ihor Balimasov, Oleksandr Krakovetskyi (DevRain), Maryna Velihura, Oleksii Hryshko | [verified: home] |

Fit: EatFit lands in "AI-помічники для покупок ... підбір продуктів під страву ... бюджет" and "Нові цифрові продукти". What judges reward that the repo lacks today: a real cart write (agentness), a visible tool-call trace in the demo, a validation story (e.g. weekly grocery spend before/after promo-aware planning, N test users), an integration story (how this lives inside the Silpo app or a messenger), the 3 to 5 minute video, and the disclosure list of third-party components and AI-generated code. Innovation carries 25%: promo-driven and receipt-driven planning (#2, #6) are the differentiators; a plain "fill my cart" agent is what the docs' own example already does.

## 11. Live probe results (2026-09-04, authenticated)

Run with `npm run silpo:tools` (OAuth + `tools/list` → `docs/silpo-tools.json`) and `node scripts/silpo-probe.mts` (read-only calls). All [probed].

| Fact | Observation |
|---|---|
| Handshake | Dynamic client registration with a `localhost:3939` redirect and `token_endpoint_auth_method: none` accepted; login at `auth.silpo.ua`; protocol `2025-11-25`; server `silpo-mcp-service 1.109.6`. SDK v1 `1.30.0` works as-is. |
| Tool schemas | 40 tools, every one with `inputSchema` **and** `outputSchema`; results arrive as `structuredContent` plus a text copy. Tool-level failures come back as `isError: true` with plain text (`Error in get-time-slots: API returned 400 Bad Request.`), not JSON. |
| Cart context | `cart.shipments[0].branchId`, `cart.deliveryType`, `cart.timeslot.start/end`; `cart.calculation.{total,totalAfterDiscounts,subTotal,subDiscount,productsTotal,delivery,validations}`; `loyalty.{bonusAvailable,bonusTotal,bonusRequested,isEnabled}`. `checkoutWebLink` was **absent** on a cart whose timeslot had expired; whether it appears once the slot is valid needs a write test. |
| Stale timeslot | Searching with the cart's expired slot does **not** error: it returns `totalFound: 0` for every query. With a live slot the same 10 queries returned 35 products. `buildCart` must validate the slot first and search with a live one. |
| `silpo_get_time_slots` | The documented `start=now` argument 400s; `{ branchId, deliveryTypes, limit }` works. Slot shape: `start, end, available, deliveryType, deliveryCost (99), deliveryCostMap ([{cost:69, fromOrderCost:1299},{cost:1, fromOrderCost:1899}]), minOrderCost (699), maxWeight (50), constraints`. |
| English queries | Useless: `chicken breast` 0, `eggs` 0, `rice` → "World's Rice" brand flour, `potato` → Porto wine, `tomatoes` → Red Tomato beer. EN→UK translation is mandatory. |
| Ukrainian queries | Work, with noise: `куряче філе` → fillet, thigh fillet, then **cat food**; `рис` → 70 hits led by specialty rices. No category field on hits, so the LLM variant-choice step stays. |
| Price and quantity model | Weighted goods (`weighted: true`): `price` is per kg, `displayRatio` "100г", `step` in kg (0.25 to 1.05), `stock` in kg. Piece goods: `price` per unit, `displayRatio` is the unit content ("10шт", "700г"), `step` 1. `oldPrice` present when discounted. `externalProductId` is the article code; searching it returns the exact product. |
| Product card | `silpo_get_product_details(slug)` → `url` (`https://silpo.ua/product/kuriache-file-461800`, a real per-product deep link), `images[]`, and `attributes` as a flat dict: `"Енергетична цінність (кКал/кДЖ)": "110/461", "Білки (г)": 21.6, "Жири (г)": 2.6, "Вуглеводи (г)": 0` (per 100 g). Nutrition-from-label (§9 #5) is feasible. |
| Promotions | 11 active codes on the Kyiv branch, e.g. `cinotyzhyky` (Цінотижики, 515 products), `only_online` (1080), `melkoopt` (372); each usable as `promotionCode` in `silpo_get_products`. |

## 12. Open items (still unverified)

1. Whether `checkoutWebLink` appears once the cart has a valid slot and products (needs a write test on a real cart).
2. Rate-limit numbers, MCP terms of use outside the hackathon, commercial use, any partner program.
3. Whether the deployed LiteLLM proxy has the MCP gateway enabled and at which version.

## Sources

- Silpo MCP docs: https://ai-factory.silpo.ua/docs/mcp (fetched 2026-09-04, server-rendered HTML, 68 KB)
- Hackathon home incl. client-rendered FAQ and registration state: https://ai-factory.silpo.ua/ (fetched via curl and Chrome, 2026-09-04)
- Hackathon terms (public offer, edition 2026-08-01): https://ai-factory.silpo.ua/terms
- Participant cabinet: https://ai-factory.silpo.ua/cabinet (200, login-gated)
- Tried and 404: `/llms.txt`, `/sitemap.xml`, `/docs`, `/docs/mcp.md`, `/openapi.json`; `/robots.txt` allows all
- Live probes of `https://mcp.silpo.ua/mcp`, `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource[/mcp]`, `POST /register`, `GET /authorize`, `https://auth.silpo.ua/` (2026-09-04)
- MCP spec 2026-07-28: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization , /basic/versioning , /basic/transports
- TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk , https://ts.sdk.modelcontextprotocol.io/v2/ , npm `@modelcontextprotocol/sdk@1.30.0`, `@modelcontextprotocol/client@2.0.0`, `@modelcontextprotocol/node@2.0.0`, `@ai-sdk/mcp@2.0.44`; jsdelivr `dist/esm/types.js`, `client/auth.d.ts`, `client/streamableHttp.d.ts`
- LiteLLM MCP gateway: https://docs.litellm.ai/docs/mcp
- Press: https://dou.ua/forums/topic/61352/ (2026-08-13, incl. Roman's test comment), https://dev.ua/news/mcp-silpo-1787057670 (2026-08-18), https://kosht.media/silpo-vidkryv-dostup-shi-do-tovariv-koshyka-ta-istorii-pokupok/ , https://dev.ua/news/silpo-ai-factory-1785848152 (2026-08-04), https://dou.ua/calendar/58019/
- Unofficial, for contrast only (not allowed in the hackathon): https://github.com/denysosadchyi/silposha (`sf-ecom-api.silpo.ua`), https://lobehub.com/mcp/mit9-silpo-mcp
