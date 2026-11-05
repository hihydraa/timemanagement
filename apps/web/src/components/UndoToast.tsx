import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { t } from '../lib/i18n';

interface ToastItem {
  id: number;
  message: string;
  onUndo?: () => void | Promise<void>;
  busy?: boolean;
}
interface ToastApi {
  /** ทำทันทีแล้วแจ้ง + ปุ่ม "เลิกทำ" ค้างไว้ ~6 วินาที */
  undo: (message: string, onUndo: () => void | Promise<void>, ms?: number) => void;
  info: (message: string, ms?: number) => void;
}

const Ctx = createContext<ToastApi | null>(null);

/** toast "…แล้ว · เลิกทำ" (แทนกล่องยืนยัน): การกระทำที่ย้อนกลับได้ง่ายทำทันที แล้วให้เลิกทำได้ภายในไม่กี่วินาที */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((cur) => cur.filter((x) => x.id !== id));
  }, []);
  const push = useCallback(
    (item: Omit<ToastItem, 'id'>, ms: number) => {
      const id = ++seq.current;
      setItems((cur) => [...cur.slice(-2), { ...item, id }]);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), ms),
      );
    },
    [dismiss],
  );
  useEffect(() => {
    const tm = timers.current;
    return () => tm.forEach((v) => window.clearTimeout(v));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      undo: (message, onUndo, ms = 6500) => push({ message, onUndo }, ms),
      info: (message, ms = 4000) => push({ message }, ms),
    }),
    [push],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-3 md:bottom-6"
      >
        {items.map((x) => (
          <div
            key={x.id}
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full bg-slate-900 py-2 pl-4 pr-2 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
          >
            <span className="min-w-0 truncate">{x.message}</span>
            {x.onUndo && (
              <button
                type="button"
                disabled={x.busy}
                onClick={async () => {
                  setItems((cur) => cur.map((y) => (y.id === x.id ? { ...y, busy: true } : y)));
                  try {
                    await x.onUndo?.();
                  } finally {
                    dismiss(x.id);
                  }
                }}
                className="shrink-0 rounded-full bg-white/15 px-3 py-1 font-semibold hover:bg-white/25 dark:bg-slate-900/10 dark:hover:bg-slate-900/20"
              >
                {t.toast.undo}
              </button>
            )}
            <button
              type="button"
              aria-label={t.toast.close}
              onClick={() => dismiss(x.id)}
              className="h-7 w-7 shrink-0 rounded-full hover:bg-white/15 dark:hover:bg-slate-900/10"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast must be used inside ToastProvider');
  return c;
}
