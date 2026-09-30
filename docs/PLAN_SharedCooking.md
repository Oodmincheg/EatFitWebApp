# Shared cooking plan

## Agreed scope

One shared menu for two people, using the same food. Separate diners, individual
preferences and alternative dishes per person are outside this version. The regular
repertoire contains dishes both people want to eat. Experimental dishes are explicit
choices for particular meals and become regular only after the user chooses to keep them.

This scope supersedes the earlier individual-choice proposal from the meal journal. Implemented on `feature/shared-cooking-plan`. Release checks are recorded below.

## Core distinction

A recipe describes ingredients for a stated yield. A cooking batch describes preparing
that recipe once. A planned meal assigns portions from that batch to a date and slot.
Identical recipe names do not prove that two meals use the same batch.

Example: cook four portions on Monday evening, assign two to Monday dinner and two to
Tuesday lunch. Both meals reference the same batch. Tuesday requires reheating, and
shopping counts the ingredients for four portions once.

The initial plan covers whole dishes. Recombining independently tracked sides, mains,
freezer stock and leftovers from previous plans is deferred. Shared meals use two
portions by default, without modeling each person's intake.

## Implementation sequence and verification

### 1. Recipes with explicit yield and optional nutrition

Implemented in `lib/schemas.ts`, `components/dashboard/DishForm.tsx`,
`app/dashboard/dishes/page.tsx`, the dishes API routes, `hooks/useDishes.ts` and
`lib/db/queries.ts` together.

- Add recipe yield, optional elapsed cooking time, optional attention level and a
  regular/experimental classification. Do not infer classification from missing data.
- Ingredients describe the whole recipe at its stated yield. When nutrition is known,
  it also describes that yield; per-portion numbers are derived.
- Represent unknown nutrition as absent. The existing form converts blank numeric
  fields to zero, so making schema fields optional alone will not fix the distinction.
- Allow creating a named recipe before all ingredient amounts are known. Such recipes
  cannot produce a complete quantified shopping list; expose the missing information.

Verify saving without nutrition, explicit zero versus unknown, scaling recipe yields,
classification changes and reading existing dishes without changing stored quantities.

### 2. Planned cooking batches and portion assignments

Define zod schemas in `lib/schemas.ts` and pure operations in a new
`lib/cookingPlan.ts` with sibling tests. Keep batches inside the plan initially.

Proposed data:

- Batch: id, recipe snapshot, scheduled cooking date and slot, portion yield.
- Meal assignment: date, slot, batch id and portions to serve, normally two.
- Recipe snapshots preserve the planned ingredients and yield if a library recipe changes.

Operations create a batch, assign portions, move a meal, change a batch yield and
remove an assignment. Validate all references, chronology and total assigned portions.
Deleting cooking that still feeds another meal must require resolving the dependent
assignment. Planned leftovers remain a schedule, not proof of actual food in stock.

Verify four portions assigned as two plus two, rejection of a third two-portion meal,
rejection of eating before cooking, recipe edits preserving snapshots and changes to
one batch leaving unrelated batches intact.

### 3. Manual planning and persistence

Add a validated plan mutation route and a client hook, using the existing session
pattern to return and adopt the full updated plan. The new `CookingPlanner` and `CookingWeekView` components own the shared flow. Legacy
`WeekView` and `DayCard` continue displaying the previous plan format.

- Offer choosing a saved dish and how much to cook.
- Offer assigning portions from an earlier planned batch to a later meal.
- Show cooking versus reheating and the batch's unassigned portions.
- Make experimental meals visible and offer keeping their recipe in the regular list.
- Allow leaving a meal unplanned or marking it away from home without buying food for it.

Weekly pins remain recipe preferences. Repeating a pin must not silently reuse last
week's batch. Shared weekly pin settings affect newly created plans only. Current meal changes use
the validated cooking operations, so dependent meals cannot lose their food source.
Only configured regular recipes seed a new plan; each occurrence creates its own batch.

Verify a manual plan can be created before any AI generation, survives reload, can be
edited after a generation failure, and cannot leave dangling batch references.

### 4. Shopping from batches

Project batches through `cookingShoppingSource` and reuse `lib/shopping.ts` and
`components/dashboard/ShoppingList.tsx`. Expand each
planned batch once, scaling recipe ingredients by batch yield divided by recipe yield.
Then reuse existing aggregation, pantry subtraction and Silpo matching.

Do not also sum the ingredients of meals referencing the batch. Do not treat two
separately cooked batches of one recipe as a single purchase requirement.

Verify one four-portion batch used in two meals counts once, two separate batches
count twice, changing yield rescales quantities, and pantry stock is subtracted once.
Recipes without quantified ingredients must keep the shopping list visibly incomplete.

### 5. Optional nutrition throughout the application

The new session field, today view, history and shared meal cards use the version 2
schema. Legacy progress and stream schemas remain unchanged. A missing value must not display as zero or
produce a complete-looking daily total. Any displayed nutrition for the new plan is
per portion, clearly labeled; household batch totals must not be compared with the
existing personal calorie target.

Verify missing and partial nutrition, per-portion scaling and reading historical plans.
This is a dependency of releasing the new planner, even if optional nutrition is first
introduced in the recipe form.

### 6. AI planning after the manual flow works

Use `generateSharedCookingPlan` in `lib/llm.ts`, `/api/cooking-plan/generate` and
`hooks/useCookingPlan.ts` for the new flow. Legacy generation retains its own routes. The model should propose a plan rather than own
portion balances or shopping arithmetic.

- Use saved regular dishes as the base and give pantry items a preference.
- Include experimental dishes only when requested, without automatic promotion.
- Permit planned repeats and reuse; remove the blanket prohibition on repeated meals.
- Do not force the shared cooking plan to hit one person's calorie target or repair it
  solely for missing that target.
- Validate batch references and quantities before exposing a plan as usable. Return
  the entire validated shared plan atomically. The legacy NDJSON stream is unchanged.
- Define replacement behavior for a meal whose batch supplies other meals. A one-meal
  replacement must not silently change tomorrow's lunch.

Verify schema failures, repeat handling, experimental selection, preservation of
unchanged assignments and safe regeneration of shared batches.

## Compatibility and release checks

Use an explicit new plan version with separate schemas and a compatibility reader.
Historical plans do not identify household yield or batch links, so do not double their
ingredients or infer shared batches from matching names. Preserve their current display
and shopping behavior. Existing recipe yields require an explicit interpretation before
scaling; never silently reinterpret old numbers as quantities for two people.

Deliver steps 1 through 5 as one usable manual planning flow before AI integration.
They are not independent releases if intermediate changes break existing generation or
nutrition consumers. Include Ukrainian and English copy and the repository's typecheck,
lint, test and build checks for each releasable change.


## Implemented storage and compatibility

`cooking_plans` stores version 2 documents independently from legacy `plans`.
`cookingPlan` in the session selects the new today and shopping views. Before a shared
plan exists, the old planner is available in a collapsed section. History displays both
formats without inferring yields for old data.

Plan mutations require an id and revision. MongoDB updates compare the revision to
reject concurrent changes. Recipe snapshots omit undefined BSON fields, preserving
unknown nutrition through a database round trip. Recipe edits affect future batches;
to apply them to an existing plan, replace its cooking assignment after resolving any
dependent meals.

The generator fills empty slots using saved recipes. Experimental recipes must already
exist in My dishes and be selected for that generation. It does not invent new recipes.
One corrective call is allowed after a schema or portion-allocation failure. No partial
model result replaces the saved manual plan. Shared generation has no calorie-target
repair step.

## Release verification

Pure tests cover portion allocation, chronology, dependent meals, batch scaling, pantry
subtraction, immutable snapshots, unknown nutrition, model validation/retry and card
rendering. The local integration check uses a disposable MongoDB and the production
Next.js build, with external model credentials disabled. It checks authentication,
optional-field persistence, recurring pins, revisions, generation failure and manual
recovery. Production data and the Silpo cart are not part of these checks.

Verification results on 2026-09-28:

- `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` passed.
- Vitest: 110 tests across 14 files.
- Disposable MongoDB integration passed, including clearing optional nutrition and
  reloading batches with missing calories. The temporary database and server were stopped.
- Live model generation was not called. Tests substitute model responses and verify
  retry, failure and preservation of the current plan.
- Interactive browser verification remains unconfirmed. Chrome AXI returned invalid
  `pageId` errors; the fallback CUA browser surface was unavailable. Card rendering is
  covered by server-rendered component tests, not a visual browser check.

## Preview deployment on 2026-09-30

[Open Preview](https://eat-fit-web-qsnxkttc1-vlads-projects-e8162fd5.vercel.app)
· [Vercel deployment](https://vercel.com/vlads-projects-e8162fd5/eat-fit-web-app/DZhSMSBVTteJrW6ktEBvft5hneew)

Deployed the local `feature/shared-cooking-plan` source snapshot through Vercel CLI.
No Git commit or production promotion was performed. The upload included application
source, public assets, scripts and build configuration; local credentials and the meal
journal were excluded.

Source manifest SHA-256:
`c62ab63ffc2af52931195ad9f014841ec56e3fd9bdabdcf65ee965b842b56a2e`.

The existing `LITELLM_API_KEY` secret now targets Preview as well as Production.
Other Preview environment settings were retained. Vercel CLI generated an automation
protection bypass token for authenticated HTTP checks; interactive access remains
protected by Vercel authentication.

Vercel reports Ready. The landing page returned HTTP 200 with the EatFit title. The
new cooking-plan API returned the expected HTTP 401 without a session. A read using a
nonexistent test session also returned HTTP 401 after the database lookup, confirming
MongoDB connectivity without creating application data. Live model generation and
interactive browser flows were not exercised during this deployment.

## Production deployment on 2026-09-30

At the owner's request, deployed the same source snapshot to Production so sign-in
uses the Firebase-authorized [main domain](https://eat-fit-web-app.vercel.app).
[Production deployment](https://vercel.com/vlads-projects-e8162fd5/eat-fit-web-app/FTeDBHjt8SFkAgUboxhNA1v8kSiy).

Vercel reports Ready and confirms `eat-fit-web-app.vercel.app` points to this deployment.
The public landing page returned HTTP 200. The cooking-plan API returned the expected
HTTP 401 without a session. A nonexistent test session returned HTTP 401 after a
MongoDB lookup. These checks used the public domain without a protection bypass.
Firebase interactive sign-in and live model generation remain for user testing.
Git remains on `feature/shared-cooking-plan`; no merge or commit was performed.
