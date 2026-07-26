import 'server-only';
import type { CartLine, OrderItem, ZakazCart, ZakazProduct } from './schemas';

// Undocumented, unofficial Zakaz.ua backend — see RESEARCH_ZakazUA_API.md.
// Public reads, no auth. Everything here is best-effort: any failure degrades
// to a search-link fallback rather than throwing (except an unreachable store list).

const API_BASE = process.env.ZAKAZ_API_BASE ?? 'https://stores-api.zakaz.ua';
const DEFAULT_STORE_ID = process.env.ZAKAZ_DEFAULT_STORE_ID ?? '482010105'; // NOVUS SkyMall, Kyiv
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'uk' };
const TTL_MS = 10 * 60 * 1000;

export class ZakazUpstreamError extends Error {}

type StoreInfo = ZakazCart['store'];

// ── Tiny in-process TTL cache ───────────────────────────────
const cache = new Map<string, { at: number; value: unknown }>();

function cached<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  if (hit) cache.delete(key);
  return undefined;
}
function store<T>(key: string, value: T): T {
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function getJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Store resolution ────────────────────────────────────────
async function resolveStore(storeId: string): Promise<StoreInfo> {
  const cacheKey = `store:${storeId}`;
  const hit = cached<StoreInfo>(cacheKey);
  if (hit) return hit;

  let stores: Array<{ id: string; retail_chain?: string; name?: string }>;
  try {
    stores = (await getJson(`${API_BASE}/stores/`)) as typeof stores;
  } catch (e) {
    throw new ZakazUpstreamError(e instanceof Error ? e.message : 'stores fetch failed');
  }

  const found = stores.find((s) => s.id === storeId) ?? stores.find((s) => s.id === DEFAULT_STORE_ID);
  const chain = found?.retail_chain ?? 'novus';
  const info: StoreInfo = {
    id: found?.id ?? storeId,
    chain,
    name: found?.name ?? chain,
    home: `https://${chain}.zakaz.ua/`,
    searchBase: `https://${chain}.zakaz.ua/uk/search/`,
  };
  return store(cacheKey, info);
}

// ── Ingredient categories ───────────────────────────────────
// Coarse food departments used to keep matches honest: a raw ingredient must
// come from the right Zakaz department, so "potato" can't match potato chips
// and "apple" can't match apple-flavoured yogurt. Each category maps to
// substrings matched against the product's category_id / parent_category_id
// (ids are chain-suffixed, e.g. "apples-novus", hence substrings).
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

// Hint sets cover every supported chain's naming: Novus/Varus-style
// (tins-jars-cooking, packets-cereals, snacks-and-sweets), Metro-style
// (canned-food-oil-vinegar-metro) and Auchan-style (canned-food-auchan,
// grocery-and-sweets-auchan, sweets-and-snacks-auchan).
const CATEGORY_HINTS: Record<IngredientCategory, string[]> = {
  produce: ['fruits-and-vegetables'],
  meat: ['meat'],
  fish: ['fish', 'seafood'],
  dairy_eggs: ['dairy', 'eggs'],
  grains_pasta: ['packets-cereals', 'health-and-lifestyle', 'grocery'],
  bakery: ['bakery', 'bread'],
  oils_sauces: ['sauces-and-spices', 'packets-cereals', 'oil', 'grocery'],
  canned: ['tins-jars', 'canned', 'packets-cereals', 'grocery'],
  frozen: ['frozen'],
  drinks: ['drinks', 'water'],
  sweets_snacks: ['snacks-and-sweets', 'sweets-and-snacks', 'crisps-and-snacks'],
  other: [],
};

// ── EN → UK translation for catalog search ──────────────────
// Common meal-plan ingredients → Ukrainian query + category, so the dictionary
// alone covers a typical plan even with no LLM configured.
type QueryPlan = { query: string; category?: IngredientCategory };

const DICTIONARY: Record<string, QueryPlan> = {
  chicken: { query: 'куряче філе', category: 'meat' },
  'chicken breast': { query: 'куряче філе', category: 'meat' },
  'chicken fillet': { query: 'куряче філе', category: 'meat' },
  beef: { query: 'яловичина', category: 'meat' },
  pork: { query: 'свинина', category: 'meat' },
  turkey: { query: 'філе індички', category: 'meat' },
  fish: { query: 'риба', category: 'fish' },
  salmon: { query: 'лосось', category: 'fish' },
  tuna: { query: 'тунець', category: 'fish' },
  egg: { query: 'яйця', category: 'dairy_eggs' },
  eggs: { query: 'яйця', category: 'dairy_eggs' },
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

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[.,;:!?]+$/, '').trim();
}

export function fromDictionary(name: string): QueryPlan | undefined {
  const n = normalize(name);
  if (DICTIONARY[n]) return DICTIONARY[n];
  for (const key of Object.keys(DICTIONARY)) {
    if (n.includes(key)) return DICTIONARY[key];
  }
  return undefined;
}

async function translateBatch(names: string[]): Promise<Record<string, QueryPlan>> {
  const baseUrl = process.env.LITELLM_BASE_URL;
  const apiKey = process.env.LITELLM_API_KEY;
  const model = process.env.LITELLM_MODEL;
  if (!baseUrl || !apiKey || !model) return {};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You translate grocery item names from English to Ukrainian for a supermarket ' +
              'catalog search. Reply with JSON only: {"items": [{"uk": "Ukrainian search term", ' +
              '"cat": "food category"}, ...]} in the same order as the input. Use singular ' +
              'common nouns, no quantities, no brands. Prefer the bare product noun — drop ' +
              'preparation adjectives like "заморожений"/"консервований"/"сушений" (they break ' +
              'the catalog search; "cat" conveys the department). "cat" must be one of: ' +
              INGREDIENT_CATEGORIES.join(', ') +
              '. Pick the department where the item AS NAMED is sold (potato → produce, ' +
              'canned corn → canned, frozen berries → frozen, yogurt → dairy_eggs); ' +
              'use "other" when unsure.',
          },
          { role: 'user', content: JSON.stringify({ en: names }) },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return {};
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return {};
    const parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    const items: unknown = parsed?.items;
    if (!Array.isArray(items) || items.length !== names.length) return {};
    const map: Record<string, QueryPlan> = {};
    names.forEach((name, i) => {
      const item = items[i] as { uk?: unknown; cat?: unknown };
      const uk = typeof item?.uk === 'string' ? item.uk.trim() : '';
      if (!uk) return;
      const cat = INGREDIENT_CATEGORIES.find((c) => c === item?.cat);
      map[name] = { query: uk, category: cat };
    });
    return map;
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

// Resolve a Ukrainian query + category per item: LLM → dictionary → raw English.
// The dictionary backfills the category when the LLM omits or fumbles it.
async function resolveQueries(names: string[]): Promise<Record<string, QueryPlan>> {
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

// ── Product search ──────────────────────────────────────────
export type RawProduct = {
  ean?: string;
  title?: string;
  price?: number;
  weight?: number | null;
  in_stock?: boolean;
  available_for_cart?: boolean;
  web_url?: string;
  img?: { s350x350?: string; s150x150?: string } | null;
  category_id?: string;
  parent_category_id?: string;
};

const MAX_CANDIDATES = 8;

// Ukrainian catalog titles lead with the product type ("Рис Aro…",
// "Борошно … рисове"), so a title whose first word is a query word almost
// certainly IS the queried product, not a derivative. Used to rank, never to
// filter.
export function titleLeadsWithQuery(title: string | undefined, query: string): boolean {
  const first = (title ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (first.length < 3) return false;
  return query
    .toLowerCase()
    .split(/\s+/)
    .some((w) => w.length >= 3 && (first.startsWith(w) || w.startsWith(first)));
}

// Orderable candidates from the expected department: title-leading matches
// first, then search-relevance order (stable sort). When the category is known
// but nothing in the results belongs to it, return none: an unmatched line
// with a search link beats a confident wrong product (potato → chips, apple →
// apple-flavoured yogurt).
export function topCandidates(
  results: RawProduct[],
  category?: IngredientCategory,
  limit = MAX_CANDIDATES,
  query = ''
): RawProduct[] {
  let candidates = results.filter((r) => r.available_for_cart && r.in_stock && r.web_url);

  const hints = category ? CATEGORY_HINTS[category] : [];
  if (hints.length > 0) {
    candidates = candidates.filter((r) => {
      const ids = `${r.category_id ?? ''} ${r.parent_category_id ?? ''}`;
      return hints.some((h) => ids.includes(h));
    });
  }

  if (query) {
    candidates = candidates
      .map((r, i) => ({ r, i, lead: titleLeadsWithQuery(r.title, query) }))
      .sort((a, b) => Number(b.lead) - Number(a.lead) || a.i - b.i)
      .map((x) => x.r);
  }
  return candidates.slice(0, limit);
}

export function pickProduct(
  results: RawProduct[],
  category?: IngredientCategory
): RawProduct | null {
  return topCandidates(results, category, 1)[0] ?? null;
}

const MAX_EXTRAS = 3;

// The category comes from an LLM and can misfire ("canned corn" classified as
// produce while the store shelves it under tins-jars). So the pool is
// in-department candidates first, then a few top unfiltered extras — extras
// are only ever accepted through the LLM choice step, never by default.
// `inCategoryCount` marks the boundary.
export function collectCandidates(
  results: RawProduct[],
  category?: IngredientCategory,
  query = ''
): { picks: RawProduct[]; inCategoryCount: number } {
  const inCat = topCandidates(results, category, MAX_CANDIDATES, query);
  if (!category || category === 'other') {
    return { picks: inCat, inCategoryCount: inCat.length };
  }
  const seen = new Set(inCat.map((r) => r.ean ?? r.web_url));
  const extras = topCandidates(results, undefined, MAX_CANDIDATES + MAX_EXTRAS, query)
    .filter((r) => !seen.has(r.ean ?? r.web_url))
    .slice(0, MAX_EXTRAS);
  return { picks: [...inCat, ...extras], inCategoryCount: inCat.length };
}

type SearchOutcome = { products: ZakazProduct[]; inCategoryCount: number };

async function fetchResults(storeId: string, query: string): Promise<RawProduct[]> {
  const url = `${API_BASE}/stores/${storeId}/products/search/?q=${encodeURIComponent(query)}`;
  const data = (await getJson(url)) as { results?: RawProduct[] };
  return data.results ?? [];
}

async function searchCandidates(
  storeId: string,
  uaQuery: string,
  category?: IngredientCategory
): Promise<SearchOutcome> {
  const cacheKey = `search:${storeId}:${category ?? ''}:${uaQuery.toLowerCase()}`;
  const hit = cached<SearchOutcome>(cacheKey);
  if (hit !== undefined) return hit;

  let results: RawProduct[];
  try {
    results = await fetchResults(storeId, uaQuery);

    // Zakaz search chokes on some multiword phrases ("горошок заморожений" →
    // 0 hits although the product exists). If nothing orderable came back,
    // retry per word and merge — the category filter disambiguates from there.
    if (topCandidates(results, undefined, 1).length === 0) {
      const words = uaQuery.split(/\s+/).filter((w) => w.length >= 4);
      if (words.length >= 2) {
        const pools = await Promise.all(
          words.map((w) => fetchResults(storeId, w).catch((): RawProduct[] => []))
        );
        const seen = new Set<string>();
        results = pools.flat().filter((r) => {
          const key = r.ean ?? r.web_url ?? '';
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
    }
  } catch {
    return store(cacheKey, { products: [], inCategoryCount: 0 });
  }

  const { picks, inCategoryCount } = collectCandidates(results, category, uaQuery);
  const products = picks.map(
    (pick): ZakazProduct => ({
      ean: pick.ean ?? '',
      title: pick.title ?? uaQuery,
      priceKop: typeof pick.price === 'number' ? pick.price : 0,
      weightG: typeof pick.weight === 'number' ? pick.weight : null,
      img: pick.img?.s350x350 ?? pick.img?.s150x150 ?? null,
      webUrl: pick.web_url!,
      inStock: pick.in_stock ?? false,
    })
  );
  return store(cacheKey, { products, inCategoryCount });
}

// ── LLM candidate choice ────────────────────────────────────
// When search returns several in-department variants (plain rice vs jasmine vs
// rice-in-a-box), one batched LLM call picks the variant that best fits the
// recipe ingredient. Order-based: picks[i] indexes items[i].candidates, -1 = none fits.

type ChoiceItem = {
  name: string;
  grams: number;
  candidates: ZakazProduct[];
  inCategoryCount: number;
};

export function parsePicks(parsed: unknown, candidateCounts: number[]): number[] | null {
  const picks = (parsed as { picks?: unknown })?.picks;
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

async function chooseCandidates(items: ChoiceItem[]): Promise<Record<string, number>> {
  const baseUrl = process.env.LITELLM_BASE_URL;
  const apiKey = process.env.LITELLM_API_KEY;
  const model = process.env.LITELLM_MODEL;
  if (!baseUrl || !apiKey || !model || items.length === 0) return {};

  const payload = items.map((item) => ({
    ingredient: item.name,
    needed_grams: item.grams || undefined,
    candidates: item.candidates.map((c, i) => ({
      i,
      title: c.title,
      weight_g: c.weightG ?? undefined,
      price_uah: Math.round(c.priceKop) / 100,
      out_of_dept: i >= item.inCategoryCount || undefined,
    })),
  }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You pick supermarket products for recipe ingredients. For each item you get the ' +
              'English ingredient name and candidate products (Ukrainian titles). Reply with JSON ' +
              'only: {"picks": [one candidate index per item, same order]}. Choose the plain, ' +
              'unflavoured, unprocessed variant closest to the raw ingredient, preferring a pack ' +
              'size near needed_grams and a sensible price. Use -1 only if no candidate is really ' +
              'that ingredient. Candidates marked out_of_dept come from outside the expected ' +
              'store department — pick one only when its title clearly IS the ingredient ' +
              '(never a flavoured, candy, or processed lookalike).',
          },
          { role: 'user', content: JSON.stringify({ items: payload }) },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return {};
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return {};
    const parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    const picks = parsePicks(parsed, items.map((it) => it.candidates.length));
    if (!picks) return {};
    const map: Record<string, number> = {};
    items.forEach((item, i) => {
      map[item.name] = picks[i];
    });
    return map;
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

function suggestQuantity(neededGrams: number, weightG: number | null): number {
  if (neededGrams > 0 && weightG && weightG > 0) {
    return Math.min(20, Math.max(1, Math.ceil(neededGrams / weightG)));
  }
  return 1;
}

// ── Public entry point ──────────────────────────────────────
export async function buildCart(items: OrderItem[], storeId?: string): Promise<ZakazCart> {
  const info = await resolveStore(storeId ?? DEFAULT_STORE_ID);
  const names = items.map((i) => i.name);
  const queries = await resolveQueries(names);

  const outcomes = await Promise.all(
    items.map((item) => {
      const { query: uaQuery, category } = queries[item.name];
      return searchCandidates(info.id, uaQuery, category);
    })
  );

  // One LLM pass over items with a real choice to make: several variants, or
  // out-of-department candidates that need vetting. Everything else keeps the
  // top search hit. On LLM failure `picks` is empty → defaults below.
  const picks = await chooseCandidates(
    items
      .map(
        (item, i): ChoiceItem => ({
          name: item.name,
          grams: item.grams,
          candidates: outcomes[i].products,
          inCategoryCount: outcomes[i].inCategoryCount,
        })
      )
      .filter((c) => c.candidates.length > 1 || (c.inCategoryCount === 0 && c.candidates.length > 0))
  );

  const lines: CartLine[] = items.map((item, i): CartLine => {
    const { query: uaQuery } = queries[item.name];
    const { products: candidates, inCategoryCount } = outcomes[i];
    const pick = picks[item.name];
    // No LLM verdict → trust the top hit only when it passed the category
    // filter; unvetted out-of-department candidates stay unmatched.
    const product =
      (pick === undefined
        ? inCategoryCount > 0
          ? candidates[0]
          : null
        : pick === -1
          ? null
          : candidates[pick]) ?? null;
    return {
      query: item.name,
      neededGrams: item.grams,
      product,
      quantity: suggestQuantity(item.grams, product?.weightG ?? null),
      searchUrl: `${info.searchBase}?q=${encodeURIComponent(uaQuery)}`,
    };
  });

  const matched = lines.filter((l) => l.product);
  return {
    store: info,
    lines,
    matchedCount: matched.length,
    totalKop: matched.reduce((sum, l) => sum + l.product!.priceKop * l.quantity, 0),
  };
}
