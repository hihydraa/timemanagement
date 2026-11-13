import { useEffect, useRef } from 'react';
import { usePartnerHidden } from '../../lib/widget';
import { useApp } from '../../lib/appContext';
import { t } from '../../lib/i18n';
import { useToast } from '../UndoToast';

/** ได้แต้มใหม่ (จาก api) → แสดง "+N แต้ม" และรีเฟรชยอดที่หัวหน้าจอ */
export default function PointsListener() {
  const { reloadGame, game } = useApp();
  const [hidden] = usePartnerHidden();
  const widgetRef = useRef(false);
  widgetRef.current = !!game?.profile && !hidden; // ตัวละครมุมล่างขวาบอกแต้มเองแล้ว
  const toast = useToast();
  useEffect(() => {
    const on = (e: Event) => {
      const n = (e as CustomEvent<{ points: number }>).detail?.points ?? 0;
      if (n > 0 && !widgetRef.current)
        toast.info(`🪙 ${t.game.plus.replace('{n}', String(n))}`, 2200);
      reloadGame();
    };
    window.addEventListener('dobby:points', on);
    return () => window.removeEventListener('dobby:points', on);
  }, [reloadGame, toast]);
  return null;
}
