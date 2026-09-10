import { describe, expect, it } from 'vitest';
import { scanArrayObjects } from './streamJson';

describe('scanArrayObjects', () => {
  it('returns nothing until the array has started', () => {
    expect(scanArrayObjects('{"da', 'days', 0).objects).toEqual([]);
    expect(scanArrayObjects('{"days"', 'days', 0).objects).toEqual([]);
  });

  it('yields each object as it completes, and only once', () => {
    const first = scanArrayObjects('{"days":[{"a":1},{"b":2', 'days', 0);
    expect(first.objects).toEqual(['{"a":1}']);

    const second = scanArrayObjects('{"days":[{"a":1},{"b":2}]}', 'days', first.next);
    expect(second.objects).toEqual(['{"b":2}']);
  });

  it('is not confused by braces or brackets inside strings', () => {
    const { objects } = scanArrayObjects('{"days":[{"name":"a{b}c ] ["},{"n":2}]}', 'days', 0);
    expect(objects).toEqual(['{"name":"a{b}c ] ["}', '{"n":2}']);
  });

  it('handles escaped quotes', () => {
    const { objects } = scanArrayObjects('{"days":[{"name":"say \\"hi\\" }"}]}', 'days', 0);
    expect(objects).toEqual(['{"name":"say \\"hi\\" }"}']);
  });

  it('walks nested objects to their real end', () => {
    const { objects } = scanArrayObjects('{"days":[{"meals":{"b":{"kcal":1}}}]}', 'days', 0);
    expect(objects).toEqual(['{"meals":{"b":{"kcal":1}}}']);
  });

  it('stops at the end of the array', () => {
    const { objects } = scanArrayObjects('{"days":[{"a":1}],"x":[{"b":2}]}', 'days', 0);
    expect(objects).toEqual(['{"a":1}']);
  });
});
