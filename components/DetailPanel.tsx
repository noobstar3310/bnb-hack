'use client';

import {money, shortAddress, tokenAmount} from '@/lib/domain/format';
import type {VaultView} from '@/lib/contracts/hooks';
import {allocation} from './allocation';

export type TradeType = 'invest' | 'withdraw';

interface Props {
  vault: VaultView;
  connected: boolean;
  onTrade: (type: TradeType) => void;
}

const STATE_STYLE: Record<VaultView['state'], string> = {
  ACTIVE: 'border-[#246158] bg-[#123a36] text-[#6ee7d1]',
  PAUSED: 'border-[#66541e] bg-[#28210f] text-[#f2d568]',
  SEEDED: 'border-[#43536b] bg-[#192638] text-[#a8b7ca]',
  DRAFT: 'border-[#43536b] bg-[#192638] text-[#a8b7ca]',
  CLOSED: 'border-[#69333d] bg-[#2a1820] text-[#ff9ba5]',
};

export function DetailPanel({vault, connected, onTrade}: Props) {
  const slices = allocation(vault);
  const held = vault.holdings.filter((holding) => holding.amount !== '0');
  const hasShares = Boolean(vault.position && vault.position.shares !== '0');
  const pricesMissing = held.some((holding) => holding.valueUsd === null);
  const acceptsDeposits = vault.state === 'ACTIVE' && !pricesMissing;
  const shares = BigInt(vault.position?.shares ?? '0');
  const supply = BigInt(vault.totalSupply);
  const sharePpm = supply > BigInt(0) ? Number(shares * BigInt(1_000_000) / supply) : null;
  const sharePercent = sharePpm === null ? null : sharePpm / 10_000;

  return (
    <aside aria-label="Selected vault" className="overflow-hidden rounded-xl border border-[#26374d] bg-[#0d1827] shadow-[0_20px_70px_rgba(0,0,0,0.3)] md:sticky md:top-3">
      <div className="border-b border-[#24344a] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[8px] font-[800] tracking-[1.5px] text-[#59d8c4]">SELECTED VAULT</p>
            <h2 className="mt-2 truncate text-[20px] font-[850] tracking-[-0.6px] text-white">{vault.name}</h2>
            <p className="mt-1 font-mono text-[9px] text-[#7d90a8]">Manager {shortAddress(vault.manager)}</p>
          </div>
          <span className={`shrink-0 rounded border px-2 py-1 font-mono text-[8px] font-[800] ${STATE_STYLE[vault.state]}`}>{vault.state}</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Metric label="Vault value" value={vault.totalValueUsd === null ? 'Unavailable' : money(Number(vault.totalValueUsd))} />
          <Metric label="Share price" value={vault.sharePriceUsd === null ? 'Unavailable' : money(Number(vault.sharePriceUsd))} />
        </div>
      </div>

      <div className="max-h-[calc(100dvh-260px)] overflow-y-auto p-4 [scrollbar-color:#344860_#0d1827] [scrollbar-width:thin] md:max-h-[calc(100dvh-150px)]">
        <SectionTitle>Holdings</SectionTitle>
        {slices.length > 0 && (
          <div className="mb-4 mt-3 flex h-2 gap-[2px] overflow-hidden rounded bg-[#07111f]">
            {slices.map((slice) => slice.percent === null ? null : <span key={slice.symbol} style={{width: `${slice.percent}%`, background: slice.color}} />)}
          </div>
        )}
        <div className="space-y-2">
          {held.length ? held.map((holding) => {
            const slice = slices.find((entry) => entry.symbol === holding.symbol);
            return (
              <div key={holding.asset} className="flex items-center justify-between gap-3 rounded-lg border border-[#22354a] bg-[#091521] px-3 py-2.5 text-[11px]">
                <span className="flex min-w-0 items-center gap-2 text-[#d7e1ec]">
                  <i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{background: slice?.color ?? '#63758b'}} />
                  <span className="truncate">{holding.symbol}</span>
                  <span className="font-mono text-[9px] text-[#6f849c]">{tokenAmount(holding.amount, holding.decimals, 4)}</span>
                </span>
                <strong className="shrink-0 text-[#f0f4f8]">{holding.valueUsd === null ? 'No price' : money(Number(holding.valueUsd))}</strong>
              </div>
            );
          }) : <EmptyLine>No assets held yet.</EmptyLine>}
        </div>

        {pricesMissing && (
          <p className="mt-3 rounded-lg border border-[#66541e] bg-[#28210f] p-3 text-[10px] leading-[1.6] text-[#e0ca68]">
            At least one non-zero holding has no live price. Total value, allocation and deposits remain unavailable; withdrawals still work.
          </p>
        )}

        <div className="my-4 border-t border-[#24344a]" />

        <div className="flex items-center justify-between gap-3">
          <SectionTitle>Published plan</SectionTitle>
          {vault.plan && <span className="rounded border border-[#354b61] px-2 py-1 font-mono text-[8px] text-[#8ea2b9]">v{vault.plan.version}</span>}
        </div>
        {vault.plan ? (
          <>
            <p className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-[#263b51] bg-[#091521] p-3 text-[11px] leading-[1.65] text-[#d4deea]">{vault.plan.text}</p>
            <p className="mt-2 text-[9px] leading-[1.55] text-[#74879e]">Advisory text posted on-chain by the manager; it is not mechanically enforced.</p>
          </>
        ) : (
          <EmptyLine>No plan has been published. This vault cannot rebalance until a plan exists.</EmptyLine>
        )}

        <div className="my-4 border-t border-[#24344a]" />

        <SectionTitle>Your position</SectionTitle>
        {!connected ? (
          <EmptyLine>Connect a wallet to load your shares and territory.</EmptyLine>
        ) : vault.position === null ? (
          <EmptyLine>Position data is unavailable for this wallet.</EmptyLine>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Metric label="Shares" value={tokenAmount(vault.position.shares, 18, 6)} />
            <Metric label="Vault share" value={sharePercent === null ? 'Unavailable' : `${formatPercent(sharePercent)}%`} />
            <div className="col-span-2"><Metric label="Estimated position" value={vault.position.valueUsd === null ? 'Unavailable' : money(Number(vault.position.valueUsd))} /></div>
          </div>
        )}

        <p className="mt-3 rounded-lg border border-[#29465a] bg-[#0b2230] p-3 text-[10px] leading-[1.6] text-[#9bb4c8]">
          Withdrawals return your proportional share of every held token in kind—including stock tokens and USDT—not a guaranteed cash amount.
        </p>

        <button type="button" disabled={!connected || !acceptsDeposits} onClick={() => onTrade('invest')} className="mt-4 w-full rounded-lg border border-[#e6c52d] bg-[#f2d23d] px-4 py-3 text-[12px] font-[900] text-[#111827] hover:bg-[#ffe768] disabled:cursor-not-allowed disabled:opacity-45">
          {!connected ? 'Connect wallet to deposit' : acceptsDeposits ? 'Deposit USDT' : pricesMissing && vault.state === 'ACTIVE' ? 'Deposit unavailable: missing prices' : `Deposits closed · ${vault.state}`}
        </button>
        <button type="button" disabled={!hasShares} onClick={() => onTrade('withdraw')} className="mt-2.5 w-full rounded-lg border border-[#3a5269] bg-[#111f2f] px-4 py-3 text-[12px] font-[800] text-[#d5e0eb] hover:border-[#637a90] hover:text-white disabled:cursor-not-allowed disabled:opacity-35">
          {hasShares ? 'Withdraw in kind' : 'No shares to withdraw'}
        </button>
      </div>
    </aside>
  );
}

function SectionTitle({children}: {children: string}) {
  return <h3 className="font-mono text-[9px] font-[850] tracking-[1.2px] text-[#91a5bc]">{children.toUpperCase()}</h3>;
}

function Metric({label, value}: {label: string; value: string}) {
  return (
    <div className="rounded-lg border border-[#22354a] bg-[#091521] px-3 py-2.5">
      <span className="block font-mono text-[8px] tracking-[0.5px] text-[#6f839b]">{label.toUpperCase()}</span>
      <strong className="mt-1 block truncate text-[12px] font-[800] text-[#eef4fa]" title={value}>{value}</strong>
    </div>
  );
}

function EmptyLine({children}: {children: React.ReactNode}) {
  return <p className="mt-3 rounded-lg border border-dashed border-[#30445a] bg-[#091521] p-3 text-[10px] leading-[1.6] text-[#778ba3]">{children}</p>;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return 'Unavailable';
  return value >= 0.01 && value < 99.99 ? value.toFixed(2).replace(/\.00$/, '') : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}
