/** ค่าตั้งส่วนตัวของเครื่องนี้เรื่อง Dobby (เก็บใน localStorage; อ่านไม่ได้ = ใช้ค่าเริ่มต้น) */
const GREET = 'dobby.greet'; // 'off' = ไม่ทักทายตอนเปิดแอป
const GREET_AT = 'dobby.greetAt';
const NUDGE_AT = 'dobby.nudgeAt';
const HOUR = 3_600_000;

const get = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* ไม่มี storage: ใช้ได้เฉพาะรอบนี้ */
  }
};

export const greetEnabled = (): boolean => get(GREET) !== 'off';
export const setGreetEnabled = (on: boolean) => set(GREET, on ? null : 'off');

/** ควรทักทายไหม: เปิดอยู่ และห่างจากครั้งก่อน ≥ 3 ชั่วโมง (เตือนให้ตั้งค่า Dobby ห่างกัน ≥ 24 ชั่วโมง) */
export function shouldGreet(noProfile: boolean, now = Date.now()): boolean {
  if (!greetEnabled()) return false;
  const last = Number(get(noProfile ? NUDGE_AT : GREET_AT) ?? 0);
  return now - last >= (noProfile ? 24 : 3) * HOUR;
}
export function markGreeted(noProfile: boolean, now = Date.now()) {
  set(noProfile ? NUDGE_AT : GREET_AT, String(now));
}
