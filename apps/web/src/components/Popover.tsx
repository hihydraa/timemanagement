import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** ปุ่ม + แผงลอย: ปิดเมื่อกด Esc หรือคลิกนอกแผง (a11y: aria-expanded/controls) */
export default function Popover({
  label,
  icon,
  children,
  align = 'left',
  width = 'w-64',
}: {
  label: string;
  icon?: string;
  children: ReactNode;
  align?: 'left' | 'right';
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        {icon && <span aria-hidden>{icon}</span>} {label}
      </button>
      {open && (
        <div
          id={id}
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} z-30 mt-2 ${width} rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-md dark:border-slate-700 dark:bg-slate-800`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
