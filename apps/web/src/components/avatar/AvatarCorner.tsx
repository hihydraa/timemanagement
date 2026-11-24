import { useEffect } from 'react';
import { api } from '../../lib/api';
import { useApp } from '../../lib/appContext';
import { isCornerVisible, setAvatarLook, useAvatarLook } from '../../lib/avatarLook';
import { useCelebrateMessage } from '../../lib/celebrate';
import { t } from '../../lib/i18n';
import Avatar2D from './Avatar2D';

/**
 * ตัวละครมุมขวาล่าง: ตัวละคร 2D ที่บันทึกไว้ในบัญชี (ยังไม่เคยบันทึก = ไม่แสดงอะไร) กดแล้วไปแท็บตัวละคร
 * ทำงานเสร็จ = ตัวละครเด้งและมีกล่องคำพูดฉลอง
 */
export default function AvatarCorner() {
  const { goTo, route, call } = useApp();
  const look = useAvatarLook();
  const msg = useCelebrateMessage(call);

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
      {msg && (
        <p
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute bottom-full right-0 mb-1 w-max max-w-[12rem] animate-pop rounded-2xl rounded-br-sm border border-brand-200 bg-white px-3 py-2 text-sm font-semibold text-brand-700 shadow-soft dark:border-brand-700 dark:bg-slate-800 dark:text-brand-300"
        >
          {msg}
        </p>
      )}
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
