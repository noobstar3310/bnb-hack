/**
 * Pure vault accounting. No React, no browser APIs, no network.
 *
 * Everything here is a plain function over plain data so the same maths can run
 * server-side once real instrument prices replace the simulated ones. The four
 * assets below are fictional; `Asset` is the seam where real RWA instrument
 * metadata (provider, contract address, chain, market status) belongs.
 */

export type AssetId = 'CORE' | 'TECH' | 'HEALTH' | 'USD';

export interface Asset {
  id: AssetId;
  name: string;
  /** Hex colour used for allocation bars and dots. */
  color: string;
  /** Simulated unit price in USD. */
  price: number;
}

export interface Vault {
  id: string;
  name: string;
  thesis: string;
  manager: string;
  /** Target allocation percentages, index-aligned with the asset list. */
  weights: number[];
  /** Units held of each asset, index-aligned with the asset list. */
  units: number[];
  /** Total shares outstanding. */
  supply: number;
  /** Shares held by the demo user. */
  userShares: number;
  /** Total demo dollars the user has put in, used for unrealised change. */
  cost: number;
  /** Share price after each market move, starting at the $10 launch price. */
  history: number[];
}

export type RiskLabel = 'Diversified' | 'Mixed' | 'Concentrated';
export type TradeType = 'invest' | 'withdraw';

/** Seed capital every new strategy launches with. */
export const SEED_CAPITAL = 10_000;
/** Shares issued against the seed capital, giving a $10 launch price. */
export const INITIAL_SUPPLY = 1000;
/** The demo account's opening balance. */
export const OPENING_BALANCE = 10_000;
// 🥚 You found the easter egg. Welcome to the only market on Earth where stocks
//    move exactly ±5% and never on a Sunday. If you find a real one, tell the
//    team before you tell your landlord.
/** The only market moves the simulation accepts. */
export const MARKET_MOVES = [-0.05, 0.05] as const;

export const ASSETS: readonly Asset[] = [
  { id: 'CORE', name: 'Core market', color: '#587ec2', price: 100 },
  { id: 'TECH', name: 'Technology', color: '#9367c4', price: 100 },
  { id: 'HEALTH', name: 'Healthcare', color: '#46a9a2', price: 100 },
  { id: 'USD', name: 'Demo dollars', color: '#bec9d6', price: 1 },
];

/** Index of the cash asset; the equity assets are everything before it. */
const CASH_INDEX = 3;

export const MAX_NAME_LENGTH = 44;
export const MAX_THESIS_LENGTH = 180;

export interface CreateVaultInput {
  name: string;
  thesis: string;
  weights: number[];
  manager?: string;
  id?: string;
  assets?: readonly Asset[];
}

export function createVault({
  name,
  thesis,
  weights,
  manager = 'You · demo creator',
  id,
  assets = ASSETS,
}: CreateVaultInput): Vault {
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const trimmedThesis = typeof thesis === 'string' ? thesis.trim() : '';

  if (
    !trimmedName ||
    trimmedName.length > MAX_NAME_LENGTH ||
    !trimmedThesis ||
    trimmedThesis.length > MAX_THESIS_LENGTH
  ) {
    throw new Error('Add a name and a short investment thesis.');
  }

  if (
    !Array.isArray(weights) ||
    weights.length !== assets.length ||
    weights.some((w) => !Number.isFinite(w) || w < 0 || w > 100) ||
    Math.abs(weights.reduce((a, b) => a + b, 0) - 100) > 1e-7
  ) {
    throw new Error('Allocations must add up to 100%.');
  }

  return {
    id: id ?? crypto.randomUUID(),
    name: trimmedName,
    thesis: trimmedThesis,
    manager,
    weights: [...weights],
    units: weights.map((w, i) => (SEED_CAPITAL * w) / 100 / assets[i].price),
    supply: INITIAL_SUPPLY,
    userShares: 0,
    cost: 0,
    history: [SEED_CAPITAL / INITIAL_SUPPLY],
  };
}

/** Total value of everything the vault holds, in USD. */
export function nav(vault: Vault, assets: readonly Asset[] = ASSETS): number {
  return vault.units.reduce((total, units, i) => total + units * assets[i].price, 0);
}

/** NAV divided by shares outstanding. */
export function sharePrice(vault: Vault, assets: readonly Asset[] = ASSETS): number {
  return nav(vault, assets) / vault.supply;
}

/** Return since launch, as a percentage of the $10 opening share price. */
export function returnPct(vault: Vault, assets: readonly Asset[] = ASSETS): number {
  const launchPrice = SEED_CAPITAL / INITIAL_SUPPLY;
  return (sharePrice(vault, assets) / launchPrice - 1) * 100;
}

/**
 * Exposure label derived from the target allocation. This describes the shape of
 * the allocation only — it is not a risk rating and carries no view on the
 * assets themselves.
 */
export function risk(vault: Vault): RiskLabel {
  if (vault.weights[CASH_INDEX] >= 40) return 'Mixed';
  if (Math.max(...vault.weights.slice(0, CASH_INDEX)) >= 75) return 'Concentrated';
  return 'Diversified';
}

/** Moves every equity asset by `change`, leaving cash fixed at $1. */
export function applyMarketMove(assets: readonly Asset[], change: number): Asset[] {
  if (!Number.isFinite(change) || !MARKET_MOVES.includes(change as (typeof MARKET_MOVES)[number])) {
    throw new Error('Choose a +5% or −5% demo move.');
  }

  return assets.map((asset, i) =>
    i === CASH_INDEX ? { ...asset } : { ...asset, price: asset.price * (1 + change) },
  );
}

/** Appends the vault's current share price to its history. */
export function recordHistory(vault: Vault, assets: readonly Asset[]): Vault {
  return { ...vault, history: [...vault.history, sharePrice(vault, assets)] };
}

export interface TransactInput {
  vault: Vault;
  assets?: readonly Asset[];
  type: TradeType;
  amount: number;
  balance: number;
}

export interface TransactResult {
  vault: Vault;
  balance: number;
  shares: number;
  type: TradeType;
  amount: number;
}

/**
 * Invests or withdraws demo dollars at the current share price.
 *
 * Deposits scale the vault's holdings and issue shares in the same proportion,
 * so the share price is unchanged by the transaction itself — only market moves
 * change it.
 */
export function transact({
  vault,
  assets = ASSETS,
  type,
  amount,
  balance,
}: TransactInput): TransactResult {
  if (type !== 'invest' && type !== 'withdraw') {
    throw new Error('Unknown transaction type.');
  }

  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6
  ) {
    throw new Error('Enter a positive amount with at most two decimal places.');
  }

  const price = sharePrice(vault, assets);
  const limit = type === 'invest' ? balance : vault.userShares * price;

  if (amount > limit + 1e-8) {
    throw new Error('The amount exceeds your available balance.');
  }

  const shares = amount / price;
  const currentNav = nav(vault, assets);
  const scale = (currentNav + (type === 'invest' ? amount : -amount)) / currentNav;
  const units = vault.units.map((u) => u * scale);

  if (type === 'invest') {
    return {
      vault: {
        ...vault,
        units,
        supply: vault.supply + shares,
        userShares: vault.userShares + shares,
        cost: vault.cost + amount,
      },
      balance: Math.max(0, balance - amount),
      shares,
      type,
      amount,
    };
  }

  const remainingShares = Math.max(0, vault.userShares - shares);
  const costRatio = vault.userShares > 0 ? remainingShares / vault.userShares : 0;

  return {
    vault: {
      ...vault,
      units,
      supply: vault.supply - shares,
      userShares: remainingShares,
      cost: vault.cost * Math.max(0, costRatio),
    },
    balance: balance + amount,
    shares,
    type,
    amount,
  };
}

/** The three strategies the demo opens with. Fixed ids keep rendering stable. */
export function seedVaults(): Vault[] {
  return [
    createVault({
      id: 'core',
      name: 'Market Mosaic',
      thesis:
        'Broad equity exposure, spread across the core market, technology and healthcare.',
      weights: [60, 20, 20, 0],
      manager: 'Folio Research · demo manager',
    }),
    createVault({
      id: 'mixed',
      name: 'Steady Mix',
      thesis:
        'Half equities, half demo dollars. Explore how a reserve changes portfolio movements.',
      weights: [30, 10, 10, 50],
      manager: 'Folio Research · demo manager',
    }),
    createVault({
      id: 'tech',
      name: 'Tech Conviction',
      thesis:
        'A focused technology allocation for investors comfortable with concentration.',
      weights: [10, 80, 10, 0],
      manager: 'Signal Studio · demo manager',
    }),
  ];
}
