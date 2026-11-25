import type { AvatarLook } from '../../../../src/lib/avatar2d';
import { CANVAS_H, CANVAS_W } from '../../../../src/lib/avatar2d';
import { canvasToPng, renderAvatarCanvas } from './avatarPng';

export interface ShareStats {
  dobby: string;
  title: string;
  level: number;
  doneThisWeek: number;
  streak: number;
  line: string;
}

const W = 1080;
const H = 1350;

/** การ์ดสรุปสัปดาห์สำหรับแชร์ (ภาพ PNG 1080×1350): ตัวละคร + เลเวล + สถิติ + คำพูดของ Dobby */
export async function renderShareCard(look: AvatarLook | null, s: ShareStats): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#F6ECD6');
  bg.addColorStop(1, '#E3F0E0');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  const font = (px: number, w = 600) => `${w} ${px}px Anuphan, "Noto Sans Thai", sans-serif`;
  g.textAlign = 'center';
  g.fillStyle = '#3d3a35';
  g.font = font(64, 700);
  g.fillText('สัปดาห์นี้ของฉัน', W / 2, 120);

  if (look) {
    const av = await renderAvatarCanvas(look);
    const h = 640;
    const w = (h * CANVAS_W) / CANVAS_H;
    g.drawImage(av, (W - w) / 2, 160, w, h);
  }

  g.fillStyle = '#2f6b3d';
  g.font = font(54, 700);
  g.fillText(`เลเวล ${s.level} · ${s.title}`, W / 2, 880);

  const box = (x: number, label: string, value: string) => {
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.roundRect(x, 930, 440, 190, 36);
    g.fill();
    g.fillStyle = '#2f6b3d';
    g.font = font(84, 700);
    g.fillText(value, x + 220, 1030);
    g.fillStyle = '#55524a';
    g.font = font(36, 500);
    g.fillText(label, x + 220, 1090);
  };
  box(80, 'งานที่เสร็จ', String(s.doneThisWeek));
  box(560, 'สตรีค (วัน)', String(s.streak));

  g.fillStyle = '#3d3a35';
  g.font = font(40, 500);
  wrap(g, `🧚 ${s.dobby}: ${s.line}`, W / 2, 1195, W - 160, 52);
  g.fillStyle = '#8a8372';
  g.font = font(28, 500);
  g.fillText('Dobby · วางแผนเวลาให้เป็นเรื่องสนุก', W / 2, H - 40);
  return canvasToPng(c);
}

/** ตัดบรรทัดตามความกว้าง (ไทยไม่มีช่องว่างคั่นคำ จึงตัดทีละตัวอักษร) */
function wrap(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  max: number,
  lh: number,
) {
  let line = '';
  let yy = y;
  for (const ch of text) {
    if (g.measureText(line + ch).width > max && line) {
      g.fillText(line, x, yy);
      line = ch;
      yy += lh;
    } else line += ch;
  }
  g.fillText(line, x, yy);
}

/** แชร์ด้วยเมนูแชร์ของเครื่อง (ถ้ารองรับ) ไม่ได้ก็ดาวน์โหลดไฟล์ */
export async function shareOrDownload(
  blob: Blob,
  filename = 'dobby-week.png',
): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'สัปดาห์นี้ของฉัน' });
      return 'shared';
    }
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return 'shared'; // ผู้ใช้ปิดเมนูแชร์เอง
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
