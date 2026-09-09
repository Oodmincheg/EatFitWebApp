import 'server-only';
import { z } from 'zod';
import {
  DAY_NAMES,
  DishEstimateSchema,
  MEAL_SLOTS,
  ModelMealSchema,
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
import type { Locale } from './i18n';
import { freeSlots, withDayTotals, type PinnedDay, type PinnedWeek } from './pins';

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

// One line per day: which slots the user pinned and which to generate.
function daySpec(day: DayName, pinned: PinnedDay | undefined): string {
  const free = freeSlots(pinned);
  const fixed = MEAL_SLOTS.filter((s) => pinned?.[s]).map((s) => `${s} ${describeFixed(pinned![s]!)}`);
  if (free.length === 0) {
    return `- ${day}: all three meals are fixed by the user (${fixed.join('; ')}). Return "meals": {} for this day.`;
  }
  if (fixed.length === 0) return `- ${day}: generate breakfast, lunch, dinner.`;
  return (
    `- ${day}: fixed by the user: ${fixed.join('; ')}. Generate ${free.join(', ')} so the day ` +
    `total including the fixed meals lands within ±10% of the target.`
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

function userPrompt(
  profile: Profile,
  days: DayName[],
  locale: Locale,
  pinnedByIndex: (PinnedDay | undefined)[]
): string {
  const specs = days.map((d, i) => daySpec(d, pinnedByIndex[i])).join('\n');
  const example = days
    .map((d, i) => `{"day":"${d}","meals":${mealsJson(freeSlots(pinnedByIndex[i]))}}`)
    .join(',');
  return (
    LANGUAGE_RULE[locale] +
    `Create a 7-day meal plan starting on ${days[0]} (7 consecutive days: ${days[0]} through ${days[6]}), ` +
    `3 meals per day (breakfast, lunch, dinner), targeting ${profile.calorieTarget} kcal/day (each day within ±10%). ` +
    profileContext(profile) +
    `Some slots already hold the user's own dishes; never change or repeat them, and generate only the requested slots:\n${specs}\n` +
    MEAL_FIELDS_RULE +
    `Return JSON with exactly 7 day objects in this order and only the requested meal keys per day, ` +
    `matching exactly: {"days":[${example}]} where <meal> is ${MEAL_JSON}`
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
  messages: ChatMessage[]
): Promise<z.infer<S>> {
  const first = await chatCompletion(messages);
  let attempt = tryParse(schema, first);
  if (attempt.data !== undefined) return attempt.data;

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

const ModelMealsSchema = z.object({
  breakfast: ModelMealSchema.optional(),
  lunch: ModelMealSchema.optional(),
  dinner: ModelMealSchema.optional(),
});

// Every free slot must be present; pinned slots may be omitted (or ignored).
function weekSchema(free: MealSlot[][]) {
  return z
    .object({ days: z.array(z.object({ meals: ModelMealsSchema })).length(7) })
    .superRefine((plan, ctx) => {
      plan.days.forEach((day, i) => {
        for (const slot of free[i]) {
          if (!day.meals[slot]) {
            ctx.addIssue({ code: 'custom', path: ['days', i, 'meals', slot], message: `missing ${slot}` });
          }
        }
      });
    });
}

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
  pinned: PinnedDay | undefined
): DayPlan['meals'] {
  const meals = {} as DayPlan['meals'];
  for (const slot of MEAL_SLOTS) {
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
  pinned: PinnedWeek = {}
): MealPlan {
  const startIdx = DAY_NAMES.indexOf(weekdayName(parseDateKey(startDate)));
  return {
    generatedAt: new Date().toISOString(),
    startDate,
    days: plan.days.map((day, i) => {
      const name = DAY_NAMES[(startIdx + i) % 7];
      return withDayTotals({
        day: name,
        meals: mergeMeals(name, day.meals, pinned[name]),
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

// `startDate` is the local date key ("YYYY-MM-DD") of the plan's first day.
// `pinned` holds the user's dishes per day name; only the other slots are
// generated, and a fully pinned week never calls the model.
export async function generateMealPlan(
  profile: Profile,
  startDate: string,
  locale: Locale,
  pinned: PinnedWeek = {}
): Promise<MealPlan> {
  const startIdx = DAY_NAMES.indexOf(weekdayName(parseDateKey(startDate)));
  const days = Array.from({ length: 7 }, (_, i) => DAY_NAMES[(startIdx + i) % 7]);
  const pinnedByIndex = days.map((d) => pinned[d]);
  const free = pinnedByIndex.map(freeSlots);

  if (free.every((f) => f.length === 0)) {
    return normalizePlan({ days: days.map(() => ({ meals: {} })) }, startDate, pinned);
  }

  const plan = await completeJson(weekSchema(free), [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt(profile, days, locale, pinnedByIndex) },
  ]);
  return normalizePlan(plan, startDate, pinned);
}

function dayPrompt(
  profile: Profile,
  plan: MealPlan,
  dayIndex: number,
  locale: Locale,
  pinnedDay: PinnedDay,
  preference?: string
): string {
  const day = plan.days[dayIndex].day;
  const free = freeSlots(pinnedDay);
  const fixed = MEAL_SLOTS.filter((s) => pinnedDay[s]).map((s) => `${s} ${describeFixed(pinnedDay[s]!)}`);
  const otherMeals = plan.days
    .filter((_, i) => i !== dayIndex)
    .flatMap((d) => [d.meals.breakfast.name, d.meals.lunch.name, d.meals.dinner.name]);
  return (
    LANGUAGE_RULE[locale] +
    `Create a fresh one-day meal plan for ${day} to replace the current one. ` +
    (fixed.length
      ? `These meals are the user's own dishes and stay as they are: ${fixed.join('; ')}. ` +
        `Generate only ${free.join(', ')} so the day total including the fixed meals is ` +
        `${profile.calorieTarget} kcal (within ±10%). `
      : `3 meals (breakfast, lunch, dinner), targeting ${profile.calorieTarget} kcal total (within ±10%). `) +
    (preference
      ? `The user's wish for this day: "${preference}". Honor it unless it conflicts with the dietary restrictions. `
      : '') +
    profileContext(profile) +
    `Avoid repeating meals already planned this week: ${otherMeals.join(', ')}. ` +
    MEAL_FIELDS_RULE +
    `Return JSON matching exactly: {"meals":${mealsJson(free)}} where <meal> is ${MEAL_JSON}`
  );
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
  const free = freeSlots(pinnedDay);
  let generated: ModelMeals = {};
  if (free.length > 0) {
    const result = await completeJson(daySchema(free), [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: dayPrompt(profile, plan, dayIndex, locale, pinnedDay, preference) },
    ]);
    generated = result.meals;
  }
  const name = plan.days[dayIndex].day;
  const day = withDayTotals({
    day: name,
    meals: mergeMeals(name, generated, pinnedDay),
    total_kcal: 0,
  });
  return { ...plan, days: plan.days.map((d, i) => (i === dayIndex ? day : d)) };
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
