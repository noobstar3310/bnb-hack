'use client';

import {formatUnits, parseUnits} from 'viem';
import {useConfig, useConnection, useReadContract} from 'wagmi';
import {waitForTransactionReceipt, writeContract} from 'wagmi/actions';
import {money} from '@/lib/domain/format';
import {erc20Abi} from '@/lib/contracts/abis';
import {deploymentFor} from '@/lib/contracts/addresses';
import type {VaultView} from '@/lib/contracts/hooks';
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
    {label: 'Wallet Total', value: show(total), hint: 'USDT + Vault Positions'},
    {label: 'USDT Available', value: show(cash), hint: 'Idle in your wallet'},
    {label: 'Invested in Vaults', value: show(invested), hint: 'Active shares'},
  ];

  return (
    <section
      aria-label="Your account"
      className="relative mb-10 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6 text-white shadow-[0_10px_35px_-5px_rgba(15,23,42,0.3)] ring-1 ring-white/10 sm:p-7 md:p-8"
    >
      {/* Apple specular hairline highlight */}
      <div className="pointer-events-none absolute inset-x-8 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="pointer-events-none absolute right-1/3 -bottom-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />

      <div className="relative z-10 grid grid-cols-2 gap-6 md:grid-cols-[1fr_1fr_1fr_1.35fr] md:gap-8">
        {cells.map((cell) => (
          <div key={cell.label} className="flex flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              {cell.label}
            </span>
            <strong className="mt-1.5 text-[24px] font-bold tracking-tight text-white tabular-nums sm:text-[30px]">
              {cell.value}
            </strong>
            <span className="mt-0.5 text-[11px] text-slate-500">
              {cell.hint}
            </span>
          </div>
        ))}

        <div className="flex flex-col justify-between gap-3 md:border-l md:border-white/10 md:pl-8">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              Settlement Network
            </span>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <strong className="text-[15px] font-semibold text-slate-200">
                {appChainLabel}
              </strong>
            </div>
          </div>

          {isLocal ? (
            <button
              type="button"
              disabled={!address}
              onClick={faucet}
              className="apple-press self-start rounded-full border border-[#bef264]/30 bg-[#bef264]/10 px-3.5 py-1.5 text-[12px] font-semibold text-[#bef264] shadow-xs hover:bg-[#bef264]/20 disabled:opacity-40"
            >
              + Mint 1,000 Test USDT
            </button>
          ) : (
            <p className="text-[11px] leading-[1.5] text-slate-400">
              Production assets on BSC. Valuations track Binance real-time order books.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
