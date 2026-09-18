'use client';

import { money, pct } from '@/lib/domain/format';
import { ASSETS, returnPct, sharePrice, type TradeType } from '@/lib/domain/vault';
import { useStore } from '@/lib/state/store';
import { PriceChart } from './PriceChart';

export function DetailPanel({ onTrade }: { onTrade: (type: TradeType) => void }) {
  const { selected, assets } = useStore();
  const price = sharePrice(selected, assets);
  const change = returnPct(selected, assets);

  return (
    <aside
      aria-label="Selected strategy"
      className="static self-start rounded-xl border border-line bg-white p-6 sm:sticky sm:top-[22px]"
    >
      <p className="mb-3 text-[12px] font-[750] tracking-[2px] text-[#738195]">STRATEGY DETAILS</p>
      <h2 className="mb-[6px] mt-[10px] text-[23px] tracking-[-0.7px]">{selected.name}</h2>
      <p className="text-[13px] leading-[1.65] text-muted-2">{selected.manager}</p>

      <div className="mt-[10px] text-[32px] font-[650] tracking-[-1px]">{money(price)}</div>
      <span className="text-[13px] leading-[1.65] text-muted-2">
        Per share ·{' '}
        <span className={change < 0 ? 'text-negative' : 'text-positive'}>{pct(change)}</span> since
        demo start
      </span>

      <PriceChart vault={selected} />

      <div className="my-[14px] flex items-center justify-between gap-[10px] text-[14px]">
        <span className="text-[#67748a]">Market moves</span>
        <strong>{selected.history.length - 1}</strong>
      </div>

      <hr className="my-[22px] border-0 border-t border-[#e5e9f0]" />

      <h3 className="text-[16px]">Target allocation</h3>
      <div className="my-[15px] mb-5 flex h-[9px] gap-[3px] overflow-hidden rounded">
        {selected.weights.map((w, i) => (
          <span key={ASSETS[i].id} style={{ width: `${w}%`, background: ASSETS[i].color }} className="min-w-0" />
        ))}
      </div>
      {selected.weights.map((w, i) =>
        w ? (
          <div key={ASSETS[i].id} className="my-3 flex justify-between text-[14px]">
            <span className="flex items-center">
              <i
                className="mr-[9px] inline-block h-2 w-2 rounded-[2px]"
                style={{ background: ASSETS[i].color }}
              />
              {ASSETS[i].name}
            </span>
            <strong>{w}%</strong>
          </div>
        ) : null,
      )}
      <p className="text-[13px] leading-[1.65] text-muted-2">
        Weights can drift after market moves. Rebalancing is not automated in this demo.
      </p>

      <hr className="my-[22px] border-0 border-t border-[#e5e9f0]" />

      <h3 className="text-[16px]">Strategy rules</h3>
      <div className="my-3 flex flex-wrap gap-[6px]">
        {['No leverage', '4 allowed assets', '0% demo fees'].map((rule) => (
          <span
            key={rule}
            className="rounded border border-[#e1e8d8] bg-[#f1f5eb] px-[7px] py-[5px] text-[12px] text-[#526044]"
          >
            {rule}
          </span>
        ))}
      </div>

      <div className="my-[14px] flex items-center justify-between gap-[10px] text-[14px]">
        <span className="text-[#67748a]">Your position</span>
        <strong>{money(selected.userShares * price)}</strong>
      </div>

      <button
        type="button"
        onClick={() => onTrade('invest')}
        className="mt-3 w-full rounded-lg border border-ink-soft bg-ink-soft px-[18px] py-[13px] text-[14px] font-[650] text-white hover:bg-ink-hover"
      >
        Invest demo dollars
      </button>
      {selected.userShares > 1e-9 && (
        <button
          type="button"
          onClick={() => onTrade('withdraw')}
          className="mt-[9px] w-full rounded-lg border border-line-2 bg-white p-3 text-[14px] text-[#253b5c]"
        >
          Withdraw demo dollars
        </button>
      )}
    </aside>
  );
}
