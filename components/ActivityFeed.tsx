'use client';

import {useMemo, useState} from 'react';
import type {Address} from 'viem';
import {useConnection} from 'wagmi';
import {appChain} from '@/lib/contracts/wagmi';
import {shortAddress} from '@/lib/domain/format';
import {useHistory} from '@/lib/history/hooks';
import type {ActivityItem, ActivityType} from '@/lib/history/types';
import type {VaultView} from '@/lib/contracts/hooks';

type FilterCategory = 'all' | 'mine' | 'withdraw' | 'deposit' | 'trades' | 'plans';

interface Props {
  vaults: VaultView[];
  onSelectVault?: (address: string) => void;
}

const filters: Array<{id: FilterCategory; label: string}> = [
  {id: 'all', label: 'All activity'},
  {id: 'mine', label: 'My activity'},
  {id: 'deposit', label: 'Deposits'},
  {id: 'withdraw', label: 'Withdrawals'},
  {id: 'trades', label: 'Curator trades'},
  {id: 'plans', label: 'Plans & seeds'},
];

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function formatRealTime(ms: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(ms));
}

function formatDecimal(val: string, maxDecimals = 4): string {
  const num = Number.parseFloat(val);
  if (Number.isNaN(num)) return val;
  if (num === 0) return '0';
  if (num < 0.0001) return '<0.0001';
  return num.toLocaleString('en-US', {maximumFractionDigits: maxDecimals});
}

export function ActivityFeed({vaults, onSelectVault}: Props) {
  const {address: userAddress, isConnected} = useConnection();
  const [category, setCategory] = useState<FilterCategory>('all');
  const [selectedVault, setSelectedVault] = useState<string>('all');
  const [copiedTx, setCopiedTx] = useState<string | null>(null);
  const vaultAddress = selectedVault !== 'all' ? (selectedVault as Address) : undefined;

  const {data: items = [], isLoading, error, refetch, isFetching} = useHistory({vault: vaultAddress});

  const filteredItems = useMemo(() => {
    const userLower = userAddress?.toLowerCase();
    switch (category) {
      case 'mine':
        if (!userLower) return [];
        return items.filter((item) => 'investor' in item && item.investor.toLowerCase() === userLower);
      case 'withdraw':
        return items.filter((item) => item.type === 'redeem');
      case 'deposit':
        return items.filter((item) => item.type === 'deposit');
      case 'trades':
        return items.filter((item) => item.type === 'rebalance');
      case 'plans':
        return items.filter((item) => item.type === 'plan' || item.type === 'seed');
      default:
        return items;
    }
  }, [items, category, userAddress]);

  async function handleCopy(txHash: string) {
    try {
      await navigator.clipboard.writeText(txHash);
      setCopiedTx(txHash);
      window.setTimeout(() => setCopiedTx(null), 2_000);
    } catch {
      setCopiedTx(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[#26374d] bg-[#0d1827] shadow-[0_20px_70px_rgba(0,0,0,0.28)]">
      <header className="flex flex-col gap-3 border-b border-[#26374d] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <span className="font-mono text-[8px] font-[800] tracking-[1.2px] text-[#56d8c7]">CONFIRMED ON-CHAIN EVENTS</span>
          <h2 className="mt-1 text-[20px] font-[800] tracking-[-0.5px] text-[#f2f6fb]">Activity</h2>
          <p className="mt-1 text-[11px] text-[#8295ac]">Quote previews never appear here.</p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <select
            value={selectedVault}
            onChange={(event) => setSelectedVault(event.target.value)}
            aria-label="Filter by vault"
            className="min-w-0 flex-1 rounded-md border border-[#344960] bg-[#08131f] px-3 py-2 text-[11px] font-[700] text-[#dce6f2] outline-none focus:border-[#f1cf3c] sm:max-w-[240px]"
          >
            <option value="all">All vaults</option>
            {vaults.map((vault) => (
              <option key={vault.address} value={vault.address}>
                {vault.name} ({vault.symbol})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh on-chain activity"
            className="flex shrink-0 items-center gap-2 rounded-md border border-[#344960] bg-[#0a1624] px-3 py-2 text-[10px] font-[800] text-[#aebdce] hover:border-[#55708b] hover:text-white disabled:opacity-50"
          >
            <span className={`h-2 w-2 rounded-full ${isFetching ? 'animate-pulse bg-[#f1cf3c]' : 'bg-[#43c9b8]'}`} />
            LIVE
          </button>
        </div>
      </header>

      <div className="border-b border-[#24354a] bg-[#091522] p-2.5 sm:px-4">
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-[#07111c] p-1">
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setCategory(filter.id)}
              className={`shrink-0 rounded-md px-3 py-2 text-[10px] font-[800] transition ${
                category === filter.id
                  ? 'bg-[#f1cf3c] text-[#101722] shadow-[0_4px_16px_rgba(241,207,60,0.18)]'
                  : 'text-[#8194aa] hover:bg-[#112136] hover:text-[#e9f0f8]'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 sm:p-4">
        {category === 'mine' && !isConnected ? (
          <EmptyState title="Wallet not connected" detail="Connect your wallet to filter deposits and withdrawals made by that address." />
        ) : isLoading ? (
          <div className="grid min-h-[210px] place-items-center rounded-lg border border-[#24374e] bg-[#091522] text-center">
            <div>
              <span className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-[#334a64] border-t-[#f1cf3c]" />
              <p className="mt-3 text-[11px] text-[#8295ac]">Reading confirmed events...</p>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-[#6c3540] bg-[#28151c] p-5 text-[#f0a7af]">
            <p className="text-[12px] font-[800]">Activity could not be loaded</p>
            <p className="mt-1 break-words text-[10px] leading-5 text-[#c98791]">{error.message}</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState title="No confirmed transactions" detail={emptyDetail(category)} />
        ) : (
          <div className="divide-y divide-[#24364c] overflow-hidden rounded-lg border border-[#293c53] bg-[#091522]">
            {filteredItems.map((item) => (
              <ActivityRow
                key={item.id}
                item={item}
                onSelectVault={onSelectVault}
                onCopy={handleCopy}
                copied={copiedTx === item.txHash}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyState({title, detail}: {title: string; detail: string}) {
  return (
    <div className="grid min-h-[210px] place-items-center rounded-lg border border-dashed border-[#31475f] bg-[#091522] px-6 text-center">
      <div className="max-w-[430px]">
        <div className="mx-auto grid h-9 w-9 place-items-center rounded-full border border-[#355069] bg-[#0e2032] font-mono text-[12px] text-[#56d8c7]">0</div>
        <p className="mt-3 text-[13px] font-[800] text-[#dce6f2]">{title}</p>
        <p className="mt-1 text-[11px] leading-5 text-[#7f92a9]">{detail}</p>
      </div>
    </div>
  );
}

function emptyDetail(category: FilterCategory): string {
  switch (category) {
    case 'mine':
      return 'This wallet has no deposits or withdrawals in the selected vault yet.';
    case 'withdraw':
      return 'No in-kind redemptions have been confirmed yet.';
    case 'deposit':
      return 'No deposits have been confirmed yet.';
    case 'trades':
      return 'No curator rebalances have been confirmed yet.';
    case 'plans':
      return 'No plan or seed events have been confirmed yet.';
    default:
      return 'No matching on-chain events were found.';
  }
}

function ActivityRow({
  item,
  onSelectVault,
  onCopy,
  copied,
}: {
  item: ActivityItem;
  onSelectVault?: (address: string) => void;
  onCopy: (tx: string) => void;
  copied: boolean;
}) {
  const isBsc = appChain.id === 56;

  return (
    <article className="flex flex-col gap-3 p-3.5 transition hover:bg-[#0d1c2c] sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:px-4 sm:py-4">
      <div className="flex min-w-0 items-start gap-3">
        <ActivityBadge type={item.type} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              onClick={() => onSelectVault?.(item.vault)}
              className="text-left text-[12px] font-[800] text-[#edf3fa] hover:text-[#f1cf3c]"
            >
              {item.vaultName}
            </button>
            <span className="rounded border border-[#2c425a] bg-[#0c1b2a] px-1.5 py-0.5 font-mono text-[8px] text-[#8ea1b7]">{item.vaultSymbol}</span>
            <span className="font-mono text-[9px] text-[#74879d]">{formatRealTime(item.timestamp)}</span>
            <span className="text-[9px] text-[#52677f]">{timeAgo(item.timestamp)}</span>
          </div>
          <div className="mt-1.5 text-[11px] leading-5 text-[#aebdce]">{renderActivityContent(item)}</div>
          <span className="mt-1.5 inline-block font-mono text-[8px] text-[#52677f]">BLOCK {item.blockNumber}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
        {isBsc ? (
          <a
            href={`https://bscscan.com/tx/${item.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            title="View on BscScan"
            className="font-mono text-[9px] text-[#8196ad] hover:text-[#f1cf3c]"
          >
            {shortAddress(item.txHash)} EXTERNAL
          </a>
        ) : (
          <span title="Local test-chain transaction" className="font-mono text-[9px] text-[#71869e]">
            {shortAddress(item.txHash)} LOCAL
          </span>
        )}
        <button
          type="button"
          onClick={() => onCopy(item.txHash)}
          title="Copy transaction hash"
          className="rounded border border-[#344960] bg-[#0a1624] px-2 py-1 text-[9px] font-[800] text-[#9cafc3] hover:border-[#f1cf3c] hover:text-[#f1cf3c]"
        >
          {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>
    </article>
  );
}

function ActivityBadge({type}: {type: ActivityType}) {
  const styles: Record<ActivityType, {label: string; className: string}> = {
    deposit: {label: 'IN', className: 'border-[#25685f] bg-[#0d302d] text-[#65dfce]'},
    redeem: {label: 'OUT', className: 'border-[#754936] bg-[#2b1e17] text-[#f0a16f]'},
    rebalance: {label: 'SWAP', className: 'border-[#55477f] bg-[#201b38] text-[#bca9ff]'},
    plan: {label: 'PLAN', className: 'border-[#375876] bg-[#10263a] text-[#85c6f5]'},
    seed: {label: 'SEED', className: 'border-[#53612d] bg-[#202812] text-[#c7dc67]'},
  };
  const style = styles[type];
  return <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md border font-mono text-[7px] font-[900] ${style.className}`}>{style.label}</span>;
}

function renderActivityContent(item: ActivityItem) {
  const strong = 'font-[800] text-[#e7eef7]';
  switch (item.type) {
    case 'deposit':
      return (
        <span>
          Deposited <strong className={strong}>{formatDecimal(item.usdtAmount)} USDT</strong> into the vault and minted{' '}
          <strong className={strong}>{formatDecimal(item.sharesMinted)} shares</strong>
          <span className="ml-1 text-[#71869e]">by {shortAddress(item.investor)}</span>
        </span>
      );
    case 'redeem':
      return (
        <span>
          Redeemed <strong className={strong}>{formatDecimal(item.sharesBurned)} shares</strong> for{' '}
          {item.payouts.map((payout, index) => (
            <span key={payout.asset}>
              {index > 0 && <span className="mx-1 text-[#63778f]">+</span>}
              <strong className={strong}>{formatDecimal(payout.amount)} {payout.symbol}</strong>
            </span>
          ))}
          <span className="ml-1 text-[#71869e]">by {shortAddress(item.investor)}</span>
        </span>
      );
    case 'rebalance':
      return (
        <span>
          Curator swapped <strong className={strong}>{formatDecimal(item.sellAmount)} {item.sellSymbol}</strong> for{' '}
          <strong className={strong}>{formatDecimal(item.buyAmount)} {item.buySymbol}</strong>{' '}
          <span className="rounded border border-[#55477f] bg-[#201b38] px-1.5 py-0.5 text-[8px] font-[800] text-[#bca9ff]">PLAN V{item.planVersion}</span>
        </span>
      );
    case 'plan':
      return (
        <span>
          Curator published <strong className={strong}>plan v{item.version}</strong>:{' '}
          <span className="italic text-[#91a4ba]">&ldquo;{item.planText}&rdquo;</span>
        </span>
      );
    case 'seed':
      return (
        <span>
          Seeded with <strong className={strong}>{formatDecimal(item.usdtAmount)} USDT</strong> and minted{' '}
          <strong className={strong}>{formatDecimal(item.sharesMinted)} initial shares</strong>
        </span>
      );
  }
}
