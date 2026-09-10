import { describe, expect, it } from 'vitest';
import { mergePantry, parsePantryText, replenishPantry } from './pantry';

describe('parsePantryText', () => {
  it('splits on commas, semicolons and newlines, dropping duplicates', () => {
    expect(parsePantryText('молоко, гречка; молоко\nяйця')).toEqual([
      { name: 'молоко' },
      { name: 'гречка' },
      { name: 'яйця' },
    ]);
  });
});

describe('mergePantry', () => {
  it('appends only names that are new, keeping existing amounts', () => {
    const out = mergePantry(
      [{ name: 'рис', amount: 100, unit: 'g' }],
      [{ name: 'рис' }, { name: 'гречка' }]
    );
    expect(out).toEqual([{ name: 'рис', amount: 100, unit: 'g' }, { name: 'гречка' }]);
  });
});

describe('replenishPantry', () => {
  it('adds a bought amount to what is already there, in the existing unit', () => {
    const out = replenishPantry(
      [{ name: 'рис', amount: 100, unit: 'g' }],
      [{ name: 'рис', amount: 0.4, unit: 'kg' }]
    );
    expect(out).toEqual([{ name: 'рис', amount: 500, unit: 'g' }]);
  });

  it('keeps kilograms as kilograms', () => {
    const out = replenishPantry(
      [{ name: 'рис', amount: 1, unit: 'kg' }],
      [{ name: 'рис', amount: 500, unit: 'g' }]
    );
    expect(out).toEqual([{ name: 'рис', amount: 1.5, unit: 'kg' }]);
  });

  it('sums pieces', () => {
    const out = replenishPantry(
      [{ name: 'яйця', amount: 4, unit: 'pc' }],
      [{ name: 'яйця', amount: 10, unit: 'pc' }]
    );
    expect(out).toEqual([{ name: 'яйця', amount: 14, unit: 'pc' }]);
  });

  it('falls back to an explicit unknown when the units cannot be combined', () => {
    expect(
      replenishPantry([{ name: 'рис', amount: 100, unit: 'g' }], [{ name: 'рис', amount: 2, unit: 'pc' }])
    ).toEqual([{ name: 'рис' }]);
    expect(
      replenishPantry([{ name: 'рис', amount: 100, unit: 'g' }], [{ name: 'рис' }])
    ).toEqual([{ name: 'рис' }]);
  });

  it('appends groceries the pantry did not have', () => {
    const out = replenishPantry([{ name: 'рис' }], [{ name: 'лосось', amount: 0.6, unit: 'kg' }]);
    expect(out).toEqual([{ name: 'рис' }, { name: 'лосось', amount: 0.6, unit: 'kg' }]);
  });
});
