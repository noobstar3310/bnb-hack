'use client';

import {useRef, useState} from 'react';
import {useConnection} from 'wagmi';
import {AccountBar} from '@/components/AccountBar';
import {DetailPanel, type TradeType} from '@/components/DetailPanel';
import {Header, type ViewMode} from '@/components/Header';
import {PositionsList} from '@/components/PositionsList';
import {ActivityFeed} from '@/components/ActivityFeed';
import {StrategyCard} from '@/components/StrategyCard';
import {TradeDialog} from '@/components/TradeDialog';
import {useVaults} from '@/lib/contracts/hooks';
import {appChainLabel} from '@/lib/contracts/wagmi';

export default function Page() {
  const {isConnected} = useConnection();
  const {data: vaults = [], isLoading, error, refetch, isFetching} = useVaults();
  const [mode, setMode] = useState<ViewMode>('explore');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trade, setTrade] = useState<TradeType | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const selected = vaults.find((v) => v.address === selectedId) ?? vaults[0];

  function select(address: string) {
    setSelectedId(address);
    if (window.innerWidth < 731) {
      detailRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  }

  return (
    <>
      <Header mode={mode} onMode={setMode} />

      <main className="mx-auto max-w-[1500px] px-[5%] pb-16 pt-8 sm:pt-12">
        {/* Apple-styled Hero Section */}
        <div className="mb-10 sm:mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/80 px-3.5 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase text-slate-600 shadow-xs backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-[#f3ba2f]" />
            <span>Tokenized US Stocks on BNB Chain</span>
          </div>

          <h1 className="mt-3 text-[clamp(32px,4vw,56px)] font-bold leading-[1.08] tracking-[-0.035em] text-slate-950">
            Ideas become portfolios.
          </h1>

          <p className="mt-3 max-w-3xl text-[16px] leading-[1.6] text-slate-600 sm:text-[18px]">
            Pick a curator. Deposit USDT. Own a transparent share of approved stock tokens (AAPLon, NVDAon), with guaranteed in-kind redemptions anytime.
          </p>

          {/* Apple Trust Guarantee Badges */}
          <div className="mt-5 flex flex-wrap items-center gap-2 pt-1 text-[12px] font-medium text-slate-600">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.05] bg-white/70 px-3 py-1 shadow-2xs backdrop-blur-sm">
              <span className="text-emerald-500 font-bold">✓</span> In-kind redemption guarantee
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.05] bg-white/70 px-3 py-1 shadow-2xs backdrop-blur-sm">
              <span className="text-emerald-500 font-bold">✓</span> EIP-712 signed oracle pricing
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.05] bg-white/70 px-3 py-1 shadow-2xs backdrop-blur-sm">
              <span className="text-emerald-500 font-bold">✓</span> 0% protocol extraction
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.05] bg-white/70 px-3 py-1 shadow-2xs backdrop-blur-sm">
              <span className="text-emerald-500 font-bold">✓</span> Binance Web3 DEX router
            </span>
          </div>
        </div>

        <AccountBar vaults={vaults} />

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-[minmax(0,1fr)_320px] md:grid-cols-[minmax(0,1fr)_350px] md:gap-8 lg:grid-cols-[minmax(0,1fr)_390px]">
          <section className="min-w-0">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-[20px] font-bold tracking-tight text-slate-900 sm:text-[22px]">
                {mode === 'explore'
                  ? 'Explore Vaults'
                  : mode === 'positions'
                    ? 'My Positions'
                    : 'Trading & Activity History'}
                {mode === 'explore' && (
                  <span className="ml-2.5 inline-flex items-center justify-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[12px] font-semibold text-slate-600">
                    {vaults.length}
                  </span>
                )}
              </h2>
            </div>

            {error ? (
              <Notice>
                <div className="text-rose-600 font-semibold mb-1">Could not load vaults</div>
                <div className="text-slate-600 text-[14px]">{error.message}</div>
                <button
                  type="button"
                  disabled={isFetching}
                  onClick={() => refetch()}
                  className="apple-press mt-4 rounded-full border border-black/[0.08] bg-white px-4 py-2 text-[13px] font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  {isFetching ? 'Retrying…' : 'Try again'}
                </button>
              </Notice>
            ) : isLoading ? (
              <Notice>
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800" />
                <p className="mt-3 text-[14px] font-medium text-slate-600">Loading vaults from {appChainLabel}…</p>
              </Notice>
            ) : mode === 'explore' ? (
              vaults.length ? (
                <div className="grid gap-4">
                  {vaults.map((vault, i) => (
                    <StrategyCard
                      key={vault.address}
                      vault={vault}
                      index={i}
                      selected={vault.address === selected?.address}
                      onSelect={() => select(vault.address)}
                    />
                  ))}
                </div>
              ) : (
                <Notice>
                  <p className="text-[15px] font-semibold text-slate-800">No active vaults yet</p>
                  <p className="mt-1 text-[13px] text-slate-500">
                    Curators create and seed transparent vaults through the Curator Studio.
                  </p>
                </Notice>
              )
            ) : mode === 'positions' ? (
              <PositionsList
                vaults={vaults}
                connected={isConnected}
                onSelect={(address) => {
                  setMode('explore');
                  select(address);
                }}
                onExplore={() => setMode('explore')}
              />
            ) : (
              <ActivityFeed
                vaults={vaults}
                onSelectVault={(address) => {
                  select(address);
                }}
              />
            )}

            <div className="mt-6 flex items-start gap-2 rounded-xl border border-black/[0.04] bg-white/50 p-3.5 text-[12px] leading-[1.6] text-slate-500 backdrop-blur-sm">
              <span className="text-slate-400 font-bold">ℹ</span>
              <span>
                Holdings and share counts are read directly from on-chain vault contracts on {appChainLabel}. Dollar values are real-time valuations at Binance prices; redemptions pay out the held assets directly.
              </span>
            </div>
          </section>

          <div ref={detailRef} className="min-w-0">
            {selected && <DetailPanel vault={selected} connected={isConnected} onTrade={setTrade} />}
          </div>
        </div>
      </main>

      {selected && <TradeDialog type={trade} vault={selected} onClose={() => setTrade(null)} />}
    </>
  );
}

function Notice({children}: {children: React.ReactNode}) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white/80 p-8 text-center leading-[1.7] text-slate-600 shadow-sm backdrop-blur-md sm:p-12">
      {children}
    </div>
  );
}
