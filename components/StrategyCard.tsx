'use client';

import {money, shortAddress} from '@/lib/domain/format';
import type {VaultView} from '@/lib/contracts/hooks';
import {allocation} from './allocation';

const STATE_STYLE: Record<VaultView['state'], string> = {
  ACTIVE: 'border-[#246158] bg-[#123a36] text-[#6ee7d1]',
  PAUSED: 'border-[#66541e] bg-[#28210f] text-[#f2d568]',
  SEEDED: 'border-[#43536b] bg-[#192638] text-[#a8b7ca]',
  DRAFT: 'border-[#43536b] bg-[#192638] text-[#a8b7ca]',
  CLOSED: 'border-[#69333d] bg-[#2a1820] text-[#ff9ba5]',
};

interface Props {
  vault: VaultView;
  index: number;
  selected: boolean;
  onSelect: () => void;
}

export function StrategyCard({vault, index, selected, onSelect}: Props) {
  const slices = allocation(vault);

  return (
    <article className={`relative rounded-xl border bg-[#0d1827] p-4 transition ${selected ? 'border-[#e1c83c] shadow-[0_0_0_1px_rgba(225,200,60,0.28)]' : 'border-[#26374d] hover:border-[#41566e]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center bg-[#f2d23d] font-mono text-[13px] font-[900] text-[#111827] [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]">
            {vault.name.charAt(0) || String(index + 1)}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-[820] text-white">{vault.name}</h3>
            <span className="mt-1 block font-mono text-[8px] text-[#71859d]">Manager {shortAddress(vault.manager)}</span>
          </div>
        </div>
        <span className={`shrink-0 rounded border px-2 py-1 font-mono text-[8px] font-[800] ${STATE_STYLE[vault.state]}`}>{vault.state}</span>
      </div>

      <div className="my-4 flex h-2 gap-[2px] overflow-hidden rounded bg-[#07111f]">
        {slices.map((slice) => slice.percent === null ? null : <span key={slice.symbol} style={{width: `${slice.percent}%`, background: slice.color}} />)}
      </div>
      <p className="min-h-[18px] truncate font-mono text-[8px] text-[#7589a0]">
        {slices.map((slice) => `${slice.symbol} ${slice.percent === null ? 'unavailable' : `${slice.percent.toFixed(0)}%`}`).join(' · ') || 'No holdings'}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Value label="Share price" value={vault.sharePriceUsd === null ? 'Unavailable' : money(Number(vault.sharePriceUsd))} />
        <Value label="Vault value" value={vault.totalValueUsd === null ? 'Unavailable' : money(Number(vault.totalValueUsd))} />
      </div>
      <button type="button" onClick={onSelect} aria-pressed={selected} className={`mt-3 w-full rounded-lg border px-3 py-2.5 text-[11px] font-[800] ${selected ? 'border-[#5c6f84] bg-[#192a3c] text-white' : 'border-[#31465d] bg-[#101e2e] text-[#b6c4d3] hover:border-[#5c7188] hover:text-white'}`}>
        {selected ? 'Selected vault' : 'View vault'}
      </button>
    </article>
  );
}

function Value({label, value}: {label: string; value: string}) {
  return (
    <div className="rounded-lg border border-[#22354a] bg-[#091521] px-3 py-2">
      <span className="block font-mono text-[7px] tracking-[0.4px] text-[#6f839b]">{label.toUpperCase()}</span>
      <strong className="mt-1 block truncate text-[11px] text-[#edf3fa]">{value}</strong>
    </div>
  );
}
