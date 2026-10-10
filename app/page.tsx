'use client';

import {useRef, useState} from 'react';
import {useConnection} from 'wagmi';
import {AccountBar} from '@/components/AccountBar';
import {DetailPanel, type TradeType} from '@/components/DetailPanel';
import {Header, type ViewMode} from '@/components/Header';
import {PositionsList} from '@/components/PositionsList';
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

      <main className="mx-auto max-w-[1500px] px-[5%] pb-11 pt-7 sm:pt-11">
        <div className="mb-[30px]">
          <p className="mb-3 text-[12px] font-[750] tracking-[2px] text-[#738195]">
            POOLED STOCK PORTFOLIOS ON BNB CHAIN
          </p>
          <h1 className="mb-[10px] text-[clamp(28px,3.2vw,44px)] leading-[1.12] tracking-[-1.6px]">
            Ideas become portfolios.
          </h1>
          <p className="text-[16px] leading-[1.5] text-muted sm:leading-normal">
            Pick a curator. Deposit USDT. Own a share of every stock they hold, and leave whenever you want.
          </p>
        </div>

        <AccountBar vaults={vaults} />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,1fr)_300px] md:grid-cols-[minmax(0,1fr)_330px] md:gap-[30px] lg:grid-cols-[minmax(0,1fr)_365px]">
          <section>
            <h2 className="mb-5 text-[20px] tracking-[-0.5px]">
              {mode === 'explore' ? 'Explore vaults ' : 'My positions '}
              {mode === 'explore' && <span className="pl-1 text-[15px] text-[#8a95a6]">{vaults.length}</span>}
            </h2>

            {error ? (
              <Notice>
                Could not load vaults. {error.message}
                <br />
                <button
                  type="button"
                  disabled={isFetching}
                  onClick={() => refetch()}
                  className="mt-3 rounded-[7px] border border-line-2 bg-white px-[13px] py-[10px] text-[14px] text-[#253b5c] disabled:opacity-50"
                >
                  {isFetching ? 'Retrying…' : 'Try again'}
                </button>
              </Notice>
            ) : isLoading ? (
              <Notice>Loading vaults from {appChainLabel}…</Notice>
            ) : mode === 'explore' ? (
              vaults.length ? (
                <div className="grid gap-[14px]">
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
                <Notice>No vaults yet. Curators create them from the curator console.</Notice>
              )
            ) : (
              <PositionsList
                vaults={vaults}
                connected={isConnected}
                onSelect={(address) => {
                  setMode('explore');
                  select(address);
                }}
                onExplore={() => setMode('explore')}
              />
            )}

            <p className="mt-[22px] text-[12px] leading-[1.7] text-[#7a8495]">
              Holdings and share counts are read from the vault contracts on {appChainLabel}. Dollar values are
              estimates at Binance prices; withdrawals pay out the tokens themselves, not a dollar amount.
            </p>
          </section>

          <div ref={detailRef}>
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
    <div className="rounded-xl border border-dashed border-[#c6d0de] bg-white px-6 py-[45px] text-center leading-[1.7] text-muted-2">
      {children}
    </div>
  );
}
