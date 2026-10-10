'use client';

import {useState, type FormEvent} from 'react';
import type {Address} from 'viem';
import {useNotify} from '@/components/Toast';
import {explainError} from '@/lib/contracts/hooks';
import type {CuratorAction} from './useCuratorActions';

interface Props {
  connected: boolean;
  action: CuratorAction;
  onCreate: (name: string, symbol: string, seed: string) => Promise<Address>;
  onCreated: (vault: Address) => void;
}

const ACTION_LABEL: Partial<Record<CuratorAction, string>> = {
  creating: 'Creating vaultâ€¦',
  approving: 'Approving USDTâ€¦',
  seeding: 'Sending first depositâ€¦',
};

export function CreateVaultCard({connected, action, onCreate, onCreated}: Props) {
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
    if (!/^[A-Z0-9]{2,8}$/.test(cleanSymbol)) {
      return notify('Use a 2â€“8 character symbol made from letters and numbers.');
    }
    if (!/^\d+(\.\d+)?$/.test(seed) || Number(seed) < 10) {
      return notify('The first deposit must be at least 10 USDT.');
    }

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

  return (
    <section className="rounded-xl border border-line bg-white p-5 sm:p-6">
      <p className="mb-2 text-[11px] font-[750] tracking-[1.8px] text-muted-3">NEW FUND</p>
      <h2 className="text-[21px] tracking-[-0.5px]">Create and fund a vault</h2>
      <p className="mt-2 text-[13px] leading-[1.65] text-muted-2">
        Your connected wallet becomes the manager. Creation, USDT approval and the first deposit are separate
        wallet confirmations.
      </p>

      <form onSubmit={submit} className="mt-5 grid gap-4">
        <label className="grid gap-[7px] text-[13px] font-[650] text-[#37465d]">
          Fund name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Mag Tech Fund"
            maxLength={48}
            disabled={busy}
            className="rounded-lg border border-field bg-field-bg px-3 py-[11px] font-normal text-ink disabled:opacity-60"
          />
        </label>
        <label className="grid gap-[7px] text-[13px] font-[650] text-[#37465d]">
          Share symbol
          <input
            value={symbol}
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
            placeholder="MAGT"
            maxLength={8}
            disabled={busy}
            className="rounded-lg border border-field bg-field-bg px-3 py-[11px] font-normal uppercase text-ink disabled:opacity-60"
          />
        </label>
        <label className="grid gap-[7px] text-[13px] font-[650] text-[#37465d]">
          First deposit
          <span className="flex items-center rounded-lg border border-field bg-field-bg pr-3 focus-within:outline focus-within:outline-3 focus-within:outline-[#4274e9]">
            <input
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              inputMode="decimal"
              disabled={busy}
              className="min-w-0 flex-1 border-0 bg-transparent px-3 py-[11px] outline-none disabled:opacity-60"
            />
            <span className="text-[12px] font-[650] text-muted-3">USDT</span>
          </span>
          <span className="font-normal text-muted-3">Minimum 10 USDT. The seeder receives the first shares.</span>
        </label>

        <button
          type="submit"
          disabled={!connected || busy}
          className="mt-1 rounded-lg border border-ink-soft bg-ink-soft px-4 py-3 text-[14px] font-[650] text-white hover:bg-ink-hover disabled:opacity-50"
        >
          {!connected ? 'Connect the manager wallet' : ACTION_LABEL[action] ?? 'Create and seed vault'}
        </button>
      </form>
    </section>
  );
}
