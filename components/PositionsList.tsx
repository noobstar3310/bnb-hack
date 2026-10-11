'use client';

import {money, tokenAmount} from '@/lib/domain/format';
import type {VaultView} from '@/lib/contracts/hooks';

interface Props {
  vaults: VaultView[];
  connected: boolean;
  onSelect: (address: string) => void;
  onExplore: () => void;
}

export function PositionsList({vaults, connected, onSelect, onExplore}: Props) {
  const owned = vaults.filter((v) => v.position && v.position.shares !== '0');

  if (!owned.length) {
    return (
      <div className="rounded-2xl border border-black/[0.06] bg-white/80 p-8 text-center leading-[1.7] text-slate-600 shadow-sm backdrop-blur-md sm:p-12">
        <h3 className="text-[17px] font-bold text-slate-900">
          {connected ? 'No active positions yet' : 'Connect wallet to view your positions'}
        </h3>
        <p className="mt-1 text-[13px] text-slate-500">
          {connected
            ? 'When you deposit USDT into a vault, your transparent stock token shares will appear here.'
            : 'Connect your browser wallet to inspect and redeem your vault holdings.'}
        </p>
        <button
          type="button"
          onClick={onExplore}
          className="apple-press mt-5 rounded-full border border-slate-900 bg-slate-900 px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-slate-800"
        >
          Explore Vaults
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {owned.map((vault) => {
        const shares = BigInt(vault.position!.shares);
        const supply = BigInt(vault.totalSupply);
        const ownership = supply === BigInt(0) ? 0 : Number((shares * BigInt(1_000_000)) / supply) / 10_000;
        return (
          <article
            key={vault.address}
            className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.02),0_8px_24px_rgba(0,0,0,0.03)] sm:p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[18px] font-bold tracking-tight text-slate-900">{vault.name}</h3>
                <span className="font-mono text-[12px] font-semibold text-slate-400">{vault.symbol}</span>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {ownership.toFixed(2)}% of Vault
              </span>
            </div>

            <div className="my-4 divide-y divide-black/[0.04] rounded-xl bg-slate-50/80 p-3.5 border border-black/[0.04]">
              <div className="flex items-center justify-between py-1.5 text-[13px]">
                <span className="text-slate-500 font-medium">Estimated Value</span>
                <strong className="text-[16px] font-bold text-slate-950 tabular-nums">
                  {vault.position!.valueUsd === null ? 'Unavailable' : money(Number(vault.position!.valueUsd))}
                </strong>
              </div>
              <div className="flex items-center justify-between py-1.5 text-[13px]">
                <span className="text-slate-500 font-medium">Your Vault Shares</span>
                <strong className="font-semibold text-slate-800 tabular-nums">
                  {tokenAmount(shares, 18, 4)} shares
                </strong>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelect(vault.address)}
              className="apple-press inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-slate-50 px-4 py-2 text-[13px] font-semibold text-slate-800 shadow-2xs hover:bg-slate-100 hover:text-slate-950"
            >
              <span>Manage Position & Redeem</span>
              <span className="text-[11px] text-slate-400">↗</span>
            </button>
          </article>
        );
      })}
    </div>
  );
}
