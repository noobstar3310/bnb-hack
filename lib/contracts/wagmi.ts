/**
 * Wallet configuration. The app targets one chain: BSC mainnet in production, the local anvil
 * (scripts/dev-chain.sh) in development. Override with NEXT_PUBLIC_CHAIN=bsc|local.
 */
import {createConfig, http} from 'wagmi';
import {bsc, foundry} from 'wagmi/chains';
import {injected} from 'wagmi/connectors';

const target = process.env.NEXT_PUBLIC_CHAIN ?? (process.env.NODE_ENV === 'production' ? 'bsc' : 'local');

/** The chain every read and transaction goes to. */
export const appChain = target === 'bsc' ? bsc : foundry;

export const wagmiConfig = createConfig({
  chains: [appChain],
  connectors: [injected()],
  transports: {[appChain.id]: http()} as Record<typeof appChain.id, ReturnType<typeof http>>,
  ssr: true,
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
