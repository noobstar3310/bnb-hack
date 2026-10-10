'use client';

import {tokenAmount} from '@/lib/domain/format';
import type {VaultView} from '@/lib/contracts/hooks';
import {assetColor, assetMix, SHARE_SCALE, sharePartsPerMillion} from './capitalMapModel';
import {useTokenSymbols} from './useTokenSymbols';

function dollars(value: string | null) {
  if (value === null) return 'Valuation unavailable';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: amount < 100 ? 2 : 0,
  }).format(amount);
}

export function VaultOverviewCard({vault}: {vault: VaultView}) {
  const holdings = vault.holdings.filter((holding) => BigInt(holding.amount) > BigInt(0));
  const mix = assetMix(vault.holdings);
  const tokenSymbol = useTokenSymbols(holdings);
  const total = mix.status === 'ready' ? mix.assets.reduce((sum, asset) => sum + asset.value, 0) : null;
  const walletShare = vault.position ? sharePartsPerMillion(vault.position.shares, vault.totalSupply) : null;

  return (
    <section className="border-b border-[#24344a] px-4 py-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-[800] tracking-[1.6px] text-[#74839a]">VAULT VALUE</p>
          <p className="mt-1 truncate text-[22px] font-[800] tracking-[-0.7px] text-white">{dollars(vault.totalValueUsd)}</p>
        </div>
        <span className="shrink-0 font-mono text-[9px] text-[#687b94]">{holdings.length} ASSET{holdings.length === 1 ? '' : 'S'}</span>
      </div>

      {mix.status === 'unpriced' && (
        <div className="mt-3 rounded-lg border border-[#5f5020] bg-[#231f12] px-3 py-2 text-[10px] leading-[1.5] text-[#d9c66b]">
          <strong>Asset ratios unavailable.</strong> One or more non-zero holdings has no price.
          <details className="mt-1 text-[#a99c62]">
            <summary className="cursor-pointer">Why?</summary>
            Missing prices are not treated as zero, so the complete value allocation and total valuation cannot be calculated.
          </details>
        </div>
      )}

      {holdings.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-[#34445a] p-3 text-[11px] text-[#8c9bb0]">No non-zero holdings were returned for this vault.</p>
      ) : (
        <div className="mt-3 grid gap-1.5">
          {holdings.map((holding) => {
            const value = holding.valueUsd === null ? null : Number(holding.valueUsd);
            const share = total !== null && value !== null && total > 0 ? Math.max(0, Math.min(100, value / total * 100)) : null;
            const color = assetColor(holding.asset);
            return (
              <div key={holding.asset} className="rounded-lg border border-[#223249] bg-[#091522] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{backgroundColor: color}} />
                  <strong className="min-w-0 flex-1 truncate text-[11px] text-[#e8eef7]">{tokenSymbol(holding.asset, holding.symbol)}</strong>
                  <span className="shrink-0 font-mono text-[9px] text-[#c8d2df]" title={share === null ? 'See the consolidated price notice above' : undefined}>{share === null ? '—' : `${share.toFixed(1)}%`}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2 font-mono text-[9px] text-[#71839b]">
                  <span className="truncate">{tokenAmount(holding.amount, holding.decimals, 4)}</span>
                  <span className="shrink-0">{holding.valueUsd === null ? 'Unpriced' : dollars(holding.valueUsd)}</span>
                </div>
                {share !== null && (
                  <span className="mt-2 block h-1 overflow-hidden rounded-full bg-[#293649]">
                    <span className="block h-full rounded-full opacity-75" style={{width: `${share}%`, backgroundColor: color}} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 rounded-lg border border-[#25384d] bg-[#0a1624] p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[8px] font-[800] tracking-[1.2px] text-[#71839a]">CONNECTED WALLET TERRITORY</p>
          <span className="h-2 w-5 border-t border-dashed border-[#72dfcd]" aria-hidden="true" />
        </div>
        {vault.position === null ? (
          <p className="mt-2 text-[10px] leading-[1.5] text-[#98a7ba]">Wallet position was not queried. Its share is unavailable, not zero.</p>
        ) : BigInt(vault.position.shares) === BigInt(0) ? (
          <p className="mt-2 text-[10px] leading-[1.5] text-[#98a7ba]">0 shares. No wallet tree or territory is drawn.</p>
        ) : (
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[9px]">
            <div><dt className="text-[#71839a]">Shares</dt><dd className="mt-0.5 truncate font-mono text-[#dce5ef]">{tokenAmount(vault.position.shares, 18, 6)}</dd></div>
            <div><dt className="text-[#71839a]">Vault share</dt><dd className="mt-0.5 font-mono text-[#8de7d6]">{formatShare(walletShare)}</dd></div>
            <div className="col-span-2"><dt className="text-[#71839a]">Estimated position value</dt><dd className="mt-0.5 font-mono text-[#dce5ef]">{dollars(vault.position.valueUsd)}</dd></div>
          </dl>
        )}
        <p className="mt-2 text-[9px] leading-[1.45] text-[#667991]">
          Remaining share: {formatOtherShare(walletShare)}. Holder details are not available from the current API and may include wallets or locked shares; they are not reassigned.
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[9px] leading-[1.4] text-[#7d8ea4]">
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border-2 border-[#72dfcd] bg-[#3f9d7e]" />Wallet tree</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 [clip-path:polygon(50%_0,100%_100%,0_100%)] bg-[#24513d]" />Decorative plant</span>
        <span className="col-span-2">Soft ground tint = priced asset mix · coastline gold = selected Vault.</span>
      </div>
    </section>
  );
}

function formatShare(parts: bigint | null) {
  if (parts === null) return 'Unavailable';
  return `${(Number(parts) / 10_000).toFixed(4)}%`;
}

function formatOtherShare(parts: bigint | null) {
  if (parts === null) return 'Unavailable';
  return `${(Number(SHARE_SCALE - parts) / 10_000).toFixed(4)}%`;
}
