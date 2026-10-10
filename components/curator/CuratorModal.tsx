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
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#020813]/80 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-label={title} className="max-h-[min(760px,calc(100dvh-32px))] w-full max-w-[520px] overflow-y-auto rounded-xl border border-[#354861] bg-[#0e1928] shadow-[0_30px_100px_rgba(0,0,0,0.65)]">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[#293b52] bg-[#0e1928]/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="font-mono text-[9px] font-[800] tracking-[1.7px] text-[#5dd7c4]">MANAGER ACTION</p>
            <h2 className="mt-1 text-[17px] font-[800] text-white">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="grid h-9 w-9 place-items-center rounded-lg border border-[#33465e] text-[18px] text-[#9babc0] hover:border-[#64758b] hover:text-white">×</button>
        </div>
        <div className="p-5">{children}</div>
      </section>
    </div>
  );
}
