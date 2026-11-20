import { useApp } from '../lib/appContext';
import { isCornerVisible, useAvatarSnapshot } from '../lib/avatarSnapshot';
import { useCelebrateMessage } from '../lib/celebrate';
import Mascot from './Mascot';

/**
 * Dobby ประจำมุมขวาล่าง: อยู่ค้างตลอด ใช้เมื่อไม่มีตัวละครอวตารที่มุมนั้น
 * (ถ้ามีอวตาร ตัวละครจะฉลองเองด้วยกล่องคำพูด ดู avatar/AvatarCorner)
 * ทำงานเสร็จ = เปลี่ยนท่าและมีกล่องคำพูดฉลอง ~2.6 วินาที แล้วกลับท่าปกติ
 */
export default function CelebrateToast() {
  const { call, route } = useApp();
  const snapshot = useAvatarSnapshot();
  const msg = useCelebrateMessage(call);
  if (isCornerVisible(route, snapshot)) return null;
  return (
    <div className="pointer-events-none fixed bottom-24 right-3 z-30 md:bottom-4 md:right-4">
      {msg && (
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
        height={88}
        className={`drop-shadow-lg ${msg ? 'animate-pop' : ''}`}
      />
    </div>
  );
}
