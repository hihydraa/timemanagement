import { useApp } from '../lib/appContext';
import { isCornerVisible, useAvatarSnapshot } from '../lib/avatarSnapshot';
import { useCelebrateMessage } from '../lib/celebrate';
import Mascot from './Mascot';

/**
 * Dobby ประจำมุมขวาล่าง: อยู่ค้างตลอดทุกหน้า
 * - ไม่มีตัวละครอวตารที่มุมนั้น: Dobby อยู่มุมขวาล่าง ทำงานเสร็จ = เปลี่ยนท่า + กล่องคำพูดฉลอง ~2.6 วินาที
 * - มีตัวละครอวตาร (ดู avatar/AvatarCorner): Dobby ยืนข้างตัวละคร (ซ้ายมือ) ส่วนกล่องคำพูดฉลองเป็นของตัวละคร
 */
export default function CelebrateToast() {
  const { call, route } = useApp();
  const snapshot = useAvatarSnapshot();
  const msg = useCelebrateMessage(call);
  const withAvatar = isCornerVisible(route, snapshot);
  const pos = withAvatar
    ? 'bottom-24 right-[7rem] md:bottom-4 md:right-40'
    : 'bottom-24 right-3 md:bottom-4 md:right-4';
  return (
    <div className={`pointer-events-none fixed z-30 ${pos}`}>
      {msg && !withAvatar && (
        <p
          role="status"
          aria-live="polite"
          className="absolute bottom-full right-0 mb-1 w-max max-w-[12rem] animate-pop rounded-2xl rounded-br-sm border border-brand-200 bg-white px-3 py-2 text-sm font-semibold text-brand-700 shadow-soft dark:border-brand-700 dark:bg-slate-800 dark:text-brand-300"
        >
          {msg}
        </p>
      )}
      <Mascot
        pose={msg ? 'done' : 'hello'}
        height={withAvatar ? 72 : 88}
        className={`drop-shadow-lg ${msg ? 'animate-pop' : ''}`}
      />
    </div>
  );
}
