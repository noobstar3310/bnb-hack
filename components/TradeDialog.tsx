'use client';

import { useEffect, useRef, useState } from 'react';
import { floorToCents, money } from '@/lib/domain/format';
import { sharePrice, type TradeType } from '@/lib/domain/vault';
import { useStore } from '@/lib/state/store';

interface Props {
  type: TradeType | null;
  onClose: () => void;
}

export function TradeDialog({ type, onClose }: Props) {
  const { selected, assets, balance, dispatch, notify } = useStore();
  const ref = useRef<HTMLDialogElement>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const price = sharePrice(selected, assets);
  const max = type === 'invest' ? balance : selected.userShares * price;
  const parsed = Number(amount);
  const shares = Number.isFinite(parsed) && parsed > 0 ? parsed / price : 0;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (type && !dialog.open) {
      setAmount('');
      setError('');
      dialog.showModal();
    } else if (!type && dialog.open) {
      dialog.close();
    }
  }, [type]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!type) return;
    try {
      dispatch({ type: 'transact', id: selected.id, tradeType: type, amount: Number(amount) });
      notify(
        `${money(Number(amount))} ${type === 'invest' ? 'invested' : 'withdrawn'} · ${shares.toFixed(
          4,
        )} shares ${type === 'invest' ? 'received' : 'redeemed'}.`,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

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
              {type === 'invest' ? 'INVEST DEMO FUNDS' : 'REDEEM YOUR SHARES'}
            </p>
            <h2 className="text-[20px] tracking-[-0.5px]">{selected.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="border-0 bg-transparent px-[3px] text-[28px] leading-none text-muted-3"
          >
            ×
          </button>
        </div>

        <label htmlFor="amount" className="mt-[17px] block text-[14px] font-semibold">
          Amount in demo dollars
        </label>
        <div className="flex items-center gap-[10px] text-[28px]">
          <span>$</span>
          <input
            id="amount"
            name="amount"
            type="number"
            inputMode="decimal"
            min={0.01}
            step={0.01}
            max={floorToCents(max)}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-2 w-full rounded-[7px] border border-field bg-field-bg p-3 text-[30px] text-ink"
          />
        </div>

        <div className="my-3 flex justify-between gap-2 text-[13px] text-muted-2">
          <span>Available: {money(max)}</span>
          <button
            type="button"
            onClick={() => setAmount(floorToCents(max))}
            className="border-0 bg-transparent p-0 text-[#264d88]"
          >
            Use max
          </button>
        </div>

        <div className="my-5 rounded-lg bg-[#f1f4f8] p-[14px]">
          <div className="my-[6px] flex items-center justify-between gap-[10px] text-[14px]">
            <span className="text-[#67748a]">Share price</span>
            <strong>{money(price)}</strong>
          </div>
          <div className="my-[6px] flex items-center justify-between gap-[10px] text-[14px]">
            <span className="text-[#67748a]">
              Shares {type === 'invest' ? 'received' : 'redeemed'}
            </span>
            <strong>{shares.toFixed(6)}</strong>
          </div>
          <div className="my-[6px] flex items-center justify-between gap-[10px] text-[14px]">
            <span className="text-[#67748a]">Demo fee</span>
            <strong>$0.00</strong>
          </div>
        </div>

        <p role="alert" className="min-h-[18px] text-[14px] text-error">
          {error}
        </p>
        <p className="text-[13px] leading-[1.65] text-muted-2">
          Instant simulated settlement. Real-world redemption timing would depend on asset access
          and liquidity.
        </p>

        <button
          type="submit"
          className="mt-3 w-full rounded-lg border border-ink-soft bg-ink-soft px-[18px] py-[13px] text-[14px] font-[650] text-white hover:bg-ink-hover"
        >
          {type === 'invest' ? 'Confirm demo investment' : 'Confirm demo withdrawal'}
        </button>
      </form>
    </dialog>
  );
}
