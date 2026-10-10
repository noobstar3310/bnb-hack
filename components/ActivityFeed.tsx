'use client';

import {useMemo, useState} from 'react';
import type {Address} from 'viem';
import {useConnection} from 'wagmi';
import {shortAddress} from '@/lib/domain/format';
import {useHistory} from '@/lib/history/hooks';
import type {ActivityItem, ActivityType} from '@/lib/history/types';
import type {VaultView} from '@/lib/contracts/hooks';

type FilterCategory = 'all' | 'mine' | 'withdraw' | 'deposit' | 'trades' | 'plans';

interface Props {
  vaults: VaultView[];
  onSelectVault?: (address: string) => void;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function formatRealTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[d.getMonth()] ?? 'Oct';
  const day = pad(d.getDate());
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${month} ${day}, ${year} · ${hours}:${minutes}:${seconds}`;
}

function formatDecimal(val: string, maxDecimals = 4): string {
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  if (num === 0) return '0';
  if (num < 0.0001) return '<0.0001';
  return num.toLocaleString('en-US', {
    maximumFractionDigits: maxDecimals,
  });
}

export function ActivityFeed({vaults, onSelectVault}: Props) {
  const {address: userAddress, isConnected} = useConnection();
  const [category, setCategory] = useState<FilterCategory>('all');
  const [selectedVault, setSelectedVault] = useState<string>('all');
  const [copiedTx, setCopiedTx] = useState<string | null>(null);

  const vaultAddress = selectedVault !== 'all' ? (selectedVault as Address) : undefined;

  // Fetch all activities for the selected vault (or all vaults), cached and auto-refreshing every 3s
  const {data: items = [], isLoading, error, refetch, isFetching} = useHistory({
    vault: vaultAddress,
  });

  // Filter items based on active category
  const filteredItems = useMemo(() => {
    const userLower = userAddress?.toLowerCase();
    switch (category) {
      case 'mine':
        if (!userLower) return [];
        return items.filter((i) => 'investor' in i && (i.investor as string).toLowerCase() === userLower);
      case 'withdraw':
        return items.filter((i) => i.type === 'redeem');
      case 'deposit':
        return items.filter((i) => i.type === 'deposit');
      case 'trades':
        return items.filter((i) => i.type === 'rebalance');
      case 'plans':
        return items.filter((i) => i.type === 'plan' || i.type === 'seed');
      case 'all':
      default:
        return items;
    }
  }, [items, category, userAddress]);

  const handleCopy = (txHash: string) => {
    navigator.clipboard.writeText(txHash);
    setCopiedTx(txHash);
    setTimeout(() => setCopiedTx(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Controls & Category Filters */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Category Pills (Clean labels without count numbers) */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-white p-1">
          <button
            type="button"
            onClick={() => setCategory('all')}
            className={`rounded-md px-3.5 py-1.5 text-[13px] font-[600] transition-colors ${
              category === 'all'
                ? 'bg-ink text-white'
                : 'text-muted hover:text-ink'
            }`}
          >
            All Activity
          </button>

          <button
            type="button"
            onClick={() => setCategory('mine')}
            className={`rounded-md px-3.5 py-1.5 text-[13px] font-[600] transition-colors ${
              category === 'mine'
                ? 'bg-ink text-white'
                : 'text-muted hover:text-ink'
            }`}
          >
            My Activity
          </button>

          <button
            type="button"
            onClick={() => setCategory('withdraw')}
            className={`rounded-md px-3.5 py-1.5 text-[13px] font-[600] transition-colors ${
              category === 'withdraw'
                ? 'bg-ink text-white'
                : 'text-muted hover:text-ink'
            }`}
          >
            Withdrawals
          </button>

          <button
            type="button"
            onClick={() => setCategory('deposit')}
            className={`rounded-md px-3.5 py-1.5 text-[13px] font-[600] transition-colors ${
              category === 'deposit'
                ? 'bg-ink text-white'
                : 'text-muted hover:text-ink'
            }`}
          >
            Deposits
          </button>

          <button
            type="button"
            onClick={() => setCategory('trades')}
            className={`rounded-md px-3.5 py-1.5 text-[13px] font-[600] transition-colors ${
              category === 'trades'
                ? 'bg-ink text-white'
                : 'text-muted hover:text-ink'
            }`}
          >
            Curator Trades
          </button>

          <button
            type="button"
            onClick={() => setCategory('plans')}
            className={`rounded-md px-3.5 py-1.5 text-[13px] font-[600] transition-colors ${
              category === 'plans'
                ? 'bg-ink text-white'
                : 'text-muted hover:text-ink'
            }`}
          >
            Plans & Seeds
          </button>
        </div>

        {/* Vault Filter Dropdown & Live Status */}
        <div className="flex items-center gap-2">
          <select
            value={selectedVault}
            onChange={(e) => setSelectedVault(e.target.value)}
            aria-label="Filter by vault"
            className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] font-[550] text-[#253b5c] shadow-xs outline-hidden focus:border-ink"
          >
            <option value="all">All Vaults</option>
            {vaults.map((v) => (
              <option key={v.address} value={v.address}>
                {v.name} ({v.symbol})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Manual sync"
            className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-muted hover:text-ink disabled:opacity-50"
          >
            <span className={`inline-block h-2 w-2 rounded-full ${isFetching ? 'animate-ping bg-amber-500' : 'bg-emerald-500'}`} />
            <span>{'Live'}</span>
          </button>
        </div>
      </div>

      {/* Disconnected state when "My Activity" is selected */}
      {category === 'mine' && !isConnected && (
        <div className="rounded-xl border border-dashed border-[#c6d0de] bg-white p-8 text-center text-muted-2">
          <p className="text-[15px] font-[600] text-ink">Wallet not connected</p>
          <p className="mt-1 text-[13px]">
            Connect your browser wallet to view your personal deposit and withdrawal history, or switch to the <strong>Withdrawals</strong> or <strong>Deposits</strong> tabs above.
          </p>
        </div>
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="rounded-xl border border-line bg-white p-12 text-center text-muted-2">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-line border-t-ink" />
          <p className="mt-3 text-[14px]">Fetching transaction logs from blockchain…</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-dashed border-[#fca5a5] bg-[#fef2f2] p-8 text-center text-[#991b1b]">
          <p className="text-[14px] font-[600]">Failed to load activity logs</p>
          <p className="mt-1 text-[13px]">{error.message}</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#c6d0de] bg-white p-12 text-center text-muted-2">
          <p className="text-[15px] font-[600] text-ink">No transactions found</p>
          <p className="mt-1 text-[13px]">
            {category === 'mine'
              ? 'You have not made any deposits or withdrawals in the selected vault yet.'
              : category === 'withdraw'
                ? 'No redemptions or withdrawals have been recorded yet.'
                : category === 'deposit'
                  ? 'No deposits have been recorded yet.'
                  : category === 'trades'
                    ? 'No curator rebalances have been executed yet.'
                    : 'No on-chain events found for this filter.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white shadow-xs">
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
  );
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
  return (
    <div className="flex flex-col gap-3 p-4 transition-colors hover:bg-[#fafbfc] sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5">
      {/* Left: Badge + Main Description + Exact Real Timeframe */}
      <div className="flex items-start gap-3 sm:items-center sm:gap-4">
        <ActivityBadge type={item.type} />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              onClick={() => onSelectVault?.(item.vault)}
              className="cursor-pointer text-[13px] font-[700] text-ink hover:underline"
            >
              {item.vaultName}
            </span>
            <span className="rounded bg-[#f0f3f7] px-1.5 py-0.5 font-mono text-[11px] text-[#607086]">
              {item.vaultSymbol}
            </span>
            <span className="text-[12px] text-muted-3">·</span>
            {/* Real Exact Timeframe */}
            <span className="font-mono text-[12px] font-medium text-[#4b5563]">
              {formatRealTime(item.timestamp)}
            </span>
            <span className="text-[11px] text-muted-3">
              ({timeAgo(item.timestamp)})
            </span>
            <span className="rounded bg-[#f1f5f9] px-1.5 py-0.5 font-mono text-[10px] text-[#64748b]">
              Block #{item.blockNumber}
            </span>
          </div>

          <div className="mt-1 text-[14px] text-[#253b5c]">
            {renderActivityContent(item)}
          </div>
        </div>
      </div>

      {/* Right: Block / Tx Hash Explorer Link */}
      <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
        <a
          href={`https://bscscan.com/tx/${item.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          title="View on BSCScan"
          className="inline-flex items-center gap-1 font-mono text-[12px] text-[#5c6e86] hover:text-ink hover:underline"
        >
          {shortAddress(item.txHash)}
          <span className="text-[10px]">↗</span>
        </a>
        <button
          type="button"
          onClick={() => onCopy(item.txHash)}
          title="Copy transaction hash"
          className="rounded border border-line bg-white px-1.5 py-0.5 text-[11px] text-[#6b7c93] hover:border-ink hover:text-ink"
        >
          {copied ? '✓' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

function ActivityBadge({type}: {type: ActivityType}) {
  switch (type) {
    case 'deposit':
      return (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#cde8cf] bg-[#eef8ef] text-[13px] font-bold text-[#1b7a2d]">
          ↓
        </span>
      );
    case 'redeem':
      return (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#fed7aa] bg-[#fff7ed] text-[13px] font-bold text-[#c2410c]">
          ↑
        </span>
      );
    case 'rebalance':
      return (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#ddd6fe] bg-[#f5f3ff] text-[13px] font-bold text-[#6d28d9]">
          ⇄
        </span>
      );
    case 'plan':
      return (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#bae6fd] bg-[#f0f9ff] text-[13px] font-bold text-[#0369a1]">
          📝
        </span>
      );
    case 'seed':
      return (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] text-[13px] font-bold text-[#15803d]">
          🌱
        </span>
      );
  }
}

function renderActivityContent(item: ActivityItem) {
  switch (item.type) {
    case 'deposit':
      return (
        <span>
          Deposited <strong className="font-[650] text-ink">{formatDecimal(item.usdtAmount)} USDT</strong> →
          Minted <strong className="font-[650] text-ink">{formatDecimal(item.sharesMinted)} shares</strong>
          <span className="ml-1 text-[12px] text-muted-3">by {shortAddress(item.investor)}</span>
        </span>
      );

    case 'redeem':
      return (
        <span>
          Redeemed <strong className="font-[650] text-ink">{formatDecimal(item.sharesBurned)} shares</strong> →
          Payout:{' '}
          {item.payouts.map((p, i) => (
            <span key={p.asset}>
              {i > 0 && <span className="mx-1 text-muted-3">+</span>}
              <strong className="font-[650] text-ink">
                {formatDecimal(p.amount)} {p.symbol}
              </strong>
            </span>
          ))}
          <span className="ml-1 text-[12px] text-muted-3">by {shortAddress(item.investor)}</span>
        </span>
      );

    case 'rebalance':
      return (
        <span>
          Curator Rebalance: Swapped{' '}
          <strong className="font-[650] text-ink">
            {formatDecimal(item.sellAmount)} {item.sellSymbol}
          </strong>{' '}
          →{' '}
          <strong className="font-[650] text-ink">
            {formatDecimal(item.buyAmount)} {item.buySymbol}
          </strong>{' '}
          <span className="rounded bg-[#f5f3ff] px-1.5 py-0.5 text-[11px] font-[600] text-[#6d28d9]">
            Plan v{item.planVersion}
          </span>
        </span>
      );

    case 'plan':
      return (
        <span>
          Curator posted <strong className="font-[650] text-ink">Plan v{item.version}</strong>:{' '}
          <span className="italic text-[#475569]">&ldquo;{item.planText}&rdquo;</span>
        </span>
      );

    case 'seed':
      return (
        <span>
          Vault seeded with <strong className="font-[650] text-ink">{formatDecimal(item.usdtAmount)} USDT</strong> →
          Minted <strong className="font-[650] text-ink">{formatDecimal(item.sharesMinted)} initial shares</strong>
        </span>
      );
  }
}
