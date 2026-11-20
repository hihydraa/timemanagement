import { useApp } from '../lib/appContext';
import { isCornerVisible, useAvatarSnapshot } from '../lib/avatarSnapshot';
import { useCelebrateMessage } from '../lib/celebrate';
import Mascot from './Mascot';

/**
 * ป๊อปอัปมาสคอตฉลองเมื่อทำงานเสร็จ ใช้เมื่อไม่มีตัวละครมุมขวาล่าง
 * (ถ้ามี ตัวละครจะฉลองเองด้วยกล่องคำพูด ดู avatar/AvatarCorner)
 */
export default function CelebrateToast() {
  const { call, route } = useApp();
  const snapshot = useAvatarSnapshot();
  const msg = useCelebrateMessage(call);
  if (!msg || isCornerVisible(route, snapshot)) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex animate-pop items-end gap-2 rounded-2xl border border-brand-200 bg-white px-4 py-3 shadow-soft dark:border-brand-700 dark:bg-slate-800"
    >
      <Mascot pose="done" height={84} className="-mb-1 -ml-1" />
      <p className="pb-2 font-semibold text-brand-700 dark:text-brand-300">{msg}</p>
    </div>
  );
}
