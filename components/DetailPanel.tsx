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
      className="static self-start rounded-xl border border-line bg-white p-6 sm:sticky sm:top-[22px]"
    >
      <p className="mb-3 text-[12px] font-[750] tracking-[2px] text-[#738195]">VAULT DETAILS</p>
      <h2 className="mb-[6px] mt-[10px] text-[23px] tracking-[-0.7px]">{vault.name}</h2>
      <p className="text-[13px] leading-[1.65] text-muted-2">
        Curator {shortAddress(vault.manager)} · {vault.state.toLowerCase()}
      </p>

      <div className="mt-[10px] text-[32px] font-[650] tracking-[-1px]">
        {vault.sharePriceUsd === null ? 'Unavailable' : money(Number(vault.sharePriceUsd))}
      </div>
      <span className="text-[13px] leading-[1.65] text-muted-2">
        Per share · estimated at Binance prices
      </span>

      <hr className="my-[22px] border-0 border-t border-[#e5e9f0]" />

      <h3 className="text-[16px]">What the vault holds</h3>
      <div className="my-[15px] mb-5 flex h-[9px] gap-[3px] overflow-hidden rounded bg-[#f0f3f7]">
        {slices.map((s) =>
          s.percent === null ? null : (
            <span key={s.symbol} style={{width: `${s.percent}%`, background: s.color}} className="min-w-0" />
          ),
        )}
      </div>
      {held.map((h, i) => (
        <div key={h.asset} className="my-3 flex justify-between gap-3 text-[14px]">
          <span className="flex items-center">
            <i className="mr-[9px] inline-block h-2 w-2 rounded-[2px]" style={{background: slices[i]?.color}} />
            {tokenAmount(h.amount, h.decimals, 4)} {h.symbol}
          </span>
          <strong>{h.valueUsd === null ? 'No price' : money(Number(h.valueUsd))}</strong>
        </div>
      ))}
      <div className="my-3 flex justify-between text-[14px]">
        <span className="text-[#67748a]">Total</span>
        <strong>{vault.totalValueUsd === null ? 'Unavailable' : money(Number(vault.totalValueUsd))}</strong>
      </div>
      {pricesMissing ? (
        <p className="rounded-md bg-[#fff6e3] p-[10px] text-[13px] leading-[1.6] text-[#7a5310]">
          Live prices are unavailable for some holdings right now, so values are hidden and deposits are paused.
          Withdrawals still work.
        </p>
      ) : (
        <p className="text-[13px] leading-[1.65] text-muted-2">
          Read from the vault contract. Idle USDT waits here until the curator invests it.
        </p>
      )}

      <hr className="my-[22px] border-0 border-t border-[#e5e9f0]" />

      <h3 className="text-[16px]">
        Curator&apos;s target
        {vault.target && <span className="pl-2 text-[12px] font-normal text-muted-3">v{vault.target.version}</span>}
      </h3>
      {vault.target ? (
        <>
          <div className="mt-3 flex justify-between text-[12px] text-muted-3">
            <span>Stock</span>
            <span>Target · now</span>
          </div>
          {vault.target.weights.map((w) => {
            const now = slices.find((sl) => sl.symbol === w.symbol)?.percent ?? 0;
            return (
              <div key={w.asset} className="my-2 flex justify-between text-[14px]">
                <span>{w.symbol}</span>
                <span>
                  <strong>{(w.bps / 100).toFixed(0)}%</strong>
                  <span className="pl-2 text-muted-2">{vault.totalValueUsd === null ? '—' : `${now.toFixed(0)}%`}</span>
                </span>
              </div>
            );
          })}
          <p className="text-[13px] leading-[1.65] text-muted-2">
            Published on-chain by the curator. Actual holdings drift with prices until they rebalance.
          </p>
        </>
      ) : (
        <p className="mt-2 text-[13px] leading-[1.65] text-muted-2">
          The curator has not published target weights on-chain yet.
        </p>
      )}

      <h3 className="mt-5 text-[16px]">Vault rules</h3>
      <div className="my-3 flex flex-wrap gap-[6px]">
        {['Approved stocks only', 'Withdraw any time', 'Shares not transferable', '0% fees'].map((rule) => (
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
        <strong>
          {!vault.position
            ? '—'
            : vault.position.valueUsd === null
              ? `${tokenAmount(vault.position.shares, 18, 4)} shares`
              : money(Number(vault.position.valueUsd))}
        </strong>
      </div>

      <button
        type="button"
        disabled={!connected || !acceptsDeposits}
        onClick={() => onTrade('invest')}
        className="mt-3 w-full rounded-lg border border-ink-soft bg-ink-soft px-[18px] py-[13px] text-[14px] font-[650] text-white hover:bg-ink-hover disabled:opacity-50"
      >
        {!connected
          ? 'Connect a wallet to invest'
          : acceptsDeposits
            ? 'Invest USDT'
            : pricesMissing && vault.state === 'ACTIVE'
              ? 'Deposits paused: no live prices'
              : `Deposits closed (${vault.state.toLowerCase()})`}
      </button>
      {hasShares && (
        <button
          type="button"
          onClick={() => onTrade('withdraw')}
          className="mt-[9px] w-full rounded-lg border border-line-2 bg-white p-3 text-[14px] text-[#253b5c]"
        >
          Withdraw
        </button>
      )}
    </aside>
  );
}
