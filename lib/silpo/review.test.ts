import { describe, expect, it } from 'vitest';
import type { SilpoCart, SilpoCartLine, SilpoProduct } from '../schemas';
import { commitLines, exceedsStock, purchasedGrams, updateReviewCart } from './review';

const rice: SilpoProduct = {
  productId: 'rice', companyId: 'silpo', branchId: 'store', slug: 'rice', title: 'Рис',
  price: 60, oldPrice: null, weighted: false, step: 1, displayRatio: '500г',
  stock: 10, img: null, webUrl: 'https://silpo.ua/product/rice',
};
function line(query: string, product: SilpoProduct | null = rice): SilpoCartLine {
  return { query, uaQuery: query, product, neededGrams: 300, quantity: 1, lineTotal: 60 };
}

describe('purchasedGrams', () => {
  it('explains actual weighted quantities and multipacks', () => {
    expect(purchasedGrams({ ...rice, weighted: true }, 0.55)).toBe(550);
    expect(purchasedGrams(rice, 2)).toBe(1000);
    expect(purchasedGrams({ ...rice, displayRatio: '5*80г/уп' }, 2)).toBe(800);
    expect(purchasedGrams(rice, 0)).toBe(0);
  });
  it('does not claim a weight for volume, pieces or missing pack sizes', () => {
    for (const displayRatio of ['0,75л', '330мл', '10шт', null, 'упаковка']) {
      expect(purchasedGrams({ ...rice, displayRatio }, 1)).toBeNull();
    }
  });
});

describe('commitLines', () => {
  it('adds quantities when different ingredients select the same product', () => {
    expect(commitLines([line('rice'), line('brown rice')], { rice: 2, 'brown rice': 3 }))
      .toEqual([{ productId: 'rice', companyId: 'silpo', branchId: 'store', quantity: 5 }]);
  });
  it('leaves out removed and unmatched items and separates stores', () => {
    expect(commitLines([line('removed'), line('missing', null), line('rice'),
      line('other', { ...rice, branchId: 'other' })], { removed: 0, missing: 1, rice: 1, other: 2 }))
      .toHaveLength(2);
  });
  it('sums weighted quantities without floating-point artifacts', () => {
    expect(commitLines([line('a'), line('b')], { a: 0.1, b: 0.2 })[0].quantity).toBe(0.3);
  });
});

describe('exceedsStock', () => {
  it('checks shared stock after grouping identical selected products', () => {
    const lines = [line('a'), line('b')];
    expect(exceedsStock(lines, { a: 6, b: 5 })).toBe(true);
    expect(exceedsStock(lines, { a: 6, b: 4 })).toBe(false);
    expect(exceedsStock(lines, { a: 6, b: 0 })).toBe(false);
  });
});

describe('updateReviewCart', () => {
  const cart: SilpoCart = {
    cartId: 'cart', branchId: 'store', deliveryType: 'delivery',
    timeslot: { start: '2026-09-10T10:00:00Z', end: '2026-09-10T12:00:00Z', stale: false },
    delivery: { minOrderCost: 0, deliveryCost: null },
    lines: [line('rice'), line('missing', null)], matchedCount: 1, total: 60,
  };

  it('keeps totals in sync when quantity changes, an item is removed and restored', () => {
    const increased = updateReviewCart(cart, { rice: 3 });
    expect(increased.total).toBe(180);
    expect(increased.lines[0].lineTotal).toBe(180);
    const removed = updateReviewCart(increased, { rice: 0 });
    expect(removed.total).toBe(0);
    expect(removed.lines[0].quantity).toBe(0);
    expect(removed.matchedCount).toBe(1);
    expect(updateReviewCart(removed, { rice: 2 }).total).toBe(120);
    expect(cart.total).toBe(60);
  });

  it('recomputes price and matched count after a manual replacement', () => {
    const replaced = updateReviewCart({ ...cart, lines: [line('rice'),
      line('missing', { ...rice, productId: 'other-rice', price: 33.49 })] },
    { rice: 2, missing: 3 });
    expect(replaced.matchedCount).toBe(2);
    expect(replaced.lines[1].lineTotal).toBe(100.47);
    expect(replaced.total).toBe(220.47);
  });
});
