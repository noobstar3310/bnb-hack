'use client';

import {useState, type FormEvent} from 'react';
import type {Address} from 'viem';
import {useNotify} from '@/components/Toast';
import {explainError} from '@/lib/contracts/hooks';
import type {CuratorAction} from './useCuratorActions';

interface Props {
  connected: boolean;
  deploymentReady: boolean;
  action: CuratorAction;
  onCreate: (name: string, symbol: string, seed: string) => Promise<Address>;
  onCreated: (vault: Address) => void;
}

const ACTION_LABEL: Partial<Record<CuratorAction, string>> = {
  creating: 'Creating vault…',
  approving: 'Approving USDT…',
  seeding: 'Sending first deposit…',
};

export function CreateVaultCard({connected, deploymentReady, action, onCreate, onCreated}: Props) {
  const notify = useNotify();
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [seed, setSeed] = useState('10');
  const busy = action === 'creating' || action === 'approving' || action === 'seeding';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanSymbol = symbol.trim().toUpperCase();
    if (cleanName.length < 2) return notify('Give the vault a name of at least two characters.');
    if (!/^[A-Z0-9]{2,8}$/.test(cleanSymbol)) return notify('Use a 2–8 character symbol made from letters and numbers.');
    if (!/^\d+(\.\d+)?$/.test(seed) || Number(seed) < 10) return notify('The first deposit must be at least 10 USDT.');

    try {
      const vault = await onCreate(cleanName, cleanSymbol, seed);
      setName('');
      setSymbol('');
      setSeed('10');
      onCreated(vault);
      notify('Vault created and seeded. It is waiting for Guardian activation.');
    } catch (error) {
      notify(explainError(error));
    }
  }

  const inputClass = 'rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[13px] text-white outline-none transition placeholder:text-slate-500 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 disabled:opacity-55';

  return (
    <section>
      <p className="text-[13px] leading-[1.6] text-slate-400">
        Your connected wallet becomes the curator. Vault deployment, USDT allowance, and seed deposit require three consecutive transaction signatures.
      </p>
      {connected && !deploymentReady && (
        <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-[12px] leading-[1.6] text-amber-200">
          Vault creation is paused: published Registry, Factory and USDT contracts are pending for this chain.
        </div>
      )}

      <form onSubmit={submit} className="mt-5 grid gap-4.5">
        <label className="grid gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-300">
          Fund Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Magnificent Tech Equities"
            maxLength={48}
            disabled={busy}
            className={inputClass}
          />
        </label>
        <label className="grid gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-300">
          Share Token Symbol
          <input
            value={symbol}
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
            placeholder="MTEQ"
            maxLength={8}
            disabled={busy}
            className={`${inputClass} uppercase`}
          />
        </label>
        <label className="grid gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-300">
          First Seed Deposit (USDT)
          <div className="flex items-center rounded-2xl border border-white/10 bg-white/5 pr-4 focus-within:border-amber-400 focus-within:ring-1 focus-within:ring-amber-400">
            <input
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              inputMode="decimal"
              disabled={busy}
              className="min-w-0 flex-1 border-0 bg-transparent px-4 py-3 text-[13px] text-white outline-none disabled:opacity-55"
            />
            <span className="font-mono text-[11px] font-bold text-slate-400">USDT</span>
          </div>
          <span className="text-[11px] font-normal text-slate-400">
            Minimum 10 USDT seed. You receive the initial 100% share of the vault.
          </span>
        </label>
        <button
          type="submit"
          disabled={!connected || !deploymentReady || busy}
          className="apple-press mt-2 rounded-full border border-amber-400/40 bg-gradient-to-b from-[#f3ba2f] to-[#e5ac24] px-5 py-3.5 text-[13px] font-bold text-slate-950 shadow-md hover:from-amber-300 hover:to-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {!connected ? 'Connect Manager Wallet' : !deploymentReady ? 'Deployment Addresses Pending' : ACTION_LABEL[action] ?? 'Create & Seed Vault'}
        </button>
      </form>
    </section>
  );
}
