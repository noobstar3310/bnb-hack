'use client';

import {useRef, useState} from 'react';
import {useConnection} from 'wagmi';
import {AccountBar} from '@/components/AccountBar';
import {AssetMap} from '@/components/curator/AssetMap';
import {DetailPanel, type TradeType} from '@/components/DetailPanel';
import {Header, type ViewMode} from '@/components/Header';
import {PositionsList} from '@/components/PositionsList';
import {ActivityFeed} from '@/components/ActivityFeed';
import {StrategyCard} from '@/components/StrategyCard';
import {TradeDialog} from '@/components/TradeDialog';
import {useVaults} from '@/lib/contracts/hooks';
import {appChainLabel} from '@/lib/contracts/wagmi';

type ExploreView = 'map' | 'list';

export default function Page() {
  const {address, isConnected} = useConnection();
  const {data: vaults = [], isLoading, error, refetch, isFetching} = useVaults();
  const [mode, setMode] = useState<ViewMode>('explore');
  const [exploreView, setExploreView] = useState<ExploreView>('map');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trade, setTrade] = useState<TradeType | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const owned = vaults.filter((vault) => vault.position && vault.position.shares !== '0');
  const visibleVaults = mode === 'positions' ? owned : vaults;
  const selected = visibleVaults.find((vault) => vault.address === selectedId) ?? visibleVaults[0] ?? null;

  function select(vaultAddress: string) {
    setSelectedId(vaultAddress);
    if (window.innerWidth < 768) {
      window.setTimeout(() => detailRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'}), 0);
    }
  }

  function changeMode(next: ViewMode) {
    setTrade(null);
    setMode(next);
  }

  const emptyPositions = mode === 'positions' && (!isConnected || owned.length === 0);

  return (
    <div className="min-h-[100dvh] bg-[#07111f] text-[#e8eef7]">
      <Header />

      <main className="mx-auto max-w-[1680px] p-2 sm:p-3">
        <section className="mb-3 rounded-xl border border-[#26374d] bg-[#0c1726] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.24)] sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <p className="font-mono text-[9px] font-[800] tracking-[1.7px] text-[#59d8c4]">INVESTOR DESK</p>
                <span className="rounded border border-[#4b4420] bg-[#211f13] px-2 py-1 font-mono text-[8px] text-[#e7d15d]">{appChainLabel.toUpperCase()}</span>
              </div>
              <h1 className="text-[clamp(22px,3vw,34px)] font-[850] tracking-[-1px] text-white">Explore living portfolios.</h1>
              <p className="mt-1 max-w-[720px] text-[12px] leading-[1.6] text-[#8fa0b7] sm:text-[13px]">
                Each island is one on-chain vault. Asset colors show priced holdings; territory shows your current share of that vault.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div role="tablist" aria-label="Investor view" className="flex rounded-lg border border-[#2b4056] bg-[#08131f] p-1">
                <ViewButton active={mode === 'explore'} onClick={() => changeMode('explore')}>Explore</ViewButton>
                <ViewButton active={mode === 'positions'} onClick={() => changeMode('positions')}>My positions</ViewButton>
                <ViewButton active={mode === 'activity'} onClick={() => changeMode('activity')}>Activity</ViewButton>
              </div>
              {mode !== 'activity' && (
                <div role="group" aria-label="Vault presentation" className="flex rounded-lg border border-[#2b4056] bg-[#08131f] p-1">
                  <SmallToggle active={exploreView === 'map'} onClick={() => setExploreView('map')}>Map</SmallToggle>
                  <SmallToggle active={exploreView === 'list'} onClick={() => setExploreView('list')}>List</SmallToggle>
                </div>
              )}
              <button
                type="button"
                disabled={isFetching}
                onClick={() => void refetch()}
                className="h-9 rounded-lg border border-[#30465d] bg-[#101f30] px-3 font-mono text-[9px] font-[800] text-[#93a6bc] hover:text-white disabled:opacity-50"
              >
                {isFetching ? 'REFRESHING…' : 'REFRESH'}
              </button>
            </div>
          </div>
        </section>

        <AccountBar vaults={vaults} />

        {error ? (
          <Notice title="Vault data unavailable">
            <p>{error.message}</p>
            <button type="button" disabled={isFetching} onClick={() => void refetch()} className="mt-4 rounded-md border border-[#e6c52d] bg-[#f2d23d] px-4 py-2 text-[11px] font-[850] text-[#111827] disabled:opacity-50">
              Try again
            </button>
          </Notice>
        ) : isLoading ? (
          <Notice title="Loading vault islands">Reading vaults and positions from {appChainLabel}…</Notice>
        ) : (
          <div className="grid items-start gap-3 md:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_390px]">
            <section aria-label={mode === 'explore' ? 'Explore vaults' : mode === 'positions' ? 'My positions' : 'Trading and activity history'} className="min-w-0">
              {mode === 'activity' ? (
                <ActivityFeed vaults={vaults} onSelectVault={select} />
              ) : emptyPositions ? (
                <PositionsList vaults={vaults} connected={isConnected} onSelect={select} onExplore={() => changeMode('explore')} />
              ) : exploreView === 'map' ? (
                <div className="flex h-[570px] min-h-0 overflow-hidden rounded-xl border border-[#26374d] bg-[#081827] shadow-[0_20px_70px_rgba(0,0,0,0.32)] sm:h-[650px] lg:h-[calc(100dvh-255px)] lg:min-h-[600px] lg:max-h-[820px]">
                  <AssetMap
                    vaults={visibleVaults}
                    selectedAddress={selected?.address ?? null}
                    connectedAddress={address}
                    onSelect={select}
                  />
                </div>
              ) : mode === 'positions' ? (
                <PositionsList vaults={vaults} connected={isConnected} onSelect={select} onExplore={() => changeMode('explore')} />
              ) : vaults.length ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {vaults.map((vault, index) => (
                    <StrategyCard key={vault.address} vault={vault} index={index} selected={vault.address === selected?.address} onSelect={() => select(vault.address)} />
                  ))}
                </div>
              ) : (
                <Notice title="No vaults yet">Curators have not published a vault on this network.</Notice>
              )}
            </section>

            <div ref={detailRef} className="scroll-mt-3">
              {selected ? (
                <DetailPanel vault={selected} connected={isConnected} onTrade={setTrade} />
              ) : (
                <Notice title={mode === 'positions' ? 'No selected position' : 'No vault selected'}>
                  {mode === 'positions' ? 'Connect a wallet with positive vault shares, or return to Explore.' : 'Choose a vault island or list item to inspect it.'}
                </Notice>
              )}
            </div>
          </div>
        )}

        <p className="px-2 pb-2 pt-3 font-mono text-[9px] leading-[1.6] text-[#72859c]">
          Holdings and shares come from vault contracts. Dollar values use available Binance prices; missing prices remain unavailable. Withdrawals return tokens in kind.
        </p>
      </main>

      {selected && <TradeDialog type={trade} vault={selected} onClose={() => setTrade(null)} />}
    </div>
  );
}

function ViewButton({active, onClick, children}: {active: boolean; onClick: () => void; children: React.ReactNode}) {
  return <button role="tab" aria-selected={active} type="button" onClick={onClick} className={`rounded-md px-3 py-2 text-[11px] font-[800] ${active ? 'bg-[#1a2a3d] text-white' : 'text-[#7e90a8] hover:text-white'}`}>{children}</button>;
}

function SmallToggle({active, onClick, children}: {active: boolean; onClick: () => void; children: React.ReactNode}) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`rounded-md px-3 py-2 font-mono text-[9px] font-[800] ${active ? 'bg-[#15453d] text-[#82ead8]' : 'text-[#74879f] hover:text-white'}`}>{children}</button>;
}

function Notice({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <div className="grid min-h-[220px] place-items-center rounded-xl border border-dashed border-[#344a62] bg-[#0c1726] px-6 py-10 text-center">
      <div>
        <h2 className="text-[16px] font-[800] text-[#dce6f1]">{title}</h2>
        <div className="mt-2 max-w-[520px] text-[12px] leading-[1.7] text-[#8192a8]">{children}</div>
      </div>
    </div>
  );
}
