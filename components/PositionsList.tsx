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
      <div className="rounded-xl border border-dashed border-[#c6d0de] bg-white px-6 py-[45px] text-center leading-[1.7] text-muted-2">
        <h3 className="text-[16px]">{connected ? 'No positions yet.' : 'Connect a wallet to see your positions.'}</h3>
        {connected && 'Invest in a vault to see your shares here.'}
        <br />
        <button
          type="button"
          onClick={onExplore}
          className="mt-3 rounded-[7px] border border-line-2 bg-white px-[13px] py-[10px] text-[14px] text-[#253b5c]"
        >
          Explore vaults
        </button>
      </div>
    );
  }

  return (
    <>
      {owned.map((vault) => {
        const shares = BigInt(vault.position!.shares);
        const supply = BigInt(vault.totalSupply);
        const ownership = supply === BigInt(0) ? 0 : Number((shares * BigInt(1_000_000)) / supply) / 10_000;
        return (
          <article key={vault.address} className="mb-3 rounded-[10px] border border-[#dee5ef] bg-white p-[22px]">
            <h3 className="mt-0 text-[16px]">{vault.name}</h3>
            <div className="my-[14px] flex items-center justify-between gap-[10px] text-[14px]">
              <span className="text-[#67748a]">Estimated value</span>
              <strong>
                {vault.position!.valueUsd === null ? 'Unavailable' : money(Number(vault.position!.valueUsd))}
              </strong>
            </div>
            <div className="my-[14px] flex items-center justify-between gap-[10px] text-[14px]">
              <span className="text-[#67748a]">Shares</span>
              <strong>{tokenAmount(shares, 18, 6)}</strong>
            </div>
            <div className="my-[14px] flex items-center justify-between gap-[10px] text-[14px]">
              <span className="text-[#67748a]">Your share of the vault</span>
              <strong>{ownership.toFixed(2)}%</strong>
            </div>
            <button
              type="button"
              onClick={() => onSelect(vault.address)}
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
