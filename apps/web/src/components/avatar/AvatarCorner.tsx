import { useApp } from '../../lib/appContext';
import { useAvatarSnapshot } from '../../lib/avatarSnapshot';
import { t } from '../../lib/i18n';

/** ตัวละครมุมขวาล่าง: ภาพนิ่งจากอวตาร 3D ที่ผู้ใช้เลือก (ไม่มีภาพ = ยังไม่แสดงอะไร) กดแล้วไปแท็บอวตาร */
export default function AvatarCorner() {
  const { goTo, route } = useApp();
  const src = useAvatarSnapshot();
  if (!src) return null;
  if (route.view === 'me' && route.me === 'avatar') return null; // อยู่หน้าอวตารอยู่แล้ว
  return (
    <button
      type="button"
      onClick={() => goTo('me', 'avatar')}
      aria-label={t.me.avatar}
      title={t.me.avatar}
      className="fixed bottom-24 right-3 z-30 rounded-2xl p-1 transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 md:bottom-4 md:right-4"
    >
      <img src={src} alt="" width={80} className="h-auto w-20 drop-shadow-lg md:w-28" />
    </button>
  );
}
