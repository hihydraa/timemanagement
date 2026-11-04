/** นิยาม Rich Menu 4 ปุ่ม (ขนาดมาตรฐาน 2500x843) — ใช้ร่วมกับ scripts/setup-richmenu.ts */
export function buildRichMenu(baseUrl: string) {
  const h = 843;
  const w = 625;
  const area = (i: number, action: Record<string, unknown>) => ({
    bounds: { x: i * w, y: 0, width: w, height: h },
    action,
  });
  return {
    size: { width: 2500, height: h },
    selected: true,
    name: 'Dobby main menu',
    chatBarText: 'เมนู Dobby',
    areas: [
      area(0, { type: 'message', label: 'งานวันนี้', text: 'วันนี้' }),
      area(1, { type: 'message', label: 'เพิ่มงาน', text: 'เพิ่มงาน' }),
      area(2, { type: 'message', label: 'สัปดาห์นี้', text: 'สัปดาห์นี้' }),
      area(3, { type: 'uri', label: 'เปิดเว็บ', uri: baseUrl.replace(/\/$/, '') }),
    ],
  };
}
