'use client';

import { useStore } from '@/lib/state/store';

export function Toast() {
  const { toast } = useStore();

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-7 left-1/2 z-10 max-w-[90%] -translate-x-1/2"
    >
      {toast && (
        <div className="rounded-[10px] bg-[#17273e] px-5 py-[14px] text-[14px] text-white shadow-[0_5px_20px_#14203930]">
          {toast}
        </div>
      )}
    </div>
  );
}
