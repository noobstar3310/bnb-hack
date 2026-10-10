'use client';

import {useState} from 'react';
import type {VaultView} from '@/lib/contracts/hooks';
import {PLAN_ABI_BLOCKER} from './dependencies';
import {MAX_PLAN_BYTES, utf8ByteLength} from './model';

interface Props {
  vault: VaultView;
  managerAllowed: boolean;
}

export function PlanCard({vault, managerAllowed}: Props) {
  const [text, setText] = useState(vault.plan?.text ?? '');
  const bytes = utf8ByteLength(text);
  const validLength = bytes >= 1 && bytes <= MAX_PLAN_BYTES;
  const changed = text !== (vault.plan?.text ?? '');

  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-[9px] font-[800] tracking-[1.6px] text-[#74839a]">CURATOR&apos;S PLAN</p>
          <h2 className="text-[15px] font-[750] text-white">Investment thesis</h2>
        </div>
        <span className={`shrink-0 rounded border px-2 py-1 font-mono text-[11px] ${vault.plan ? 'border-[#225f58] bg-[#123e39] text-[#6ee7d1]' : 'border-[#485469] bg-[#182334] text-[#9cabc0]'}`}>
          {vault.plan ? `v${vault.plan.version}` : 'NO PLAN'}
        </span>
      </div>

      <p className="mt-2 text-[11px] leading-[1.55] text-[#93a2b8]">
        Public and advisory. The contract requires a published version before the first rebalance.
      </p>

      <label className="mt-4 grid gap-2 text-[12px] font-[700] text-[#c9d3e1]">
        Plan text
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={5}
          placeholder="Describe the portfolio objective, cash buffer and rebalancing approach."
          disabled={!managerAllowed}
          aria-describedby="plan-byte-count plan-publishing-status"
          className="resize-y rounded-lg border border-[#33445b] bg-[#07131f] px-3 py-3 font-mono text-[12px] leading-[1.55] text-[#e6edf7] outline-none transition focus:border-[#f4cd3f] disabled:opacity-55"
        />
      </label>

      <div
        id="plan-byte-count"
        className={`mt-2 flex items-center justify-between gap-3 font-mono text-[11px] ${bytes > MAX_PLAN_BYTES ? 'text-[#ff8290]' : 'text-[#7f8ea4]'}`}
      >
        <span>{bytes === 0 ? 'Enter at least one UTF-8 byte.' : validLength ? changed ? 'Draft changed — not on-chain.' : 'Matches the published plan.' : 'Plan exceeds the contract limit.'}</span>
        <strong>{bytes} / {MAX_PLAN_BYTES} bytes</strong>
      </div>

      <div id="plan-publishing-status" className="mt-4 rounded-lg border border-[#5e5020] bg-[#231f12] p-3 text-[11px] leading-[1.55] text-[#dac66b]">
        <strong className="text-[#f4d657]">Publishing unavailable</strong>
        <details className="mt-1 text-[#aa9d62]">
          <summary className="cursor-pointer">Technical detail</summary>
          {PLAN_ABI_BLOCKER} Your draft has not been saved on-chain.
        </details>
      </div>

      <button
        type="button"
        disabled
        className="mt-4 w-full rounded-lg border border-[#6d5c16] bg-[#30290f] px-4 py-3 text-[13px] font-[800] text-[#f7db58] disabled:cursor-not-allowed disabled:opacity-65"
      >
        Publishing unavailable
      </button>
    </section>
  );
}
