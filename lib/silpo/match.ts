import 'server-only';
import { normalize } from '../shopping';

// Silpo's catalog search is Ukrainian-only (English queries return brand
// noise: "potato" → Porto wine), so every item is translated first. Hits
// carry no category, so an LLM pass vets the candidates instead.

export const INGREDIENT_CATEGORIES = [
  'produce',
  'meat',
  'fish',
  'dairy_eggs',
  'grains_pasta',
  'bakery',
  'oils_sauces',
  'canned',
  'frozen',
  'drinks',
  'sweets_snacks',
  'other',
] as const;
export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

export type QueryPlan = { query: string; category?: IngredientCategory };

// Common meal-plan ingredients → Ukrainian query + department, so the
// dictionary alone covers a typical plan even with no LLM configured.
const DICTIONARY: Record<string, QueryPlan> = {
  chicken: { query: 'куряче філе', category: 'meat' },
  'chicken breast': { query: 'куряче філе', category: 'meat' },
  'chicken fillet': { query: 'куряче філе', category: 'meat' },
  'chicken thigh': { query: 'куряче стегно', category: 'meat' },
  beef: { query: 'яловичина', category: 'meat' },
  pork: { query: 'свинина', category: 'meat' },
  turkey: { query: 'філе індички', category: 'meat' },
  fish: { query: 'риба', category: 'fish' },
  salmon: { query: 'лосось', category: 'fish' },
  tuna: { query: 'тунець', category: 'fish' },
  egg: { query: 'яйця курячі', category: 'dairy_eggs' },
  eggs: { query: 'яйця курячі', category: 'dairy_eggs' },
  milk: { query: 'молоко', category: 'dairy_eggs' },
  cheese: { query: 'сир твердий', category: 'dairy_eggs' },
  'cottage cheese': { query: 'сир кисломолочний', category: 'dairy_eggs' },
  yogurt: { query: 'йогурт', category: 'dairy_eggs' },
  butter: { query: 'масло вершкове', category: 'dairy_eggs' },
  cream: { query: 'вершки', category: 'dairy_eggs' },
  rice: { query: 'рис', category: 'grains_pasta' },
  buckwheat: { query: 'гречка', category: 'grains_pasta' },
  oats: { query: 'вівсянка', category: 'grains_pasta' },
  oatmeal: { query: 'вівсянка', category: 'grains_pasta' },
  pasta: { query: 'макарони', category: 'grains_pasta' },
  bread: { query: 'хліб', category: 'bakery' },
  flour: { query: 'борошно', category: 'grains_pasta' },
  sugar: { query: 'цукор', category: 'grains_pasta' },
  salt: { query: 'сіль', category: 'oils_sauces' },
  honey: { query: 'мед', category: 'grains_pasta' },
  oil: { query: 'олія', category: 'oils_sauces' },
  'olive oil': { query: 'олія оливкова', category: 'oils_sauces' },
  potato: { query: 'картопля', category: 'produce' },
  potatoes: { query: 'картопля', category: 'produce' },
  tomato: { query: 'помідори', category: 'produce' },
  tomatoes: { query: 'помідори', category: 'produce' },
  cucumber: { query: 'огірки', category: 'produce' },
  onion: { query: 'цибуля', category: 'produce' },
  garlic: { query: 'часник', category: 'produce' },
  carrot: { query: 'морква', category: 'produce' },
  pepper: { query: 'перець', category: 'produce' },
  'bell pepper': { query: 'перець солодкий', category: 'produce' },
  broccoli: { query: 'броколі', category: 'produce' },
  spinach: { query: 'шпинат', category: 'produce' },
  mushroom: { query: 'гриби', category: 'produce' },
  mushrooms: { query: 'гриби', category: 'produce' },
  cabbage: { query: 'капуста', category: 'produce' },
  banana: { query: 'банани', category: 'produce' },
  apple: { query: 'яблука', category: 'produce' },
  lemon: { query: 'лимон', category: 'produce' },
  beans: { query: 'квасоля', category: 'grains_pasta' },
  lentils: { query: 'сочевиця', category: 'grains_pasta' },
  nuts: { query: 'горіхи', category: 'grains_pasta' },
  water: { query: 'вода', category: 'drinks' },
};

export function fromDictionary(name: string): QueryPlan | undefined {
  const n = normalize(name);
  if (DICTIONARY[n]) return DICTIONARY[n];
  for (const key of Object.keys(DICTIONARY)) {
    if (n.includes(key)) return DICTIONARY[key];
  }
  return undefined;
}

// One LiteLLM JSON completion with a short timeout. Every failure returns
// null so callers fall back; matching must never depend on the LLM.
async function liteLlmJson(system: string, user: string, timeoutMs: number): Promise<unknown> {
  const baseUrl = process.env.LITELLM_BASE_URL;
  const apiKey = process.env.LITELLM_API_KEY;
  const model = process.env.LITELLM_MODEL;
  if (!baseUrl || !apiKey || !model) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return null;
    return JSON.parse(
      content
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const TRANSLATE_PROMPT =
  'You turn grocery item names (English or Ukrainian) into Ukrainian supermarket catalog ' +
  'search terms. Reply with JSON only: {"items": [{"uk": "Ukrainian search term", "cat": "food ' +
  'category"}, ...]} in the same order as the input. Use singular common nouns, no ' +
  'quantities, no brands. Prefer the bare product noun; drop preparation adjectives like ' +
  '"заморожений"/"консервований"/"сушений" (they break the catalog search; "cat" conveys ' +
  'the department). "cat" must be one of: ' +
  INGREDIENT_CATEGORIES.join(', ') +
  '. Pick the department where the item AS NAMED is sold (potato → produce, canned corn → ' +
  'canned, frozen berries → frozen, yogurt → dairy_eggs); use "other" when unsure.';

async function translateBatch(names: string[]): Promise<Record<string, QueryPlan>> {
  const parsed = await liteLlmJson(TRANSLATE_PROMPT, JSON.stringify({ en: names }), 20_000);
  const items = (parsed as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || items.length !== names.length) return {};
  const map: Record<string, QueryPlan> = {};
  names.forEach((name, i) => {
    const item = items[i] as { uk?: unknown; cat?: unknown };
    const uk = typeof item?.uk === 'string' ? item.uk.trim() : '';
    if (!uk) return;
    const category = INGREDIENT_CATEGORIES.find((c) => c === item?.cat);
    map[name] = { query: uk, category };
  });
  return map;
}

// Ukrainian query + department per item: LLM → dictionary → raw name.
export async function resolveQueries(names: string[]): Promise<Record<string, QueryPlan>> {
  const llm = await translateBatch(names);
  const out: Record<string, QueryPlan> = {};
  for (const name of names) {
    const dict = fromDictionary(name);
    const hit = llm[name];
    if (hit) {
      out[name] = hit.category ? hit : { ...hit, category: dict?.category };
    } else {
      out[name] = dict ?? { query: name };
    }
  }
  return out;
}

// ── Candidate choice ────────────────────────────────────────
export type PickCandidate = {
  title: string;
  price: number;
  weighted: boolean;
  displayRatio: string | null;
  oldPrice: number | null;
};
export type PickItem = {
  name: string;
  grams: number;
  category?: IngredientCategory;
  candidates: PickCandidate[];
};

// picks[i] indexes items[i].candidates; -1 = nothing fits.
export function parsePicks(parsed: unknown, candidateCounts: number[]): number[] | null {
  const picks = (parsed as { picks?: unknown } | null)?.picks;
  if (!Array.isArray(picks) || picks.length !== candidateCounts.length) return null;
  const out: number[] = [];
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    if (typeof p !== 'number' || !Number.isInteger(p) || p < -1 || p >= candidateCounts[i]) {
      return null;
    }
    out.push(p);
  }
  return out;
}

const PICK_PROMPT =
  'You pick supermarket products for recipe ingredients. For each item you get the ' +
  'ingredient name (English or Ukrainian), the store department it belongs to, and candidate products (Ukrainian ' +
  'titles, prices in UAH, unit = "per kg" or the pack content). Reply with JSON only: ' +
  '{"picks": [one candidate index per item, same order]}. Choose the plain, unflavoured, ' +
  'unprocessed variant closest to the raw ingredient, preferring a pack size near ' +
  'needed_grams and a sensible price. Reject candidates that merely contain the ingredient ' +
  'word: pet food, drinks, snacks, sauces, ready meals, cosmetics. Use -1 when no candidate ' +
  'really is that ingredient.';

// One batched call; on any failure returns {} and callers keep the top hit.
export async function choosePicks(items: PickItem[]): Promise<Record<string, number>> {
  if (items.length === 0) return {};
  const payload = items.map((item) => ({
    ingredient: item.name,
    department: item.category ?? 'unknown',
    needed_grams: item.grams || undefined,
    candidates: item.candidates.map((c, i) => ({
      i,
      title: c.title,
      price_uah: c.price,
      unit: c.weighted ? 'per kg' : (c.displayRatio ?? 'per pack'),
      discounted: c.oldPrice ? true : undefined,
    })),
  }));
  const parsed = await liteLlmJson(PICK_PROMPT, JSON.stringify({ items: payload }), 15_000);
  const picks = parsePicks(
    parsed,
    items.map((it) => it.candidates.length)
  );
  if (!picks) return {};
  const map: Record<string, number> = {};
  items.forEach((item, i) => {
    map[item.name] = picks[i];
  });
  return map;
}

export { parseDisplayRatio, suggestQuantity } from './quantity';
