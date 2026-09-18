'use client';

import { useEffect, useRef, useState } from 'react';
import { ASSETS, MAX_NAME_LENGTH, MAX_THESIS_LENGTH } from '@/lib/domain/vault';
import { useStore } from '@/lib/state/store';

const DEFAULT_WEIGHTS = [40, 30, 20, 10];

export function CreateStrategyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dispatch, notify } = useStore();
  const ref = useRef<HTMLDialogElement>(null);
  const [weights, setWeights] = useState<number[]>(DEFAULT_WEIGHTS);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setWeights(DEFAULT_WEIGHTS);
      setError('');
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const total = weights.reduce((a, b) => a + b, 0);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      dispatch({
        type: 'createVault',
        name: String(data.get('name') ?? ''),
        thesis: String(data.get('thesis') ?? ''),
        weights,
      });
      notify('Strategy launched with $10,000 simulated seed capital.');
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
              YOUR INVESTMENT IDEA
            </p>
            <h2 className="text-[20px] tracking-[-0.5px]">Create a strategy</h2>
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

        <label className="mt-[17px] block text-[14px] font-semibold">
          Strategy name
          <input
            name="name"
            required
            maxLength={MAX_NAME_LENGTH}
            placeholder="e.g. Tomorrow’s technology"
            className="mt-2 w-full rounded-[7px] border border-field bg-field-bg p-3 text-[16px] font-normal text-ink"
          />
        </label>

        <label className="mt-[17px] block text-[14px] font-semibold">
          Investment thesis
          <textarea
            name="thesis"
            required
            maxLength={MAX_THESIS_LENGTH}
            placeholder="Describe the idea behind your allocation."
            className="mt-2 min-h-20 w-full resize-y rounded-[7px] border border-field bg-field-bg p-3 text-[16px] font-normal text-ink"
          />
        </label>

        <div className="mt-[15px] flex items-center justify-between">
          <h3 className="mb-2 text-[16px]">Target allocation</h3>
          <strong className={total !== 100 ? 'text-error' : undefined}>{total}%</strong>
        </div>
        <p className="text-[13px] leading-[1.65] text-muted-2">
          Choose weights that add up to 100%. Stocks below are fictional demo instruments.
        </p>

        {ASSETS.map((asset, i) => (
          <label key={asset.id} className="my-[10px] flex items-center justify-between gap-5 text-[14px]">
            <span className="flex items-center">
              <i
                className="mr-[9px] inline-block h-2 w-2 rounded-[2px]"
                style={{ background: asset.color }}
              />
              {asset.name} (%)
            </span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              required
              aria-label={`${asset.name} allocation percent`}
              value={weights[i]}
              onChange={(e) =>
                setWeights((prev) =>
                  prev.map((w, j) => (j === i ? Number(e.target.value) : w)),
                )
              }
              className="m-0 w-[90px] rounded-[7px] border border-field bg-field-bg p-2 text-[16px] text-ink"
            />
          </label>
        ))}

        <p role="alert" className="min-h-[18px] text-[14px] text-error">
          {error}
        </p>
        <p className="text-[13px] leading-[1.65] text-muted-2">
          Demo mandate: no leverage, no borrowing, only these four assets. Fees: 0% for this
          simulation.
        </p>

        <button
          type="submit"
          className="mt-3 w-full rounded-lg border border-ink-soft bg-ink-soft px-[18px] py-[13px] text-[14px] font-[650] text-white hover:bg-ink-hover"
        >
          Launch demo strategy
        </button>
      </form>
    </dialog>
  );
}
