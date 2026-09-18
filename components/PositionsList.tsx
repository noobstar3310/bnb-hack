'use client';

import { money } from '@/lib/domain/format';
import { sharePrice } from '@/lib/domain/vault';
import { useStore } from '@/lib/state/store';

export function PositionsList({ onSelect }: { onSelect: (id: string) => void }) {
  const { vaults, assets, dispatch } = useStore();
  const owned = vaults.filter((v) => v.userShares > 1e-9);

  if (!owned.length) {
    return (
      <div className="rounded-xl border border-dashed border-[#c6d0de] bg-white px-6 py-[45px] text-center leading-[1.7] text-muted-2">
        <h3 className="text-[16px]">Your portfolio starts here.</h3>
        Invest demo dollars in a strategy to see your shares and performance.
        <br />
        <button
          type="button"
          onClick={() => dispatch({ type: 'setMode', mode: 'explore' })}
          className="mt-3 rounded-[7px] border border-line-2 bg-white px-[13px] py-[10px] text-[14px] text-[#253b5c]"
        >
          Explore strategies
        </button>
      </div>
    );
  }

  return (
    <>
      {owned.map((vault) => {
        const value = vault.userShares * sharePrice(vault, assets);
        return (
          <article
            key={vault.id}
            className="mb-3 rounded-[10px] border border-[#dee5ef] bg-white p-[22px]"
          >
            <h3 className="mt-0 text-[16px]">{vault.name}</h3>
            <div className="my-[14px] flex items-center justify-between gap-[10px] text-[14px]">
              <span className="text-[#67748a]">Current value</span>
              <strong>{money(value)}</strong>
            </div>
            <div className="my-[14px] flex items-center justify-between gap-[10px] text-[14px]">
              <span className="text-[#67748a]">Shares</span>
              <strong>{vault.userShares.toFixed(6)}</strong>
            </div>
            <div className="my-[14px] flex items-center justify-between gap-[10px] text-[14px]">
              <span className="text-[#67748a]">Unrealized change</span>
              <strong>{money(value - vault.cost)}</strong>
            </div>
            <button
              type="button"
              onClick={() => onSelect(vault.id)}
              className="mt-3 rounded-[7px] border border-line-2 bg-white px-[13px] py-[10px] text-[14px] text-[#253b5c]"
            >
              Manage position ↗
            </button>
          </article>
        );
      })}
    </>
  );
}
