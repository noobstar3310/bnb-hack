'use client';

import {useMemo, useState} from 'react';
import Link from 'next/link';
import type {Address} from 'viem';
import {useConnection} from 'wagmi';
import {WalletButton} from '@/components/WalletButton';
import {useVaults, type VaultView} from '@/lib/contracts/hooks';
import {appChainLabel} from '@/lib/contracts/wagmi';
import {shortAddress} from '@/lib/domain/format';
import {CreateVaultCard} from './CreateVaultCard';
import {RebalanceCard} from './RebalanceCard';
import {sameAddress} from './model';
import {TargetWeightsCard} from './TargetWeightsCard';
import {useCuratorActions} from './useCuratorActions';

const STATE_STYLE: Record<VaultView['state'], string> = {
  ACTIVE: 'bg-[#e8f4ef] text-positive',
  PAUSED: 'bg-[#fff6e3] text-[#7a5310]',
  SEEDED: 'bg-[#edf2f8] text-[#52647e]',
  DRAFT: 'bg-[#edf2f8] text-[#52647e]',
  CLOSED: 'bg-[#f6e9eb] text-negative',
};

export function CuratorConsole() {
  const {address, isConnected} = useConnection();
  const {data: vaults = [], isLoading, error, refetch, isFetching} = useVaults();
  const {action, createAndSeed, publishWeights, rebalance} = useCuratorActions();
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);

  const managed = useMemo(
    () => vaults.filter((vault) => sameAddress(vault.manager, address)),
    [address, vaults],
  );
  const selected = managed.find((vault) => vault.address === selectedAddress) ?? managed[0] ?? null;

  const managerAllowed = Boolean(address && selected && sameAddress(selected.manager, address));

  return (
    <>
      <header className="flex min-h-[72px] items-center gap-4 border-b border-line-3 bg-white px-[5%] py-3 sm:min-h-[88px]">
        <Link href="/" className="flex items-center gap-2 text-[23px] font-[750] tracking-[-1px] text-ink no-underline sm:text-[28px]">
          <span className="grid h-[30px] w-[28px] place-items-center rounded-[10px] bg-ink text-lime italic sm:h-9 sm:w-9">f</span>
          <span className="hidden sm:inline">folio<span className="-ml-[1px] font-normal text-muted-3">lab</span></span>
        </Link>
        <div className="min-w-0 flex-1 border-l border-line-3 pl-4">
          <p className="truncate text-[12px] font-[750] tracking-[1.4px] text-muted-3">CURATOR CONSOLE</p>
          <Link href="/" className="text-[12px] text-[#48648d] no-underline hover:underline">Back to investor app</Link>
        </div>
        <WalletButton />
      </header>

      <main className="mx-auto max-w-[1500px] px-[5%] pb-12 pt-7 sm:pt-10">
        <div className="mb-7 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="mb-3 text-[12px] font-[750] tracking-[2px] text-[#738195]">MANAGE ON {appChainLabel.toUpperCase()}</p>
            <h1 className="text-[clamp(28px,3.2vw,44px)] leading-[1.12] tracking-[-1.6px]">Build the portfolio you promised.</h1>
            <p className="mt-3 max-w-[720px] text-[15px] leading-[1.65] text-muted">
              Create and seed a vault, publish transparent target weights, then review every Binance route before signing.
            </p>
          </div>
          <span className="text-[13px] text-muted-3">
            {isConnected ? `${managed.length} managed vault${managed.length === 1 ? '' : 's'}` : 'Wallet not connected'}
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="grid content-start gap-5">
            <CreateVaultCard
              connected={isConnected}
              action={action}
              onCreate={createAndSeed}
              onCreated={(vault) => {
                setSelectedAddress(vault);
                void refetch();
              }}
            />

            <section className="rounded-xl border border-line bg-white p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[18px] tracking-[-0.4px]">Your managed vaults</h2>
                <button
                  type="button"
                  disabled={isFetching}
                  onClick={() => refetch()}
                  className="text-[12px] font-[650] text-[#48648d] disabled:opacity-50"
                >
                  {isFetching ? 'Refreshingâ€¦' : 'Refresh'}
                </button>
              </div>

              {!isConnected ? (
                <Notice>Connect the manager wallet to see its vaults.</Notice>
              ) : error ? (
                <Notice>Could not load vaults: {error.message}</Notice>
              ) : isLoading ? (
                <Notice>Reading vaults from {appChainLabel}â€¦</Notice>
              ) : managed.length === 0 ? (
                <Notice>No vaults are managed by this wallet yet.</Notice>
              ) : (
                <div className="mt-4 grid gap-2">
                  {managed.map((vault) => (
                    <button
                      key={vault.address}
                      type="button"
                      onClick={() => setSelectedAddress(vault.address)}
                      className={`rounded-lg border p-3 text-left ${selected?.address === vault.address ? 'border-[#879cbb] bg-[#f6f9fd]' : 'border-line-2 bg-white'}`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <strong className="truncate text-[14px] font-[650]">{vault.name}</strong>
                        <span className={`rounded px-2 py-1 text-[10px] font-[650] ${STATE_STYLE[vault.state]}`}>{vault.state}</span>
                      </span>
                      <span className="mt-1 block text-[11px] text-muted-3">{shortAddress(vault.address)} Â· {vault.symbol}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="min-w-0">
            {!selected ? (
              <div className="rounded-xl border border-dashed border-[#c6d0de] bg-white px-6 py-16 text-center text-muted-2">
                {isConnected ? 'Create a vault or select one you manage.' : 'Connect the curator wallet to begin.'}
              </div>
            ) : (
              <div className="grid gap-5">
                <VaultStatus vault={selected} managerAllowed={managerAllowed} />
                <div className="grid gap-5 xl:grid-cols-2">
                  <TargetWeightsCard
                    key={`${selected.address}-${selected.target?.version ?? 0}`}
                    vault={selected}
                    managerAllowed={managerAllowed}
                    action={action}
                    onPublish={publishWeights}
                  />
                  <RebalanceCard
                    key={`${selected.address}-${selected.holdings.map((holding) => `${holding.asset}:${holding.amount}`).join('|')}`}
                    vault={selected}
                    managerAllowed={managerAllowed}
                    action={action}
                    onRebalance={rebalance}
                  />
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

function VaultStatus({vault, managerAllowed}: {vault: VaultView; managerAllowed: boolean}) {
  return (
    <section className="rounded-xl border border-line bg-white p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[24px] tracking-[-0.7px]">{vault.name}</h2>
            <span className={`rounded-md px-2 py-[6px] text-[11px] font-[650] ${STATE_STYLE[vault.state]}`}>{vault.state}</span>
          </div>
          <p className="mt-2 break-all text-[12px] text-muted-3">{vault.address}</p>
        </div>
        <div className="text-left text-[12px] leading-[1.65] text-muted-3 sm:text-right">
          <span className="block">Manager {shortAddress(vault.manager)}</span>
          <span className={managerAllowed ? 'text-positive' : 'text-negative'}>
            {managerAllowed ? 'Connected wallet is authorized' : 'Manager wallet required'}
          </span>
        </div>
      </div>

      {vault.state === 'SEEDED' && (
        <div className="mt-5 rounded-lg border border-[#d8e1ed] bg-[#f3f7fb] p-4 text-[13px] leading-[1.65] text-[#465b78]">
          <strong className="block text-[14px]">Waiting for Guardian activation</strong>
          The first deposit is secured in the vault. You can prepare the initial allocation while SEEDED, but investors cannot deposit until the Guardian calls <code>activate()</code>.
        </div>
      )}
      {!managerAllowed && (
        <div className="mt-5 rounded-lg bg-[#f6e9eb] p-4 text-[13px] leading-[1.65] text-negative">
          Manager actions are disabled because this wallet does not match the vault&apos;s on-chain manager.
        </div>
      )}
    </section>
  );
}

function Notice({children}: {children: React.ReactNode}) {
  return <p className="mt-4 rounded-lg bg-[#f7f9fc] p-4 text-[13px] leading-[1.6] text-muted-2">{children}</p>;
}
