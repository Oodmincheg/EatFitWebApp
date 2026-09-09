import type { SilpoCart, SilpoCartLine, SilpoProduct, SilpoCommitBody } from '../schemas';
import { parseDisplayRatio } from './quantity';

export function lineStep(line: SilpoCartLine): number {
  return line.product?.weighted ? line.product.step || 0.1 : 1;
}

export function lineMax(line: SilpoCartLine): number {
  const p = line.product;
  if (!p) return 0;
  if (p.weighted) {
    const step = lineStep(line);
    return Math.min(20, Math.max(step, Math.floor(p.stock / step) * step));
  }
  return Math.min(20, Math.max(1, Math.floor(p.stock)));
}


export function purchasedGrams(product: SilpoProduct, quantity: number): number | null {
  if (product.weighted) return Math.round(quantity * 1000);
  // A volume or piece count cannot establish weight without density or unit mass.
  if (!product.displayRatio || /л|шт/i.test(product.displayRatio)) return null;
  const { grams } = parseDisplayRatio(product.displayRatio);
  return grams ? Math.round(grams * quantity) : null;
}

export function commitLines(lines: SilpoCartLine[], quantities: Record<string, number>): SilpoCommitBody['lines'] {
  const grouped = new Map<string, SilpoCommitBody['lines'][number]>();
  for (const line of lines) {
    const p = line.product;
    const quantity = quantities[line.query] ?? 0;
    if (!p || quantity <= 0) continue;
    const key = JSON.stringify([p.companyId, p.branchId, p.productId]);
    const previous = grouped.get(key);
    grouped.set(key, { productId: p.productId, companyId: p.companyId, branchId: p.branchId,
      quantity: Math.round(((previous?.quantity ?? 0) + quantity) * 1000) / 1000 });
  }
  return [...grouped.values()];
}

export function exceedsStock(lines: SilpoCartLine[], quantities: Record<string, number>): boolean {
  return commitLines(lines, quantities).some((entry) => lines.some(({ product }) =>
    product && product.productId === entry.productId && product.companyId === entry.companyId &&
    product.branchId === entry.branchId && entry.quantity > product.stock + 1e-9));
}

export function updateReviewCart(cart: SilpoCart, quantities: Record<string, number>): SilpoCart {
  const lines = cart.lines.map((line) => {
    const quantity = line.product ? quantities[line.query] ?? 0 : 0;
    return { ...line, quantity, lineTotal: Math.round((line.product?.price ?? 0) * quantity * 100) / 100 };
  });
  return {
    ...cart,
    lines,
    matchedCount: lines.filter((line) => line.product).length,
    total: Math.round(lines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100,
  };
}
