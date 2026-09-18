'use client';

import { money, pct } from '@/lib/domain/format';
import { nav, returnPct, risk, type Asset, type Vault } from '@/lib/domain/vault';

const TINTS = ['#eaf0fb', '#e9f4f0', '#f0eafa'];
const EMBLEM_COLORS = ['#5072ad', '#458673', '#8b67ac'];

interface Props {
  vault: Vault;
  assets: Asset[];
  index: number;
  selected: boolean;
  onSelect: () => void;
}

export function StrategyCard({ vault, assets, index, selected, onSelect }: Props) {
  const change = returnPct(vault, assets);

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
            style={{ background: TINTS[index % 3], color: EMBLEM_COLORS[index % 3] }}
          >
            {vault.name.charAt(0)}
          </div>
          <div>
            <h3 className="mb-[5px] text-[16px] tracking-[-0.4px] sm:text-[18px]">{vault.name}</h3>
            <span className="text-[12px] text-muted-3">{vault.manager}</span>
          </div>
        </div>
        <span className="whitespace-nowrap rounded-[5px] bg-[#f0f3f7] px-[9px] py-[6px] text-[11px] text-[#5a687d] sm:text-[12px]">
          {risk(vault)}
        </span>
      </div>

      <p className="my-4 text-[14px] leading-[1.6] text-[#657187]">{vault.thesis}</p>

      <div className="grid grid-cols-2 items-center gap-[10px] xs:grid-cols-[1fr_1fr_auto] sm:gap-4">
        <div>
          <label className="mb-[6px] block text-[12px] text-[#7a8697]">Simulated return</label>
          <strong
            className={`text-[16px] font-[650] sm:text-[18px] ${
              change < 0 ? 'text-negative' : 'text-positive'
            }`}
          >
            {pct(change)}
          </strong>
        </div>
        <div>
          <label className="mb-[6px] block text-[12px] text-[#7a8697]">Demo vault value</label>
          <strong className="text-[16px] font-[650] sm:text-[18px]">{money(nav(vault, assets))}</strong>
        </div>
        <button
          type="button"
          onClick={onSelect}
          aria-label={`View ${vault.name}`}
          className={`col-span-2 rounded-[7px] border border-line-2 px-[13px] py-[10px] text-[13px] text-[#253b5c] xs:col-span-1 sm:text-[14px] ${
            selected ? 'bg-[#edf2fa]' : 'bg-white'
          }`}
        >
          View strategy ↗
        </button>
      </div>
    </article>
  );
}
