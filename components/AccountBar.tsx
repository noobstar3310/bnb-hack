'use client';

import {formatUnits, parseUnits} from 'viem';
import {useConfig, useConnection, useReadContract} from 'wagmi';
import {waitForTransactionReceipt, writeContract} from 'wagmi/actions';
import {money} from '@/lib/domain/format';
import {erc20Abi} from '@/lib/contracts/abis';
import {deploymentFor} from '@/lib/contracts/addresses';
import type {VaultView} from '@/lib/contracts/hooks';
import {appChain} from '@/lib/contracts/wagmi';
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
  const positions = vaults.filter((v) => v.position && v.position.shares !== '0');
  const invested = positions.every((v) => v.position?.valueUsd !== null)
    ? positions.reduce((sum, v) => sum + Number(v.position!.valueUsd), 0)
    : null;
  const total = cash !== null && invested !== null ? cash + invested : null;

  async function faucet() {
    if (!address || !usdt) return;
    try {
      const hash = await writeContract(config, {address: usdt, abi: mintAbi, functionName: 'mint', args: [address, parseUnits('1000', 18)]});
      await waitForTransactionReceipt(config, {hash});
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
    {label: 'Invested in vaults', value: show(invested)},
  ];

  return (
    <section
      aria-label="Your account"
      className="mb-9 grid grid-cols-2 gap-6 rounded-[14px] bg-ink p-[22px] text-white md:grid-cols-[1fr_1fr_1fr_1.45fr] md:gap-[22px] md:px-[30px] md:py-[26px]"
    >
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col gap-[10px]">
          <span className="text-[13px] text-panel-text sm:text-[14px]">{cell.label}</span>
          <strong className="text-[23px] font-semibold tracking-[-0.6px] sm:text-[28px]">{cell.value}</strong>
        </div>
      ))}

      <div className="flex flex-col gap-[10px] md:border-l md:border-panel-line md:pl-[25px]">
        <span className="text-[13px] text-panel-text sm:text-[14px]">Network</span>
        <strong className="text-[16px] font-semibold">{appChain.name}</strong>
        {isLocal ? (
          <button
            type="button"
            disabled={!address}
            onClick={faucet}
            className="self-start rounded-md border border-panel-btn-line bg-panel-btn px-[10px] py-[7px] text-[13px] text-lime-2 disabled:opacity-50"
          >
            Get 1,000 test USDT
          </button>
        ) : (
          <small className="text-[12px] leading-[1.4] text-[#aeb9ca]">
            Real USDT on BNB Smart Chain. Values are estimates at Binance prices.
          </small>
        )}
      </div>
    </section>
  );
}
