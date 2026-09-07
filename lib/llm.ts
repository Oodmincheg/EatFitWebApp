import 'server-only';
import { z } from 'zod';
import {
  DAY_NAMES,
  ModelDaySchema,
  ModelPlanSchema,
  type DayName,
  type MealPlan,
  type Profile,
} from './schemas';
import { parseDateKey, weekdayName } from './dates';
import type { Locale } from './i18n';

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

function userPrompt(profile: Profile, startDay: DayName, locale: Locale): string {
  const ingredients = profile.ingredients.trim() || 'none provided';
  const tags = profile.dietaryTags.length
    ? profile.dietaryTags.map((t) => TAG_LABELS[t] ?? t).join(', ')
    : 'none';
  return (
    LANGUAGE_RULE[locale] +
    `Create a 7-day meal plan starting on ${startDay} (7 consecutive days: ` +
    `${startDay} through ${DAY_NAMES[(DAY_NAMES.indexOf(startDay) + 6) % 7]}), ` +
    `3 meals per day (breakfast, lunch, dinner), ` +
    `targeting ${profile.calorieTarget} kcal/day (each day within ±10%). ` +
    `Use mostly these ingredients the user already has: ${ingredients} (fill gaps with common groceries). ` +
    `Strictly respect these dietary restrictions: ${tags}. Goal: ${profile.goal}. ` +
    `Each meal needs: name, kcal, protein_g, fat_g, carbs_g (whole grams of protein, fat and ` +
    `carbohydrates in the meal — keep them consistent with kcal: roughly 4 kcal per gram of ` +
    `protein or carbs and 9 kcal per gram of fat), and an ingredients array where each ingredient has a ` +
    `lowercase name and grams (the weight of that ingredient used in the dish, realistic portions). ` +
    `Each day needs total_kcal = sum of its meals. Return JSON matching exactly: ` +
    `{"days":[{"day":"${startDay}","meals":{"breakfast":{"name":"","kcal":0,"protein_g":0,"fat_g":0,"carbs_g":0,"ingredients":[{"name":"","grams":0}]},` +
    `"lunch":{"name":"","kcal":0,"protein_g":0,"fat_g":0,"carbs_g":0,"ingredients":[{"name":"","grams":0}]},` +
    `"dinner":{"name":"","kcal":0,"protein_g":0,"fat_g":0,"carbs_g":0,"ingredients":[{"name":"","grams":0}]}},` +
    `"total_kcal":0}, ...]}`
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

// Recompute totals server-side (don't trust model arithmetic); normalize
// ingredients; assign day names positionally from startDate (don't trust
// model ordering either).
export function normalizePlan(plan: z.infer<typeof ModelPlanSchema>, startDate: string): MealPlan {
  const startIdx = DAY_NAMES.indexOf(weekdayName(parseDateKey(startDate)));
  return {
    generatedAt: new Date().toISOString(),
    startDate,
    days: plan.days.map((day, i) => {
      const meals = {
        breakfast: normalizeMeal(day.meals.breakfast),
        lunch: normalizeMeal(day.meals.lunch),
        dinner: normalizeMeal(day.meals.dinner),
      };
      return {
        day: DAY_NAMES[(startIdx + i) % 7],
        meals,
        total_kcal: meals.breakfast.kcal + meals.lunch.kcal + meals.dinner.kcal,
        total_protein_g: meals.breakfast.protein_g + meals.lunch.protein_g + meals.dinner.protein_g,
        total_fat_g: meals.breakfast.fat_g + meals.lunch.fat_g + meals.dinner.fat_g,
        total_carbs_g: meals.breakfast.carbs_g + meals.lunch.carbs_g + meals.dinner.carbs_g,
      };
    }),
  };
}

function normalizeMeal(meal: {
  name: string;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  ingredients: { name: string; grams: number }[];
}) {
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
export async function generateMealPlan(
  profile: Profile,
  startDate: string,
  locale: Locale
): Promise<MealPlan> {
  const plan = await completeJson(ModelPlanSchema, [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: userPrompt(profile, weekdayName(parseDateKey(startDate)), locale),
    },
  ]);
  return normalizePlan(plan, startDate);
}

function dayPrompt(
  profile: Profile,
  plan: MealPlan,
  dayIndex: number,
  locale: Locale,
  preference?: string
): string {
  const ingredients = profile.ingredients.trim() || 'none provided';
  const tags = profile.dietaryTags.length
    ? profile.dietaryTags.map((t) => TAG_LABELS[t] ?? t).join(', ')
    : 'none';
  const otherMeals = plan.days
    .filter((_, i) => i !== dayIndex)
    .flatMap((d) => [d.meals.breakfast.name, d.meals.lunch.name, d.meals.dinner.name]);
  return (
    LANGUAGE_RULE[locale] +
    `Create a fresh one-day meal plan for ${plan.days[dayIndex].day} to replace the current one, ` +
    `3 meals (breakfast, lunch, dinner), targeting ${profile.calorieTarget} kcal total (within ±10%). ` +
    (preference
      ? `The user's wish for this day: "${preference}". Honor it unless it conflicts with the dietary restrictions. `
      : '') +
    `Use mostly these ingredients the user already has: ${ingredients} (fill gaps with common groceries). ` +
    `Strictly respect these dietary restrictions: ${tags}. Goal: ${profile.goal}. ` +
    `Avoid repeating meals already planned this week: ${otherMeals.join(', ')}. ` +
    `Each meal needs: name, kcal, protein_g, fat_g, carbs_g (whole grams of protein, fat and ` +
    `carbohydrates in the meal — keep them consistent with kcal: roughly 4 kcal per gram of ` +
    `protein or carbs and 9 kcal per gram of fat), and an ingredients array where each ingredient has a ` +
    `lowercase name and grams (the weight of that ingredient used in the dish, realistic portions). ` +
    `Return JSON matching exactly: ` +
    `{"meals":{"breakfast":{"name":"","kcal":0,"protein_g":0,"fat_g":0,"carbs_g":0,"ingredients":[{"name":"","grams":0}]},` +
    `"lunch":{"name":"","kcal":0,"protein_g":0,"fat_g":0,"carbs_g":0,"ingredients":[{"name":"","grams":0}]},` +
    `"dinner":{"name":"","kcal":0,"protein_g":0,"fat_g":0,"carbs_g":0,"ingredients":[{"name":"","grams":0}]}}}`
  );
}

// Regenerate a single day of an existing plan. The rest of the plan is kept
// as-is (including generatedAt — the staleness check compares against the
// full generation, and startDate — the day↔date mapping must not shift).
export async function regenerateMealPlanDay(
  profile: Profile,
  plan: MealPlan,
  dayIndex: number,
  locale: Locale,
  preference?: string
): Promise<MealPlan> {
  const result = await completeJson(ModelDaySchema, [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: dayPrompt(profile, plan, dayIndex, locale, preference) },
  ]);
  const meals = {
    breakfast: normalizeMeal(result.meals.breakfast),
    lunch: normalizeMeal(result.meals.lunch),
    dinner: normalizeMeal(result.meals.dinner),
  };
  const day = {
    day: plan.days[dayIndex].day,
    meals,
    total_kcal: meals.breakfast.kcal + meals.lunch.kcal + meals.dinner.kcal,
    total_protein_g: meals.breakfast.protein_g + meals.lunch.protein_g + meals.dinner.protein_g,
    total_fat_g: meals.breakfast.fat_g + meals.lunch.fat_g + meals.dinner.fat_g,
    total_carbs_g: meals.breakfast.carbs_g + meals.lunch.carbs_g + meals.dinner.carbs_g,
  };
  return { ...plan, days: plan.days.map((d, i) => (i === dayIndex ? day : d)) };
}
