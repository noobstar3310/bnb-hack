'use client';

import Link from 'next/link';
import {WalletButton} from './WalletButton';

export type ViewMode = 'explore' | 'positions' | 'activity';

export function Header() {
  return (
    <header className="flex h-[64px] items-center gap-3 border-b border-[#203047] bg-[#0a1422]/95 px-4 text-[#e8eef7] backdrop-blur sm:px-6">
      <Link href="/" className="flex items-center gap-2 text-[17px] font-[850] tracking-[-0.4px] text-white no-underline">
        <span className="grid h-7 w-7 place-items-center bg-[#f2d23d] font-mono text-[13px] text-[#101725] [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]">
          F
        </span>
        <span>FOLIO LAB</span>
      </Link>

      <nav aria-label="Product navigation" className="ml-2 hidden h-full items-center gap-6 border-l border-[#203047] pl-5 sm:flex">
        <Link href="/curator" className="text-[13px] text-[#8fa0b7] no-underline transition hover:text-white">
          Curator
        </Link>
        <span aria-current="page" className="flex h-full items-center border-b-2 border-[#f2d23d] text-[13px] font-[750] text-white">
          Investor
        </span>
      </nav>

      <div className="ml-auto">
        <WalletButton />
      </div>
    </header>
  );
}
