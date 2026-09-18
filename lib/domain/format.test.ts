import { describe, expect, test } from 'vitest';
import { floorToCents, money, pct } from './format';

describe('money', () => {
  test('formats as US dollars with two decimals', () => {
    expect(money(10_000)).toBe('$10,000.00');
  });
});

describe('pct', () => {
  test('prefixes a gain with a plus sign', () => {
    expect(pct(5)).toBe('+5.00%');
  });

  test('keeps the minus sign on a loss', () => {
    expect(pct(-2.5)).toBe('-2.50%');
  });
});

describe('floorToCents', () => {
  test('rounds down rather than up, so max never exceeds the limit', () => {
    expect(floorToCents(99.999)).toBe('99.99');
  });
});
