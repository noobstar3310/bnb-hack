'use client';

import {useEffect, useRef, useState} from 'react';
import {formatUnits, type Address} from 'viem';
import {money, tokenAmount} from '@/lib/domain/format';
import {explainError, useDeposit, useRedeem, type DepositStep, type RedeemResult, type VaultView} from '@/lib/contracts/hooks';
import type {TradeType} from './DetailPanel';
import {useNotify} from './Toast';

interface Props {
  type: TradeType | null;
  vault: VaultView;
  onClose: () => void;
}

const STEP_LABEL: Record<DepositStep, string> = {
  idle: 'Confirm investment',
  approving: 'Approve USDT in your wallet…',
  pricing: 'Getting signed prices…',
  depositing: 'Confirm the deposit in your wallet…',
  done: 'Done',
};

const PERCENTS = [25, 50, 100];

export function TradeDialog({type, vault, onClose}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const notify = useNotify();
  const {deposit, step, reset} = useDeposit();
  const {redeem, preview, pending} = useRedeem();
  const [amount, setAmount] = useState('');
  const [percent, setPercent] = useState(100);
  const [previewState, setPreview] = useState<{key: string; result?: RedeemResult; error?: string} | null>(null);
  const [forfeit, setForfeit] = useState<Address[]>([]);
  const [showForfeit, setShowForfeit] = useState(false);
  const [error, setError] = useState('');

  const myShares = BigInt(vault.position?.shares ?? '0');
  const redeemShares = (myShares * BigInt(percent)) / BigInt(100);
  const busy = step !== 'idle' && step !== 'done';
  const sharePrice = vault.sharePriceUsd === null ? null : Number(vault.sharePriceUsd);
  const parsed = Number(amount);
  const estShares = sharePrice && parsed > 0 ? parsed / sharePrice : null;
  // A preview belongs to one (vault, shares, forfeit) request; a stale one is never shown.
  const previewKey =
    type === 'withdraw' && redeemShares > BigInt(0) ? `${vault.address}:${redeemShares}:${forfeit.join(',')}` : null;
  const current = previewState && previewState.key === previewKey ? previewState : null;
  const payout = current?.result ?? null;
  const previewError = current?.error ?? null;
  const leavable = vault.holdings.filter((h) => h.amount !== '0');

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (type && !dialog.open) {
      setAmount('');
      setPercent(100);
      setForfeit([]);
      setShowForfeit(false);
      setError('');
      reset();
      dialog.showModal();
    } else if (!type && dialog.open) {
      dialog.close();
    }
  }, [type, reset]);

  // Withdrawal preview: simulate the redemption so the investor sees exactly what arrives.
  useEffect(() => {
    if (!previewKey) return;
    let live = true;
    preview(vault.address, redeemShares, forfeit)
      .then((result) => live && setPreview({key: previewKey, result}))
      .catch((e) => live && setPreview({key: previewKey, error: explainError(e)}));
    return () => {
      live = false;
    };
  }, [previewKey, vault.address, redeemShares, forfeit, preview]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      if (type === 'invest') {
        const {shares} = await deposit(vault.address, amount);
        notify(`Invested ${money(parsed)} · ${tokenAmount(shares, 18, 4)} shares received.`);
      } else {
        await redeem(vault.address, redeemShares, forfeit);
        notify(`Withdrew ${tokenAmount(redeemShares, 18, 4)} shares. Tokens sent to your wallet.`);
      }
      onClose();
    } catch (err) {
      setError(explainError(err));
    }
  }

  const symbolOf = (asset: string) => vault.holdings.find((h) => h.asset === asset);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto max-h-[92vh] w-[490px] max-w-[calc(100vw-32px)] overflow-auto rounded-3xl border border-black/[0.08] bg-white p-6 text-slate-900 shadow-[0_30px_100px_rgba(15,23,42,0.25)] backdrop-blur-2xl sm:p-8"
    >
      <form onSubmit={submit}>
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-3 border-b border-black/[0.05] pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.05] bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600">
              <span className={`h-1.5 w-1.5 rounded-full ${type === 'invest' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
              {type === 'invest' ? 'Deposit USDT' : 'In-Kind Redemption'}
            </div>
            <h2 className="mt-1.5 text-[20px] font-bold tracking-tight text-slate-950 sm:text-[22px]">
              {vault.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy || pending}
            aria-label="Close"
            className="apple-press grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-[18px] text-slate-500 hover:bg-slate-200 hover:text-slate-800 disabled:opacity-40"
          >
            ×
          </button>
        </div>

        {type === 'invest' ? (
          <>
            <label htmlFor="amount" className="block text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-400">
              Deposit Amount
            </label>
            <div className="relative mt-2 flex items-center rounded-2xl border border-black/[0.08] bg-slate-50/70 px-4 py-3 shadow-inner focus-within:border-slate-900 focus-within:bg-white focus-within:ring-2 focus-within:ring-slate-900/10">
              <span className="text-[28px] font-bold text-slate-400 sm:text-[32px]">$</span>
              <input
                id="amount"
                name="amount"
                type="number"
                inputMode="decimal"
                min={0.01}
                step="any"
                required
                disabled={busy}
                placeholder="100.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full border-0 bg-transparent px-2 text-[30px] font-bold tracking-tight text-slate-950 tabular-nums outline-none placeholder:text-slate-300 sm:text-[36px]"
              />
              <span className="shrink-0 rounded-full border border-black/[0.06] bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-2xs">
                USDT
              </span>
            </div>

            {/* Receipt Summary Card */}
            <div className="my-5 rounded-2xl border border-black/[0.04] bg-slate-50/80 p-4 divide-y divide-black/[0.04]">
              <Row label="Current Share NAV" value={sharePrice === null ? 'Unavailable' : money(sharePrice)} />
              <Row label="Estimated Shares Received" value={estShares === null ? '—' : estShares.toFixed(4)} />
              <Row label="Deposit Fee" value="$0.00 (0%)" valueClass="text-emerald-600 font-bold" />
            </div>

            <p className="text-[12px] leading-[1.6] text-slate-500">
              Shares are priced via live Binance order books signed by the Folio oracle. You will sign two transactions: USDT ERC-20 approval, followed by on-chain deposit.
            </p>
          </>
        ) : (
          <>
            <span className="block text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-400">
              Redemption Percentage
            </span>
            <div className="mt-2 flex rounded-full border border-black/[0.06] bg-slate-100 p-1">
              {PERCENTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={pending}
                  aria-pressed={percent === p}
                  onClick={() => setPercent(p)}
                  className={`apple-press flex-1 rounded-full py-2 text-[13px] font-semibold transition-all ${
                    percent === p
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-black/[0.04]'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>

            {/* Redemption Output Receipt */}
            <div className="my-5 rounded-2xl border border-black/[0.04] bg-slate-50/80 p-4">
              <Row label="Shares to Burn" value={tokenAmount(redeemShares, 18, 4)} />
              <div className="mt-3 border-t border-black/[0.05] pt-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                  In-Kind Tokens Returning to Your Wallet
                </span>
                <div className="mt-2 space-y-1.5">
                  {payout ? (
                    payout.assets.map((asset, i) => {
                      const h = symbolOf(asset);
                      if (payout.amounts[i] === BigInt(0)) return null;
                      const units = h ? Number(formatUnits(payout.amounts[i], h.decimals)) : null;
                      const usd = units !== null && h?.priceUsd ? money(units * Number(h.priceUsd)) : '';
                      return (
                        <div key={asset} className="flex items-center justify-between text-[13px]">
                          <span className="font-semibold text-slate-800">
                            {tokenAmount(payout.amounts[i], h?.decimals ?? 18, 4)} {h?.symbol ?? asset}
                          </span>
                          <span className="font-medium text-slate-500 tabular-nums">{usd}</span>
                        </div>
                      );
                    })
                  ) : previewError ? (
                    <p className="text-[12px] text-rose-600">
                      {previewError} One holding may be paused by its token issuer. Tick below to forfeit and withdraw all other tokens.
                    </p>
                  ) : (
                    <div className="flex items-center gap-2 text-[12px] text-slate-400 py-1">
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-slate-300 border-t-slate-700" />
                      Simulating in-kind redemption…
                    </div>
                  )}
                </div>
              </div>
            </div>

            {showForfeit || previewError ? (
              <fieldset className="mb-4 rounded-2xl border border-black/[0.06] bg-slate-50/60 p-3.5">
                <legend className="px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                  Leave Token Behind (Emergency Forfeit)
                </legend>
                <p className="mb-2 text-[11px] leading-[1.5] text-slate-500">
                  If an underlying stock token transfer is paused by its issuer, leave it behind to redeem everything else.
                </p>
                {leavable.map((h) => (
                  <label key={h.asset} className="my-1 flex items-center gap-2 text-[13px] text-slate-700 font-medium">
                    <input
                      type="checkbox"
                      disabled={pending}
                      checked={forfeit.includes(h.asset)}
                      onChange={(e) =>
                        setForfeit((list) => (e.target.checked ? [...list, h.asset] : list.filter((a) => a !== h.asset)))
                      }
                      className="rounded accent-slate-900"
                    />
                    {h.symbol}
                  </label>
                ))}
              </fieldset>
            ) : (
              <button
                type="button"
                onClick={() => setShowForfeit(true)}
                className="mb-3 block text-[12px] font-semibold text-blue-600 hover:text-blue-700 hover:underline"
              >
                A token won&apos;t transfer? Leave it behind
              </button>
            )}

            <p className="text-[12px] leading-[1.6] text-slate-500">
              Guaranteed in-kind redemptions: you receive your mathematical percentage of every single stock token and cash held by the vault.
            </p>
          </>
        )}

        {error && (
          <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-700 font-medium">
            {error}
          </div>
        )}

        {/* Prominent Action Button */}
        <button
          type="submit"
          disabled={busy || pending || (type === 'withdraw' && (redeemShares === BigInt(0) || !payout))}
          className="apple-press mt-5 w-full rounded-full border border-slate-900 bg-gradient-to-b from-slate-800 to-slate-950 px-5 py-3.5 text-[14px] font-bold text-white shadow-sm hover:from-slate-700 hover:to-slate-900 disabled:opacity-50"
        >
          {type === 'invest' ? STEP_LABEL[step] : pending ? 'Confirm in Wallet…' : 'Confirm In-Kind Withdrawal'}
        </button>
      </form>
    </dialog>
  );
}

function Row({label, value, valueClass = 'text-slate-900'}: {label: string; value: string; valueClass?: string}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-[13px]">
      <span className="text-slate-500">{label}</span>
      <strong className={`font-semibold tabular-nums ${valueClass}`}>{value}</strong>
    </div>
  );
}

