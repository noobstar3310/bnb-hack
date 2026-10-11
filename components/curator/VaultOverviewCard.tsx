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
    <section className="border-b border-white/[0.08] px-4 py-4 sm:px-5">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <span className="font-mono text-[9px] font-bold tracking-[1.5px] text-slate-400 uppercase">
            PORTFOLIO VALUATION
          </span>
          <p className="mt-1 truncate text-[24px] font-bold tracking-tight text-white tabular-nums">
            {dollars(vault.totalValueUsd)}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-slate-300">
          {holdings.length} {holdings.length === 1 ? 'Asset' : 'Assets'}
        </span>
      </div>

      {mix.status === 'unpriced' && (
        <div className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-[11px] leading-[1.5] text-amber-200">
          <strong>Asset ratios uncalculated:</strong> One or more non-zero holdings is awaiting an oracle price.
        </div>
      )}

      {holdings.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-[12px] text-slate-400 text-center">
          No non-zero holdings in this vault yet.
        </p>
      ) : (
        <div className="mt-3 grid gap-2">
          {holdings.map((holding) => {
            const value = holding.valueUsd === null ? null : Number(holding.valueUsd);
            const share = total !== null && value !== null && total > 0 ? Math.max(0, Math.min(100, value / total * 100)) : null;
            const color = assetColor(holding.asset);
            return (
              <div key={holding.asset} className="rounded-2xl border border-white/10 bg-white/5 px-3.5 py-3 transition hover:bg-white/[0.08]">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{backgroundColor: color}} />
                  <strong className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white">
                    {tokenSymbol(holding.asset, holding.symbol)}
                  </strong>
                  <span className="shrink-0 font-mono text-[11px] font-bold text-slate-300 tabular-nums">
                    {share === null ? '—' : `${share.toFixed(1)}%`}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2 font-mono text-[10px] text-slate-400">
                  <span className="truncate">{tokenAmount(holding.amount, holding.decimals, 4)} units</span>
                  <span className="shrink-0 text-slate-200 font-semibold">{holding.valueUsd === null ? 'Unpriced' : dollars(holding.valueUsd)}</span>
                </div>
                {share !== null && (
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/10 p-0.5">
                    <span className="block h-full rounded-full" style={{width: `${share}%`, backgroundColor: color}} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3.5 rounded-2xl border border-white/10 bg-white/5 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[9px] font-bold tracking-[1.2px] text-slate-400 uppercase">
            MANAGER WALLET SHARE
          </span>
          <span className="h-2 w-5 border-t border-dashed border-[#72dfcd]" aria-hidden="true" />
        </div>
        {vault.position === null ? (
          <p className="mt-2 text-[11px] text-slate-400">Wallet position was not queried.</p>
        ) : BigInt(vault.position.shares) === BigInt(0) ? (
          <p className="mt-2 text-[11px] text-slate-400">0 shares held in connected wallet.</p>
        ) : (
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
            <div><dt className="text-slate-400">Shares</dt><dd className="mt-0.5 truncate font-mono text-white">{tokenAmount(vault.position.shares, 18, 6)}</dd></div>
            <div><dt className="text-slate-400">Vault Share</dt><dd className="mt-0.5 font-mono text-[#8de7d6] font-bold">{formatShare(walletShare)}</dd></div>
            <div className="col-span-2"><dt className="text-slate-400">Estimated Value</dt><dd className="mt-0.5 font-mono text-white font-bold">{dollars(vault.position.valueUsd)}</dd></div>
          </dl>
        )}
        <p className="mt-2 text-[10px] leading-[1.45] text-slate-400">
          Remaining share: {formatOtherShare(walletShare)}.
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
