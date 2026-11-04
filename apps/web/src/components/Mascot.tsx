/** มาสคอต Dobby: ท่าทางต่าง ๆ จากชุดสติกเกอร์ (ไฟล์ใน public/mascot, ขนาดจริงใช้กัน layout shift) */
export type Pose = 'hero' | 'morning' | 'idea' | 'plan' | 'hello' | 'deadline' | 'done' | 'rest';

const RATIO: Record<Pose, [number, number]> = {
  hero: [409, 640],
  morning: [324, 480],
  idea: [332, 480],
  plan: [331, 480],
  hello: [341, 480],
  deadline: [326, 480],
  done: [341, 480],
  rest: [359, 480],
};

type Props = {
  pose: Pose;
  /** ความสูงที่แสดง (px) */
  height?: number;
  /** ข้อความอธิบายภาพ; ไม่ใส่ = ภาพตกแต่ง (ซ่อนจาก screen reader) */
  alt?: string;
  bob?: boolean;
  /** โหลดทันที (ใช้กับภาพบนสุดของหน้า เพื่อไม่ให้ LCP ช้า) */
  eager?: boolean;
  className?: string;
};

export default function Mascot({
  pose,
  height = 140,
  alt = '',
  bob = false,
  eager = false,
  className = '',
}: Props) {
  const [w, h] = RATIO[pose];
  return (
    <img
      src={`/mascot/${pose}.webp`}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      width={Math.round((w / h) * height)}
      height={height}
      decoding="async"
      loading={eager ? 'eager' : 'lazy'}
      draggable={false}
      className={`select-none ${bob ? 'animate-bob' : ''} ${className}`}
    />
  );
}
