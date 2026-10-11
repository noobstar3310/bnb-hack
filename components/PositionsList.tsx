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
  const owned = vaults.filter((vault) => vault.position && vault.position.shares !== '0');

  if (!connected || !owned.length) {
    return (
      <div className="grid min-h-[320px] place-items-center rounded-xl border border-dashed border-[#344a62] bg-[#0c1726] px-6 py-10 text-center">
        <div>
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-[#315267] bg-[#0e2633] text-[20px] text-[#65d9c6]">♟</span>
          <h3 className="mt-4 text-[15px] font-[800] text-[#dce6f1]">{connected ? 'No positions yet' : 'Connect your wallet'}</h3>
          <p className="mx-auto mt-2 max-w-[380px] text-[11px] leading-[1.7] text-[#7d90a8]">
            {connected ? 'Vaults appear here only when this wallet has a positive current share balance.' : 'Your positions and investor territories are loaded for the connected address. A disconnected wallet is never treated as a zero balance.'}
          </p>
          <button type="button" onClick={onExplore} className="mt-5 rounded-lg border border-[#e6c52d] bg-[#f2d23d] px-4 py-2.5 text-[11px] font-[900] text-[#111827] hover:bg-[#ffe768]">
            Explore vaults
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {owned.map((vault) => {
        const shares = BigInt(vault.position!.shares);
        const supply = BigInt(vault.totalSupply);
        const ppm = supply > BigInt(0) ? Number(shares * BigInt(1_000_000) / supply) : null;
        const ownership = ppm === null ? null : ppm / 10_000;
        return (
          <article key={vault.address} className="rounded-xl border border-[#26374d] bg-[#0d1827] p-4 shadow-[0_14px_40px_rgba(0,0,0,0.18)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[8px] font-[800] tracking-[1.2px] text-[#59d8c4]">ACTIVE POSITION</p>
                <h3 className="mt-2 text-[16px] font-[820] text-white">{vault.name}</h3>
              </div>
              <span className="rounded-full border border-[#367166] bg-[#123a36] px-2.5 py-1 font-mono text-[8px] text-[#7be5d2]">YOU</span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Metric label="Estimated value" value={vault.position!.valueUsd === null ? 'Unavailable' : money(Number(vault.position!.valueUsd))} />
              <Metric label="Vault share" value={ownership === null ? 'Unavailable' : `${formatPercent(ownership)}%`} />
              <div className="col-span-2"><Metric label="Shares" value={tokenAmount(shares, 18, 6)} /></div>
            </div>

            <p className="mt-3 text-[9px] leading-[1.55] text-[#788ba2]">The map territory uses this current share balance divided by total supply. It is not based on deposit history.</p>
            <button type="button" onClick={() => onSelect(vault.address)} className="mt-4 w-full rounded-lg border border-[#31475e] bg-[#111f2f] px-3 py-2.5 text-[11px] font-[800] text-[#cbd7e4] hover:border-[#60768d] hover:text-white">
              Select position
            </button>
          </article>
        );
      })}
    </div>
  );
}

function Metric({label, value}: {label: string; value: string}) {
  return (
    <div className="rounded-lg border border-[#22354a] bg-[#091521] px-3 py-2.5">
      <span className="block font-mono text-[7px] tracking-[0.4px] text-[#6f839b]">{label.toUpperCase()}</span>
      <strong className="mt-1 block truncate text-[12px] text-[#eef4fa]">{value}</strong>
    </div>
  );
}

function formatPercent(value: number) {
  return value >= 0.01 && value < 99.99 ? value.toFixed(2).replace(/\.00$/, '') : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}
