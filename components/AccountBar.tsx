'use client';

import {formatUnits, parseUnits} from 'viem';
import {useConfig, useConnection, useReadContract} from 'wagmi';
import {writeContract} from 'wagmi/actions';
import {money} from '@/lib/domain/format';
import {erc20Abi} from '@/lib/contracts/abis';
import {deploymentFor} from '@/lib/contracts/addresses';
import {waitForSuccessfulReceipt, type VaultView} from '@/lib/contracts/hooks';
import {appChain, appChainLabel} from '@/lib/contracts/wagmi';
import {useNotify} from './Toast';

/** Open-mint function on the local mock USDT. Exists only on the dev chain. */
const mintAbi = [
  {
    type: 'function',
    name: 'mint',
    inputs: [{type: 'address'}, {type: 'uint256'}],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

const isLocal = appChain.id === 31337;

export function AccountBar({vaults}: {vaults: VaultView[]}) {
  const {address} = useConnection();
  const config = useConfig();
  const notify = useNotify();
  const usdt = deploymentFor(appChain.id)?.usdt;

  const balance = useReadContract({
    address: usdt,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {enabled: Boolean(address && usdt), refetchInterval: 10_000},
  });

  const cash = balance.data === undefined ? null : Number(formatUnits(balance.data, 18));
  const positions = vaults.filter((vault) => vault.position && vault.position.shares !== '0');
  const invested = positions.every((vault) => vault.position?.valueUsd !== null)
    ? positions.reduce((sum, vault) => sum + Number(vault.position!.valueUsd), 0)
    : null;
  const total = cash !== null && invested !== null ? cash + invested : null;

  async function faucet() {
    if (!address || !usdt) return;
    try {
      const hash = await writeContract(config, {address: usdt, abi: mintAbi, functionName: 'mint', args: [address, parseUnits('1000', 18)]});
      await waitForSuccessfulReceipt(config, hash);
      await balance.refetch();
      notify('1,000 test USDT added to your wallet.');
    } catch {
      notify('Could not mint test USDT.');
    }
  }

  const show = (value: number | null) => (!address ? '—' : value === null ? 'Unavailable' : money(value));
  const cells = [
    {label: 'Wallet total', value: show(total)},
    {label: 'USDT available', value: show(cash)},
    {label: 'Invested', value: show(invested)},
    {label: 'Positions', value: address ? String(positions.length) : '—'},
  ];

  return (
    <section aria-label="Your account" className="mb-3 grid grid-cols-2 overflow-hidden rounded-xl border border-[#26374d] bg-[#0d1827] sm:grid-cols-4 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
      {cells.map((cell) => (
        <div key={cell.label} className="border-b border-r border-[#24344a] px-4 py-3 last:border-r-0 sm:border-b-0">
          <span className="block font-mono text-[8px] font-[800] tracking-[0.9px] text-[#71849b]">{cell.label.toUpperCase()}</span>
          <strong className="mt-1.5 block truncate text-[16px] font-[800] tracking-[-0.4px] text-[#edf3fa] sm:text-[18px]">{cell.value}</strong>
        </div>
      ))}

      <div className="col-span-2 flex items-center justify-between gap-3 px-4 py-3 sm:col-span-4 lg:col-span-1 lg:min-w-[220px] lg:border-l lg:border-[#24344a]">
        <div>
          <span className="block font-mono text-[8px] font-[800] tracking-[0.9px] text-[#71849b]">NETWORK</span>
          <strong className="mt-1.5 block text-[12px] text-[#cbd7e5]">{appChainLabel}</strong>
        </div>
        {isLocal && (
          <button type="button" disabled={!address} onClick={faucet} className="rounded-md border border-[#66591d] bg-[#2b2610] px-3 py-2 text-[10px] font-[800] text-[#f2d568] hover:border-[#a98f27] disabled:opacity-40">
            + Test USDT
          </button>
        )}
      </div>
    </section>
  );
}
