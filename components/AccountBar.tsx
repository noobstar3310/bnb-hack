'use client';

import { money } from '@/lib/domain/format';
import { useStore } from '@/lib/state/store';

export function AccountBar() {
  const { balance, invested, total, dispatch, notify } = useStore();

  function move(change: number) {
    dispatch({ type: 'marketMove', change });
    notify(
      `Simulated equities moved ${change > 0 ? '+5%' : '−5%'}. Portfolio values updated.`,
    );
  }

  const cells = [
    { label: 'Demo account value', value: total },
    { label: 'Available to invest', value: balance },
    { label: 'Portfolio value', value: invested },
  ];

  return (
    <section
      aria-label="Your demo account"
      className="mb-9 grid grid-cols-2 gap-6 rounded-[14px] bg-ink p-[22px] text-white md:grid-cols-[1fr_1fr_1fr_1.45fr] md:gap-[22px] md:px-[30px] md:py-[26px]"
    >
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col gap-[10px]">
          <span className="text-[13px] text-panel-text sm:text-[14px]">{cell.label}</span>
          <strong className="text-[23px] font-semibold tracking-[-0.6px] sm:text-[28px]">
            {money(cell.value)}
          </strong>
        </div>
      ))}

      <div className="flex flex-col gap-[10px] md:border-l md:border-panel-line md:pl-[25px]">
        <span className="text-[13px] text-panel-text sm:text-[14px]">Try a market move</span>
        <div className="flex flex-wrap gap-[6px]">
          <button
            type="button"
            onClick={() => move(0.05)}
            className="rounded-md border border-panel-btn-line bg-panel-btn px-[10px] py-[7px] text-[13px] text-lime-2"
          >
            Market +5%
          </button>
          <button
            type="button"
            onClick={() => move(-0.05)}
            className="rounded-md border border-panel-btn-line bg-panel-btn px-[10px] py-[7px] text-[13px] text-white"
          >
            Market −5%
          </button>
        </div>
        <small className="text-[12px] leading-[1.4] text-[#aeb9ca]">
          Equities move together; demo dollars stay flat.
        </small>
      </div>
    </section>
  );
}
