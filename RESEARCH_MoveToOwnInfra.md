> **Status (2026-09-09): mostly executed.** Done: repo transferred to `Oodmincheg/EatFitWebApp`; Vercel Hobby project `eat-fit-web-app` deployed at https://eat-fit-web-app.vercel.app with all nine variables (a duplicate project was deleted); LLM switched to OpenRouter `openai/gpt-5.6-luna`; Atlas cluster resumed (it was paused, not deleted, and paused M0 clusters drop their SRV records); `.npmrc` pins npmjs after Vercel failed `npm install` against the lockfile's Artifactory URLs; `.env.local.example` added. Remaining: Firebase Authorized domains for the Vercel host, Silpo re-link on the new origin, a permanent LLM key (the current one is a 7-day test key), deleting `.silpo-probe.local.json`, the IP/permission check in §8.

# Research: moving EatFit onto infrastructure the owner controls

**Date:** September 6, 2026
**Context:** EatFit was built at the airSlate / SignNow "AI Build Day" hackathon (team repo "Clauders", `package.json` name `aibd-clauders`). It runs on a corporate LiteLLM proxy, a MongoDB Atlas cluster, a Vercel project and a Firebase project that belong to the employer or to colleagues. The owner (@Oodmincheg) has entered it into the Silpo AI Factory hackathon, a public event for natural persons, and wants every dependency under his own accounts. This document is the ordered checklist for that move, with one recommendation per decision and the exact env-var mapping.
**Method:** read the repo (README, SPEC §2, RESEARCH_SilpoMCP §2, §10, §11, `lib/llm.ts`, `lib/silpo/*`, `lib/db/*`, `lib/firebase.ts`, `app/api/*/route.ts`, `package.json`, `next.config.ts`, `skills-lock.json`, `promo/`), ran read-only `git` and `gh api` calls, then read the owning docs page for every external claim. Tags: [verified: source] read on the owning page, [repo] read in this repo, [unverified] inferred. No `.env*` file exists in the checkout; no secret values were read or printed.
**Companion docs:** [RESEARCH_SilpoMCP.md](./RESEARCH_SilpoMCP.md) (Silpo OAuth and hackathon terms), [SPEC_MealPlanner_MVP.md](./SPEC_MealPlanner_MVP.md) §2 (architecture, env vars).

---

## 1. Bottom line

- Owner confirmed on 2026-09-06 that the GitHub org, the Atlas cluster and the Firebase project are already the team's own, not the employer's. What actually moves is the LLM gateway (corporate LiteLLM) and hosting (no Vercel deployment could be found from this machine or the repo).
- Recommended stack: keep Atlas and Firebase as they are (rotate the Atlas DB password if ex-teammates hold it) + Vercel Hobby on a personal team + OpenRouter with `anthropic/claude-sonnet-5` as the LLM. LiteLLM is dropped. Every change is env-only; no code edit is required for the move.
- `EatFitFood/EatFitWebApp` is a private repo in a GitHub org created 2026-07-26 for the hackathon; @Oodmincheg has admin on the repo. Both commit authors use personal gmail addresses. `airslate` appears only as the PRD/SPEC owner line. [repo]
- Vercel Hobby cannot connect to a repo owned by a Git organization [verified: vercel.com/docs/limits]. Either transfer the repo to `Oodmincheg/EatFitWebApp` before importing, or pay for a Vercel team plan to keep the org. Fluid compute gives Hobby functions 300 s, so `maxDuration = 120` is fine [verified: vercel.com/docs/functions/configuring-functions/duration]. Netlify is out (60 s hard function limit) [verified: docs.netlify.com].
- Anthropic's own OpenAI-compatible endpoint ignores `response_format` and is documented as "not considered a long-term or production-ready solution" [verified: platform.claude.com openai-sdk]. OpenRouter honors `response_format`, accepts `image_url`, charges the provider's list price plus 5.5% on credit top-ups [verified: openrouter.ai docs]. That is why it wins over pointing at Anthropic directly.
- 100 seven-day plan generations cost about $4.12 (₴184) on Claude Sonnet 5, $2.06 (₴92) on Claude Haiku 4.5, $0.82 (₴37) on gpt-5-mini, before thinking tokens and retries (§3.3).
- Moving origin re-registers the Silpo OAuth client automatically (registration is keyed by redirect URI in `silpo_clients`) and every user re-links. No Silpo-side allow-listing is documented. [repo; verified: ai-factory.silpo.ua/docs/mcp]
- Not a legal opinion: the PRD is owned by a colleague, the initial commit (code, promo video, screenshots) is by that colleague, and the Silpo terms make the participant warrant ownership of all exclusive rights (13.4) and disclose background materials and third-party components (13.3, 8.6, 8.7). Get a written OK from Volodymyr and check the AI Build Day rules before the repo goes public.

## 2. What the repo depends on today

| Dependency | Where | Owner today | Tag |
|---|---|---|---|
| `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LITELLM_MODEL` | `lib/llm.ts` (100 s timeout), `lib/silpo/match.ts` (20 s translate, 15 s pick). `POST {base}/chat/completions`, Bearer, `response_format: {type:'json_object'}`, no `temperature`, no `max_tokens`, `image_url` data URL for the fridge photo, fence stripping, one corrective retry | corporate LiteLLM, model `claude-sonnet-5` per code comment | [repo] |
| `MONGODB_URI`, `MONGODB_DB` (default `mealplanner`) | `lib/db/client.ts`, raw driver `mongodb@^7.5`, collections `users`, `plans`, `progress`, `orders`, `silpo_oauth`, `silpo_clients`, indexes created on connect | team's own Atlas cluster (owner confirmed) | [repo] |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID` | `lib/firebase.ts` client SDK only, `signInWithPopup`; `app/api/session/route.ts` decodes the ID token without verification; unset vars hide the Google button | team's own Firebase project (owner confirmed) | [repo] |
| `APP_BASE_URL` (optional), `SILPO_MCP_URL`, `SILPO_OAUTH_CLIENT_ID` (optional) | `lib/silpo/auth.ts`: redirect `${APP_BASE_URL ?? origin}/api/auth/silpo/callback`; client registration stored per redirect URI | Silpo (public MCP, no developer account) | [repo] |
| Route `maxDuration` | 120 s `generate-plan`, `regenerate-day`; 60 s `parse-fridge`, `cart/silpo`, `cart/silpo/commit`; `runtime = 'nodejs'` | written for Vercel | [repo] |
| Vercel project | No `.vercel/`, no `vercel.json`, 0 GitHub deployments and 0 environments on the repo, no repo homepage, no Vercel CLI login on the owner's machine, no `vercel.app` string in the repo, promo screenshots cropped above the address bar. If a deployment exists it was made from another account without the GitHub integration | unknown; check vercel.com under your account and ask Volodymyr | [repo; gh api] |
| Fonts | `next/font/google` (Bricolage Grotesque, Instrument Sans, Space Mono) in `app/layout.tsx` | build-time only | [repo] |
| Images | `images.silpo.ua` in `next.config.ts` `remotePatterns`; one plain link to `glovoapp.com` | none | [repo] |
| Promo assets | `promo/eatfit-promo.mp4` (21 MB), 5 screenshots dated 2026-07-11, all in the initial commit by Volodymyr Batsan; `skills-lock.json` pins `higgsfield-generate` and `higgsfield-websites` | whoever's Higgsfield account produced them | [repo] |
| Local secrets (git-ignored) | `.silpo-oauth.local.json` (keys `clientInformation`, `codeVerifier`, `state`, `tokens`), `.silpo-probe.local.json` | owner's Silpo login | [repo] |

## 3. LLM gateway

### 3.1 Point `LITELLM_BASE_URL` at a provider directly

| Provider | Base URL | `response_format json_object` | `image_url` | Model id for Claude | Notes | Tag |
|---|---|---|---|---|---|---|
| Anthropic OpenAI compat | `https://api.anthropic.com/v1/` | Ignored ("For JSON output, use Structured Outputs with the native Claude API") | `url` fully supported, `detail` ignored | `claude-sonnet-5`, `claude-haiku-4-5`, `claude-opus-5` | `temperature` 0..1, `n` must be 1, `strict` and prompt caching unsupported, system messages hoisted; "primarily intended to test and compare model capabilities". Default `max_tokens` when omitted: not documented [unverified] | [verified: platform.claude.com/docs/en/api/openai-sdk] |
| OpenRouter | `https://openrouter.ai/api/v1` | Supported (`json_object` and `json_schema`, per model) | URL or base64 | `anthropic/claude-sonnet-5` ($2 / $10), lists structured outputs and image input | No markup on inference; 5.5% ($0.80 min) fee on Stripe credit purchases | [verified: openrouter.ai/docs/api-reference/overview, /docs/faq, /anthropic/claude-sonnet-5] |
| OpenAI | `https://api.openai.com/v1` | Supported; "the model will not generate JSON without a system or user message instructing it" (the prompts already do) | supported | n/a (`gpt-5-mini`) | Prompts are tuned to Claude; expect output drift | [verified: developers.openai.com/api/docs/api-reference/chat/create] |
| Gemini OpenAI compat | `https://generativelanguage.googleapis.com/v1beta/openai/` | Only schema-style example shown; `json_object` not documented; unlisted params "silently ignored" | base64 data URL shown | n/a | "still in beta" | [verified: ai.google.dev/gemini-api/docs/openai] |
| Groq, DeepSeek | `https://api.groq.com/openai/v1`, `https://api.deepseek.com` | DeepSeek yes (prompt must contain "json"); Groq page silent | not documented on either compat page | none (no Claude) | Not relevant for Claude-tuned prompts | [verified: console.groq.com/docs/openai, api-docs.deepseek.com/guides/json_mode] |

Claude model facts: `claude-sonnet-5` $2 in / $10 out per MTok, `claude-haiku-4-5` $1 / $5, `claude-opus-5` $5 / $25; all current models accept image input; image cost is ⌈w/28⌉ × ⌈h/28⌉ visual tokens, a 1092×1092 photo is 1521 tokens [verified: platform.claude.com/docs/en/models/overview, /build-with-claude/vision]. Sonnet 5 has adaptive thinking on; thinking tokens bill as output and `temperature` is rejected on the native API, which is why the code sends none [claude-api skill; repo comment].

### 3.2 Self-host LiteLLM (the "light" option)

| Item | Fact | Tag |
|---|---|---|
| Image | `docker.litellm.ai/berriai/litellm:latest` in the quick start; deploy docs say pin a version tag, e.g. `ghcr.io/berriai/litellm:v1.90.2` | [verified: docs.litellm.ai/docs/proxy/docker_quick_start, /proxy/deploy] |
| Postgres | Not needed: "If you only need the OpenAI-compatible API (no Admin UI model management, virtual keys, or spend tracking), you can run the plain litellm image with a config file". Without a DB "authentication falls back to the master key alone" | [verified: same pages] |
| Minimal config | `model_list: [{model_name: claude-sonnet-5, litellm_params: {model: anthropic/claude-sonnet-5, api_key: os.environ/ANTHROPIC_API_KEY}}]`; env `LITELLM_MASTER_KEY`; port 4000. LiteLLM maps `response_format` to Anthropic structured outputs | [verified: docs.litellm.ai/docs/providers/anthropic] |
| Fly.io | shared-cpu-1x 256 MB $2.02/mo, 512 MB $3.32/mo (Amsterdam), egress $0.02/GB, no plan fee; `[http_service.http_options] idle_timeout` is configurable, default not shown (community reports 60 s [unverified]) | [verified: fly.io/docs/about/pricing, /reference/configuration] |
| Railway | Free plan $1 credit/mo; Hobby $5/mo incl. $5 usage; $10 per GB-month RAM, $20 per vCPU-month, egress $0.05/GB; official LiteLLM template, set `PORT=4000` | [verified: railway.com/pricing, docs.litellm.ai/docs/proxy/deploy] |
| Render | Free web service spins down after 15 min idle, 750 free instance hours/month, Free 0.1 CPU / 512 MB, Starter 0.5 CPU / 512 MB (price $7/mo per third-party pages [unverified]) | [verified: render.com/docs/free, /docs/compute-plans] |

Verdict: a proxy adds a service, a master key and a cold-start risk in front of a 100 s call, and buys nothing the app uses. Only do it if the owner wants per-key spend caps later.

### 3.3 Cost per 100 calls

Assumptions from the prompts: plan = 600 in + 4,000 out tokens; day regeneration = 700 in + 1,000 out; fridge photo = 1,500 image + 150 text in, 100 out. Excludes thinking tokens (Sonnet 5) and the retry path (up to 2×). ₴ at NBU 44.5616 UAH/USD for 07.09.2026 [verified: bank.gov.ua NBUStatService]. All rows [unverified estimate] on [verified] list prices.

| Model | 100 plans | 100 day regens | 100 photos |
|---|---|---|---|
| `claude-sonnet-5` ($2 / $10) | $4.12, ₴184 | $1.14, ₴51 | $0.43, ₴19 |
| `claude-haiku-4-5` ($1 / $5) | $2.06, ₴92 | $0.57, ₴25 | $0.22, ₴10 |
| `gpt-5-mini` ($0.25 / $2) | $0.82, ₴37 | $0.22, ₴10 | $0.06, ₴3 (OpenAI image tokenization differs) |

Recommendation: OpenRouter with `anthropic/claude-sonnet-5` (same model family the prompts were tuned on, `response_format` honored, zero code change). Switch `LITELLM_MODEL` to `anthropic/claude-haiku-4-5` if latency or cost matters more than plan quality. Runner-up: Anthropic direct with `LITELLM_MODEL=claude-sonnet-5`, accepting that `response_format` is ignored (the prompts and the retry already enforce JSON). Env values: `LITELLM_BASE_URL=https://openrouter.ai/api/v1`, `LITELLM_API_KEY=<OpenRouter key>`, `LITELLM_MODEL=anthropic/claude-sonnet-5`. The durable fix is replacing the raw `fetch` with the Anthropic SDK and native structured outputs; that is a code change, outside this checklist.

## 4. Hosting

| Option | Next.js 15 App Router | Long request (100 s LLM call + retry) | Cost | Verdict | Tag |
|---|---|---|---|---|---|
| Vercel Hobby | native, verified adapter | Fluid compute: default and max 300 s on Hobby; legacy non-Fluid projects 10 s / 60 s | $0; "restricted to non-commercial personal use only"; typical fair use 100 GB transfer, 1M invocations, 4 CPU-hrs, 360 GB-hrs; 100 deployments/day; 45 min build; 1 concurrent build; 1 h runtime logs; 5K image transformations | Recommended | [verified: vercel.com/docs/plans/hobby, /docs/limits, /docs/limits/fair-use-guidelines, /docs/functions/configuring-functions/duration] |
| Vercel project transfer | n/a | n/a | Owner of source team + member of target team; env vars, domains, deployments, Git link move; integrations and logs do not | Only if the current owner cooperates; a fresh import is simpler | [verified: vercel.com/docs/projects/transferring-projects] |
| Netlify | OpenNext adapter, Next ≥ 13.5 | synchronous function limit 60 s, not configurable | free tier | Rejected | [verified: docs.netlify.com/frameworks/next-js/overview, /build/functions/configuration] |
| Cloudflare (OpenNext) | latest minors of 14 and 15, Node runtime only | no wall-clock limit, but free plan 10 ms CPU/invocation, 128 MB, 3 MiB compressed Worker | free / $5 | Risky: `mongodb` driver over TCP and bundle size [unverified] | [verified: opennext.js.org/cloudflare, developers.cloudflare.com/workers/platform/limits] |
| Railway | Dockerfile with `output: "standalone"`, Generate Domain | requests run up to 15 min with data, closed after 5 min without | Hobby $5/mo incl. $5 usage; no non-commercial clause on the pricing page | Fallback if the Vercel commercial clause worries you | [verified: docs.railway.com/guides/nextjs, /networking/public-networking/specs-and-limits, railway.com/pricing] |
| Fly.io / VPS (`next start` in Docker) | all features | proxy `idle_timeout` configurable | ~$2 to $3.32/mo machine (Fly, 1 GB default for Next) | Fine, more hands-on | [verified: nextjs.org/docs/app/getting-started/deploying, fly.io/docs/js/frameworks/nextjs] |

Vercel caveat: "Commercial usage is defined as any Deployment that is used for the purpose of financial gain of anyone involved". A hackathon with cash prizes is a grey zone; Vercel's own advice is to contact support if unsure [verified: fair-use page]. Vercel Hobby also refuses Git-organization repos, so §8 step 1 comes first [verified: vercel.com/docs/limits].

Steps: move repo (§8) → vercel.com, Add New Project, import `Oodmincheg/EatFitWebApp` → set the §11 env vars for Production and Preview → Deploy → leave `APP_BASE_URL` unset so the redirect URI follows the request origin; set it only when a custom domain and `*.vercel.app` both serve traffic, so Silpo sees one client → optional custom domain (50 per project on Hobby).

## 5. Database

| Item | Fact | Tag |
|---|---|---|
| Free (M0) cluster | 0.5 GB storage, 500 connections, 100 ops/s, 10 GB in and 10 GB out per rolling 7 days, one per project, 100 databases / 500 collections, no backups, paused after 30 days with zero connections | [verified: mongodb.com/docs/atlas/reference/free-shared-limitations] |
| Create | Console: org → project → Free cluster → database user → IP access list → connection string; or `atlas setup --clusterName eatfit --provider AWS --region eu-west-1 --username ... --password ...` prints the URI | [verified: mongodb.com/docs/atlas/getting-started] |
| Copy data | `mongodump --uri="<old URI>" --db=mealplanner --out ./dump` then `mongorestore --uri="<new URI>" --nsInclude="mealplanner.*" ./dump`. Live migration is for running clusters, not needed here | [verified: mongodb.com/docs/database-tools/mongodump, /mongorestore, atlas/import/live-import] |

Recommendation: the cluster is already the team's, so keep it and its data; nothing to create or copy. Rotate the DB user's password if anyone outside the team still holds `MONGODB_URI`, and keep `0.0.0.0/0` only while the app runs on Vercel (no static IP on Hobby). Local dev can use Docker `mongo:7` with `MONGODB_URI=mongodb://localhost:27017` [unverified: not tested here]. The create and copy rows above stay for the case where a fresh cluster is wanted later.

## 6. Auth

| Item | Fact | Tag |
|---|---|---|
| New project | Firebase console → Authentication → Sign-in method → enable Google → Save; web app config (`apiKey`, `authDomain`, `projectId`, `appId`) is "considered public" | [verified: firebase.google.com/docs/auth/web/google-signin, /docs/projects/learn-more] |
| Domains | "you must whitelist the domains that the Firebase Authentication servers can redirect to"; `localhost` and the project's hosting domain are pre-whitelisted; add the Vercel domain(s) under Authentication → Settings → Authorized domains (menu path [unverified]) | [verified: support.google.com/firebase/answer/6400741] |
| Cost | Spark plan: no cost up to 50K MAU for standard providers | [verified: firebase.google.com/pricing] |
| Consequence | `uid` is unique per Firebase project, so every Google user becomes a new `users` document; guest cookie users are untouched | [verified: firebase.google.com/docs/auth/admin/verify-id-tokens; repo `findOrCreateGoogleUser`] |
| Alternative | Auth.js Google provider: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, callback `https://<host>/api/auth/callback/google`; or guest-only by leaving `NEXT_PUBLIC_FIREBASE_*` unset | [verified: authjs.dev/getting-started/providers/google; repo `firebaseAvailable`] |

Recommendation: the project is already the team's, so keep it and the four env vars; existing Google users keep their `firebaseUid`. The only action is adding the new deploy domain to Authorized domains. The unverified-token shortcut stays as documented in README; do not present Google sign-in as secure in the pitch. Auth.js only pays off together with real token verification.

## 7. Silpo

Origin change → redirect URI change → `MongoSilpoAuthProvider.clientInformation()` finds no `silpo_clients` doc for the new URI → the MCP SDK calls `POST /register` again and stores the new client [repo `lib/silpo/auth.ts`]. Docs describe exactly this ("Реєструється через Dynamic Client Registration (`POST /register`)") and list no redirect-URI restrictions or developer registration; a `localhost` redirect was accepted in the live probe [verified: ai-factory.silpo.ua/docs/mcp; repo RESEARCH_SilpoMCP §2, §11]. Every user re-links once (tokens in `silpo_oauth` belong to the old client). Hackathon rules that still apply: connect only to `https://mcp.silpo.ua/mcp`, call at least one tool in a working scenario, show the call in the demo, keep tokens server-side [verified: docs/mcp "Використання на хакатоні"]. Delete `.silpo-oauth.local.json` after the move; it holds a live token for the owner's Silpo account.

## 8. Repo, identity, IP

| Item | Fact | Tag |
|---|---|---|
| Remote | `origin git@github.com:EatFitFood/EatFitWebApp.git`, private, no license, org created 2026-07-26T14:47Z, repo 14:49Z; @Oodmincheg has `admin` on the repo; `gh` is logged in as Oodmincheg | [repo; gh api] |
| Transfer | Requires admin on the repo (org owner or repo admin); issues, PRs, stars move; new owner accepts within one day; old URLs redirect. Alternative: create `Oodmincheg/EatFitWebApp`, `git remote set-url origin git@github.com:Oodmincheg/EatFitWebApp.git`, `git push -u origin main feature/silpo-mcp-cart silpo-draf` | [verified: docs.github.com transferring-a-repository, managing-remote-repositories] |
| Authors | `Volodymyr Batsan <vbatsan@gmail.com>` 1 commit, `Vorobiov Vladyslav <vorobyov.vladislav@gmail.com>` 2. Nothing to scrub; do not rewrite history. Set `git config user.email` in this clone to the address you want on future commits | [repo] |
| License | Without one "no one may reproduce, distribute, or create derivative works"; add `LICENSE` (choosealicense.com) only after the IP question below is settled | [verified: docs.github.com licensing-a-repository] |
| IP flags (not legal advice) | PRD/SPEC "Owner: volodymyr.batsan@airslate.com"; initial commit incl. promo assets by Volodymyr; employer hackathon rules unknown. Silpo terms: 6.1 natural persons, 18+, Ukraine residents; 8.6 list third-party libraries/models and their licenses; 8.7 disclose substantial generative-AI or third-party code; 13.3 disclose background materials; 13.4 participant warrants holding all exclusive rights | [repo; verified: ai-factory.silpo.ua/terms] |
| Secrets to rotate or drop | corporate `LITELLM_API_KEY` (teammates' `.env.local`, any Vercel env), the Atlas DB user and `MONGODB_URI`, the Vercel project's env set, `.silpo-oauth.local.json` (Silpo `revocation_endpoint` is `/token` per RESEARCH_SilpoMCP §2). Firebase config is public, nothing to rotate | [repo] |

## 9. Assets and other dependencies

| Item | Fact | Action | Tag |
|---|---|---|---|
| Higgsfield outputs | ToU 4.4: "Company does not claim ownership of any of your Inputs or Outputs, nor does it restrict your commercial use of Outputs"; rights survive account deletion and may be sublicensed; content may be used for training | Rights sit with whoever generated them (account unknown [unverified]); get that person's OK to keep `promo/` | [verified: higgsfield.ai/terms-of-use-agreement] |
| Google Fonts | "CSS and font files are downloaded at build time and self-hosted ... No requests are sent to Google by the browser" | none | [verified: nextjs.org/docs/app/api-reference/components/font] |
| `images.silpo.ua` | `remotePatterns` only; the optimizer fetches at request time on the host | none (counts toward Vercel's 5K image transformations) | [repo; verified: fair-use page] |
| `mongodb-memory-server` | devDependency; downloads a MongoDB binary for tests | none, dev only | [repo; download behavior unverified] |
| `glovoapp.com` link | plain anchor in `OrderModal.tsx` | none | [repo] |

## 10. Ordered checklist

1. Get written OK from Volodymyr (PRD owner, initial-commit author) on publishing the code and reusing `promo/`, and check the AI Build Day terms. Decide the license only after this.
2. Vercel: log in to vercel.com and check whether an EatFit project already exists under your account; ask Volodymyr about his. None is discoverable from the repo or this machine.
3. Repo: Vercel Hobby will not import an org repo. Either transfer `EatFitFood/EatFitWebApp` to `Oodmincheg` (Settings → Danger Zone → Transfer; you have admin), then `git remote set-url origin git@github.com:Oodmincheg/EatFitWebApp.git`, or keep the org and pay for a Vercel team plan. Push `feature/silpo-mcp-cart` and `silpo-draf` either way; `git config user.email <chosen address>`.
4. OpenRouter: account → API key → buy credits. Record `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LITELLM_MODEL` from §11.
5. Vercel: Add New Project → import the repo → paste §11 env vars (Production and Preview; `MONGODB_URI` and `NEXT_PUBLIC_FIREBASE_*` keep their current values) → Deploy → note the `*.vercel.app` URL. Leave `APP_BASE_URL` unset unless a custom domain is added.
6. Firebase Authorized domains: add `<project>.vercel.app` (and the custom domain) to the existing project.
7. Silpo: open Cart → Connect Silpo → complete login → confirm `silpo_clients` has one doc whose `_id` is the new redirect URI.
8. Rotate and drop: ask whoever holds the corporate LiteLLM key to revoke it; rotate the Atlas DB password if anyone outside the team has `MONGODB_URI`; delete `.silpo-oauth.local.json` and `.silpo-probe.local.json`.
9. Add `.env.local.example` with the §11 variable names (README already references it and it is missing) and update README setup to name OpenRouter instead of LiteLLM.
10. Prepare the Silpo disclosure list (8.6, 8.7): Next.js, React, Tailwind, `mongodb`, `firebase`, `@modelcontextprotocol/sdk`, `zod`, Claude via OpenRouter, Higgsfield for promo assets, AI-assisted code.

## 11. Env-var mapping

| Variable | Old source | New source | Value to set |
|---|---|---|---|
| `LITELLM_BASE_URL` | corporate LiteLLM proxy | OpenRouter | `https://openrouter.ai/api/v1` (Anthropic direct: `https://api.anthropic.com/v1`) |
| `LITELLM_API_KEY` | corporate key | OpenRouter key | `sk-or-...` (Anthropic direct: `sk-ant-...`) |
| `LITELLM_MODEL` | `claude-sonnet-5` on the proxy | OpenRouter model id | `anthropic/claude-sonnet-5` (cheaper: `anthropic/claude-haiku-4-5`; Anthropic direct: `claude-sonnet-5`) |
| `MONGODB_URI` | team's Atlas cluster | same cluster, unchanged (new password if rotated) | current value |
| `MONGODB_DB` | unset or `mealplanner` | same | `mealplanner` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | team's Firebase project | same project, unchanged | current value |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | same | same | current value |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | same | same | current value |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | same | same | current value |
| `APP_BASE_URL` | unset | unset | set only with a custom domain, e.g. `https://eatfit.example` |
| `SILPO_MCP_URL` | unset (default) | unset | default `https://mcp.silpo.ua/mcp` |
| `SILPO_OAUTH_CLIENT_ID` | unset | unset | only if Silpo issues a fixed client id |

## 12. Monthly cost of the recommended stack

Load assumed for the estimate: 200 plans, 100 day regenerations, 50 photos per month. [unverified estimate on verified prices]

| Service | Plan | USD / month | ₴ / month (44.56) |
|---|---|---|---|
| Vercel | Hobby | 0 | 0 |
| MongoDB Atlas | Free (M0) | 0 | 0 |
| Firebase Auth | Spark | 0 | 0 |
| OpenRouter, `anthropic/claude-sonnet-5` | pay as you go + 5.5% top-up fee | ≈ 10.1 | ≈ 451 |
| OpenRouter, `anthropic/claude-haiku-4-5` (alternative) | same | ≈ 5.1 | ≈ 226 |
| Self-hosted LiteLLM on Fly (not recommended) | shared-cpu-1x 256 to 512 MB | 2.02 to 3.32 | 90 to 148 |
| Custom domain | optional | registrar price | not estimated |

## 13. Verify it works

- `npm ci && npm run build && npm test` on the new clone. [repo scripts]
- `curl -sS "$LITELLM_BASE_URL/chat/completions" -H "Authorization: Bearer $LITELLM_API_KEY" -H 'Content-Type: application/json' -d '{"model":"'"$LITELLM_MODEL"'","response_format":{"type":"json_object"},"messages":[{"role":"user","content":"Return {\"ok\":true} as JSON"}]}'` returns `choices[0].message.content` with `{"ok":true}`.
- `mongosh "$MONGODB_URI" --eval 'db.runCommand({ping:1})'` returns `ok: 1`; after the first app request, `db.getCollectionNames()` lists `users`, `plans`, `progress`, `orders`.
- Browser on the Vercel URL: guest → onboarding → Generate (7 days render, no 422/502) → Regenerate a day → upload a fridge photo → Google sign-in popup opens and returns (else Authorized domains is missing the host) → Cart → Connect Silpo → lands on `/dashboard/cart?silpo=linked` → Add to my Silpo cart returns totals.
- Vercel → project → Logs: `POST /api/generate-plan` finishes under 300 s with no timeout entries.
- `git remote -v` shows `Oodmincheg/EatFitWebApp`; `gh repo view --json isPrivate,licenseInfo`.
- OpenRouter Activity page shows the calls and their cost; compare against §3.3.

## 14. Could not verify

- Whether a Vercel deployment exists and under which account (no `.vercel/`, no GitHub deployments or environments, no CLI login, nothing in the promo screenshots).
- Default `max_tokens` when omitted on Anthropic's OpenAI-compatible endpoint, and how OpenRouter sets thinking for Sonnet 5.
- Fly Proxy default `idle_timeout` (docs show the key, not the default) and Render's Starter price (pricing page did not render).
- Which Higgsfield account generated `promo/`.
- The Firebase console menu path for Authorized domains (behavior verified, path not).

## Sources

- Repo: `README.md`, `SPEC_MealPlanner_MVP.md` §2, `RESEARCH_SilpoMCP.md` §2, §10, §11, `lib/llm.ts`, `lib/silpo/match.ts`, `lib/silpo/auth.ts`, `lib/db/client.ts`, `lib/firebase.ts`, `app/api/session/route.ts`, `app/api/*/route.ts`, `package.json`, `next.config.ts`, `skills-lock.json`; `git remote -v`, `git log`, `gh api orgs/EatFitFood`, `gh api repos/EatFitFood/EatFitWebApp`.
- https://platform.claude.com/docs/en/api/openai-sdk, https://platform.claude.com/docs/en/models/overview, https://platform.claude.com/docs/en/build-with-claude/vision
- https://openrouter.ai/docs/api-reference/overview, https://openrouter.ai/docs/faq, https://openrouter.ai/anthropic/claude-sonnet-5
- https://developers.openai.com/api/docs/pricing, https://developers.openai.com/api/docs/api-reference/chat/create, https://developers.openai.com/api/docs/guides/structured-outputs
- https://ai.google.dev/gemini-api/docs/openai, https://ai.google.dev/gemini-api/docs/pricing, https://console.groq.com/docs/openai, https://api-docs.deepseek.com/guides/json_mode
- https://docs.litellm.ai/docs/proxy/docker_quick_start, https://docs.litellm.ai/docs/proxy/deploy, https://docs.litellm.ai/docs/providers/anthropic
- https://fly.io/docs/about/pricing/, https://fly.io/docs/reference/configuration/, https://fly.io/docs/js/frameworks/nextjs/, https://railway.com/pricing, https://docs.railway.com/guides/nextjs, https://docs.railway.com/networking/public-networking/specs-and-limits, https://render.com/docs/free, https://render.com/docs/compute-plans
- https://vercel.com/docs/plans/hobby, https://vercel.com/docs/limits, https://vercel.com/docs/limits/fair-use-guidelines, https://vercel.com/docs/functions/configuring-functions/duration, https://vercel.com/docs/projects/transferring-projects
- https://docs.netlify.com/frameworks/next-js/overview/, https://docs.netlify.com/build/functions/configuration/, https://opennext.js.org/cloudflare, https://developers.cloudflare.com/workers/platform/limits/, https://nextjs.org/docs/app/getting-started/deploying, https://nextjs.org/docs/app/api-reference/components/font
- https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/, https://www.mongodb.com/docs/atlas/getting-started/, https://www.mongodb.com/docs/database-tools/mongodump/, https://www.mongodb.com/docs/database-tools/mongorestore/, https://www.mongodb.com/docs/atlas/import/live-import/
- https://firebase.google.com/docs/auth/web/google-signin, https://support.google.com/firebase/answer/6400741, https://firebase.google.com/docs/projects/learn-more, https://firebase.google.com/docs/auth/admin/verify-id-tokens, https://firebase.google.com/pricing, https://authjs.dev/getting-started/providers/google
- https://ai-factory.silpo.ua/docs/mcp, https://ai-factory.silpo.ua/terms
- https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository, https://docs.github.com/en/get-started/git-basics/managing-remote-repositories, https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository
- https://higgsfield.ai/terms-of-use-agreement, https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json
