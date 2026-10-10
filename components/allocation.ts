import type {VaultView} from '@/lib/contracts/hooks';

/** Fixed series order from the theme; cash is always the neutral grey. */
const SERIES = ['var(--color-series-1)', 'var(--color-series-2)', 'var(--color-series-3)', '#8b67ac', '#c9a227'];
const CASH = '#bec9d6';

export interface Slice {
  symbol: string;
  color: string;
  /** Share of the vault's value, 0–100. Null when some price is unavailable. */
  percent: number | null;
}

/** Current allocation by value, from actual holdings (not the curator's target). */
export function allocation(vault: VaultView): Slice[] {
  const total = vault.totalValueUsd === null ? null : Number(vault.totalValueUsd);
  let next = 0;
  return vault.holdings
    .filter((h) => h.amount !== '0')
    .map((h) => ({
      symbol: h.symbol,
      color: h.symbol === 'USDT' ? CASH : SERIES[next++ % SERIES.length],
      percent: total && h.valueUsd !== null ? (Number(h.valueUsd) / total) * 100 : null,
    }));
}
