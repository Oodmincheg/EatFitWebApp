import { describe, expect, it } from 'vitest';
import { num, optNum } from './num';

describe('num', () => {
  it('reads both decimal separators', () => {
    expect(num('1.5')).toBe(1.5);
    expect(num('1,5')).toBe(1.5);
  });

  it('is zero for blank, negative and unparseable input', () => {
    expect(num('')).toBe(0);
    expect(num('   ')).toBe(0);
    expect(num('-3')).toBe(0);
    expect(num('abc')).toBe(0);
  });
});

describe('optNum', () => {
  it('keeps a blank field absent', () => {
    expect(optNum('')).toBeUndefined();
    expect(optNum('  ')).toBeUndefined();
  });

  it('parses anything else like num', () => {
    expect(optNum('0')).toBe(0);
    expect(optNum('12,5')).toBe(12.5);
  });
});
