'use client';

import {money, shortAddress} from '@/lib/domain/format';
import type {VaultView} from '@/lib/contracts/hooks';
import {allocation} from './allocation';

const TINTS = ['#eaf0fb', '#e9f4f0', '#f0eafa'];
const EMBLEM_COLORS = ['#5072ad', '#458673', '#8b67ac'];

const STATE_STYLE: Record<VaultView['state'], string> = {
  ACTIVE: 'bg-[#e8f4ef] text-positive',
  PAUSED: 'bg-[#fff6e3] text-[#7a5310]',
  SEEDED: 'bg-[#f0f3f7] text-[#5a687d]',
  DRAFT: 'bg-[#f0f3f7] text-[#5a687d]',
  CLOSED: 'bg-[#f6e9eb] text-negative',
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
    <article
      className={`relative rounded-xl border bg-white p-[19px] sm:p-[23px] ${
        selected ? 'border-[#879cbb] shadow-[0_0_0_1px_#879cbb]' : 'border-line'
      }`}
    >
      <div className="flex flex-col items-start justify-between gap-[10px] xs:flex-row sm:flex-col md:flex-row">
        <div className="flex items-center gap-3">
          <div
            className="grid h-11 w-11 place-items-center rounded-[10px] text-[20px] font-[750]"
            style={{background: TINTS[index % 3], color: EMBLEM_COLORS[index % 3]}}
          >
            {vault.name.charAt(0)}
          </div>
          <div>
            <h3 className="mb-[5px] text-[16px] tracking-[-0.4px] sm:text-[18px]">{vault.name}</h3>
            <span className="text-[12px] text-muted-3">Curator {shortAddress(vault.manager)}</span>
          </div>
        </div>
        <span className={`whitespace-nowrap rounded-[5px] px-[9px] py-[6px] text-[11px] font-[650] sm:text-[12px] ${STATE_STYLE[vault.state]}`}>
          {vault.state}
        </span>
      </div>

      <div className="my-4 flex h-[9px] gap-[3px] overflow-hidden rounded bg-[#f0f3f7]">
        {slices.map((s) =>
          s.percent === null ? null : (
            <span key={s.symbol} style={{width: `${s.percent}%`, background: s.color}} className="min-w-0" />
          ),
        )}
      </div>
      <p className="mb-4 text-[13px] text-[#657187]">
        {slices.map((s) => `${s.symbol} ${s.percent === null ? '—' : `${s.percent.toFixed(0)}%`}`).join(' · ') || 'Empty'}
      </p>

      <div className="grid grid-cols-2 items-center gap-[10px] xs:grid-cols-[1fr_1fr_auto] sm:gap-4">
        <div>
          <span className="mb-[6px] block text-[12px] text-[#7a8697]">Share price</span>
          <strong className="text-[16px] font-[650] sm:text-[18px]">
            {vault.sharePriceUsd === null ? 'Unavailable' : money(Number(vault.sharePriceUsd))}
          </strong>
        </div>
        <div>
          <span className="mb-[6px] block text-[12px] text-[#7a8697]">Vault value</span>
          <strong className="text-[16px] font-[650] sm:text-[18px]">
            {vault.totalValueUsd === null ? 'Unavailable' : money(Number(vault.totalValueUsd))}
          </strong>
        </div>
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className="col-span-2 rounded-[7px] border border-line-2 bg-white px-[13px] py-[10px] text-[14px] text-[#253b5c] xs:col-span-1"
        >
          {selected ? 'Viewing' : 'View vault'}
        </button>
      </div>
    </article>
  );
}
