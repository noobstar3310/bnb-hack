'use client';

import { useStore, type ViewMode } from '@/lib/state/store';

const TABS: { id: ViewMode; label: string }[] = [
  { id: 'explore', label: 'Explore' },
  { id: 'positions', label: 'My positions' },
];

export function Header() {
  const { mode, dispatch } = useStore();

  return (
    <header className="flex h-[72px] items-center gap-[12px] border-b border-line-3 bg-white px-[5%] xs:gap-[20px] sm:h-[88px] sm:gap-[56px]">
      <a
        href="#"
        className="flex items-center gap-2 text-[23px] font-[750] tracking-[-1px] text-ink no-underline sm:text-[28px]"
      >
        <span className="hidden h-[30px] w-[28px] place-items-center rounded-[10px] bg-ink text-lime italic xs:grid sm:h-9 sm:w-9">
          f
        </span>
        folio<span className="-ml-[7px] font-normal text-muted-3">lab</span>
      </a>

      <nav aria-label="Main navigation" className="flex h-full gap-[14px] sm:gap-8">
        {TABS.map((tab) => {
          const active = mode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => dispatch({ type: 'setMode', mode: tab.id })}
              className={`relative border-0 bg-transparent text-[13px] sm:text-[15px] ${
                active ? 'font-[650] text-ink' : 'text-[#6c768a]'
              }`}
            >
              {tab.label}
              {active && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-ink" />}
            </button>
          );
        })}
      </nav>

      <span className="ml-auto rounded-md border border-pill-line bg-pill-bg p-[6px] text-[10px] font-[750] tracking-[0.5px] sm:px-3 sm:py-2 sm:text-[12px] sm:tracking-[1px]">
        SIMULATION
      </span>
    </header>
  );
}
