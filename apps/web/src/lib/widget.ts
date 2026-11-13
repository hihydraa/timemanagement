import { useEffect, useState } from 'react';

const KEY = 'dobby.partner.hidden';
const EVT = 'dobby:partner-visibility';

const read = (): boolean => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

/** ตัวละคร+Dobby มุมล่างขวา: ซ่อน/แสดง (จำไว้ในเครื่อง) */
export function usePartnerHidden(): [boolean, (v: boolean) => void] {
  const [hidden, setHidden] = useState(read);
  useEffect(() => {
    const on = () => setHidden(read());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  return [
    hidden,
    (v) => {
      try {
        localStorage.setItem(KEY, v ? '1' : '0');
      } catch {
        /* ไม่มี storage */
      }
      window.dispatchEvent(new Event(EVT));
    },
  ];
}
