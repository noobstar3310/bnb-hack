'use client';

import {money, shortAddress} from '@/lib/domain/format';
import type {VaultView} from '@/lib/contracts/hooks';
import {allocation} from './allocation';

const EMBLEM_GRADIENTS = [
  'from-blue-500 to-indigo-600 text-white shadow-blue-500/20',
  'from-emerald-500 to-teal-700 text-white shadow-emerald-500/20',
  'from-purple-500 to-violet-700 text-white shadow-purple-500/20',
  'from-amber-500 to-orange-600 text-white shadow-amber-500/20',
];

const STATE_CONFIG: Record<VaultView['state'], {pill: string; dot: string; label: string}> = {
  ACTIVE: {
    pill: 'border-emerald-200 bg-emerald-50/80 text-emerald-800',
    dot: 'bg-emerald-500',
    label: 'Active',
  },
  PAUSED: {
    pill: 'border-amber-200 bg-amber-50/80 text-amber-800',
    dot: 'bg-amber-500',
    label: 'Paused',
  },
  SEEDED: {
    pill: 'border-slate-200 bg-slate-100/80 text-slate-700',
    dot: 'bg-slate-400',
    label: 'Seeded',
  },
  DRAFT: {
    pill: 'border-slate-200 bg-slate-100/80 text-slate-600',
    dot: 'bg-slate-400',
    label: 'Draft',
  },
  CLOSED: {
    pill: 'border-rose-200 bg-rose-50/80 text-rose-800',
    dot: 'bg-rose-500',
    label: 'Closed',
  },
};

interface Props {
  vault: VaultView;
  index: number;
  selected: boolean;
  onSelect: () => void;
}

export function StrategyCard({vault, index, selected, onSelect}: Props) {
  const slices = allocation(vault);
  const stateCfg = STATE_CONFIG[vault.state];

  return (
    <article
      onClick={onSelect}
      className={`group apple-press relative cursor-pointer rounded-2xl bg-white p-5 transition-all sm:p-6 ${
        selected
          ? 'border-transparent shadow-[0_12px_40px_rgba(15,23,42,0.1)] ring-2 ring-slate-950'
          : 'border border-black/[0.06] shadow-[0_2px_8px_rgba(0,0,0,0.02),0_8px_24px_rgba(0,0,0,0.03)] hover:-translate-y-0.5 hover:border-black/[0.12] hover:shadow-[0_8px_32px_rgba(0,0,0,0.06)]'
      }`}
    >
      {/* Top Header: Emblem, Names, Status Capsule */}
      <div className="flex flex-col items-start justify-between gap-3 xs:flex-row sm:flex-col md:flex-row">
        <div className="flex items-center gap-3.5">
          <div
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-[20px] font-bold shadow-md ring-1 ring-black/5 transition-transform group-hover:scale-105 ${
              EMBLEM_GRADIENTS[index % EMBLEM_GRADIENTS.length]
            }`}
          >
            {vault.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[17px] font-bold tracking-tight text-slate-900 sm:text-[18px]">
                {vault.name}
              </h3>
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-500">
                {vault.symbol}
              </span>
            </div>
            <p className="mt-0.5 text-[12px] font-medium text-slate-400">
              Curator <span className="font-mono text-slate-500">{shortAddress(vault.manager)}</span>
            </p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${stateCfg.pill}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${stateCfg.dot}`} />
          {stateCfg.label}
        </span>
      </div>

      {/* Segmented Asset Allocation Bar */}
      <div className="my-4">
        <div className="flex h-2 w-full gap-1 overflow-hidden rounded-full bg-slate-100 p-0.5">
          {slices.map((s) =>
            s.percent === null ? null : (
              <span
                key={s.symbol}
                style={{width: `${s.percent}%`, background: s.color}}
                className="h-full rounded-full transition-all duration-300"
              />
            ),
          )}
        </div>

        {/* Legend */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-600">
          {slices.length > 0 ? (
            slices.map((s) => (
              <span key={s.symbol} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{backgroundColor: s.color}} />
                <span className="font-semibold text-slate-700">{s.symbol}</span>
                <span className="text-slate-400 tabular-nums">
                  {s.percent === null ? '—' : `${s.percent.toFixed(0)}%`}
                </span>
              </span>
            ))
          ) : (
            <span className="text-slate-400 text-[12px]">All cash (USDT awaiting curator trades)</span>
          )}
        </div>
      </div>

      {/* Metrics & Action Button */}
      <div className="mt-5 grid grid-cols-2 items-center gap-3 border-t border-black/[0.04] pt-4 xs:grid-cols-[1fr_1fr_auto] sm:gap-4">
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
            Share Price
          </span>
          <strong className="mt-0.5 block text-[17px] font-bold tracking-tight text-slate-900 tabular-nums sm:text-[19px]">
            {vault.sharePriceUsd === null ? 'Unavailable' : money(Number(vault.sharePriceUsd))}
          </strong>
        </div>

        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
            Vault Valuation
          </span>
          <strong className="mt-0.5 block text-[17px] font-bold tracking-tight text-slate-900 tabular-nums sm:text-[19px]">
            {vault.totalValueUsd === null ? 'Unavailable' : money(Number(vault.totalValueUsd))}
          </strong>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          aria-pressed={selected}
          className={`apple-press col-span-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-all xs:col-span-1 ${
            selected
              ? 'bg-slate-950 text-white shadow-xs'
              : 'border border-black/[0.08] bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          {selected ? 'Viewing' : 'View Details'}
        </button>
      </div>
    </article>
  );
}

