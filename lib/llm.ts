import 'server-only';
import { z } from 'zod';
import {
  DAY_NAMES,
  DEFAULT_MEAL_SLOTS,
  DishEstimateSchema,
  MealSlotSchema,
  ModelMealSchema,
  daySlots,
  type DayName,
  type DayPlan,
  type DishEstimate,
  type Meal,
  type MealPlan,
  type MealSlot,
  type ModelMeal,
  type Profile,
} from './schemas';
import { parseDateKey, weekdayName } from './dates';
import { scanArrayObjects } from './streamJson';
import type { Locale } from './i18n';
import { freeSlots, withDayTotals, type PinnedDay, type PinnedWeek } from './pins';
import { profilePlanDays, profileSlots } from './profile';

export class UpstreamError extends Error {}
export class GenerationFailedError extends Error {}

const TAG_LABELS: Record<string, string> = {
  lactose_free: 'lactose-free',
  vegan: 'vegan',
  vegetarian: 'vegetarian',
  gluten_free: 'gluten-free',
  nut_allergy: 'no nuts (nut allergy)',
};

// Menus are written in the UI language; JSON keys and "day" values stay
// English because the schema depends on them.
const LANGUAGE_RULE: Record<Locale, string> = {
  uk:
    'Write every meal name and ingredient name in Ukrainian (ingredient names lowercase, ' +
    'nominative singular, e.g. "куряче філе", "гречка"; reuse the user\'s own wording for ' +
    'ingredients they listed). Keep JSON keys and the "day" values in English exactly as in the schema. ',
  en: 'Write every meal name and ingredient name in English (ingredient names lowercase). ',
};

const FRIDGE_LANGUAGE_RULE: Record<Locale, string> = {
  uk: 'Use short lowercase Ukrainian names ("куряче філе", "яйця", "помідори")',
  en: 'Use short lowercase names ("chicken breast", "eggs", "tomatoes")',
};

const SYSTEM_PROMPT =
  'You are a nutritionist. Respond with JSON only — no markdown, no commentary.';

// The model sees the slot keys verbatim, so they need a plain-English gloss.
const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'breakfast',
  morning_snack: 'a light morning snack',
  lunch: 'lunch',
  afternoon_snack: 'a light afternoon snack',
  dinner: 'dinner',
};

function slotList(slots: MealSlot[]): string {
  return slots.map((s) => `${s} (${SLOT_LABELS[s]})`).join(', ');
}

const MEAL_JSON =
  '{"name":"","kcal":0,"protein_g":0,"fat_g":0,"carbs_g":0,"ingredients":[{"name":"","grams":0}]}';

const MEAL_FIELDS_RULE =
  'Each generated meal needs: name, kcal, protein_g, fat_g, carbs_g (whole grams of protein, fat and ' +
  'carbohydrates in the meal, consistent with kcal: roughly 4 kcal per gram of protein or carbs and ' +
  '9 kcal per gram of fat), and an ingredients array where each ingredient has a lowercase name and ' +
  'grams (the weight of that ingredient used in the dish, realistic portions). ';

function describeFixed(meal: Meal): string {
  return (
    `"${meal.name}" (${meal.kcal} kcal, protein ${meal.protein_g ?? '?'} g, ` +
    `fat ${meal.fat_g ?? '?'} g, carbs ${meal.carbs_g ?? '?'} g)`
  );
}

function mealsJson(free: MealSlot[]): string {
  return `{${free.map((s) => `"${s}":<meal>`).join(',')}}`;
}

function profileContext(profile: Profile): string {
  const ingredients = profile.ingredients.trim() || 'none provided';
  const tags = profile.dietaryTags.length
    ? profile.dietaryTags.map((t) => TAG_LABELS[t] ?? t).join(', ')
    : 'none';
  return (
    `Use mostly these ingredients the user already has: ${ingredients} (fill gaps with common groceries). ` +
    `Strictly respect these dietary restrictions: ${tags}. Goal: ${profile.goal}. `
  );
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };
type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string | ContentPart[] };

async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  const baseUrl = process.env.LITELLM_BASE_URL;
  const apiKey = process.env.LITELLM_API_KEY;
  const model = process.env.LITELLM_MODEL;
  if (!baseUrl || !apiKey || !model) {
    throw new UpstreamError('LiteLLM is not configured (LITELLM_* env vars)');
  }

  const controller = new AbortController();
  // Reasoning models can take >60s on the full 7-day schema with weights.
  const timer = setTimeout(() => controller.abort(), 100_000);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      // No explicit temperature: reasoning models (e.g. claude-sonnet-5 via
      // LiteLLM) reject anything but their default and 400 the request.
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new UpstreamError(`LiteLLM responded ${res.status}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new UpstreamError('empty completion');
    return content;
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    throw new UpstreamError(err instanceof Error ? err.message : 'fetch failed');
  } finally {
    clearTimeout(timer);
  }
}

// Carries a handler's failure out of the stream unchanged: the outer catch
// turns transport problems into UpstreamError, and a failed save must not be
// mistaken for one.
class StreamHandlerError extends Error {
  constructor(readonly reason: unknown) {
    super('stream handler failed');
  }
}

// Same endpoint, `stream: true`: the caller sees text as it is written, which
// is what lets a week-long completion render day by day. Returns the whole
// text once the stream ends.
async function chatCompletionStream(
  messages: ChatMessage[],
  onText: (full: string) => void | Promise<void>
): Promise<string> {
  const baseUrl = process.env.LITELLM_BASE_URL;
  const apiKey = process.env.LITELLM_API_KEY;
  const model = process.env.LITELLM_MODEL;
  if (!baseUrl || !apiKey || !model) {
    throw new UpstreamError('LiteLLM is not configured (LITELLM_* env vars)');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        stream: true,
        messages,
      }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new UpstreamError(`LiteLLM responded ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        let delta: unknown;
        try {
          delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
        } catch {
          // A keep-alive or a partial frame — the next chunk completes it.
          continue;
        }
        // Outside the frame's catch on purpose: whatever the caller does with
        // a finished day (persisting it, streaming it out) must surface, not
        // read as a malformed frame.
        if (typeof delta === 'string' && delta) {
          full += delta;
          try {
            await onText(full);
          } catch (e) {
            throw new StreamHandlerError(e);
          }
        }
      }
    }

    if (!full) throw new UpstreamError('empty completion');
    return full;
  } catch (err) {
    if (err instanceof StreamHandlerError) throw err.reason;
    if (err instanceof UpstreamError) throw err;
    throw new UpstreamError(err instanceof Error ? err.message : 'fetch failed');
  } finally {
    clearTimeout(timer);
  }
}

function stripJsonFence(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
}

function tryParse<S extends z.ZodTypeAny>(
  schema: S,
  raw: string
): { data?: z.infer<S>; issue?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch (e) {
    return { issue: `not parseable JSON: ${e instanceof Error ? e.message : 'parse error'}` };
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    return { issue: `${first.path.join('.')}: ${first.message}` };
  }
  return { data: result.data };
}

// Complete, parse against `schema`; one retry with a corrective instruction,
// then give up (the route maps GenerationFailedError to 422).
async function completeJson<S extends z.ZodTypeAny>(
  schema: S,
  messages: ChatMessage[],
  // The plan's repair pass is budgeted at one call, so it opts out of the
  // corrective retry rather than nesting another round trip inside it.
  retryOnInvalid = true
): Promise<z.infer<S>> {
  const first = await chatCompletion(messages);
  let attempt = tryParse(schema, first);
  if (attempt.data !== undefined) return attempt.data;
  if (!retryOnInvalid) throw new GenerationFailedError(attempt.issue ?? 'invalid model output');

  const retry = await chatCompletion([
    ...messages,
    { role: 'assistant', content: first },
    {
      role: 'user',
      content: `Your previous response was invalid: ${attempt.issue}. Return only valid JSON matching the schema.`,
    },
  ]);
  attempt = tryParse(schema, retry);
  if (attempt.data !== undefined) return attempt.data;

  throw new GenerationFailedError(attempt.issue ?? 'invalid model output');
}

// ── Output schemas that depend on which slots are free ──────
type ModelMeals = Partial<Record<MealSlot, ModelMeal>>;
type ModelWeekOut = { days: { meals: ModelMeals }[] };

const ModelMealsSchema = z.partialRecord(MealSlotSchema, ModelMealSchema);

// Every free slot must be present; pinned slots may be omitted (or ignored).
function daySchema(free: MealSlot[]) {
  return z.object({ meals: ModelMealsSchema }).superRefine((day, ctx) => {
    for (const slot of free) {
      if (!day.meals[slot]) {
        ctx.addIssue({ code: 'custom', path: ['meals', slot], message: `missing ${slot}` });
      }
    }
  });
}

// Pinned slots win; the rest comes from the model, normalized.
function mergeMeals(
  dayName: DayName,
  generated: ModelMeals,
  pinned: PinnedDay | undefined,
  slots: MealSlot[]
): DayPlan['meals'] {
  const meals: DayPlan['meals'] = {};
  for (const slot of slots) {
    const fixed = pinned?.[slot];
    if (fixed) {
      meals[slot] = fixed;
      continue;
    }
    const meal = generated[slot];
    if (!meal) throw new GenerationFailedError(`missing ${slot} for ${dayName}`);
    meals[slot] = normalizeMeal(meal);
  }
  return meals;
}

// Recompute totals server-side (don't trust model arithmetic); normalize
// ingredients; assign day names positionally from startDate (don't trust
// model ordering either); keep the user's pinned dishes as they are.
export function normalizePlan(
  plan: ModelWeekOut,
  startDate: string,
  pinned: PinnedWeek = {},
  slots: MealSlot[] = DEFAULT_MEAL_SLOTS
): MealPlan {
  return {
    generatedAt: new Date().toISOString(),
    startDate,
    days: plan.days.map((day, i) => {
      const name = planDayNames(startDate, plan.days.length)[i];
      return withDayTotals({
        day: name,
        meals: mergeMeals(name, day.meals, pinned[name], slots),
        total_kcal: 0,
      });
    }),
  };
}

function normalizeMeal(meal: ModelMeal): Meal {
  return {
    name: meal.name.trim(),
    kcal: Math.round(meal.kcal),
    protein_g: Math.round(meal.protein_g),
    fat_g: Math.round(meal.fat_g),
    carbs_g: Math.round(meal.carbs_g),
    ingredients: meal.ingredients
      .map((i) => ({ name: i.name.toLowerCase().trim(), grams: Math.round(i.grams) }))
      .filter((i) => i.name),
  };
}

const FridgeItemsSchema = z.object({
  items: z.array(z.string().min(1).max(60)).max(80),
});

// Extract the food items visible in a fridge/pantry photo. `imageDataUrl`
// is a base64 data URL (the client downscales before uploading).
export async function parseFridgeImage(imageDataUrl: string, locale: Locale): Promise<string[]> {
  const raw = await chatCompletion([
    {
      role: 'system',
      content:
        'You identify food items in photos. Respond with JSON only — no markdown, no commentary.',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text:
            'List the food items and ingredients visible in this photo of a fridge or pantry. ' +
            `${FRIDGE_LANGUAGE_RULE[locale]} — no quantities, ` +
            'no brands, no duplicates. Skip non-food objects. If nothing edible is visible, ' +
            'return an empty list. Return JSON matching exactly: {"items":["",""]}',
        },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    },
  ]);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch {
    throw new GenerationFailedError('not parseable JSON');
  }
  const result = FridgeItemsSchema.safeParse(parsed);
  if (!result.success) throw new GenerationFailedError('invalid model output');
  return [...new Set(result.data.items.map((s) => s.toLowerCase().trim()).filter(Boolean))];
}

// One line per day: which slots the user pinned and which to generate.
function daySpec(day: DayName, pinned: PinnedDay | undefined, slots: MealSlot[]): string {
  const free = freeSlots(pinned, slots);
  const fixed = slots.filter((s) => pinned?.[s]).map((s) => `${s} ${describeFixed(pinned![s]!)}`);
  if (free.length === 0) {
    return `- ${day}: every meal is fixed by the user (${fixed.join('; ')}). Return "meals": {} for this day.`;
  }
  if (fixed.length === 0) return `- ${day}: generate ${free.join(', ')}.`;
  return (
    `- ${day}: fixed by the user: ${fixed.join('; ')}. Generate ${free.join(', ')} so the day ` +
    `total including the fixed meals lands within ±10% of the target.`
  );
}

// The whole plan in one request: cheaper and faster than a call per day, and
// the answer is streamed, so days still appear one at a time.
function weekPrompt(
  profile: Profile,
  days: DayName[],
  slots: MealSlot[],
  locale: Locale,
  pinnedByIndex: (PinnedDay | undefined)[]
): string {
  const specs = days.map((d, i) => daySpec(d, pinnedByIndex[i], slots)).join('\n');
  const example = days
    .map((d, i) => `{"day":"${d}","meals":${mealsJson(freeSlots(pinnedByIndex[i], slots))}}`)
    .join(',');
  return (
    LANGUAGE_RULE[locale] +
    `Create a ${days.length}-day meal plan starting on ${days[0]} ` +
    `(${days.length} consecutive days: ${days[0]} through ${days[days.length - 1]}), ` +
    `${slots.length} meals per day (${slotList(slots)}), targeting ${profile.calorieTarget} kcal/day ` +
    `(each day within ±10%). ` +
    (slots.some((s) => s.endsWith('snack')) ? SNACK_RULE : '') +
    profileContext(profile) +
    `Some slots already hold the user's own dishes; never change or repeat them, and generate only the requested slots:\n${specs}\n` +
    'Never repeat a meal across the plan. ' +
    MEAL_FIELDS_RULE +
    `Return JSON with exactly ${days.length} day objects in this order and only the requested meal keys per day, ` +
    `matching exactly: {"days":[${example}]} where <meal> is ${MEAL_JSON}`
  );
}

// Day names of a plan of `count` days starting on `startDate`.
export function planDayNames(startDate: string, count: number): DayName[] {
  const startIdx = DAY_NAMES.indexOf(weekdayName(parseDateKey(startDate)));
  return Array.from({ length: count }, (_, i) => DAY_NAMES[(startIdx + i) % 7]);
}

// Meal names already in the plan, so the next day doesn't repeat them.
function planMealNames(days: DayPlan[], skipIndex = -1): string[] {
  return days
    .filter((_, i) => i !== skipIndex)
    .flatMap((d) => daySlots(d).map((slot) => d.meals[slot]!.name));
}

const SNACK_RULE =
  'Snacks are small and need no cooking: roughly 10-15% of the day\'s calories each. ';

function dayPrompt(opts: {
  profile: Profile;
  day: DayName;
  slots: MealSlot[];
  pinnedDay: PinnedDay;
  locale: Locale;
  avoid: string[];
  preference?: string;
}): string {
  const { profile, day, slots, pinnedDay, locale, avoid, preference } = opts;
  const free = freeSlots(pinnedDay, slots);
  const fixed = slots.filter((s) => pinnedDay[s]).map((s) => `${s} ${describeFixed(pinnedDay[s]!)}`);
  return (
    LANGUAGE_RULE[locale] +
    `Create the meals for ${day} of a meal plan. ` +
    (fixed.length
      ? `These meals are the user's own dishes and stay as they are: ${fixed.join('; ')}. ` +
        `Generate only ${slotList(free)} so the day total including the fixed meals is ` +
        `${profile.calorieTarget} kcal (within ±10%). `
      : `Generate ${slotList(free)}, targeting ${profile.calorieTarget} kcal for the whole day (within ±10%). `) +
    (free.some((s) => s.endsWith('snack')) ? SNACK_RULE : '') +
    (preference
      ? `The user's wish for this day: "${preference}". Honor it unless it conflicts with the dietary restrictions. `
      : '') +
    profileContext(profile) +
    (avoid.length ? `Avoid repeating meals already planned this week: ${avoid.join(', ')}. ` : '') +
    MEAL_FIELDS_RULE +
    `Return JSON matching exactly: {"meals":${mealsJson(free)}} where <meal> is ${MEAL_JSON}`
  );
}

// Model output within ±10% is what the prompt asks for; retry only on a real
// miss, so one sloppy answer does not cost every day a second call.
const KCAL_TOLERANCE = 0.15;

function offTarget(day: DayPlan, target: number): boolean {
  return Math.abs(day.total_kcal - target) > target * KCAL_TOLERANCE;
}

// One day at a time: each call is small and fast, which is what lets the
// plan route stream days to the client as they land.
export async function generatePlanDay(opts: {
  profile: Profile;
  day: DayName;
  slots: MealSlot[];
  locale: Locale;
  pinnedDay?: PinnedDay;
  avoid?: string[];
  preference?: string;
  // One call, no schema retry and no second attempt at the target: used by
  // the plan repair pass, whose whole budget is that single call.
  single?: boolean;
}): Promise<DayPlan> {
  const pinnedDay = opts.pinnedDay ?? {};
  const free = freeSlots(pinnedDay, opts.slots);
  if (free.length === 0) {
    return withDayTotals({
      day: opts.day,
      meals: mergeMeals(opts.day, {}, pinnedDay, opts.slots),
      total_kcal: 0,
    });
  }

  const prompt = dayPrompt({
    profile: opts.profile,
    day: opts.day,
    slots: opts.slots,
    pinnedDay,
    locale: opts.locale,
    avoid: opts.avoid ?? [],
    preference: opts.preference,
  });

  const build = async (messages: ChatMessage[]) => {
    const result = await completeJson(daySchema(free), messages, !opts.single);
    return withDayTotals({
      day: opts.day,
      meals: mergeMeals(opts.day, result.meals, pinnedDay, opts.slots),
      total_kcal: 0,
    });
  };

  const first = await build([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ]);
  if (opts.single || !offTarget(first, opts.profile.calorieTarget)) return first;

  // Server-side totals say the day missed the target: say so and ask again,
  // then keep whichever attempt came closer.
  const second = await build([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
    { role: 'assistant', content: JSON.stringify({ meals: first.meals }) },
    {
      role: 'user',
      content:
        `That day totals ${first.total_kcal} kcal, but the target is ${opts.profile.calorieTarget} kcal. ` +
        'Resize the portions (and swap dishes if you must) so the day lands within ±10% of the target. ' +
        'Return the same JSON shape.',
    },
  ]);
  const miss = (d: DayPlan) => Math.abs(d.total_kcal - opts.profile.calorieTarget);
  return miss(second) < miss(first) ? second : first;
}

// `startDate` is the local date key ("YYYY-MM-DD") of the plan's first day.
// `pinned` holds the user's dishes per day name; only the other slots are
// generated, and a fully pinned week never calls the model. `onDay` is called
// with each finished day so the caller can stream it out — including a day
// that a repair pass later replaces, which arrives again under the same index.
export async function generateMealPlan(
  profile: Profile,
  startDate: string,
  locale: Locale,
  pinned: PinnedWeek = {},
  onDay?: (index: number, day: DayPlan) => void | Promise<void>
): Promise<MealPlan> {
  const slots = profileSlots(profile);
  const names = planDayNames(startDate, profilePlanDays(profile));
  const pinnedByIndex = names.map((d) => pinned[d]);
  const free = pinnedByIndex.map((p) => freeSlots(p, slots));
  const days: DayPlan[] = [];

  const keep = async (index: number, day: DayPlan) => {
    days[index] = day;
    await onDay?.(index, day);
  };

  if (free.every((f) => f.length === 0)) {
    // Nothing to ask for: every slot is one of the user's own dishes.
    for (const [index, name] of names.entries()) {
      await keep(
        index,
        withDayTotals({
          day: name,
          meals: mergeMeals(name, {}, pinnedByIndex[index], slots),
          total_kcal: 0,
        })
      );
    }
    return { generatedAt: new Date().toISOString(), startDate, days };
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: weekPrompt(profile, names, slots, locale, pinnedByIndex) },
  ];

  // Parse day objects out of the answer while it is still being written.
  // `cursor` is a position inside one particular answer, so every fresh
  // answer starts from a fresh scanner.
  let cursor = 0;
  let next = 0;
  let issue: string | undefined;
  // Set when a day fails the schema: the rest of that answer is unusable,
  // because taking the next object would silently shift it into the failed
  // day's place.
  let halted = false;
  const rescan = () => {
    cursor = 0;
    next = 0;
    halted = false;
  };

  const consume = async (full: string) => {
    if (halted || next >= names.length) return;
    const scan = scanArrayObjects(full, 'days', cursor);
    cursor = scan.next;
    for (const raw of scan.objects) {
      if (next >= names.length) return;
      const index = next;
      const parsed = tryParse(daySchema(free[index]), raw);
      if (!parsed.data) {
        // Remember why, so the corrective attempt can quote it.
        issue = `days.${index}: ${parsed.issue}`;
        halted = true;
        return;
      }
      next = index + 1;
      const name = names[index];
      await keep(
        index,
        withDayTotals({
          day: name,
          meals: mergeMeals(name, parsed.data.meals, pinnedByIndex[index], slots),
          total_kcal: 0,
        })
      );
    }
  };

  let answer = '';
  try {
    answer = await chatCompletionStream(messages, consume);
  } catch (err) {
    // Endpoints that cannot stream, or a connection that dropped after some
    // days: fall back to one plain call and read the days out of it.
    if (next === 0) {
      rescan();
      answer = await chatCompletion(messages);
      await consume(answer);
    } else if (!(err instanceof UpstreamError)) {
      throw err;
    }
  }

  // One corrective attempt, the same contract as `completeJson`: say what was
  // wrong and take the whole plan again.
  if (next < names.length) {
    const why = issue ?? `only ${next} of ${names.length} days were returned`;
    rescan();
    await consume(
      await chatCompletion([
        ...messages,
        { role: 'assistant', content: answer },
        {
          role: 'user',
          content: `Your previous response was invalid: ${why}. Return only valid JSON matching the schema.`,
        },
      ])
    );
  }

  if (next < names.length) {
    throw new GenerationFailedError(issue ?? `only ${next} of ${names.length} days were returned`);
  }

  // Totals are recomputed server-side, so a day that missed the target is
  // known here. The repair is budgeted at one call per day and is allowed to
  // fail: every day already passed the schema and reached the caller, so a
  // dead repair endpoint must not throw a finished plan away.
  for (const [index, day] of days.entries()) {
    if (!offTarget(day, profile.calorieTarget)) continue;
    let repaired: DayPlan | null = null;
    try {
      repaired = await generatePlanDay({
        profile,
        day: day.day,
        slots,
        locale,
        pinnedDay: pinnedByIndex[index],
        avoid: planMealNames(days, index),
        single: true,
      });
    } catch {
      repaired = null; // keep the day as generated
    }
    const closer =
      repaired !== null &&
      Math.abs(repaired.total_kcal - profile.calorieTarget) <
        Math.abs(day.total_kcal - profile.calorieTarget);
    // Outside the catch: a failure to persist the repaired day is the
    // caller's problem, not something to swallow.
    if (closer) await keep(index, repaired!);
  }

  return { generatedAt: new Date().toISOString(), startDate, days };
}

// Regenerate a single day of an existing plan. The rest of the plan is kept
// as-is (including generatedAt — the staleness check compares against the
// full generation, and startDate — the day↔date mapping must not shift).
// Pinned slots of that day are kept; a fully pinned day never calls the model.
export async function regenerateMealPlanDay(
  profile: Profile,
  plan: MealPlan,
  dayIndex: number,
  locale: Locale,
  pinnedDay: PinnedDay = {},
  preference?: string
): Promise<MealPlan> {
  const current = plan.days[dayIndex];
  // Keep the day's own shape: an old 3-meal plan is not silently reshaped
  // by a later change to the profile's slots.
  const slots = daySlots(current).length ? daySlots(current) : profileSlots(profile);
  const day = await generatePlanDay({
    profile,
    day: current.day,
    slots,
    locale,
    pinnedDay,
    // Including the day being replaced: repeating it is the failure mode.
    avoid: planMealNames(plan.days),
    preference,
  });
  return { ...plan, days: plan.days.map((d, i) => (i === dayIndex ? day : d)) };
}

function mealPrompt(
  profile: Profile,
  plan: MealPlan,
  dayIndex: number,
  slot: MealSlot,
  locale: Locale,
  preference?: string
): string {
  const day = plan.days[dayIndex];
  const others = daySlots(day).filter((s) => s !== slot);
  const otherKcal = others.reduce((sum, s) => sum + day.meals[s]!.kcal, 0);
  const budget = Math.max(100, profile.calorieTarget - otherKcal);
  const current = day.meals[slot];
  return (
    LANGUAGE_RULE[locale] +
    `Replace only the ${slot} (${SLOT_LABELS[slot]}) of ${day.day} in a meal plan with a different meal. ` +
    (current ? `The meal being replaced is "${current.name}" — propose something clearly different. ` : '') +
    (others.length
      ? `The rest of that day stays: ${others.map((s) => `${s} ${describeFixed(day.meals[s]!)}`).join('; ')}. `
      : '') +
    `The new meal should be about ${budget} kcal so the day lands near the ${profile.calorieTarget} kcal target. ` +
    (slot.endsWith('snack') ? SNACK_RULE : '') +
    (preference
      ? `The user's wish: "${preference}". Honor it unless it conflicts with the dietary restrictions. `
      : '') +
    profileContext(profile) +
    `Avoid repeating meals already planned this week: ${planMealNames(plan.days).join(', ')}. ` +
    MEAL_FIELDS_RULE +
    `Return JSON matching exactly: {"meals":${mealsJson([slot])}} where <meal> is ${MEAL_JSON}`
  );
}

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

// Regenerate one slot of one day, leaving the other meals of that day alone.
export async function regenerateMeal(
  profile: Profile,
  plan: MealPlan,
  dayIndex: number,
  slot: MealSlot,
  locale: Locale,
  preference?: string
): Promise<MealPlan> {
  const previous = plan.days[dayIndex].meals[slot]?.name ?? '';
  const prompt = mealPrompt(profile, plan, dayIndex, slot, locale, preference);
  const ask = async (messages: ChatMessage[]) => {
    const result = await completeJson(daySchema([slot]), messages);
    const out = result.meals[slot];
    if (!out) throw new GenerationFailedError(`missing ${slot}`);
    return out;
  };

  let meal = await ask([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ]);
  // "Replace this meal" that returns the same meal is a failed swap, so say
  // it plainly and ask once more.
  if (previous && sameName(meal.name, previous)) {
    meal = await ask([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
      { role: 'assistant', content: JSON.stringify({ meals: { [slot]: meal } }) },
      {
        role: 'user',
        content:
          `"${previous}" is the meal being replaced — returning it again is not a replacement. ` +
          'Return a different dish, with a different main ingredient. Same JSON shape.',
      },
    ]);
  }
  return {
    ...plan,
    days: plan.days.map((d, i) =>
      i === dayIndex ? withDayTotals({ ...d, meals: { ...d.meals, [slot]: normalizeMeal(meal) } }) : d
    ),
  };
}

// kcal and macros of a whole dish from its ingredient list (the user can
// still edit the numbers by hand).
export async function estimateDish(
  name: string | undefined,
  ingredients: { name: string; grams: number }[]
): Promise<DishEstimate> {
  const list = ingredients.map((i) => `${i.name} ${i.grams} g`).join(', ');
  const est = await completeJson(DishEstimateSchema, [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content:
        `Estimate the nutrition of the whole dish${name ? ` "${name}"` : ''} made from: ${list}. ` +
        'Return totals for the entire dish (not per 100 g) as whole numbers, consistent with ' +
        '4 kcal per gram of protein or carbs and 9 kcal per gram of fat. ' +
        'Return JSON matching exactly: {"kcal":0,"protein_g":0,"fat_g":0,"carbs_g":0}',
    },
  ]);
  return {
    kcal: Math.round(est.kcal),
    protein_g: Math.round(est.protein_g),
    fat_g: Math.round(est.fat_g),
    carbs_g: Math.round(est.carbs_g),
  };
}
