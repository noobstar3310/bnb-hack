'use client';

import {useSyncExternalStore} from 'react';
import {useChainId, useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain} from 'wagmi';
import {shortAddress} from '@/lib/domain/format';
import {appChain, appChainLabel} from '@/lib/contracts/wagmi';

const pill =
  'ml-auto rounded-md border px-3 py-2 text-[12px] font-[650] sm:text-[13px] whitespace-nowrap';

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

  if (!mounted) return <span className={`${pill} border-line-2 text-muted-3`}>Wallet</span>;

  if (!isConnected) {
    const injected = connectors[0];
    return (
      <button
        type="button"
        disabled={!injected || isPending}
        onClick={() => injected && connect({connector: injected})}
        className={`${pill} border-ink-soft bg-ink-soft text-white hover:bg-ink-hover disabled:opacity-60`}
      >
        {isPending ? 'Connecting…' : 'Connect wallet'}
      </button>
    );
  }

  if ((walletChainId ?? chainId) !== appChain.id) {
    return (
      <button
        type="button"
        onClick={() => switchChain({chainId: appChain.id})}
        className={`${pill} border-[#e6c27a] bg-[#fff6e3] text-[#7a5310]`}
      >
        Switch to {appChainLabel}
      </button>
    );
  }

  return (
    <button
      type="button"
      title="Disconnect"
      onClick={() => disconnect()}
      className={`${pill} border-pill-line bg-pill-bg text-ink`}
    >
      <span className="mr-2 inline-block h-2 w-2 rounded-full bg-positive" />
      {shortAddress(address!)}
    </button>
  );
}
