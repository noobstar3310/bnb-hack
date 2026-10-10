'use client';

import {useMemo, useState} from 'react';
import Link from 'next/link';
import type {Address} from 'viem';
import {useChainId, useConnection} from 'wagmi';
import {WalletButton} from '@/components/WalletButton';
import {useVaults, type VaultView} from '@/lib/contracts/hooks';
import {deploymentFor} from '@/lib/contracts/addresses';
import {appChainLabel} from '@/lib/contracts/wagmi';
import {shortAddress} from '@/lib/domain/format';
import {ActivityPanel, ActivityStrip} from './ActivityPanel';
import {AssetMap} from './AssetMap';
import {CreateVaultCard} from './CreateVaultCard';
import {CuratorModal} from './CuratorModal';
import {PlanCard} from './PlanCard';
import {RebalanceCard} from './RebalanceCard';
import {sameAddress} from './model';
import {useCuratorActions} from './useCuratorActions';
import {VaultOverviewCard} from './VaultOverviewCard';

const STATE_STYLE: Record<VaultView['state'], string> = {
  ACTIVE: 'border-[#246158] bg-[#123a36] text-[#6ee7d1]',
  PAUSED: 'border-[#66541e] bg-[#28210f] text-[#f2d568]',
  SEEDED: 'border-[#43536b] bg-[#192638] text-[#a8b7ca]',
  DRAFT: 'border-[#43536b] bg-[#192638] text-[#a8b7ca]',
  CLOSED: 'border-[#69333d] bg-[#2a1820] text-[#ff9ba5]',
};

type ManagerTab = 'plan' | 'rebalance' | 'activity';
type MobileView = 'controls' | 'map';

export function CuratorConsole({artSample = false}: {artSample?: boolean} = {}) {
  const {address, isConnected} = useConnection();
  const chainId = useChainId();
  const {data: vaults = [], isLoading, error, refetch, isFetching} = useVaults();
  const {action, createAndSeed} = useCuratorActions();
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [managerTab, setManagerTab] = useState<ManagerTab>('plan');
  const [mobileView, setMobileView] = useState<MobileView>('map');
  const [createOpen, setCreateOpen] = useState(false);

  const managed = useMemo(
    () => vaults
      .filter((vault) => sameAddress(vault.manager, address))
      .sort((left, right) => left.address.localeCompare(right.address)),
    [address, vaults],
  );
  const selected = managed.find((vault) => vault.address === selectedAddress) ?? managed[0] ?? null;
  const managerAllowed = Boolean(address && selected && sameAddress(selected.manager, address));

  return (
    <div className="h-[100dvh] overflow-hidden bg-[#07111f] text-[#e8eef7]">
      <header className="flex h-[64px] items-center gap-3 border-b border-[#203047] bg-[#0a1422]/95 px-4 backdrop-blur sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-[17px] font-[850] tracking-[-0.4px] text-white no-underline">
          <span className="grid h-7 w-7 place-items-center bg-[#f2d23d] font-mono text-[13px] text-[#101725] [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]">F</span>
          <span>FOLIO LAB</span>
        </Link>
        <nav className="ml-3 hidden h-full items-center gap-6 border-l border-[#203047] pl-6 sm:flex">
          <span className="flex h-full items-center border-b-2 border-[#f2d23d] text-[13px] font-[750] text-white">Curator</span>
          <Link href="/" className="text-[13px] text-[#8fa0b7] no-underline hover:text-white">Investor</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span className="hidden rounded border border-[#4b4420] bg-[#211f13] px-2 py-1 font-mono text-[9px] text-[#e7d15d] lg:inline">{appChainLabel.toUpperCase()}</span>
          <WalletButton />
        </div>
      </header>

      <main className="flex h-[calc(100dvh-64px)] min-h-0 flex-col p-2 sm:p-3">
        <div className="mb-2 grid grid-cols-2 rounded-lg border border-[#26374d] bg-[#0c1726] p-1 md:hidden">
          <MobileToggle active={mobileView === 'controls'} onClick={() => setMobileView('controls')}>Manager</MobileToggle>
          <MobileToggle active={mobileView === 'map'} onClick={() => setMobileView('map')}>Capital map</MobileToggle>
        </div>

        <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[360px_minmax(0,1fr)]">
          <aside className={`${mobileView === 'controls' ? 'flex' : 'hidden'} min-h-0 flex-col overflow-hidden rounded-xl border border-[#26374d] bg-[#0d1827] shadow-[0_20px_70px_rgba(0,0,0,0.3)] md:flex`}>
            <div className="border-b border-[#24344a] p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="font-mono text-[9px] font-[800] tracking-[1.7px] text-[#59d8c4]">MANAGER CONSOLE</p>
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="rounded-md border border-[#e6c52d] bg-[#f2d23d] px-3 py-2 text-[11px] font-[850] text-[#111827] hover:bg-[#ffe768]"
                >
                  + Create
                </button>
              </div>
              <VaultPicker
                connected={isConnected}
                managed={managed}
                selected={selected}
                loading={isLoading}
                refreshing={isFetching}
                error={error instanceof Error ? error.message : null}
                onSelect={setSelectedAddress}
                onRefresh={() => void refetch()}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-color:#344860_#0d1827] [scrollbar-width:thin]">
              {selected ? (
                <>
                  <VaultStatus vault={selected} managerAllowed={managerAllowed} />
                  <VaultOverviewCard vault={selected} />
                  <div className="sticky top-0 z-10 border-y border-[#24344a] bg-[#0d1827]/95 p-2 backdrop-blur">
                    <div className="grid grid-cols-3 rounded-lg bg-[#08121f] p-1">
                      <TabButton active={managerTab === 'plan'} onClick={() => setManagerTab('plan')}>Plan</TabButton>
                      <TabButton active={managerTab === 'rebalance'} onClick={() => setManagerTab('rebalance')}>Rebalance</TabButton>
                      <TabButton active={managerTab === 'activity'} onClick={() => setManagerTab('activity')}>Activity</TabButton>
                    </div>
                  </div>
                  <div className="p-3">
                    {managerTab === 'plan' ? (
                      <PlanCard key={`${selected.address}-${selected.plan?.version ?? 0}`} vault={selected} managerAllowed={managerAllowed} />
                    ) : managerTab === 'rebalance' ? (
                      <RebalanceCard
                        key={`${selected.address}-${selected.plan?.version ?? 0}-${selected.holdings.map((holding) => `${holding.asset}:${holding.amount}`).join('|')}`}
                        vault={selected}
                        managerAllowed={managerAllowed}
                      />
                    ) : (
                      <ActivityPanel vaultName={selected.name} />
                    )}
                  </div>
                </>
              ) : (
                <div className="grid min-h-full place-items-center p-6 text-center">
                  <div>
                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-dashed border-[#3d526c] font-mono text-[#8293aa]">V</span>
                    <p className="mt-4 text-[14px] font-[750] text-[#d4deea]">No managed vaults</p>
                    <p className="mt-2 text-[12px] leading-[1.6] text-[#7f90a7]">{isConnected ? 'This wallet does not manage a vault yet. Create one or refresh after it is indexed.' : 'Connect the local manager wallet to load its vault islands.'}</p>
                    <button type="button" onClick={() => setCreateOpen(true)} className="mt-5 rounded-lg border border-[#e6c52d] bg-[#f2d23d] px-4 py-2.5 text-[12px] font-[850] text-[#111827]">Create investment pool</button>
                  </div>
                </div>
              )}
            </div>
          </aside>

          <section className={`${mobileView === 'map' ? 'flex' : 'hidden'} relative min-h-0 flex-col overflow-hidden rounded-xl border border-[#26374d] bg-[#081827] shadow-[0_20px_70px_rgba(0,0,0,0.32)] md:flex`}>
            <AssetMap
              vaults={managed}
              selectedAddress={selected?.address ?? null}
              connectedAddress={address}
              artSample={artSample}
              onSelect={(vault) => {
                setSelectedAddress(vault);
                setMobileView('controls');
              }}
            />
            {selected && <ActivityStrip vaultName={selected.name} onOpen={() => {
                  setManagerTab('activity');
                  setMobileView('controls');
                }} />}
          </section>
        </div>
      </main>

      <CuratorModal open={createOpen} title="Create and seed a vault" onClose={() => setCreateOpen(false)}>
        <CreateVaultCard
          connected={isConnected}
          deploymentReady={Boolean(deploymentFor(chainId))}
          action={action}
          onCreate={createAndSeed}
          onCreated={(vault) => {
            setSelectedAddress(vault);
            setCreateOpen(false);
            setMobileView('controls');
            void refetch();
          }}
        />
      </CuratorModal>
    </div>
  );
}

interface VaultPickerProps {
  connected: boolean;
  managed: VaultView[];
  selected: VaultView | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onSelect: (address: Address) => void;
  onRefresh: () => void;
}

function VaultPicker({connected, managed, selected, loading, refreshing, error, onSelect, onRefresh}: VaultPickerProps) {
  const message = !connected
    ? 'Connect manager wallet'
    : error
      ? `Vault API unavailable: ${error}`
      : loading
        ? 'Loading managed vaults…'
        : managed.length === 0
          ? 'No vaults managed by this wallet'
          : null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#2b3e55] bg-[#08131f] p-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[#30445c] bg-[#101f30] font-mono text-[11px] text-[#f2d23d]">V</span>
      <div className="min-w-0 flex-1">
        {message ? (
          <p className={`truncate text-[11px] ${error ? 'text-[#ff9ba5]' : 'text-[#8394ab]'}`} title={message}>{message}</p>
        ) : (
          <select aria-label="Selected managed vault" value={selected?.address ?? ''} onChange={(event) => onSelect(event.target.value as Address)} className="w-full bg-transparent text-[12px] font-[750] text-white outline-none">
            {managed.map((vault) => <option key={vault.address} value={vault.address} className="bg-[#111b2a]">{vault.name} ({vault.symbol})</option>)}
          </select>
        )}
      </div>
      <button type="button" onClick={onRefresh} disabled={refreshing} aria-label="Refresh vaults" className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[#2d4058] font-mono text-[14px] text-[#8fa1b8] hover:text-white disabled:opacity-50">{refreshing ? '…' : '↻'}</button>
    </div>
  );
}

function VaultStatus({vault, managerAllowed}: {vault: VaultView; managerAllowed: boolean}) {
  return (
    <div className="border-b border-[#24344a] px-4 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-mono text-[9px] text-[#788aa1]">Manager {shortAddress(vault.manager)}</p>
        <span className={`shrink-0 rounded border px-2 py-1 font-mono text-[9px] ${STATE_STYLE[vault.state]}`}>{vault.state}</span>
      </div>
      {vault.state === 'SEEDED' && (
        <div className="mt-3 rounded-lg border border-[#5f5020] bg-[#231f12] p-2.5 text-[11px] leading-[1.5] text-[#d9c66b]">
          <strong className="block text-[#f3d756]">Waiting for Guardian activation</strong>
          Manager trading remains locked until <code>activate()</code> is confirmed.
        </div>
      )}
      {!managerAllowed && <p className="mt-3 rounded-lg border border-[#69333d] bg-[#2a1820] p-2.5 text-[11px] leading-[1.5] text-[#ff9ba5]">Manager actions are disabled for this wallet.</p>}
    </div>
  );
}

function TabButton({active, onClick, children}: {active: boolean; onClick: () => void; children: React.ReactNode}) {
  return <button type="button" onClick={onClick} className={`rounded-md px-3 py-2 text-[11px] font-[800] transition ${active ? 'bg-[#1a2a3d] text-white shadow-sm' : 'text-[#7e90a8] hover:text-white'}`}>{children}</button>;
}

function MobileToggle({active, onClick, children}: {active: boolean; onClick: () => void; children: React.ReactNode}) {
  return <button type="button" onClick={onClick} className={`rounded-md px-3 py-2 text-[12px] font-[800] ${active ? 'bg-[#f2d23d] text-[#111827]' : 'text-[#8ea0b7]'}`}>{children}</button>;
}
