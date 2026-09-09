> **Status: historical.** Implementation-ready spec of the July 2026 MVP. Sections 5.2 (three-step onboarding), 5.4 (mock order) and 6 (project structure) no longer match the code; §5.1, §5.3 and the data model in §4 are still broadly accurate (meals gained macros, per-ingredient grams and `dishId`). Current behavior: [README.md](./README.md).

# Technical Specification — AI Meal Planner (Hackathon MVP)

**Version:** 1.2 (persistence: MongoDB Atlas; supersedes 1.1 SQLite and 1.0 localStorage)
**Date:** July 10, 2026
**Source PRD:** [PRD_MealPlanner_MVP.md](./PRD_MealPlanner_MVP.md)
**Owner:** volodymyr.batsan@airslate.com

---

## 1. Purpose & Scope

This document translates the PRD into an implementation-ready specification: architecture, routes, data models, API contracts, component breakdown, business logic, and acceptance checks.

**In scope:** landing page, auth (Google + guest), 3-step onboarding, calorie calculation, AI weekly menu generation, dashboard week view, shopping list derivation, mock grocery ordering.

**Out of scope (per PRD):** real payments, real Glovo/Silpo API integration, restaurant ordering, account management (password reset, email verification), native mobile apps, nutrition accuracy beyond Harris-Benedict + LLM estimates.

---

## 2. Architecture Overview

```
┌────────────────────────── Browser ──────────────────────────┐
│  Next.js App (React, Tailwind)                               │
│  ├─ / (landing)                                              │
│  ├─ /onboarding (3 steps, client state)                      │
│  ├─ /dashboard (plan view, shopping list, order modal)       │
│  ├─ Firebase Auth SDK (Google sign-in)                       │
│  └─ httpOnly cookie `mp_uid` identifies the user/guest       │
└──────────────┬───────────────────────────────────────────────┘
               │ /api/session · /api/profile · /api/plan
               │ POST /api/generate-plan  (JSON)
┌──────────────▼───────────────────────────────────────────────┐
│  Next.js API Routes (server-side, Vercel)                    │
│  ├─ input validation (zod)                                   │
│  ├─ MongoDB driver (users, plans collections)                │
│  ├─ prompt assembly                                          │
│  ├─ LiteLLM call (OpenAI-compatible, key server-side only)   │
│  ├─ JSON schema validation of model output                   │
│  └─ single retry on malformed output                         │
└──────┬───────────────────────────────┬───────────────────────┘
       │ mongodb driver (cached client)│ OpenAI-compatible HTTP
┌──────▼──────────────┐         ┌──────▼──────┐
│  MongoDB Atlas       │         │   LiteLLM   │ → Claude / OpenAI / any
│  (free M0 cluster;   │         └─────────────┘   provider (config swap)
│  same DB for dev+prod)│
└─────────────────────┘
```

### 2.1 Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | PRD mandate; Vercel-native; API routes keep keys server-side |
| Styling | Tailwind CSS | PRD mandate; fastest path to a clean SaaS look |
| Auth | Firebase Auth (Google popup) + guest mode | PRD mandate; both resolve to a server-side user document |
| Database | **MongoDB Atlas** (free M0) via the official `mongodb` driver | Hosted → works on Vercel with no filesystem caveats; document model matches the JSON-shaped data (plan blob, profile object) |
| ODM | None (raw driver + zod) | Mongoose adds schema duplication for 2 collections; zod already validates at the boundaries |
| Identity | httpOnly `mp_uid` cookie (UUID) | Same mechanism for guests and Google users; no JWT plumbing |
| AI gateway | LiteLLM (OpenAI-compatible endpoint) | Provider swap via env config, no code changes |
| Validation | `zod` on both API input and model output | Malformed AI JSON is the #1 risk in the PRD |
| State | React context + hooks; no Redux | 3 screens of state; anything heavier is overhead |

> **Serverless connection handling:** on Vercel, the `MongoClient` must be created once per runtime and cached on `globalThis` (the standard Next.js pattern) so hot lambda invocations reuse the connection instead of exhausting Atlas's pool. This lives in `lib/db/client.ts` and is invisible to the rest of the code.
>
> **Setup prerequisite (before the hackathon clock ideally):** create the Atlas M0 cluster, a DB user, and allow-list `0.0.0.0/0` (fine for a demo), then put the connection string in `MONGODB_URI`. ~15 minutes.

### 2.2 Environment variables

| Variable | Side | Purpose |
|---|---|---|
| `LITELLM_BASE_URL` | server | LiteLLM proxy endpoint |
| `LITELLM_API_KEY` | server | Never shipped to client |
| `LITELLM_MODEL` | server | Model id (swap provider without code changes) |
| `MONGODB_URI` | server | Atlas connection string (includes credentials) |
| `MONGODB_DB` | server | Database name, default `mealplanner` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` etc. | client | Firebase web config (public by design) |

---

## 3. Routes & Navigation

| Route | Access | Purpose |
|---|---|---|
| `/` | public | Landing page |
| `/onboarding` | authed or guest | 3-step wizard (steps are client-side state, not sub-routes) |
| `/dashboard` | authed or guest, profile required | Calorie target, plan generation, week view, shopping list |
| `POST /api/session` | server | Create session: guest (`{}`) or Google (`{ idToken }`); sets `mp_uid` cookie |
| `GET /api/me` | server | Returns `{ user, profile, plan }` for the cookie's uid (single bootstrap call) |
| `PUT /api/profile` | server | Upsert profile for current uid |
| `POST /api/generate-plan` | server | AI menu generation; persists the plan |

### 3.1 Routing guards

- `/` → CTA/Login → if session exists **and** profile complete → `/dashboard`; if session exists but no profile → `/onboarding`; else auth flow → `/onboarding`.
- `/onboarding` → no session (Google or guest) → redirect `/`.
- `/dashboard` → no profile → redirect `/onboarding`.
- Guards run in a client-side `useSession()` hook fed by one `GET /api/me` call on app load (cookie → user + profile + latest plan in a single round trip). Any API route without a valid `mp_uid` cookie returns 401 and the client redirects to `/`.

---

## 4. Data Models (TypeScript)

```ts
// ── Session (server-derived; client mirror of the user doc) ──
type Session =
  | { kind: 'google'; uid: string; displayName: string; email: string }
  | { kind: 'guest'; uid: string };          // uid lives in the httpOnly cookie

// ── Profile (onboarding output) ────────────────────────────
type Goal = 'weight_loss' | 'maintenance' | 'muscle_gain';
type Sex = 'male' | 'female';
type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active';
type DietaryTag =
  | 'lactose_free' | 'vegan' | 'vegetarian'
  | 'gluten_free' | 'nut_allergy';

interface Profile {
  goal: Goal;
  age: number;            // years, 10–100
  weightKg: number;       // 30–300
  heightCm: number;       // 100–250
  sex: Sex;
  activityLevel: ActivityLevel;
  ingredients: string;    // raw free text, e.g. "chicken, buckwheat, eggs"
  dietaryTags: DietaryTag[];
  calorieTarget: number;  // derived, rounded to nearest 10 kcal
  createdAt: string;      // ISO
}

// ── Meal plan (AI output, schema-enforced) ─────────────────
interface Meal {
  name: string;
  kcal: number;
  protein_g?: number;     // grams; required in fresh AI output,
  fat_g?: number;         // absent on plans generated before macros
  carbs_g?: number;
  ingredients: string[];  // lowercase, singular-ish item names
}

interface DayPlan {
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday'
     | 'Friday' | 'Saturday' | 'Sunday';
  meals: { breakfast: Meal; lunch: Meal; dinner: Meal };
  total_kcal: number;
  total_protein_g?: number; // server-computed sums of the meals'
  total_fat_g?: number;     // macros; absent on legacy plans
  total_carbs_g?: number;
}

interface MealPlan {
  days: DayPlan[];        // exactly 7, Monday–Sunday
  generatedAt: string;    // ISO, added client-side after response
}

// ── Shopping list (derived, never persisted separately) ────
interface ShoppingItem {
  name: string;
  usedIn: string[];       // meal names, for display context
}
```

### 4.1 MongoDB collections

Two collections in the `mealplanner` database. The profile is **embedded** in the user document (1:1, always read together); plans are a separate collection (1:N, unbounded growth doesn't belong inside a document).

```ts
// users collection — _id is the mp_uid cookie value
interface UserDoc {
  _id: string;                       // UUID
  kind: 'google' | 'guest';
  firebaseUid?: string;              // absent for guests; unique index (sparse)
  email?: string;
  displayName?: string;
  profile?: Profile;                 // §4 Profile, embedded; absent until onboarding done
  createdAt: string;                 // ISO
}

// plans collection
interface PlanDoc {
  _id: ObjectId;
  userId: string;                    // → users._id
  plan: MealPlan;                    // §4 schema, validated before insert
  generatedAt: string;               // ISO
}
```

**Indexes** (created idempotently at client init in `lib/db/client.ts`):
- `users`: `{ firebaseUid: 1 }` unique + sparse (Google login lookup).
- `plans`: `{ userId: 1, generatedAt: -1 }` ("latest plan" query).

Notes:
- `PUT /api/profile` is a `$set: { profile }` on the user document. "Current plan" = `find({ userId }).sort({ generatedAt: -1 }).limit(1)`; regeneration inserts a new document, so plan history comes free.
- The `MealPlan` is stored as a zod-validated subdocument — no per-meal normalization; the app only ever reads a whole plan at once.
- No migrations or schema push step — collections and indexes are created on first use.
- `localStorage` is not used for app data; identity lives in the `mp_uid` httpOnly cookie (30-day expiry, `SameSite=Lax`).

---

## 5. Feature Specifications

### 5.0 Landing Page (`/`)

**Layout (top to bottom):**

1. **Header** — logo/wordmark left; `Login` button right. Sticky not required. Login opens the auth dialog (Google button + "Continue as guest" link).
2. **Hero** — headline (e.g. "Personalized weekly meal plans from what's already in your fridge"), one-line subheadline, primary CTA `Get started` → same auth dialog.
3. **How it works** — 3 numbered steps: *Set your goal → Add your ingredients → Get an AI menu + shopping list*.
4. **Feature highlights** — 3 cards: calorie-aware plans / uses your own food / one-tap grocery ordering.
5. Minimal footer (product name, year).

**Visual direction:** neutral background, one accent color, generous whitespace, clear typographic hierarchy. No stock imagery required; simple icons/emoji acceptable.

**Responsive:** single column below `md`; header keeps Login visible without scrolling at all widths.

**Acceptance criteria** (from PRD):
- [ ] Renders at `/` with visible header Login button.
- [ ] CTA and header Login both open the auth flow (Google or guest).
- [ ] No layout breakage at 375 px width.

---

### 5.1 Authentication

**Flows:**

1. **Google:** `signInWithPopup(GoogleAuthProvider)` → client sends the Firebase ID token to `POST /api/session { idToken }` → server verifies it with `firebase-admin`, finds-or-creates the user document by `firebaseUid`, sets the `mp_uid` cookie → route per §3.1 guard (onboarding if no profile, dashboard otherwise). Signing in with Google on a device that already has a guest cookie **upgrades** the existing user document (kind → google, firebaseUid attached) so onboarding data done as a guest is kept.
2. **Guest:** one click → `POST /api/session {}` → server inserts a `users` row (`kind: 'guest'`), sets `mp_uid` cookie → route to `/onboarding`.

**Session restoration:** on app load, `useSession()` calls `GET /api/me`; the cookie resolves to user + profile + latest plan in one round trip. Sessions persist for the cookie's 30-day lifetime. No logout requirement in MVP (a "clear session" that deletes the cookie is nice-to-have).

**Failure handling:** popup closed/blocked → non-blocking toast, stay on landing. Firebase misconfigured → Google button hidden, guest mode remains the demo-safe path (PRD cut-list item #2). **Time-pressure simplification (acceptable for demo, flagged in code):** skip `firebase-admin` verification and trust the client-sent uid/email — cuts a dependency and service-account setup at the cost of auth being spoofable, which is irrelevant for a hackathon jury demo.

**Deviation from PRD:** the PRD's "guest mode works with zero backend calls" criterion assumed localStorage. With a database, guest mode makes the same lightweight API calls as Google mode — the criterion becomes "guest mode works with zero *third-party auth* calls (no Firebase)".

**Acceptance criteria:**
- [ ] Google login returns a user and lands on onboarding (or dashboard when a profile exists).
- [ ] Guest mode works without any Firebase/third-party calls; page refresh keeps the session (cookie + DB).

---

### 5.2 Onboarding (`/onboarding`)

Single page, three steps as client state, progress indicator (`1/3 … 3/3`), Back/Next navigation. Each step validates before advancing; state lives in a wizard-level reducer and is saved via `PUT /api/profile` only on final completion.

**Step 1 — Goal.** Three large selectable cards: Weight loss / Maintenance / Muscle gain. One must be selected.

**Step 2 — Parameters.** Inputs with validation ranges:

| Field | Control | Validation |
|---|---|---|
| Age | number | integer 10–100 |
| Weight (kg) | number | 30–300 |
| Height (cm) | number | 100–250 |
| Sex | segmented (male/female) | required |
| Activity level | select of 4 | required |

**Step 3 — Ingredients & preferences.**
- Free-text textarea for fridge contents; placeholder: `chicken, buckwheat, eggs, tomatoes`. May be empty (plan then relies on the shopping list).
- Dietary tags as toggle chips: lactose-free, vegan, vegetarian, gluten-free, nut allergy. Zero or more.
- On **Finish**: compute calorie target (§5.2.1), show a confirmation panel ("Your daily target: **1 980 kcal**"), `PUT /api/profile` (server recomputes the target from raw inputs — client value is display-only), route to `/dashboard`.

#### 5.2.1 Calorie calculation (pure function, unit-tested)

```ts
// lib/calories.ts
function bmr(sex, weightKg, heightCm, age) {
  return sex === 'male'
    ? 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age
    : 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.330 * age;
}

const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };
const GOAL_ADJ = { weight_loss: 0.85, maintenance: 1.0, muscle_gain: 1.10 };

calorieTarget = round10(bmr(...) * ACTIVITY[level] * GOAL_ADJ[goal]);
```

Worked example (sanity check): male, 30 y, 80 kg, 180 cm, moderate, weight loss →
BMR = 88.362 + 1071.76 + 863.82 − 170.31 = **1853.6** → ×1.55 = 2873.1 → ×0.85 = **2442 kcal** (rounded to 2440).

**Acceptance criteria:**
- [ ] All three steps capture data and persist to the user document's embedded `profile`.
- [ ] Calorie target computed and shown before generation.
- [ ] Dietary tags reach the AI prompt (verifiable in API route payload).

---

### 5.3 Dashboard & Menu Generation (`/dashboard`) — Core

#### 5.3.1 Dashboard layout

- **Summary card:** calorie target (large), goal, age/weight/height/activity, dietary tags as chips. Link "Edit" → `/onboarding` (pre-filled from profile).
- **Primary CTA:** `Generate weekly menu` (label switches to `Regenerate` when a plan already exists).
- **Plan area:** the latest plan (from `GET /api/me`) renders immediately on load if one exists; otherwise an empty state prompting generation.
- **Loading state:** button disabled + skeleton week grid + rotating status line ("Composing your week…"). Expected latency 5–30 s.

#### 5.3.2 API contract — `POST /api/generate-plan`

**Request:** empty body. The server resolves the `mp_uid` cookie and loads the embedded profile (calorie target, ingredients, tags, goal) from the user document — the client can't send stale or tampered generation inputs.

**Response 200:** `MealPlan` JSON exactly per §4 schema (already persisted to `plans`).
**Response 401:** no/unknown session cookie.
**Response 409:** `{ "error": "no_profile" }` — onboarding not completed.
**Response 422:** `{ "error": "generation_failed" }` — model produced invalid JSON twice.
**Response 502:** `{ "error": "upstream_error" }` — LiteLLM/provider failure.

#### 5.3.3 Server-side generation logic

1. Resolve session cookie → load profile from DB (401/409 per above).
2. Assemble prompt (system + user):

   > **System:** You are a nutritionist. Respond with JSON only — no markdown, no commentary.
   >
   > **User:** Create a 7-day meal plan (Monday–Sunday), 3 meals per day (breakfast, lunch, dinner), targeting **{calorieTarget} kcal/day** (each day within ±10%). Use mostly these ingredients the user already has: **{ingredients}** (fill gaps with common groceries). Strictly respect these dietary restrictions: **{tags}**. Goal: {goal}. Each meal needs: name, kcal, ingredients array (lowercase item names). Each day needs total_kcal = sum of its meals. Return JSON matching exactly: `{"days":[{"day":"Monday","meals":{"breakfast":{"name":"","kcal":0,"ingredients":[""]},"lunch":{...},"dinner":{...}},"total_kcal":0}, ...]}`

3. Call LiteLLM (`temperature: 0.7`, `response_format: { type: 'json_object' }` when the provider supports it, 60 s timeout).
4. Parse & validate against the zod `MealPlan` schema. Also strip a ```json fence if present before parsing.
5. **On validation failure: retry once** with an appended corrective instruction ("Your previous response was invalid JSON: {issue}. Return only valid JSON."). Second failure → 422.
6. Normalize: recompute `total_kcal` server-side from meal kcals (don't trust model arithmetic); lowercase/trim all ingredient names.
7. Insert the validated plan into `plans` (`generatedAt` = server time) and return it.

#### 5.3.4 Client behavior

- 200 → render week view (no client-side persistence needed; refresh re-reads from DB via `/api/me`).
- 422/502/network → keep previous plan (if any), show error banner with a `Try again` button. Never crash.

#### 5.3.5 Week view rendering

- 7 day cards, Monday–Sunday: responsive grid (1 col mobile → 2 col tablet → 3–4 col desktop) or horizontal scroll — implementer's choice, must not break on mobile.
- Each card: day name, daily total kcal (highlighted; subtle warning tint if outside target ±10%), three meal rows — meal type label, dish name, kcal.
- Meal ingredients on expand/hover (nice-to-have; not required for acceptance).

**Acceptance criteria:**
- [ ] Generate returns a valid 7-day plan and renders without crashing.
- [ ] Every dish shows kcal; daily totals shown and near target.
- [ ] Malformed AI JSON handled gracefully (one retry, then fallback message; UI stays usable).

---

### 5.4 Shopping List & Grocery Order (dashboard section) — Smart Mock

#### 5.4.1 Shopping list derivation (pure function, unit-tested)

```
needToBuy = unique(all plan ingredients) − ownedIngredients
```

Matching rules (`lib/shopping.ts`):
1. Normalize both sides: lowercase, trim, strip trailing punctuation.
2. Owned set = profile `ingredients` split on `,` / `;` / newlines.
3. An ingredient is **owned** if, after normalization, either string contains the other (`"chicken"` owns `"chicken breast"`, `"tomatoes"` owns `"tomato"` via naive singular/plural check: compare with trailing `s`/`es` stripped).
4. Output sorted alphabetically, each item with `usedIn` meal names (capped display at 3).

This is intentionally naive — good enough for the demo; no NLP.

#### 5.4.2 UI

- "Shopping list" panel below (or beside) the week view, visible once a plan exists.
- Items rendered as a checklist (checkboxes are cosmetic — no persistence needed).
- Empty case: "You already have everything you need 🎉".
- Button: **`Order basket in Silpo/Glovo`**.

#### 5.4.3 Order flow (mock)

On click, open a polished modal:
1. Brief simulated progress (~1.5 s spinner, "Sending your basket…").
2. Success state: check icon, "Your order has been sent for delivery", item count, fake ETA ("Delivery in 60–90 min"), Close button.
3. Optional (cut first under time pressure, per PRD cut-list #1): secondary link "Open in Glovo" → `https://glovoapp.com/ua/uk/search?q={encodeURIComponent(firstItem)}` in a new tab.

No network calls. No state changes beyond the modal.

**Acceptance criteria:**
- [ ] Shopping list excludes already-owned ingredients (per §5.4.1 rules).
- [ ] Order button shows the success modal (and/or opens the correct Glovo search URL).

---

## 6. Project Structure

```
app/
  layout.tsx                 # fonts, Tailwind, providers
  page.tsx                   # 5.0 landing
  onboarding/page.tsx        # 5.2 wizard shell
  dashboard/page.tsx         # 5.3 + 5.4
  api/session/route.ts       # POST — guest/Google session, sets cookie
  api/me/route.ts            # GET — user + profile + latest plan
  api/profile/route.ts       # PUT — upsert profile
  api/generate-plan/route.ts # 5.3.2–5.3.3
components/
  landing/{Header,Hero,HowItWorks,Features}.tsx
  auth/AuthDialog.tsx        # Google + guest
  onboarding/{StepGoal,StepParams,StepIngredients,Progress}.tsx
  dashboard/{SummaryCard,WeekView,DayCard,ShoppingList,OrderModal}.tsx
  ui/{Button,Card,Chip,Modal,Skeleton,Toast}.tsx
lib/
  calories.ts                # §5.2.1 — pure, tested
  shopping.ts                # §5.4.1 — pure, tested
  db/
    client.ts                # cached MongoClient (globalThis pattern) + index setup
    queries.ts               # findOrCreateUser, upsertProfile, latestPlan, insertPlan
  session.ts                 # cookie read/write, uid resolution (server-only)
  schemas.ts                 # zod: Profile, MealPlan, API bodies
  firebase.ts                # client SDK init
  llm.ts                     # server-only LiteLLM client
hooks/
  useSession.ts              # /api/me bootstrap, exposes user/profile/plan
  usePlan.ts                 # generation call + error states
```

---

## 7. Error Handling Matrix

| Failure | Detection | User experience |
|---|---|---|
| Google popup blocked/closed | Firebase error code | Toast; guest mode still available |
| Firebase not configured | init throws | Google button hidden; guest-only |
| Invalid onboarding input | zod / field validation | Inline field errors; Next disabled |
| AI malformed JSON | zod on server | 1 silent retry → 422 → banner + "Try again"; old plan kept |
| LiteLLM down / timeout | fetch error / 60 s timeout | 502 → banner + "Try again" |
| Missing/unknown `mp_uid` cookie | session lookup miss | API returns 401; client redirects to `/` |
| Cookie present but user document gone (wiped DB) | `users` lookup miss | Treated as no session: cookie cleared, redirect `/` |
| Atlas unreachable / connection timeout | driver throws | 500 + banner + "Try again"; 5 s `serverSelectionTimeoutMS` so it fails fast |
| No plan, direct visit to shopping list | plan == null | Section hidden until plan exists |

---

## 8. Non-Functional Requirements

- **Performance:** landing is static (no client JS needed above the fold beyond the auth dialog); generation latency masked by skeleton + status text.
- **Security:** LiteLLM key exists only in server env; API routes reject wrong methods and oversized bodies (>10 KB); `mp_uid` cookie is httpOnly + `SameSite=Lax`; every DB query is scoped to the cookie's uid so users can't read each other's data; no user data leaves the server except the generation payload to LiteLLM.
- **Data:** MongoDB Atlas M0 (free tier) — hosted, so dev and the deployed demo share one database; no backup story needed for MVP. `MONGODB_URI` contains credentials and stays server-side only.
- **Responsiveness:** all pages usable at 375 px; week view degrades to single-column.
- **Accessibility (lightweight):** semantic headings, focusable controls, visible focus rings, modal closes on Esc. No full audit for MVP.
- **Testing (time-boxed):** unit tests only for the two pure modules — `calories.ts` (formula + worked example above) and `shopping.ts` (subtraction/matching rules). Everything else verified manually via the demo script (§9).

---

## 9. Demo Script (jury happy path)

1. Open `/` → point out header Login + hero CTA.
2. Click CTA → "Continue as guest".
3. Onboarding: Muscle gain → 30 y / 80 kg / 180 cm / male / moderate → ingredients "chicken, buckwheat, eggs, tomatoes" + gluten-free tag → show computed target.
4. Dashboard → Generate → skeleton → 7-day plan with kcal per dish and per day.
5. Scroll to shopping list → note owned items are absent.
6. Order basket → success modal (→ optional Glovo redirect).
7. Refresh the page → session (cookie), profile, and plan all persist from MongoDB; optionally open the same URL in a second browser to show sessions are isolated.

---

## 10. Build Order (maps to PRD time-boxes)

| # | Task | Depends on | Budget |
|---|---|---|---|
| 0 | Pre-work (before the clock if allowed): Atlas M0 cluster + DB user + `MONGODB_URI` | — | 0.25 h |
| 1 | Scaffold: Next.js + Tailwind + Mongo client/queries (`lib/db/*`) + `schemas.ts` + ui primitives | 0 | 0.5 h |
| 2 | Session plumbing: `/api/session`, `/api/me`, cookie helpers (guest path only) | 1 | 0.5 h |
| 3 | Landing page (5.0) | 1 | 0.5–1 h |
| 4 | Google sign-in on top of session plumbing (5.1) | 2 | 0.5 h |
| 5 | Onboarding wizard + `calories.ts` + `/api/profile` (5.2) | 2 | 1–1.5 h |
| 6 | `/api/generate-plan`: LiteLLM + validation/retry + persist (5.3.2–3) | 2 | 1 h |
| 7 | Dashboard + week view + loading/error states (5.3) | 5, 6 | 1.5 h |
| 8 | `shopping.ts` + list UI + order modal (5.4) | 7 | 1.5 h |
| 9 | Polish pass + demo dry-run + Vercel deploy (same Atlas DB as dev) | all | remaining |

Total is ~0.5–0.75 h over the PRD's localStorage-based budget — the DB adds Atlas setup and session-plumbing time. The overrun is absorbed by the PRD's cut list, and the Atlas setup can happen before the clock starts.

**Cut order under time pressure (per PRD, extended):** Glovo redirect → Google sign-in (guest-only demo) → firebase-admin token verification (trust client uid).
