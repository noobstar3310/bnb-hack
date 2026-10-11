'use client';

import {useState} from 'react';
import {useNotify} from '@/components/Toast';
import {explainError, type VaultView} from '@/lib/contracts/hooks';
import {MAX_PLAN_BYTES, utf8ByteLength} from './model';
import {useCuratorActions} from './useCuratorActions';

interface Props {
  vault: VaultView;
  managerAllowed: boolean;
}

export function PlanCard({vault, managerAllowed}: Props) {
  const notify = useNotify();
  const {action, publishPlan} = useCuratorActions();
  const [text, setText] = useState(vault.plan?.text ?? '');
  const [error, setError] = useState<string | null>(null);
  const bytes = utf8ByteLength(text);
  const validLength = bytes >= 1 && bytes <= MAX_PLAN_BYTES;
  const changed = text !== (vault.plan?.text ?? '');
  const publishing = action === 'publishing';

  async function submit() {
    if (!managerAllowed || !validLength || !changed || publishing) return;
    setError(null);
    try {
      await publishPlan(vault.address, text);
      notify(`Plan v${(vault.plan?.version ?? 0) + 1} confirmed on-chain.`);
    } catch (caught) {
      const message = explainError(caught);
      setError(message);
      notify(message);
    }
  }

  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="font-mono text-[9px] font-bold tracking-[1.5px] text-slate-400 uppercase">
            CURATOR INVESTMENT THESIS
          </span>
          <h2 className="mt-0.5 text-[16px] font-bold tracking-tight text-white">Portfolio Objective</h2>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold ${
            vault.plan
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-white/10 bg-white/5 text-slate-400'
          }`}
        >
          {vault.plan ? `v${vault.plan.version}` : 'DRAFT'}
        </span>
      </div>

      <p className="mt-2 text-[12px] leading-[1.6] text-slate-400">
        Public, non-custodial and advisory. BNB smart contracts require an on-chain thesis version before the first rebalance.
      </p>

      <label className="mt-4 grid gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-300">
        Thesis Content
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={5}
          placeholder="Describe your asset allocation criteria, tech equity targets, cash buffer, and rebalance triggers."
          disabled={!managerAllowed || publishing}
          aria-describedby="plan-byte-count plan-publishing-status"
          className="resize-y rounded-2xl border border-white/10 bg-white/5 p-3.5 font-mono text-[12px] leading-[1.6] text-white outline-none transition placeholder:text-slate-500 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 disabled:opacity-50"
        />
      </label>

      <div
        id="plan-byte-count"
        className={`mt-2 flex items-center justify-between gap-3 font-mono text-[11px] ${
          bytes > MAX_PLAN_BYTES ? 'text-rose-400' : 'text-slate-400'
        }`}
      >
        <span>
          {bytes === 0
            ? 'Enter at least 1 UTF-8 byte.'
            : validLength
              ? changed
                ? 'Draft modified (not yet on-chain).'
                : 'Matches published on-chain plan.'
              : 'Plan exceeds 1,000-byte contract limit.'}
        </span>
        <strong className="tabular-nums">
          {bytes} / {MAX_PLAN_BYTES} bytes
        </strong>
      </div>

      {!managerAllowed && (
        <div id="plan-publishing-status" className="mt-4 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-3.5 text-[11px] leading-[1.55] text-rose-200">
          <strong className="block font-bold text-rose-300">Manager wallet required</strong>
          <p className="mt-1 text-slate-300">Connect this vault&apos;s manager wallet to publish the plan on-chain.</p>
        </div>
      )}

      {managerAllowed && error && (
        <div id="plan-publishing-status" role="alert" className="mt-4 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-3.5 text-[11px] leading-[1.55] text-rose-200">
          <strong className="block font-bold text-rose-300">Publication failed</strong>
          <p className="mt-1 text-slate-300">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={!managerAllowed || !validLength || !changed || publishing}
        className="apple-press mt-4 w-full rounded-full border border-amber-300 bg-amber-300 px-4 py-3 text-[12px] font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
      >
        {publishing ? 'Confirming plan on-chain...' : changed ? 'Publish plan on-chain' : 'Plan already published'}
      </button>
    </section>
  );
}
