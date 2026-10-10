'use client';

import {useMemo, useState, type FormEvent} from 'react';
import type {Address} from 'viem';
import {useNotify} from '@/components/Toast';
import {explainError, type VaultView} from '@/lib/contracts/hooks';
import {curatorAssets, percentageToBps} from './model';
import type {CuratorAction} from './useCuratorActions';

interface Props {
  vault: VaultView;
  managerAllowed: boolean;
  action: CuratorAction;
  onPublish: (vault: Address, assets: Address[], bps: number[]) => Promise<void>;
}

export function TargetWeightsCard({vault, managerAllowed, action, onPublish}: Props) {
  const notify = useNotify();
  const assets = useMemo(() => curatorAssets(vault), [vault]);
  const [values, setValues] = useState<Record<string, string>>(() => initialWeights(vault, assets));
  const busy = action === 'publishing';

  const parsed = assets.map((asset) => percentageToBps(values[asset.address] ?? '0'));
  const total = parsed.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const valid = parsed.every((value) => value !== null) && total === 10_000;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) return notify('Target weights must be valid percentages that total exactly 100%.');
    const positive = assets
      .map((asset, index) => ({asset: asset.address, bps: parsed[index] ?? 0}))
      .filter((item) => item.bps > 0);
    try {
      await onPublish(
        vault.address,
        positive.map((item) => item.asset),
        positive.map((item) => item.bps),
      );
      notify('Target weights published on-chain.');
    } catch (error) {
      notify(explainError(error));
    }
  }

  return (
    <section className="rounded-xl border border-line bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mb-2 text-[11px] font-[750] tracking-[1.8px] text-muted-3">TARGET ALLOCATION</p>
          <h2 className="text-[20px] tracking-[-0.5px]">Publish the plan</h2>
        </div>
        <span className="rounded-md bg-[#f0f3f7] px-2 py-[6px] text-[12px] text-muted-2">
          {vault.target ? `Version ${vault.target.version}` : 'Not published'}
        </span>
      </div>
      <p className="mt-2 text-[13px] leading-[1.65] text-muted-2">
        Targets are advisory and visible to investors. They do not force trades or move tokens.
      </p>

      <form onSubmit={submit} className="mt-5">
        <div className="grid gap-3">
          {assets.map((asset) => (
            <label key={asset.address} className="flex items-center justify-between gap-4 text-[14px]">
              <span>
                <strong className="font-[650]">{asset.symbol}</strong>
                <span className="ml-2 text-[11px] text-muted-3">{asset.address.slice(0, 6)}â€¦{asset.address.slice(-4)}</span>
              </span>
              <span className="flex w-[112px] items-center rounded-lg border border-field bg-field-bg pr-3">
                <input
                  value={values[asset.address] ?? ''}
                  onChange={(event) => setValues((current) => ({...current, [asset.address]: event.target.value}))}
                  inputMode="decimal"
                  aria-label={`${asset.symbol} target percentage`}
                  disabled={!managerAllowed || busy}
                  className="min-w-0 flex-1 border-0 bg-transparent px-3 py-[9px] text-right outline-none disabled:opacity-60"
                />
                <span className="text-[12px] text-muted-3">%</span>
              </span>
            </label>
          ))}
        </div>
        <div className={`mt-4 flex justify-between rounded-lg px-3 py-[10px] text-[13px] ${valid ? 'bg-[#e8f4ef] text-positive' : 'bg-[#fff6e3] text-[#7a5310]'}`}>
          <span>Total</span>
          <strong>{(total / 100).toFixed(2)}%</strong>
        </div>
        <button
          type="submit"
          disabled={!managerAllowed || !valid || busy}
          className="mt-4 w-full rounded-lg border border-line-2 bg-white px-4 py-3 text-[14px] font-[650] text-[#253b5c] hover:bg-[#f7f9fc] disabled:opacity-50"
        >
          {busy ? 'Publishingâ€¦' : managerAllowed ? 'Publish target weights' : 'Manager wallet required'}
        </button>
      </form>
    </section>
  );
}

function initialWeights(vault: VaultView, assets: ReturnType<typeof curatorAssets>): Record<string, string> {
  const published = new Map(vault.target?.weights.map((weight) => [weight.asset.toLowerCase(), weight.bps]));
  return Object.fromEntries(
    assets.map((asset, index) => {
      const bps = published.get(asset.address.toLowerCase());
      if (bps !== undefined) return [asset.address, String(bps / 100)];
      if (vault.target) return [asset.address, '0'];
      const defaults = assets.length === 4 ? [0, 34, 33, 33] : assets.map((_, i) => (i === 0 ? 34 : 33));
      return [asset.address, String(defaults[index] ?? 0)];
    }),
  );
}
