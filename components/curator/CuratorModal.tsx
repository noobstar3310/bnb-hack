'use client';

import {useEffect, type ReactNode} from 'react';

interface Props {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export function CuratorModal({open, title, children, onClose}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#020813]/75 p-4 backdrop-blur-md transition-opacity"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[min(780px,calc(100dvh-32px))] w-full max-w-[530px] overflow-y-auto rounded-3xl border border-white/[0.12] bg-[#0c1626]/95 shadow-[0_30px_100px_rgba(0,0,0,0.8)] backdrop-blur-2xl ring-1 ring-white/10"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/[0.08] bg-[#0c1626]/95 px-6 py-4.5 backdrop-blur-xl">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#5dd7c4]/30 bg-[#5dd7c4]/10 px-2.5 py-0.5 text-[9px] font-bold tracking-[1.5px] text-[#5dd7c4] uppercase">
              MANAGER ACTION
            </div>
            <h2 className="mt-1 text-[18px] font-bold tracking-tight text-white">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="apple-press grid h-8 w-8 place-items-center rounded-full bg-white/10 text-[18px] text-slate-300 hover:bg-white/20 hover:text-white"
          >
            ×
          </button>
        </div>
        <div className="p-6">{children}</div>
      </section>
    </div>
  );
}
