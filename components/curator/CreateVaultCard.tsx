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

  const inputClass = 'rounded-lg border border-[#33445b] bg-[#0b1421] px-3 py-[11px] font-normal text-white outline-none transition placeholder:text-[#56667d] focus:border-[#f1cf3c] disabled:opacity-55';

  return (
    <section>
      <p className="text-[12px] leading-[1.65] text-[#93a2b8]">Your wallet becomes manager. Creation, USDT approval and the first deposit require separate confirmations.</p>
      {connected && !deploymentReady && (
        <p className="mt-4 rounded-lg border border-[#5e5020] bg-[#231f12] p-3 text-[12px] leading-[1.6] text-[#dac66b]">Vault creation is disabled because this chain has no published Registry, Factory and USDT addresses.</p>
      )}

      <form onSubmit={submit} className="mt-5 grid gap-4">
        <label className="grid gap-[7px] text-[12px] font-[700] text-[#bec9d8]">
          Fund name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Mag Tech Fund" maxLength={48} disabled={busy} className={inputClass} />
        </label>
        <label className="grid gap-[7px] text-[12px] font-[700] text-[#bec9d8]">
          Share symbol
          <input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="MAGT" maxLength={8} disabled={busy} className={`${inputClass} uppercase`} />
        </label>
        <label className="grid gap-[7px] text-[12px] font-[700] text-[#bec9d8]">
          First deposit
          <span className="flex items-center rounded-lg border border-[#33445b] bg-[#0b1421] pr-3 focus-within:border-[#f1cf3c]">
            <input value={seed} onChange={(event) => setSeed(event.target.value)} inputMode="decimal" disabled={busy} className="min-w-0 flex-1 border-0 bg-transparent px-3 py-[11px] text-white outline-none disabled:opacity-55" />
            <span className="font-mono text-[11px] text-[#7d8da4]">USDT</span>
          </span>
          <span className="font-normal text-[#77879e]">Minimum 10 USDT. The seeder receives the first shares.</span>
        </label>
        <button type="submit" disabled={!connected || !deploymentReady || busy} className="mt-1 rounded-lg border border-[#f2cf3d] bg-[#f2cf3d] px-4 py-3 text-[13px] font-[850] text-[#111827] transition hover:bg-[#ffe56e] disabled:cursor-not-allowed disabled:border-[#4d4627] disabled:bg-[#2b2819] disabled:text-[#817746]">
          {!connected ? 'Connect the manager wallet' : !deploymentReady ? 'Deployment addresses pending' : ACTION_LABEL[action] ?? 'Create and seed vault'}
        </button>
      </form>
    </section>
  );
}
