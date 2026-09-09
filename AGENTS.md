# AGENTS.md

Working rules for anyone, human or agent, changing this repo. README.md explains what the
app is; docs/DECISIONS.md explains why. Read both before a non-trivial change.

## Commands

```bash
npm run dev          # local server, reloads .env.local on save
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # vitest (pure modules only)
npm run build        # must pass before a push; needs no env
npm run silpo:tools  # authenticated tools/list dump → docs/silpo-tools.json
npm run silpo:probe  # read-only MCP probes with the local token
```

Before pushing: typecheck, lint, test, build, all four green.

## Branches and deploys

- `main` auto-deploys to production on Vercel (`eat-fit-web-app`). Do not push to `main`;
  branch, push the branch, and let the owner merge and deploy.
- Vercel CLI is linked in this folder (`.vercel/`, gitignored). `vercel env add` for
  `NEXT_PUBLIC_*` needs `--type config`; those values are inlined at build time, so
  redeploy after changing them. `vercel link` edits `.env.local` and `.gitignore`;
  revert the `.env*` line it appends.
- Commit messages: imperative subject, body says what changed and the constraint behind
  it. No time or effort estimates anywhere in docs or messages.

## Code conventions

- TypeScript strict. zod at every boundary: request bodies, model output, MCP tool
  results. Types come from `z.infer`, not hand-written twins.
- Modules with server I/O, credentials or request cookies start with `import 'server-only'`.
  Keep shared pure helpers and schemas browser-safe: `lib/silpo/quantity.ts`,
  `lib/silpo/review.ts`, `lib/silpo/tools.ts`. Tests of server-only modules mock the marker:
  `vi.mock('server-only', () => ({}))`.
- API routes follow one shape: `getUid()` → 401 `no_session`; `readJsonBody()` →
  400/413; `Schema.safeParse` → 400 with `issues`; then try/catch mapping domain errors
  to snake_case codes. Add new codes to that vocabulary, do not invent HTTP-only signals.
- Client data flows through hooks (`hooks/use*.ts`); components never `fetch` directly.
  `useSession` holds user, profile, plan, pins; anything that changes the plan on the
  server returns the new plan and the hook pushes it into the session.
- Comments state a constraint the code cannot show, nothing else. No narration of what
  the next line does, no change history.
- Pure logic lives in `lib/` with a sibling `*.test.ts` (`calories`, `shopping`, `pins`,
  `silpo/match`, `llm.normalizePlan`). Anything with I/O is thin and untested by design.

## i18n

- Every user-visible string goes through `useI18n()` → `t`. No hardcoded UI text.
- `lib/i18n/uk.ts` is the source of truth and defines the type; `en.ts` must mirror it
  key for key or typecheck fails. Parameterized and plural strings are functions
  (`pluralUk` for Ukrainian forms).
- Data keys stay English: `DayName` (`Monday`…), `MealSlot`, dietary tags, goals. Only
  labels are translated (`t.days[name].label / .short / .acc`).
- Dates and numbers format with `t.intl` (`uk-UA` / `en-US`).

## LLM

- `lib/llm.ts` talks to any OpenAI-compatible `/chat/completions`. Send
  `response_format: { type: 'json_object' }`, never `temperature` (reasoning models
  reject it). Parse with zod, retry once with the validation issue, then 422.
- Menus are written in the UI locale; JSON keys and `day` values stay English because
  the schema depends on them. Pinned slots are passed as fixed context and excluded from
  the requested output; a fully pinned day or week skips the model.
- Server-side totals are recomputed; never trust model arithmetic or ordering.

## Silpo MCP

- Official server only: `https://mcp.silpo.ua/mcp` (hackathon rules forbid unofficial
  APIs). Facts, schemas and probe results: RESEARCH_SilpoMCP.md §11, docs/silpo-tools.json.
- Read tools are safe to call in development. Never call write tools
  (`silpo_add_or_update_cart_products`, `silpo_update_shopping_cart`,
  `silpo_clear_shopping_cart`, `silpo_remove_cart_products`, `silpo_create_shopping_cart`,
  favorites, certificates) against a real account without an explicit human OK.
- Known server behaviors: an expired cart timeslot makes searches return zero products
  silently (resolve a live slot first); `silpo_get_time_slots` 400s when `start` is
  passed; tool errors arrive as `isError` plus plain text; weighted goods price per kg
  with `step` in kg, piece goods per pack with `displayRatio`.
- Tokens: local dev in `.silpo-oauth.local.json` (gitignored), users in the
  `silpo_oauth` collection. `.silpo-probe.local.json` holds personal cart data; delete
  after use.

## Environment and secrets

- `.env.local` from `.env.local.example`; never commit it. The `LITELLM_` prefix is
  historical, any OpenAI-compatible endpoint works (production: OpenRouter).
- `.npmrc` pins `registry.npmjs.org`. If `package-lock.json` ever contains
  `artifactory.infrateam`, rewrite those `resolved` URLs to npmjs before pushing;
  Vercel cannot fetch from the private registry.
- MongoDB Atlas M0 pauses after inactivity and its SRV records disappear
  (`querySrv ENOTFOUND`). Resume in the console before assuming the cluster is gone.

## Communication

- The owner writes Ukrainian or English; answer in the language of the message.
- UI copy is Ukrainian-first; English is the secondary locale.
