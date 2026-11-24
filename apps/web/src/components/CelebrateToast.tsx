import { useApp } from '../lib/appContext';
import { isCornerVisible, useAvatarLook } from '../lib/avatarLook';
import { useCelebrate } from '../lib/celebrate';
import Confetti from './Confetti';
import Mascot from './Mascot';

/**
 * Dobby ประจำมุมขวาล่าง: อยู่ค้างตลอดทุกหน้า
 * - เพิ่ม/ทำงานเสร็จ: Dobby เปลี่ยนท่า + กล่องคำพูดฉลอง + กระดาษสีกระจาย (Dobby เป็นคนพูดเสมอ)
 * - ไม่มีตัวละครอวตารที่มุมนั้น: Dobby อยู่มุมขวาล่าง
 * - มีตัวละครอวตาร (ดู avatar/AvatarCorner): Dobby ยืนข้างตัวละคร (ซ้ายมือ) ตัวละครแค่เด้งตอบรับ
 */
export default function CelebrateToast() {
  const { call, route } = useApp();
  const look = useAvatarLook();
  const { msg, tick } = useCelebrate(call);
  const withAvatar = isCornerVisible(route, look);
  const pos = withAvatar
    ? 'bottom-24 right-[7rem] md:bottom-4 md:right-40'
    : 'bottom-24 right-3 md:bottom-4 md:right-4';
  return (
    <div className={`pointer-events-none fixed z-30 ${pos}`}>
      {msg && (
        <p
          role="status"
          aria-live="polite"
          className="glow-success absolute bottom-full right-0 mb-2 w-max max-w-[14rem] animate-pop rounded-2xl rounded-br-sm border-2 border-gold-500 bg-white px-4 py-2.5 text-base font-semibold leading-snug text-brand-700 shadow-soft dark:bg-slate-800 dark:text-brand-300"
        >
          {msg}
        </p>
      )}
      {tick > 0 && <Confetti key={tick} count={22} radius={110} />}
      <Mascot
        pose={msg ? 'done' : 'hello'}
        height={withAvatar ? 72 : 88}
        className={`drop-shadow-lg ${msg ? 'animate-pop' : ''}`}
      />
    </div>
  );
}
