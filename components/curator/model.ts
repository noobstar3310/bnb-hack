import {getAddress, type Address, type Hex} from 'viem';
import type {VaultView} from '@/lib/contracts/hooks';

export interface CuratorAsset {
  address: Address;
  symbol: string;
  decimals: number;
}

export interface TradeQuote {
  trade: {
    router: Address;
    sellToken: Address;
    buyToken: Address;
    maxSellAmount: string;
    minBuyAmount: string;
    callData: Hex;
  };
  quote: {
    expectedBuyAmount: string;
    slippagePercent: string;
    route: string[];
  };
  warnings: string[];
}

export const STOCKS: readonly CuratorAsset[] = [
  {symbol: 'AAPLon', address: '0x390a684EF9cADE28A7AD0DFa61AB1Eb3842618c4', decimals: 18},
  {symbol: 'NVDAon', address: '0xA9eE28C80f960B889dFbd1902055218cBa016F75', decimals: 18},
  {symbol: 'MSFTon', address: '0x6Bfe75D1ad432050eA973C3A3DcD88F02e2444C3', decimals: 18},
] as const;

/** Assets the curator can target or buy, using the vault's settlement address for USDT. */
export function curatorAssets(vault: VaultView): CuratorAsset[] {
  const settlement = vault.holdings.find((holding) => holding.symbol === 'USDT');
  const assets = settlement
    ? [{address: getAddress(settlement.asset), symbol: 'USDT', decimals: settlement.decimals}, ...STOCKS]
    : [...STOCKS];
  return assets.filter(
    (asset, index) => assets.findIndex((candidate) => candidate.address === asset.address) === index,
  );
}

/** Converts a percentage with at most two decimals to exact basis points. */
export function percentageToBps(value: string): number | null {
  const text = value.trim();
  if (!/^\d{1,3}(\.\d{0,2})?$/.test(text)) return null;
  const [wholeText, fractionText = ''] = text.split('.');
  const bps = Number(wholeText) * 100 + Number(fractionText.padEnd(2, '0'));
  return bps >= 0 && bps <= 10_000 ? bps : null;
}

export function sameAddress(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}
