'use client';

import Link from 'next/link';
import {WalletButton} from './WalletButton';

export type ViewMode = 'explore' | 'positions' | 'activity';

const TABS: {id: ViewMode; label: string; icon?: string}[] = [
  {id: 'explore', label: 'Explore'},
  {id: 'positions', label: 'My Positions'},
  {id: 'activity', label: 'Activity'},
];

export function Header({mode, onMode}: {mode: ViewMode; onMode: (mode: ViewMode) => void}) {
  return (
    <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-black/[0.06] bg-white/80 px-[5%] backdrop-blur-xl transition-all sm:h-18">
      {/* Brand Mark */}
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="group flex items-center gap-2.5 text-[20px] font-bold tracking-tight text-slate-900 no-underline sm:text-[22px]"
        >
          <div className="relative grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-b from-slate-800 to-slate-950 font-mono text-[16px] italic text-[#bef264] shadow-sm ring-1 ring-white/20 transition-transform group-hover:scale-[1.03] sm:h-9 sm:w-9 sm:rounded-2xl">
            f
            <span className="absolute inset-x-1.5 top-0.5 h-[1px] bg-white/30" />
          </div>
          <span className="tracking-[-0.03em]">
            folio<span className="font-normal text-slate-400">lab</span>
          </span>
        </Link>

        {/* Network Badge */}
        <div className="hidden items-center gap-1.5 rounded-full border border-black/[0.05] bg-black/[0.02] px-2.5 py-0.5 text-[11px] font-medium text-slate-600 lg:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-[#f3ba2f]" />
          <span>BNB Chain</span>
        </div>
      </div>

      {/* Apple-style Segmented Control */}
      <nav aria-label="Main navigation" className="flex items-center rounded-full border border-black/[0.05] bg-slate-100/80 p-1 backdrop-blur-md shadow-inner">
        {TABS.map((tab) => {
          const active = mode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onMode(tab.id)}
              className={`apple-press relative rounded-full px-3 py-1.5 text-[12px] tracking-tight sm:px-4 sm:text-[13px] ${
                active
                  ? 'bg-white font-semibold text-slate-900 shadow-[0_1px_4px_rgba(0,0,0,0.08),0_1px_1px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.04]'
                  : 'font-medium text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Actions: Curator Link + Wallet */}
      <div className="flex items-center gap-2 sm:gap-3">
        <Link
          href="/curator"
          className="apple-press hidden items-center gap-1.5 rounded-full border border-black/[0.08] bg-white/70 px-3.5 py-1.5 text-[12px] font-semibold tracking-tight text-slate-700 shadow-xs hover:border-black/[0.15] hover:bg-white hover:text-slate-950 sm:inline-flex"
        >
          <span>Curator Studio</span>
          <span className="text-[10px] text-slate-400">↗</span>
        </Link>

        <WalletButton />
      </div>
    </header>
  );
}

