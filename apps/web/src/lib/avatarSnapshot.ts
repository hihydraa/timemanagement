import { useEffect, useState } from 'react';

const KEY = 'dobby.avatar.snapshot';
const EVT = 'dobby:avatar-snapshot';

const read = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/** เก็บภาพตัวละครที่เลือกไว้ในเครื่อง (ใช้แสดงมุมขวาล่างโดยไม่ต้องโหลดโมเดล 3D) */
export function saveAvatarSnapshot(dataUrl: string) {
  try {
    localStorage.setItem(KEY, dataUrl);
  } catch {
    /* ไม่มี storage หรือเต็ม: ข้าม ภาพมุมขวาล่างจะไม่ขึ้น */
  }
  window.dispatchEvent(new Event(EVT));
}

/** ภาพตัวละครล่าสุด (null = ยังไม่เคยเลือก) อัปเดตเมื่อมีการบันทึกใหม่ */
export function useAvatarSnapshot(): string | null {
  const [url, setUrl] = useState<string | null>(read);
  useEffect(() => {
    const on = () => setUrl(read());
    window.addEventListener(EVT, on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener('storage', on);
    };
  }, []);
  return url;
}
