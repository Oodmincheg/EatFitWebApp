# Keep recurring pins editable

The meal dialog in the reported screenshot has a pinned badge but no actions.
`WeekView` removes meal actions for past dates, while the plan page hides
`WeekTemplate` whenever a plan exists. Recurring pins can therefore become
inaccessible after their dates pass.

1. Reproduce the missing template access by rendering the plan page with an expired
   plan and a generation error. Verify that a user can still reach the pin editor.
2. Keep the weekly pin editor available with an existing plan, explain its scope,
   and link to it from past meal dialogs. Show calendar dates on plan cards.
   Verify both expired and current plans, plus the state before the first plan.
3. Run typecheck, lint, tests and build. Preserve past meals when recurring pins
   change; the existing pins API already enforces this boundary.

## Result

Implemented locally. The regression failed before the change because an expired plan
hid the weekly pin editor. It now passes, alongside cases for today, future dates,
no plan and generation in progress. Typecheck, lint, all 92 tests and the production
build pass. No deployment was made.
