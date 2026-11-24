import { useEffect } from 'react';
import { api } from '../../lib/api';
import { useApp } from '../../lib/appContext';
import { isCornerVisible, setAvatarLook, useAvatarLook } from '../../lib/avatarLook';
import { useCelebrate } from '../../lib/celebrate';
import { t } from '../../lib/i18n';
import Avatar2D from './Avatar2D';

/**
 * ตัวละครมุมขวาล่าง: ตัวละคร 2D ที่บันทึกไว้ในบัญชี (ยังไม่เคยบันทึก = ไม่แสดงอะไร) กดแล้วไปแท็บตัวละคร
 * เพิ่ม/ทำงานเสร็จ = ตัวละครเด้งตอบรับ (คนพูดฉลองคือ Dobby ดู CelebrateToast)
 */
export default function AvatarCorner() {
  const { goTo, route, call } = useApp();
  const look = useAvatarLook();
  // กล่องคำพูด/กระดาษสีเป็นของ Dobby (CelebrateToast) ตัวละครของผู้ใช้แค่เด้งตอบรับ
  const { msg } = useCelebrate(call);

  useEffect(() => {
    let alive = true;
    api
      .getAvatar2d()
      .then((a) => {
        if (alive) setAvatarLook(a.look);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      setAvatarLook(null);
    };
  }, []);

  if (!look || !isCornerVisible(route, look)) return null;
  return (
    <div className="fixed bottom-24 right-3 z-30 md:bottom-4 md:right-4">
      <button
        type="button"
        onClick={() => goTo('me', 'avatar')}
        aria-label={t.me.avatar}
        title={t.me.avatar}
        className="block rounded-2xl p-1 transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
      >
        <Avatar2D
          look={look}
          label=""
          className={`w-20 drop-shadow-lg md:w-28 ${msg ? 'animate-pop' : ''}`}
        />
      </button>
    </div>
  );
}
