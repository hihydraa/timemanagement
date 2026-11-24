import { useMemo, type CSSProperties } from 'react';

const COLORS = ['#f3b95a', '#34d399', '#5aa7e0', '#e8566b', '#9470d6', '#eea844'];

/**
 * กระดาษสีกระจายจากจุดกึ่งกลางของตัวแม่ (ตัวแม่ต้อง relative) — เล่นครั้งเดียวตอนแสดงผล (ใช้ key เปลี่ยนเพื่อเล่นใหม่)
 * ซ่อนอัตโนมัติเมื่อระบบตั้งให้ลดการเคลื่อนไหว (ดู index.css)
 */
export default function Confetti({
  count = 16,
  radius = 80,
  className = '',
}: {
  count?: number;
  radius?: number;
  className?: string;
}) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + (i % 2 ? 0.25 : -0.15);
        const r = radius * (0.55 + (((i * 37) % 10) / 10) * 0.6);
        return {
          dx: Math.round(Math.cos(a) * r),
          dy: Math.round(Math.sin(a) * r) - 14,
          rot: ((i * 83) % 420) - 210,
          color: COLORS[i % COLORS.length]!,
          delay: ((i * 29) % 12) / 100,
        };
      }),
    [count, radius],
  );
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute left-1/2 top-1/2 h-0 w-0 ${className}`}
    >
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={
            {
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
              '--rot': `${p.rot}deg`,
              '--d': `${p.delay}s`,
              background: p.color,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
