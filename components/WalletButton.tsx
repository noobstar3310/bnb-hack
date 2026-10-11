'use client';

import {useSyncExternalStore} from 'react';
import {useChainId, useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain} from 'wagmi';
import {shortAddress} from '@/lib/domain/format';
import {appChain, appChainLabel} from '@/lib/contracts/wagmi';

const basePill =
  'apple-press shrink-0 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-all sm:text-[13px]';

const subscribeNothing = () => () => {};

export function WalletButton() {
  const {address, isConnected, chainId: walletChainId} = useConnection();
  const chainId = useChainId();
  const connectors = useConnectors();
  const {connect, isPending} = useConnect();
  const {disconnect} = useDisconnect();
  const {switchChain} = useSwitchChain();
  // The wallet only exists in the browser; render the same placeholder on the server.
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);

  if (!mounted) {
    return (
      <span className={`${basePill} border-black/[0.06] bg-black/[0.02] text-slate-400`}>
        Wallet
      </span>
    );
  }

  if (!isConnected) {
    const injected = connectors[0];
    return (
      <button
        type="button"
        disabled={!injected || isPending}
        onClick={() => injected && connect({connector: injected})}
        className={`${basePill} border-slate-900 bg-gradient-to-b from-slate-800 to-slate-950 text-white shadow-sm hover:from-slate-700 hover:to-slate-900 disabled:opacity-50`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        {isPending ? 'Connecting…' : (
          <>
            Connect<span className="hidden sm:inline"> Wallet</span>
          </>
        )}
      </button>
    );
  }

  if ((walletChainId ?? chainId) !== appChain.id) {
    return (
      <button
        type="button"
        onClick={() => switchChain({chainId: appChain.id})}
        className={`${basePill} border-amber-200 bg-amber-50 text-amber-800 shadow-xs hover:bg-amber-100`}
      >
        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        <span className="sm:hidden">Switch Network</span>
        <span className="hidden sm:inline">Switch to {appChainLabel}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      title="Click to disconnect"
      onClick={() => disconnect()}
      className={`${basePill} border-emerald-200 bg-emerald-50/70 text-slate-800 shadow-xs hover:border-emerald-300 hover:bg-emerald-100/60`}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span className="font-mono text-[11px] tracking-tight sm:text-[12px]">{shortAddress(address!)}</span>
    </button>
  );
}

