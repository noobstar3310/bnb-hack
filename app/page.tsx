'use client';

import { useRef, useState } from 'react';
import { AccountBar } from '@/components/AccountBar';
import { CreateStrategyDialog } from '@/components/CreateStrategyDialog';
import { DetailPanel } from '@/components/DetailPanel';
import { Header } from '@/components/Header';
import { PositionsList } from '@/components/PositionsList';
import { StrategyCard } from '@/components/StrategyCard';
import { Toast } from '@/components/Toast';
import { TradeDialog } from '@/components/TradeDialog';
import { risk, type TradeType } from '@/lib/domain/vault';
import { useStore, type ExposureFilter } from '@/lib/state/store';

const FILTERS: { value: ExposureFilter; label: string }[] = [
  { value: 'all', label: 'All strategies' },
  { value: 'Diversified', label: 'Diversified equity' },
  { value: 'Mixed', label: 'Mixed allocation' },
  { value: 'Concentrated', label: 'Concentrated equity' },
];

export default function Page() {
  const { vaults, assets, mode, filter, selectedId, dispatch } = useStore();
  const [creating, setCreating] = useState(false);
  const [trade, setTrade] = useState<TradeType | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const visible = vaults.filter((v) => filter === 'all' || risk(v) === filter);

  function select(id: string) {
    dispatch({ type: 'select', id });
    if (window.innerWidth < 731) {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  return (
    <>
      <Header />

      <main className="mx-auto max-w-[1500px] px-[5%] pb-11 pt-7 sm:pt-11">
        <div className="mb-[30px] flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center sm:gap-6">
          <div>
            <p className="mb-3 text-[12px] font-[750] tracking-[2px] text-[#738195]">
              THE PORTFOLIO LAUNCHPAD
            </p>
            <h1 className="mb-[10px] text-[clamp(28px,3.2vw,44px)] leading-[1.12] tracking-[-1.6px]">
              Ideas become portfolios.
            </h1>
            <p className="text-[16px] leading-[1.5] text-muted sm:leading-normal">
              Choose a strategy. Follow its rules. Own a share.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="w-full rounded-lg border border-ink-soft bg-ink-soft px-[18px] py-[13px] text-[14px] font-[650] text-white hover:bg-ink-hover sm:w-auto"
          >
            ＋ Create a strategy
          </button>
        </div>

        <AccountBar />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,1fr)_300px] md:grid-cols-[minmax(0,1fr)_330px] md:gap-[30px] lg:grid-cols-[minmax(0,1fr)_365px]">
          <section>
            <div className="mb-5 flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
              <h2 className="text-[20px] tracking-[-0.5px]">
                {mode === 'explore' ? 'Explore strategies ' : 'My positions '}
                {mode === 'explore' && (
                  <span className="pl-1 text-[15px] text-[#8a95a6]">{visible.length}</span>
                )}
              </h2>
              {mode === 'explore' && (
                <label className="flex w-full items-center justify-between gap-2 text-[13px] text-muted md:w-auto md:justify-start">
                  Exposure
                  <select
                    value={filter}
                    onChange={(e) =>
                      dispatch({ type: 'setFilter', filter: e.target.value as ExposureFilter })
                    }
                    className="max-w-[170px] rounded-md border border-[#dae0e8] bg-white p-[9px] text-[13px]"
                  >
                    {FILTERS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {mode === 'explore' ? (
              <div className="grid gap-[14px]">
                {visible.length ? (
                  visible.map((vault, i) => (
                    <StrategyCard
                      key={vault.id}
                      vault={vault}
                      assets={assets}
                      index={i}
                      selected={vault.id === selectedId}
                      onSelect={() => select(vault.id)}
                    />
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-[#c6d0de] bg-white px-6 py-[45px] text-center leading-[1.7] text-muted-2">
                    No strategies match this exposure. Try another filter.
                  </div>
                )}
              </div>
            ) : (
              <PositionsList onSelect={select} />
            )}

            <p className="mt-[22px] text-[12px] leading-[1.7] text-[#7a8495]">
              All assets, managers, returns and transactions are simulated. No wallet connection or
              real funds. Refreshing starts a new session.
            </p>
          </section>

          <div ref={detailRef}>
            <DetailPanel onTrade={setTrade} />
          </div>
        </div>
      </main>

      <Toast />
      <CreateStrategyDialog open={creating} onClose={() => setCreating(false)} />
      <TradeDialog type={trade} onClose={() => setTrade(null)} />
    </>
  );
}
