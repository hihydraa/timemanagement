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
import Confetti from './Confetti';

interface ToastItem {
  id: number;
  message: string;
  /** success = ติ๊กถูกพร้อมประกาย (ทำสำเร็จ) / info = ไอคอนข้อมูล */
  tone: 'success' | 'info';
  /** เวลาที่แสดง (ms) ใช้ทำแถบนับถอยหลัง */
  ms: number;
  onUndo?: () => void | Promise<void>;
  busy?: boolean;
}
interface ToastApi {
  /** ทำทันทีแล้วแจ้ง + ปุ่ม "เลิกทำ" ค้างไว้ ~6 วินาที */
  undo: (message: string, onUndo: () => void | Promise<void>, ms?: number) => void;
  info: (message: string, ms?: number) => void;
  /** แจ้งสำเร็จ (ติ๊กถูก+เอฟเฟกต์) โดยไม่มีปุ่มเลิกทำ */
  success: (message: string, ms?: number) => void;
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
    (item: Omit<ToastItem, 'id' | 'ms'>, ms: number) => {
      const id = ++seq.current;
      setItems((cur) => [...cur.slice(-2), { ...item, id, ms }]);
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
      undo: (message, onUndo, ms = 6500) => push({ message, onUndo, tone: 'success' }, ms),
      info: (message, ms = 4000) => push({ message, tone: 'info' }, ms),
      success: (message, ms = 4500) => push({ message, tone: 'success' }, ms),
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
        {items.map((x) => {
          // "เพิ่มแล้ว: ชื่องาน" → หัวข้อตัวหนา + ชื่องานขึ้นบรรทัดถัดไป (ข้อความยาวขึ้นบรรทัดใหม่ ไม่ตัดกลางประโยค)
          const [head, ...rest] = x.message.split(': ');
          const detail = rest.join(': ');
          return (
            <div
              key={x.id}
              className={`pointer-events-auto relative w-[min(26rem,calc(100vw-1.5rem))] animate-toast-in rounded-2xl ${x.tone === 'success' ? 'glow-success' : ''} bg-slate-900 text-sm text-white shadow-xl ring-1 ring-white/10 dark:bg-slate-100 dark:text-slate-900 dark:ring-slate-900/10`}
            >
              <div className="flex items-start gap-3 py-3 pl-3 pr-2">
                <span
                  aria-hidden
                  className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center"
                >
                  {x.tone === 'success' && (
                    <>
                      <span className="animate-ring-out absolute inset-0 rounded-full bg-emerald-400/60" />
                      <Confetti count={18} radius={90} />
                    </>
                  )}
                  <span
                    className={`animate-check-pop relative flex h-8 w-8 items-center justify-center rounded-full text-base font-bold ${x.tone === 'success' ? 'bg-emerald-500 text-white' : 'bg-sky-500 text-white'}`}
                  >
                    {x.tone === 'success' ? (
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
                        <path
                          className="check-draw"
                          d="M5 12.5l4.5 4.5L19 7"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      'i'
                    )}
                  </span>
                </span>
                <div className="min-w-0 flex-1 self-center">
                  <p className="font-semibold leading-snug">{head}</p>
                  {detail && (
                    <p className="mt-0.5 line-clamp-4 break-words leading-snug opacity-90">
                      {detail}
                    </p>
                  )}
                </div>
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
                    className="shrink-0 self-center rounded-full bg-white/15 px-3 py-1 font-semibold hover:bg-white/25 dark:bg-slate-900/10 dark:hover:bg-slate-900/20"
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
              <div aria-hidden className="overflow-hidden rounded-b-2xl">
                <div
                  className="toast-timer h-1 w-full bg-emerald-400/80"
                  style={{ ['--ms' as string]: `${x.ms}ms` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast must be used inside ToastProvider');
  return c;
}
