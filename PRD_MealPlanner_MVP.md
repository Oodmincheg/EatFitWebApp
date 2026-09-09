> **Status: historical.** The July 2026 hackathon MVP as designed. The shipped app differs: onboarding is two steps (fridge list and dietary tags moved into the generate dialog), grocery ordering is a real Silpo cart through the official MCP rather than a mock, the UI is Ukrainian-first with an English toggle, and users can pin their own dishes into the week. Current behavior: [README.md](./README.md); reasons: [docs/DECISIONS.md](./docs/DECISIONS.md).

# PRD — AI Meal Planner (Hackathon MVP)

**Version:** 1.0
**Date:** July 10, 2026
**Type:** Hackathon MVP (build target ~6.5–7 hours)
**Owner:** volodymyr.batsan@airslate.com

---

## 1. Overview

A web app that generates a personalized weekly meal plan based on the user's goal, body parameters, and the food they already have. It calculates a daily calorie target, calls an AI model to produce a 7-day menu, builds a shopping list of missing items, and simulates ordering groceries (Silpo/Glovo) or restaurant meals.

**Problem:** Deciding what to eat every day is tedious. Users want a fast, personalized plan and a low-friction path to actually getting the food.

**Solution:** A 3-screen onboarding + dashboard that offloads meal-selection logic to an LLM and mocks the ordering flow for a convincing demo.

**Primary demo audience:** Hackathon jury — prioritize a polished, working happy-path over real integrations.

---

## 2. Goals & Non-Goals

**Goals**
- Get a user from landing to a generated weekly plan in under 2 minutes.
- Produce a realistic, calorie-aware menu from the user's own ingredients.
- Show a credible "order groceries / order from restaurant" flow.

**Non-Goals (out of scope for MVP)**
- Real payments or real Glovo/Silpo/UberEats API integration.
- Restaurant meal ordering (deferred to post-MVP).
- Complex account management, password reset, email verification.
- Nutrition accuracy beyond Harris-Benedict + LLM estimates.
- Mobile native apps (web only).

---

## 3. Target Timeline (Time-boxed)

| # | Module | Budget |
|---|--------|--------|
| 0 | Landing Page | 0.5–1.0 h |
| 1 | Authentication | 1.0 h |
| 2 | Onboarding | 1.0–1.5 h |
| 3 | Dashboard + Menu Generation | 2.5 h |
| 4 | Cart / Grocery Order Flow | 1.5 h |
| — | **Total** | **~6.5–7.5 h** |

---

## 4. Tech Stack

- **Frontend:** Next.js (App Router) + Tailwind for fast, clean UI.
- **Auth:** Firebase Auth (Google sign-in) with a "Continue as guest" fallback storing everything in `localStorage`.
- **State/Storage:** `localStorage` for guest data and cached plans.
- **AI:** LiteLLM as the model gateway, called via a Next.js API route / server action to generate the menu (JSON output). LiteLLM gives a single OpenAI-compatible interface and lets us swap the underlying model (Claude, OpenAI, etc.) without changing app code.
- **Hosting:** Vercel (Next.js native deployment).

---

## 5. Features

### 5.0 Landing Page (0.5–1 h)

The main screen (`/`) is a creative landing page that sells the product in one glance and routes users into the app.

**Requirements**
- **Header** with logo/product name on the left and a **Login button** on the right (opens Google sign-in; also exposes "Continue as guest").
- **Hero section:** bold headline + subheadline explaining the value ("Personalized weekly meal plans from what's already in your fridge"), and a primary CTA ("Get started" / "Generate my plan") that leads into auth → onboarding.
- **How it works:** 3 short steps (Set your goal → Add your ingredients → Get an AI menu + shopping list).
- **Feature highlights:** calorie-aware plans, uses your own food, one-tap grocery/restaurant ordering.
- Responsive; clean & modern style — minimal, generous whitespace, sleek SaaS look.

**Visual direction:** Clean & modern. Neutral background, one accent color, clear typographic hierarchy, subtle sections. No clutter.

**User stories**
- As a visitor, I immediately understand what the app does and how to start.
- As a returning user, I can log in from the header without scrolling.

**Acceptance criteria**
- Landing renders at `/` with a header containing a visible Login button.
- Primary CTA and the header Login both lead into the auth flow (Google or guest).
- Layout is responsive and doesn't break on mobile widths.

---

### 5.1 Authentication (1 h)

Keep it minimal — the only job is to let the user into the app.

**Requirements**
- Google sign-in via Firebase.
- "Continue as guest" button — no account; all data saved to `localStorage`.
- On success, route to onboarding (or dashboard if profile already exists).

**User stories**
- As a new user, I can sign in with Google in one click.
- As a user who doesn't want to sign in, I can continue as a guest and still use everything.

**Acceptance criteria**
- Google login returns a user and lands on onboarding.
- Guest mode works with zero backend calls; refreshing the page keeps the session.

---

### 5.2 Onboarding (1–1.5 h)

Minimum screens needed to generate a plan. Three steps, progress indicator, all inputs persisted.

**Screen 1 — Goal:** Weight loss / Maintenance / Muscle gain.

**Screen 2 — Parameters:** Age, weight (kg), height (cm), sex, activity level. Used to compute the daily calorie target.

**Screen 3 — Ingredients & Preferences:**
- Free-text field for what's in the fridge (e.g., "chicken, buckwheat, eggs, tomatoes").
- Dietary tags: lactose-free, vegan, vegetarian, gluten-free, nut allergy, etc.

**Calorie calculation — Harris-Benedict (revised):**

BMR (male) = 88.362 + (13.397 × weight kg) + (4.799 × height cm) − (5.677 × age)
BMR (female) = 447.593 + (9.247 × weight kg) + (3.098 × height cm) − (4.330 × age)

TDEE = BMR × activity factor (Sedentary 1.2 · Light 1.375 · Moderate 1.55 · Active 1.725).

Adjust by goal: Weight loss −15%, Maintenance 0%, Muscle gain +10%.

**Acceptance criteria**
- All three screens capture data and persist it (localStorage or user profile).
- A daily calorie target is computed and shown before generation.
- Dietary tags flow into the AI prompt.

---

### 5.3 Dashboard & Menu Generation (2.5 h) — Core

**Dashboard**
- Shows the daily calorie target prominently.
- Shows the user's goal and key params.
- Primary CTA: **"Generate weekly menu"**.
- Loading state while the AI responds.

**Generation logic**
- On click, the client hits a Next.js API route that forwards the prompt to LiteLLM, e.g.:

  > "Create a 7-day meal plan at {calories} kcal/day using mostly these ingredients: {ingredients}. Respect these dietary restrictions: {tags}. Return JSON only."

- **Enforce a strict JSON schema** so the UI can render reliably:

```json
{
  "days": [
    {
      "day": "Monday",
      "meals": {
        "breakfast": { "name": "...", "kcal": 450, "protein_g": 30, "fat_g": 15, "carbs_g": 45, "ingredients": ["..."] },
        "lunch":     { "name": "...", "kcal": 700, "protein_g": 45, "fat_g": 25, "carbs_g": 65, "ingredients": ["..."] },
        "dinner":    { "name": "...", "kcal": 600, "protein_g": 40, "fat_g": 20, "carbs_g": 55, "ingredients": ["..."] }
      },
      "total_kcal": 1750
    }
  ]
}
```

**Display**
- Week view Monday–Sunday.
- Each day split into Breakfast / Lunch / Dinner with kcal next to each dish.
- Daily total kcal shown per day.

**Acceptance criteria**
- Clicking generate returns a valid 7-day plan and renders without crashing.
- Each dish shows a calorie value; daily totals are near the target.
- Invalid/malformed AI JSON is handled gracefully (retry or fallback message).

---

### 5.4 Cart / Grocery Order Flow (1.5 h) — Smart Mock

Real delivery APIs are closed/complex, so this is a convincing simulation for the jury. Scope for MVP: **grocery ordering only** (restaurant ordering is out of scope).

**Shopping list**
- App parses the generated menu, subtracts ingredients the user already has, and produces a "need to buy" list.

**Order groceries (delivery)**
- "Order basket in Silpo/Glovo" button next to the list.
- On click, either:
  - Show a polished modal: "Your order has been sent for delivery" (enough for MVP), **or**
  - Redirect to a real service search, e.g. `https://glovoapp.com/ua/uk/search?q=chicken+fillet`.

**Acceptance criteria**
- Shopping list correctly excludes already-owned ingredients.
- Grocery order shows the success modal or opens the correct search URL.

---

## 6. Primary User Flow

1. Landing page (`/`) → click header Login or hero CTA → sign in with Google **or** continue as guest.
2. Onboarding: goal → parameters → ingredients/preferences.
3. See daily calorie target on the dashboard.
4. Generate weekly menu (AI) → view 7-day plan.
5. Open shopping list → order groceries (mock/redirect).

---

## 7. Demo Success Criteria (for jury)

- Full happy path works end-to-end without errors.
- Generated menu looks realistic and respects calories + dietary tags.
- Shopping list is clearly derived from the plan minus owned items.
- Ordering flows feel real (clean modals / correct redirects).

---

## 8. Risks & Mitigations

- **AI returns malformed JSON** → enforce schema in prompt, validate, retry once, show fallback.
- **Slow AI response** → clear loading state; consider caching the last plan in localStorage.
- **API key exposure** → keys stay server-side in the Next.js API route / LiteLLM config, never shipped to the client.
- **Model provider outage/limits** → LiteLLM lets us switch the underlying model via config with no code changes.
- **Time overrun** → order flow is fully mockable; cut the redirect/restaurant path first if needed.

---

## 9. Cut-if-Needed (priority order to drop under time pressure)

1. Real Glovo redirect (keep only the success modal).
2. Google sign-in (keep guest mode only).
