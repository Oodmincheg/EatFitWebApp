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
}): Promise<DayPlan> {
  const pinnedDay = opts.pinnedDay ?? {};
  const free = freeSlots(pinnedDay, opts.slots);
  let generated: ModelMeals = {};
  if (free.length > 0) {
    const result = await completeJson(daySchema(free), [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: dayPrompt({
          profile: opts.profile,
          day: opts.day,
          slots: opts.slots,
          pinnedDay,
          locale: opts.locale,
          avoid: opts.avoid ?? [],
          preference: opts.preference,
        }),
      },
    ]);
    generated = result.meals;
  }
  return withDayTotals({
    day: opts.day,
    meals: mergeMeals(opts.day, generated, pinnedDay, opts.slots),
    total_kcal: 0,
  });
}

// `startDate` is the local date key ("YYYY-MM-DD") of the plan's first day.
// `pinned` holds the user's dishes per day name; only the other slots are
// generated, and a fully pinned day never calls the model. `onDay` is called
// with each finished day so the caller can stream it out.
export async function generateMealPlan(
  profile: Profile,
  startDate: string,
  locale: Locale,
  pinned: PinnedWeek = {},
  onDay?: (index: number, day: DayPlan) => void | Promise<void>
): Promise<MealPlan> {
  const slots = profileSlots(profile);
  const names = planDayNames(startDate, profilePlanDays(profile));
  const days: DayPlan[] = [];

  for (const [index, name] of names.entries()) {
    const day = await generatePlanDay({
      profile,
      day: name,
      slots,
      locale,
      pinnedDay: pinned[name],
      avoid: planMealNames(days),
    });
    days.push(day);
    await onDay?.(index, day);
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
    avoid: planMealNames(plan.days, dayIndex),
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

// Regenerate one slot of one day, leaving the other meals of that day alone.
export async function regenerateMeal(
  profile: Profile,
  plan: MealPlan,
  dayIndex: number,
  slot: MealSlot,
  locale: Locale,
  preference?: string
): Promise<MealPlan> {
  const result = await completeJson(daySchema([slot]), [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: mealPrompt(profile, plan, dayIndex, slot, locale, preference) },
  ]);
  const meal = result.meals[slot];
  if (!meal) throw new GenerationFailedError(`missing ${slot}`);
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
