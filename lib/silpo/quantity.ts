// ── Quantity ────────────────────────────────────────────────
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

// Weighted goods: quantity is kilograms in `step` increments, price per kg.
// Piece goods: quantity is packs; displayRatio says what one pack holds.
export function suggestQuantity(
  neededGrams: number,
  product: { weighted: boolean; step: number; displayRatio: string | null; stock: number }
): number {
  if (product.weighted) {
    const step = product.step > 0 ? product.step : 0.1;
    const wanted = neededGrams > 0 ? neededGrams / 1000 : step;
    let q = Math.min(20, Math.max(step, Math.ceil(wanted / step - 1e-9) * step));
    if (product.stock > 0) q = Math.min(q, Math.max(step, Math.floor(product.stock / step) * step));
    return Math.round(q * 1000) / 1000;
  }
  const { grams } = parseDisplayRatio(product.displayRatio);
  let q = neededGrams > 0 && grams ? Math.ceil(neededGrams / grams) : 1;
  q = Math.min(20, Math.max(1, q));
  if (product.stock > 0) q = Math.min(q, Math.max(1, Math.floor(product.stock)));
  return q;
}
