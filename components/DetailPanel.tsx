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

export function DetailPanel({vault, connected, onTrade}: Props) {
  const slices = allocation(vault);
  const held = vault.holdings.filter((h) => h.amount !== '0');
  const hasShares = Boolean(vault.position && vault.position.shares !== '0');
  // A holding without a live price makes the signed-price deposit impossible; say so up front.
  const pricesMissing = held.some((h) => h.valueUsd === null);
  const acceptsDeposits = vault.state === 'ACTIVE' && !pricesMissing;

  return (
    <aside
      aria-label="Selected vault"
      className="static self-start rounded-3xl border border-black/[0.06] bg-white/95 p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)] backdrop-blur-xl sm:sticky sm:top-24 sm:p-7"
    >
      {/* Header Info */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          Vault Inspector
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
          {vault.symbol}
        </span>
      </div>

      <h2 className="mt-2 text-[22px] font-bold tracking-tight text-slate-900 sm:text-[24px]">
        {vault.name}
      </h2>
      <p className="mt-1 text-[13px] text-slate-500">
        Curator <span className="font-mono text-slate-600">{shortAddress(vault.manager)}</span> ·{' '}
        <span className="capitalize">{vault.state.toLowerCase()}</span>
      </p>

      {/* Share Price Display */}
      <div className="mt-5 rounded-2xl bg-gradient-to-b from-slate-50 to-slate-100/60 p-4.5 border border-black/[0.04]">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
          Share Net Asset Value
        </span>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[32px] font-bold tracking-tight text-slate-950 tabular-nums sm:text-[36px]">
            {vault.sharePriceUsd === null ? 'Unavailable' : money(Number(vault.sharePriceUsd))}
          </span>
          {vault.sharePriceUsd !== null && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          )}
        </div>
        <p className="mt-1 text-[12px] text-slate-500">
          Real-time unit valuation calculated from Binance signed order books.
        </p>
      </div>

      <hr className="my-5 border-0 border-t border-black/[0.06]" />

      {/* Holdings Breakdown */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-bold tracking-tight text-slate-900">
            Vault Portfolio Holdings
          </h3>
          <span className="text-[12px] font-semibold text-slate-500">
            {held.length} {held.length === 1 ? 'Asset' : 'Assets'}
          </span>
        </div>

        {/* Continuous Allocation Bar */}
        <div className="my-3 flex h-2 w-full gap-1 overflow-hidden rounded-full bg-slate-100 p-0.5">
          {slices.map((s) =>
            s.percent === null ? null : (
              <span
                key={s.symbol}
                style={{width: `${s.percent}%`, background: s.color}}
                className="h-full rounded-full transition-all"
              />
            ),
          )}
        </div>

        {/* Holdings List */}
        <div className="mt-3 divide-y divide-black/[0.04]">
          {held.map((h, i) => (
            <div key={h.asset} className="flex items-center justify-between py-2.5 text-[13px]">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{background: slices[i]?.color ?? '#94a3b8'}} />
                <span className="font-semibold text-slate-800">{h.symbol}</span>
                <span className="text-slate-400 font-mono text-[12px]">
                  ({tokenAmount(h.amount, h.decimals, 3)})
                </span>
              </span>
              <strong className="font-semibold text-slate-900 tabular-nums">
                {h.valueUsd === null ? 'No price' : money(Number(h.valueUsd))}
              </strong>
            </div>
          ))}

          <div className="flex items-center justify-between pt-3 text-[14px]">
            <span className="font-semibold text-slate-600">Total Portfolio Value</span>
            <strong className="text-[16px] font-bold text-slate-950 tabular-nums">
              {vault.totalValueUsd === null ? 'Unavailable' : money(Number(vault.totalValueUsd))}
            </strong>
          </div>
        </div>

        {pricesMissing ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-[12px] leading-[1.5] text-amber-900">
            <strong>Deposits paused:</strong> Live prices are unavailable for some holdings right now. Redemptions remain enabled.
          </div>
        ) : (
          <p className="mt-2 text-[12px] leading-[1.5] text-slate-400">
            Idle USDT sits in the smart contract until the manager executes an allowlisted stock rebalance.
          </p>
        )}
      </div>

      <hr className="my-5 border-0 border-t border-black/[0.06]" />

      {/* Curator Plan */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-bold tracking-tight text-slate-900">
            Curator Investment Plan
          </h3>
          {vault.plan && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
              v{vault.plan.version}
            </span>
          )}
        </div>

        {vault.plan ? (
          <div className="mt-2.5 rounded-2xl border border-black/[0.05] bg-slate-50/80 p-3.5">
            <p className="whitespace-pre-wrap break-words text-[13px] leading-[1.6] text-slate-700 italic">
              &ldquo;{vault.plan.text}&rdquo;
            </p>
            <p className="mt-2 text-[11px] text-slate-400">
              ✓ On-chain verified thesis. Compare with holdings above before investing.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-[12px] text-slate-400">
            The curator has not posted an on-chain plan yet; trades are locked until posted.
          </p>
        )}
      </div>

      {/* Vault Guarantees Tags */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {['Approved Stocks Only', 'In-Kind Withdrawals', 'Non-Transferable Shares', '0% Protocol Fees'].map((rule) => (
          <span
            key={rule}
            className="rounded-full border border-black/[0.05] bg-slate-100/80 px-2.5 py-0.5 text-[11px] font-medium text-slate-600"
          >
            {rule}
          </span>
        ))}
      </div>

      <hr className="my-5 border-0 border-t border-black/[0.06]" />

      {/* Investor Position */}
      <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-[13px]">
        <span className="font-semibold text-slate-600">Your Vault Holding</span>
        <strong className="font-bold text-slate-900 tabular-nums">
          {!vault.position
            ? '—'
            : vault.position.valueUsd === null
              ? `${tokenAmount(vault.position.shares, 18, 4)} shares`
              : money(Number(vault.position.valueUsd))}
        </strong>
      </div>

      {/* Action Buttons */}
      <button
        type="button"
        disabled={!connected || !acceptsDeposits}
        onClick={() => onTrade('invest')}
        className="apple-press mt-4 w-full rounded-full border border-slate-900 bg-gradient-to-b from-slate-800 to-slate-950 px-5 py-3.5 text-[14px] font-bold text-white shadow-sm hover:from-slate-700 hover:to-slate-900 disabled:opacity-50"
      >
        {!connected
          ? 'Connect Wallet to Invest'
          : acceptsDeposits
            ? 'Deposit USDT'
            : pricesMissing && vault.state === 'ACTIVE'
              ? 'Deposits Paused: No Live Prices'
              : `Deposits Closed (${vault.state.toLowerCase()})`}
      </button>

      {hasShares && (
        <button
          type="button"
          onClick={() => onTrade('withdraw')}
          className="apple-press mt-2 w-full rounded-full border border-black/[0.08] bg-white p-3 text-[13px] font-semibold text-slate-800 shadow-2xs hover:bg-slate-50"
        >
          Withdraw In-Kind
        </button>
      )}
    </aside>
  );
}

