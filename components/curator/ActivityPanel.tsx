'use client';

import type {Address} from 'viem';
import {useHistory} from '@/lib/history/hooks';
import {shortAddress} from '@/lib/domain/format';

export function ActivityPanel({
  vaultName,
  vaultAddress,
}: {
  vaultName?: string;
  vaultAddress?: Address;
}) {
  const {data: items = []} = useHistory({vault: vaultAddress, enabled: Boolean(vaultAddress)});
  const trades = items.filter((i) => i.type === 'rebalance');

  return (
    <section className="rounded-lg border border-[#30445c] bg-[#091522] p-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[12px] font-[750] text-white">Confirmed trade activity</h2>
        <span className="font-mono text-[8px] text-[#718198]">THIS SESSION</span>
      </div>
      {vaultName && <p className="mt-1 truncate font-mono text-[9px] text-[#72849a]">{vaultName}</p>}

      {trades.length === 0 ? (
        <div className="mt-2 flex items-start gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#3b4c62] font-mono text-[10px] text-[#8fa0b6]">
            0
          </span>
          <div>
            <p className="text-[11px] font-[700] text-[#cbd6e4]">No confirmed manager trades</p>
            <p className="mt-0.5 text-[9px] leading-[1.5] text-[#78889e]">
              Routes appear only after a successful wallet transaction. Quote previews are not activity.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {trades.map((t) => (
            <div key={t.id} className="flex items-start justify-between gap-2 border-t border-[#1c2e42] pt-2 text-[10px]">
              <div>
                <span className="font-bold text-[#8be9fd]">Rebalanced</span>
                <p className="text-[#c1d1e4]">
                  Sold {t.sellAmount} {t.sellSymbol} → Bought {t.buyAmount} {t.buySymbol}
                </p>
                <span className="font-mono text-[9px] text-[#72849a]">Plan v{t.planVersion}</span>
              </div>
              <a
                href={`https://bscscan.com/tx/${t.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[9px] text-[#5e81ac] hover:underline"
              >
                {shortAddress(t.txHash)} ↗
              </a>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function ActivityStrip({
  vaultName,
  vaultAddress,
  onOpen,
}: {
  vaultName: string;
  vaultAddress?: Address;
  onOpen: () => void;
}) {
  const {data: items = []} = useHistory({vault: vaultAddress, enabled: Boolean(vaultAddress)});
  const count = items.filter((i) => i.type === 'rebalance').length;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full shrink-0 items-center gap-3 border-t border-[#263b52] bg-[#0a1624] px-4 py-2.5 text-left hover:bg-[#0d1b2b]"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#40536a] font-mono text-[10px] text-[#91a2b7]">
        {count}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-[11px] font-[750] text-[#d6e0eb]">
          Confirmed activity · {vaultName}
        </strong>
        <span className="mt-0.5 block text-[9px] text-[#75879e]">
          {count > 0 ? `${count} confirmed on-chain rebalances` : 'No confirmed trades. Quote previews never appear here.'}
        </span>
      </span>
      <span className="font-mono text-[9px] text-[#7f91a8]">OPEN →</span>
    </button>
  );
}
