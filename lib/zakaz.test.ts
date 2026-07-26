import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  collectCandidates,
  fromDictionary,
  parsePicks,
  pickProduct,
  titleLeadsWithQuery,
  topCandidates,
  type RawProduct,
} from './zakaz';

function raw(over: Partial<RawProduct>): RawProduct {
  return {
    ean: '123',
    title: 'x',
    price: 100,
    in_stock: true,
    available_for_cart: true,
    web_url: 'https://novus.zakaz.ua/uk/products/x/',
    ...over,
  };
}

describe('pickProduct', () => {
  const chips = raw({
    title: 'Чіпси Lay’s картопляні 120г',
    category_id: 'crisps',
    parent_category_id: 'crisps-and-snacks',
  });
  const potato = raw({
    title: 'Картопля молода',
    category_id: 'fresh-potatoes',
    parent_category_id: 'fruits-and-vegetables',
  });
  const appleYogurt = raw({
    title: 'Йогурт зі смаком яблука',
    category_id: 'yogurts',
    parent_category_id: 'dairy-and-eggs',
  });

  it('skips off-category products ranked first', () => {
    expect(pickProduct([chips, potato], 'produce')).toBe(potato);
  });

  it('returns null when the expected category is absent, not a wrong product', () => {
    expect(pickProduct([chips, appleYogurt], 'produce')).toBeNull();
  });

  it('falls back to first orderable result when category is unknown', () => {
    expect(pickProduct([chips, potato], undefined)).toBe(chips);
    expect(pickProduct([chips, potato], 'other')).toBe(chips);
  });

  it('still enforces stock and cart availability', () => {
    const outOfStock = raw({ ...potato, in_stock: false });
    expect(pickProduct([outOfStock], 'produce')).toBeNull();
    const noUrl = raw({ ...potato, web_url: undefined });
    expect(pickProduct([noUrl], 'produce')).toBeNull();
  });

  it('matches divergent per-chain taxonomies for canned goods', () => {
    const metroTuna = raw({
      title: 'Тунець Calvo у власному соку 160г',
      category_id: 'tuna-metro',
      parent_category_id: 'canned-food-oil-vinegar-metro',
    });
    const auchanCorn = raw({
      title: 'Кукурудза Bonduelle 340г',
      category_id: 'canned-corn-auchan',
      parent_category_id: 'canned-food-auchan',
    });
    expect(pickProduct([metroTuna], 'canned')).toBe(metroTuna);
    expect(pickProduct([auchanCorn], 'canned')).toBe(auchanCorn);
  });

  it('matches chain-suffixed category ids by substring', () => {
    const novusApple = raw({
      title: 'Яблуко Муцу',
      category_id: 'apples-novus',
      parent_category_id: 'fruits-and-vegetables',
    });
    expect(pickProduct([appleYogurt, novusApple], 'produce')).toBe(novusApple);
  });
});

describe('topCandidates', () => {
  const rice = (title: string) =>
    raw({ title, category_id: 'groats', parent_category_id: 'packets-cereals' });

  it('returns all in-department candidates in search order, capped by limit', () => {
    const variants = ['Рис круглий', 'Рис жасмин', 'Рис басмати', 'Рис пропарений'].map(rice);
    const offCat = raw({
      title: 'Чіпси рисові',
      category_id: 'crisps',
      parent_category_id: 'crisps-and-snacks',
    });
    expect(topCandidates([offCat, ...variants], 'grains_pasta')).toEqual(variants);
    expect(topCandidates([offCat, ...variants], 'grains_pasta', 2)).toEqual(variants.slice(0, 2));
  });

  it('drops unorderable products before ranking', () => {
    const soldOut = raw({ ...rice('Рис круглий'), in_stock: false });
    const ok = rice('Рис жасмин');
    expect(topCandidates([soldOut, ok], 'grains_pasta')).toEqual([ok]);
  });
});

describe('titleLeadsWithQuery', () => {
  it('matches when the title leads with a query word (prefix both ways)', () => {
    expect(titleLeadsWithQuery('Рис Aro довгозернистий 1кг', 'рис')).toBe(true);
    expect(titleLeadsWithQuery('Яблуко Муцу', 'яблука')).toBe(false);
    expect(titleLeadsWithQuery('Яблука сушені', 'яблука')).toBe(true);
    expect(titleLeadsWithQuery('Філе куряче охолоджене', 'куряче філе')).toBe(true);
  });

  it('rejects derivative products that mention the query later in the title', () => {
    expect(titleLeadsWithQuery('Борошно Metro Chef рисове 1кг', 'рис')).toBe(false);
    expect(titleLeadsWithQuery('Локшина рисова плоска 600г', 'рис')).toBe(false);
  });
});

describe('topCandidates title ranking', () => {
  const grocery = (title: string, ean: string) =>
    raw({ title, ean, category_id: 'rice', parent_category_id: 'packets-cereals-metro' });

  it('ranks products leading with the query above in-department derivatives', () => {
    // Metro relevance puts rice flour and noodles ahead of actual rice.
    const flour = grocery('Борошно Metro Chef рисове 1кг', 'f1');
    const noodles = grocery('Локшина рисова плоска 600г', 'n1');
    const rice = grocery('Рис Aro довгозернистий 1кг', 'r1');
    expect(topCandidates([flour, noodles, rice], 'grains_pasta', 8, 'рис')).toEqual([
      rice,
      flour,
      noodles,
    ]);
  });

  it('keeps search-relevance order within each rank', () => {
    const rice1 = grocery('Рис круглий', 'r1');
    const rice2 = grocery('Рис жасмин', 'r2');
    expect(topCandidates([rice1, rice2], 'grains_pasta', 8, 'рис')).toEqual([rice1, rice2]);
  });
});

describe('collectCandidates', () => {
  const cannedCorn = raw({
    ean: 'corn-1',
    title: 'Кукурудза Верес цукрова 340г',
    category_id: 'canned-corn',
    parent_category_id: 'tins-jars-cooking',
  });
  const freshTomato = raw({
    ean: 'tomato-1',
    title: 'Помідори сливка',
    category_id: 'fresh-tomatoes',
    parent_category_id: 'fruits-and-vegetables',
  });

  it('puts in-department candidates first, then unfiltered extras past inCategoryCount', () => {
    expect(collectCandidates([cannedCorn, freshTomato], 'produce')).toEqual({
      picks: [freshTomato, cannedCorn],
      inCategoryCount: 1,
    });
  });

  it('keeps out-of-department candidates reachable when the category misfires', () => {
    // "canned corn" categorized as produce, but the store shelves it under tins-jars.
    expect(collectCandidates([cannedCorn], 'produce')).toEqual({
      picks: [cannedCorn],
      inCategoryCount: 0,
    });
  });

  it('does not duplicate in-department candidates into the extras', () => {
    const { picks, inCategoryCount } = collectCandidates([freshTomato, freshTomato], 'produce');
    expect(inCategoryCount).toBe(2);
    expect(picks).toHaveLength(2);
  });

  it('returns empty when nothing is orderable at all', () => {
    const soldOut = raw({ ...cannedCorn, in_stock: false });
    expect(collectCandidates([soldOut], 'produce')).toEqual({ picks: [], inCategoryCount: 0 });
  });

  it('treats everything as in-department for unknown/other categories', () => {
    expect(collectCandidates([cannedCorn], 'other')).toEqual({
      picks: [cannedCorn],
      inCategoryCount: 1,
    });
    expect(collectCandidates([cannedCorn], undefined)).toEqual({
      picks: [cannedCorn],
      inCategoryCount: 1,
    });
  });
});

describe('parsePicks', () => {
  it('accepts indices within each item candidate range, including -1', () => {
    expect(parsePicks({ picks: [2, -1, 0] }, [3, 2, 1])).toEqual([2, -1, 0]);
  });

  it('rejects wrong length, out-of-range, and non-integer picks', () => {
    expect(parsePicks({ picks: [0] }, [3, 2])).toBeNull();
    expect(parsePicks({ picks: [3, 0] }, [3, 2])).toBeNull();
    expect(parsePicks({ picks: [-2, 0] }, [3, 2])).toBeNull();
    expect(parsePicks({ picks: [0.5, 0] }, [3, 2])).toBeNull();
    expect(parsePicks({ picks: ['0', 0] }, [3, 2])).toBeNull();
    expect(parsePicks({}, [1])).toBeNull();
  });
});

describe('fromDictionary', () => {
  it('returns query and category for known items', () => {
    expect(fromDictionary('potato')).toEqual({ query: 'картопля', category: 'produce' });
    expect(fromDictionary('Apple')).toEqual({ query: 'яблука', category: 'produce' });
  });

  it('matches by substring for compound names', () => {
    expect(fromDictionary('fresh chicken breast')?.category).toBe('meat');
  });

  it('returns undefined for unknown items', () => {
    expect(fromDictionary('dragonfruit jam')).toBeUndefined();
  });
});
