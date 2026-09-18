import { describe, expect, test } from 'vitest';
import {
  ASSETS,
  applyMarketMove,
  createVault,
  nav,
  risk,
  seedVaults,
  sharePrice,
  transact,
} from './vault';

const weights = (a: number, b: number, c: number, d: number) => [a, b, c, d];

describe('createVault', () => {
  test('issues 1000 shares priced at $10 against $10,000 of seed capital', () => {
    const v = createVault({ name: 'Test', thesis: 'A thesis', weights: weights(100, 0, 0, 0) });
    expect(nav(v, ASSETS)).toBeCloseTo(10_000, 6);
    expect(v.supply).toBe(1000);
    expect(sharePrice(v, ASSETS)).toBeCloseTo(10, 6);
  });

  test('rejects weights that do not sum to 100', () => {
    expect(() =>
      createVault({ name: 'Test', thesis: 'A thesis', weights: weights(50, 20, 20, 0) }),
    ).toThrow(/add up to 100/i);
  });

  test('rejects a name longer than 44 characters', () => {
    expect(() =>
      createVault({ name: 'x'.repeat(45), thesis: 'A thesis', weights: weights(100, 0, 0, 0) }),
    ).toThrow(/name/i);
  });
});

describe('risk', () => {
  test('classifies 40% or more demo dollars as Mixed', () => {
    expect(risk(createVault({ name: 'V', thesis: 't', weights: weights(30, 20, 10, 40) }))).toBe('Mixed');
  });

  test('classifies a 75% single-equity weight as Concentrated', () => {
    expect(risk(createVault({ name: 'V', thesis: 't', weights: weights(10, 80, 10, 0) }))).toBe('Concentrated');
  });

  test('classifies a spread allocation as Diversified', () => {
    expect(risk(createVault({ name: 'V', thesis: 't', weights: weights(60, 20, 20, 0) }))).toBe('Diversified');
  });
});

describe('transact', () => {
  test('a deposit does not change the share price', () => {
    const v = createVault({ name: 'V', thesis: 't', weights: weights(60, 20, 20, 0) });
    const before = sharePrice(v, ASSETS);

    const { vault: after } = transact({ vault: v, assets: ASSETS, type: 'invest', amount: 1000, balance: 10_000 });

    expect(sharePrice(after, ASSETS)).toBeCloseTo(before, 9);
  });

  test('a $1,000 deposit into a $10 share buys 100 shares', () => {
    const v = createVault({ name: 'V', thesis: 't', weights: weights(60, 20, 20, 0) });

    const result = transact({ vault: v, assets: ASSETS, type: 'invest', amount: 1000, balance: 10_000 });

    expect(result.shares).toBeCloseTo(100, 9);
    expect(result.vault.userShares).toBeCloseTo(100, 9);
    expect(result.balance).toBeCloseTo(9000, 9);
  });

  test('a full withdrawal returns the position to zero', () => {
    const v = createVault({ name: 'V', thesis: 't', weights: weights(60, 20, 20, 0) });
    const invested = transact({ vault: v, assets: ASSETS, type: 'invest', amount: 2500, balance: 10_000 });

    const out = transact({
      vault: invested.vault,
      assets: ASSETS,
      type: 'withdraw',
      amount: 2500,
      balance: invested.balance,
    });

    expect(out.vault.userShares).toBeCloseTo(0, 9);
    expect(out.balance).toBeCloseTo(10_000, 9);
  });

  test('rejects an amount with more than two decimal places', () => {
    const v = createVault({ name: 'V', thesis: 't', weights: weights(60, 20, 20, 0) });
    expect(() =>
      transact({ vault: v, assets: ASSETS, type: 'invest', amount: 10.123, balance: 10_000 }),
    ).toThrow(/two decimal places/i);
  });

  test('rejects investing more than the available balance', () => {
    const v = createVault({ name: 'V', thesis: 't', weights: weights(60, 20, 20, 0) });
    expect(() =>
      transact({ vault: v, assets: ASSETS, type: 'invest', amount: 500, balance: 100 }),
    ).toThrow(/exceeds/i);
  });

  test('rejects a zero amount', () => {
    const v = createVault({ name: 'V', thesis: 't', weights: weights(60, 20, 20, 0) });
    expect(() =>
      transact({ vault: v, assets: ASSETS, type: 'invest', amount: 0, balance: 10_000 }),
    ).toThrow(/positive/i);
  });
});

describe('applyMarketMove', () => {
  test('moves the three equities but leaves demo dollars at $1', () => {
    const moved = applyMarketMove(ASSETS, 0.05);
    expect(moved[0].price).toBeCloseTo(105, 9);
    expect(moved[1].price).toBeCloseTo(105, 9);
    expect(moved[2].price).toBeCloseTo(105, 9);
    expect(moved[3].price).toBe(1);
  });

  test('rejects any move other than plus or minus five percent', () => {
    expect(() => applyMarketMove(ASSETS, 0.1)).toThrow(/\+5%|−5%|5%/);
  });

  test('a +5% move lifts an all-equity vault share price by 5%', () => {
    const v = createVault({ name: 'V', thesis: 't', weights: weights(60, 20, 20, 0) });
    const before = sharePrice(v, ASSETS);

    expect(sharePrice(v, applyMarketMove(ASSETS, 0.05))).toBeCloseTo(before * 1.05, 9);
  });

  test('a half-cash vault moves half as much', () => {
    const v = createVault({ name: 'V', thesis: 't', weights: weights(30, 10, 10, 50) });
    const before = sharePrice(v, ASSETS);

    expect(sharePrice(v, applyMarketMove(ASSETS, 0.05))).toBeCloseTo(before * 1.025, 9);
  });
});

describe('seedVaults', () => {
  test('creates the three demo strategies with stable ids', () => {
    expect(seedVaults().map((v) => v.id)).toEqual(['core', 'mixed', 'tech']);
  });
});
