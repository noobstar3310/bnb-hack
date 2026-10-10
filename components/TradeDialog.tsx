'use client';

import {useEffect, useRef, useState} from 'react';
import {formatUnits} from 'viem';
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
  const [previewState, setPreview] = useState<{key: string; result: RedeemResult} | null>(null);
  const [error, setError] = useState('');

  const myShares = BigInt(vault.position?.shares ?? '0');
  const redeemShares = (myShares * BigInt(percent)) / BigInt(100);
  const busy = step !== 'idle' && step !== 'done';
  const sharePrice = vault.sharePriceUsd === null ? null : Number(vault.sharePriceUsd);
  const parsed = Number(amount);
  const estShares = sharePrice && parsed > 0 ? parsed / sharePrice : null;
  // A preview belongs to one (vault, shares) request; a stale one is never shown.
  const previewKey = type === 'withdraw' && redeemShares > BigInt(0) ? `${vault.address}:${redeemShares}` : null;
  const payout = previewState && previewState.key === previewKey ? previewState.result : null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (type && !dialog.open) {
      setAmount('');
      setPercent(100);
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
    preview(vault.address, redeemShares)
      .then((result) => live && setPreview({key: previewKey, result}))
      .catch((e) => live && setError(explainError(e)));
    return () => {
      live = false;
    };
  }, [previewKey, vault.address, redeemShares, preview]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      if (type === 'invest') {
        const {shares} = await deposit(vault.address, amount);
        notify(`Invested ${money(parsed)} · ${tokenAmount(shares, 18, 4)} shares received.`);
      } else {
        await redeem(vault.address, redeemShares);
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
      className="m-auto max-h-[90vh] w-[480px] max-w-[calc(100vw-28px)] overflow-auto rounded-2xl border border-line-2 bg-white p-7 text-ink shadow-[0_30px_100px_#0e183a40]"
    >
      <form onSubmit={submit}>
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="mb-3 text-[12px] font-[750] tracking-[2px] text-[#738195]">
              {type === 'invest' ? 'INVEST USDT' : 'WITHDRAW YOUR SHARE'}
            </p>
            <h2 className="text-[20px] tracking-[-0.5px]">{vault.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy || pending}
            aria-label="Close"
            className="border-0 bg-transparent px-[3px] text-[28px] leading-none text-muted-3"
          >
            ×
          </button>
        </div>

        {type === 'invest' ? (
          <>
            <label htmlFor="amount" className="mt-[17px] block text-[14px] font-semibold">
              Amount in USDT
            </label>
            <input
              id="amount"
              name="amount"
              type="number"
              inputMode="decimal"
              min={0.01}
              step="any"
              required
              disabled={busy}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-2 w-full rounded-[7px] border border-field bg-field-bg p-3 text-[30px] text-ink"
            />
            <div className="my-5 rounded-lg bg-[#f1f4f8] p-[14px]">
              <Row label="Share price" value={sharePrice === null ? 'Unavailable' : money(sharePrice)} />
              <Row label="Estimated shares" value={estShares === null ? '—' : estShares.toFixed(4)} />
              <Row label="Fee" value="$0.00" />
            </div>
            <p className="text-[13px] leading-[1.65] text-muted-2">
              Shares are priced from live stock prices signed by the Folio server and checked by the vault.
              Your USDT stays in the vault until the curator invests it. You will sign up to two
              transactions: a USDT approval and the deposit.
            </p>
          </>
        ) : (
          <>
            <span className="mt-[17px] block text-[14px] font-semibold">How much of your position</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {PERCENTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={pending}
                  aria-pressed={percent === p}
                  onClick={() => setPercent(p)}
                  className={`rounded-[7px] border p-3 text-[15px] ${
                    percent === p ? 'border-ink-soft bg-ink-soft text-white' : 'border-line-2 bg-white text-[#253b5c]'
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>
            <div className="my-5 rounded-lg bg-[#f1f4f8] p-[14px]">
              <Row label="Shares to burn" value={tokenAmount(redeemShares, 18, 6)} />
              <p className="mb-1 mt-3 text-[13px] font-semibold">You receive</p>
              {payout ? (
                payout.assets.map((asset, i) => {
                  const h = symbolOf(asset);
                  if (payout.amounts[i] === BigInt(0)) return null;
                  const units = h ? Number(formatUnits(payout.amounts[i], h.decimals)) : null;
                  const usd = units !== null && h?.priceUsd ? money(units * Number(h.priceUsd)) : '';
                  return (
                    <Row
                      key={asset}
                      label={`${tokenAmount(payout.amounts[i], h?.decimals ?? 18, 4)} ${h?.symbol ?? asset}`}
                      value={usd}
                    />
                  );
                })
              ) : (
                <p className="text-[13px] text-muted-2">Calculating…</p>
              )}
            </div>
            <p className="text-[13px] leading-[1.65] text-muted-2">
              You get your exact share of every holding, in kind. That means stock tokens as well as
              USDT. Selling those tokens is up to you. Withdrawals work even when the vault is paused.
            </p>
          </>
        )}

        <p role="alert" className="mt-2 min-h-[18px] text-[14px] text-error">
          {error}
        </p>

        <button
          type="submit"
          disabled={busy || pending || (type === 'withdraw' && redeemShares === BigInt(0))}
          className="mt-3 w-full rounded-lg border border-ink-soft bg-ink-soft px-[18px] py-[13px] text-[14px] font-[650] text-white hover:bg-ink-hover disabled:opacity-60"
        >
          {type === 'invest' ? STEP_LABEL[step] : pending ? 'Confirm in your wallet…' : 'Confirm withdrawal'}
        </button>
      </form>
    </dialog>
  );
}

function Row({label, value}: {label: string; value: string}) {
  return (
    <div className="my-[6px] flex items-center justify-between gap-[10px] text-[14px]">
      <span className="text-[#67748a]">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

