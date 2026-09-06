import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { fromDictionary, parseDisplayRatio, parsePicks, suggestQuantity } from './match';

describe('fromDictionary', () => {
  it('maps exact and partial English names to Ukrainian queries', () => {
    expect(fromDictionary('chicken breast')).toEqual({ query: 'куряче філе', category: 'meat' });
    expect(fromDictionary('Tomatoes,')?.query).toBe('помідори');
    expect(fromDictionary('boneless chicken thighs')?.category).toBe('meat');
    expect(fromDictionary('saffron')).toBeUndefined();
  });
});

describe('parseDisplayRatio', () => {
  it('reads grams, kilograms, litres, multipacks and piece counts', () => {
    expect(parseDisplayRatio('400г')).toEqual({ grams: 400 });
    expect(parseDisplayRatio('1,5кг')).toEqual({ grams: 1500 });
    expect(parseDisplayRatio('0,75л')).toEqual({ grams: 750 });
    expect(parseDisplayRatio('330мл')).toEqual({ grams: 330 });
    expect(parseDisplayRatio('5*80г/уп')).toEqual({ grams: 400 });
    expect(parseDisplayRatio('10шт')).toEqual({ count: 10 });
    expect(parseDisplayRatio(null)).toEqual({});
    expect(parseDisplayRatio('100г')).toEqual({ grams: 100 });
  });
});

describe('suggestQuantity', () => {
  it('rounds weighted goods up to the next step in kilograms', () => {
    const fillet = { weighted: true, step: 0.5, displayRatio: '100г', stock: 291.5 };
    expect(suggestQuantity(900, fillet)).toBe(1);
    expect(suggestQuantity(1200, fillet)).toBe(1.5);
    expect(suggestQuantity(0, fillet)).toBe(0.5);
    expect(suggestQuantity(200, { ...fillet, step: 0.25 })).toBe(0.25);
  });

  it('caps weighted quantity at the stock in whole steps', () => {
    expect(suggestQuantity(5000, { weighted: true, step: 0.5, displayRatio: null, stock: 1.7 })).toBe(1.5);
  });

  it('counts packs for piece goods from the pack content', () => {
    const rice = { weighted: false, step: 1, displayRatio: '500г', stock: 13 };
    expect(suggestQuantity(1200, rice)).toBe(3);
    expect(suggestQuantity(400, rice)).toBe(1);
    expect(suggestQuantity(0, rice)).toBe(1);
  });

  it('defaults to one pack when the content is a piece count or unknown', () => {
    expect(suggestQuantity(300, { weighted: false, step: 1, displayRatio: '10шт', stock: 13 })).toBe(1);
    expect(suggestQuantity(300, { weighted: false, step: 1, displayRatio: null, stock: 13 })).toBe(1);
  });

  it('never exceeds stock or 20 packs', () => {
    expect(suggestQuantity(9000, { weighted: false, step: 1, displayRatio: '100г', stock: 2 })).toBe(2);
    expect(suggestQuantity(9000, { weighted: false, step: 1, displayRatio: '100г', stock: 100 })).toBe(20);
  });
});

describe('parsePicks', () => {
  it('accepts one in-range index (or -1) per item', () => {
    expect(parsePicks({ picks: [0, -1, 2] }, [3, 1, 3])).toEqual([0, -1, 2]);
  });

  it('rejects wrong length, out-of-range and non-integer picks', () => {
    expect(parsePicks({ picks: [0] }, [3, 1])).toBeNull();
    expect(parsePicks({ picks: [3] }, [3])).toBeNull();
    expect(parsePicks({ picks: [-2] }, [3])).toBeNull();
    expect(parsePicks({ picks: [0.5] }, [3])).toBeNull();
    expect(parsePicks(null, [1])).toBeNull();
  });
});
