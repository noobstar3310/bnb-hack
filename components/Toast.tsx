'use client';

import {createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode} from 'react';

const TOAST_MS = 5000;

const NotifyContext = createContext<((message: string) => void) | null>(null);

/** Holds the one visible toast and renders it; `useNotify` shows a message. */
export function ToastProvider({children}: {children: ReactNode}) {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <NotifyContext.Provider value={notify}>
      {children}
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
    </NotifyContext.Provider>
  );
}

export function useNotify(): (message: string) => void {
  const notify = useContext(NotifyContext);
  if (!notify) throw new Error('useNotify must be used inside ToastProvider.');
  return notify;
}
