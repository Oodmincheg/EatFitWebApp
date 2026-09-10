import type { PantryItem } from '../schemas';

// Pure: shared by the server-side matching (which sizes the order) and by
// the cart UI (which turns a committed line into a pantry row).

// displayRatio is the content of one unit: "400г", "1,5кг", "10шт", "0,75л",
// "5*80г/уп".
export function parseDisplayRatio(ratio: string | null | undefined): { grams?: number; count?: number } {
  if (!ratio) return {};
  const s = ratio.toLowerCase().replace(/,/g, '.').replace(/\s+/g, '');
  const multi = s.match(/^(\d+(?:\.\d+)?)[*x×](\d+(?:\.\d+)?)(кг|г|л|мл)/);
  if (multi) return { grams: Number(multi[1]) * toGrams(Number(multi[2]), multi[3]) };
  const single = s.match(/^(\d+(?:\.\d+)?)(кг|г|л|мл)/);
  if (single) return { grams: toGrams(Number(single[1]), single[2]) };
  const count = s.match(/^(\d+)шт/);
  if (count) return { count: Number(count[1]) };
  return {};
}

function toGrams(n: number, unit: string): number {
  return unit === 'кг' || unit === 'л' ? n * 1000 : n;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

// What a committed cart line actually brings home. Weighted goods are ordered
// in kilograms; a pack multiplies its whole stated content by how many packs
// were taken. A pack whose content cannot be read stays an explicit count of
// packs rather than a guessed weight.
export function purchasedPantryItem(
  name: string,
  product: { weighted: boolean; displayRatio: string | null },
  quantity: number
): PantryItem {
  if (product.weighted) return { name, amount: round3(quantity), unit: 'kg' };
  const { grams, count } = parseDisplayRatio(product.displayRatio);
  if (grams) return { name, amount: round3(grams * quantity), unit: 'g' };
  if (count) return { name, amount: round3(count * quantity), unit: 'pc' };
  return { name, amount: quantity, unit: 'pc' };
}
