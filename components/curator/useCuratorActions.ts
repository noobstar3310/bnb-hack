'use client';

import {useQueryClient} from '@tanstack/react-query';
import {useCallback, useState} from 'react';
import {
  getAddress,
  parseEventLogs,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';
import {useChainId, useConfig, useConnection, type Config} from 'wagmi';
import {readContract, simulateContract, waitForTransactionReceipt, writeContract} from 'wagmi/actions';
import {erc20Abi, folioVaultAbi, vaultFactoryAbi} from '@/lib/contracts/abis';
import {deploymentFor} from '@/lib/contracts/addresses';
import type {TradeQuote} from './model';

export type CuratorAction =
  | 'idle'
  | 'creating'
  | 'approving'
  | 'seeding'
  | 'publishing'
  | 'rebalancing';

async function successfulReceipt(config: Config, hash: Hex) {
  const receipt = await waitForTransactionReceipt(config, {hash});
  if (receipt.status !== 'success') throw new Error('The transaction failed on-chain.');
  return receipt;
}

export function useCuratorActions() {
  const config = useConfig();
  const chainId = useChainId();
  const {address} = useConnection();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<CuratorAction>('idle');

  const refreshVaults = useCallback(
    () => queryClient.invalidateQueries({queryKey: ['vaults']}),
    [queryClient],
  );

  const requireWallet = useCallback((): Address => {
    if (!address) throw new Error('Connect the curator wallet first.');
    return address;
  }, [address]);

  const requireManager = useCallback(
    async (vault: Address): Promise<Address> => {
      const account = requireWallet();
      const manager = await readContract(config, {
        address: vault,
        abi: folioVaultAbi,
        functionName: 'manager',
      });
      if (getAddress(manager) !== getAddress(account)) {
        throw new Error('Only this vault\'s manager can perform that action.');
      }
      return account;
    },
    [config, requireWallet],
  );

  const createAndSeed = useCallback(
    async (name: string, symbol: string, amountText: string): Promise<Address> => {
      const account = requireWallet();
      const deployment = deploymentFor(chainId);
      if (!deployment) throw new Error(`No Folio Lab deployment is configured for chain ${chainId}.`);

      setAction('creating');
      try {
        await simulateContract(config, {
          address: deployment.factory,
          abi: vaultFactoryAbi,
          functionName: 'createVault',
          args: [name, symbol, account],
          account,
        });
        const createHash = await writeContract(config, {
          address: deployment.factory,
          abi: vaultFactoryAbi,
          functionName: 'createVault',
          args: [name, symbol, account],
        });
        const createReceipt = await successfulReceipt(config, createHash);
        const created = parseEventLogs({
          abi: vaultFactoryAbi,
          eventName: 'VaultCreated',
          logs: createReceipt.logs,
        }).find((event) => getAddress(event.args.manager) === getAddress(account));
        if (!created) throw new Error('Vault was created, but its address was not found in the receipt.');
        const vault = getAddress(created.args.vault);
        // Creation is already final even if approval or seeding later fails, so expose the DRAFT
        // vault immediately and let the curator recover instead of hiding it until the next poll.
        await refreshVaults();

        const decimals = await readContract(config, {
          address: deployment.usdt,
          abi: erc20Abi,
          functionName: 'decimals',
        });
        const amount = parseUnits(amountText, decimals);
        const minimum = await readContract(config, {
          address: vault,
          abi: folioVaultAbi,
          functionName: 'minSeed',
        });
        if (amount < minimum) throw new Error('The first deposit must be at least 10 USDT.');

        const allowance = await readContract(config, {
          address: deployment.usdt,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [account, vault],
        });
        if (allowance < amount) {
          setAction('approving');
          const approveHash = await writeContract(config, {
            address: deployment.usdt,
            abi: erc20Abi,
            functionName: 'approve',
            args: [vault, amount],
          });
          await successfulReceipt(config, approveHash);
        }

        setAction('seeding');
        await simulateContract(config, {
          address: vault,
          abi: folioVaultAbi,
          functionName: 'seed',
          args: [amount],
          account,
        });
        const seedHash = await writeContract(config, {
          address: vault,
          abi: folioVaultAbi,
          functionName: 'seed',
          args: [amount],
        });
        await successfulReceipt(config, seedHash);
        await refreshVaults();
        return vault;
      } finally {
        setAction('idle');
      }
    },
    [chainId, config, refreshVaults, requireWallet],
  );

  const publishWeights = useCallback(
    async (vault: Address, assets: Address[], bps: number[]): Promise<void> => {
      const account = await requireManager(vault);
      setAction('publishing');
      try {
        const weights = bps.map((value) => value);
        await simulateContract(config, {
          address: vault,
          abi: folioVaultAbi,
          functionName: 'setTargetWeights',
          args: [assets, weights],
          account,
        });
        const hash = await writeContract(config, {
          address: vault,
          abi: folioVaultAbi,
          functionName: 'setTargetWeights',
          args: [assets, weights],
        });
        await successfulReceipt(config, hash);
        await refreshVaults();
      } finally {
        setAction('idle');
      }
    },
    [config, refreshVaults, requireManager],
  );

  const rebalance = useCallback(
    async (vault: Address, built: TradeQuote): Promise<void> => {
      const account = await requireManager(vault);
      if (built.warnings.length) throw new Error('Resolve the quote warnings before signing.');
      const trade = {
        ...built.trade,
        maxSellAmount: BigInt(built.trade.maxSellAmount),
        minBuyAmount: BigInt(built.trade.minBuyAmount),
      };

      setAction('rebalancing');
      try {
        await simulateContract(config, {
          address: vault,
          abi: folioVaultAbi,
          functionName: 'rebalance',
          args: [trade],
          account,
        });
        const hash = await writeContract(config, {
          address: vault,
          abi: folioVaultAbi,
          functionName: 'rebalance',
          args: [trade],
        });
        await successfulReceipt(config, hash);
        await refreshVaults();
      } finally {
        setAction('idle');
      }
    },
    [config, refreshVaults, requireManager],
  );

  return {action, createAndSeed, publishWeights, rebalance};
}
