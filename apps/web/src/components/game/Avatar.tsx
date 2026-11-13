import { FIGURE, canvasAspect, placeItems, placePet, type Box } from '../../lib/avatar';
import { getItem } from '../../lib/game';

const pct = (n: number) => `${n}%`;
/** อัตราส่วนกว้าง/สูงของภาพถุงมือทั้งคู่ (ครึ่งหนึ่ง = ถุงมือข้างเดียว) */
const GLOVE_ASPECT: Record<string, number> = { 'draco-08': 1.011, 'hagrid-07': 1.167 };

/** สไตล์ของกล่องที่อ้างกึ่งกลาง: วางด้วย translate(-50%,-50%) แล้วหมุน/กลับด้าน */
function boxStyle(b: Box) {
  const t = [
    'translate(-50%, -50%)',
    b.rotate ? `rotate(${b.rotate}deg)` : '',
    b.flip ? 'scaleX(-1)' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return {
    left: pct(b.cx),
    top: pct(b.cy),
    width: pct(b.width),
    height: b.height === undefined ? undefined : pct(b.height),
    transform: t,
    zIndex: Math.round(b.z * 2),
  } as const;
}

/** ตัวละครที่ "สวมจริง": ซ้อนภาพไอเท็มที่สวมอยู่บนตัวละคร + สัตว์ประจำตัวบนไหล่/ข้างเท้า (ตำแหน่งดู lib/avatar.ts) */
export default function Avatar({
  characterId,
  worn,
  companionId,
  height = 200,
  className = '',
}: {
  characterId: string;
  /** id ไอเท็มที่สวมอยู่ (ไม่รวมสัตว์ประจำตัว) */
  worn: string[];
  companionId?: string | null;
  height?: number;
  className?: string;
}) {
  const aspect = canvasAspect(characterId);
  const pet = companionId ? getItem(companionId) : null;
  const petBox = pet ? placePet(characterId) : null;
  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ height, width: height * aspect }}
      role="img"
      aria-label={
        [...worn.map((i) => getItem(i)?.th), pet?.th].filter(Boolean).join(', ') || undefined
      }
    >
      <img
        src={`/game/cut/characters/${characterId}.webp`}
        alt=""
        decoding="async"
        className="absolute object-contain"
        style={{
          left: pct(FIGURE.left),
          top: pct(FIGURE.top),
          width: pct(FIGURE.width),
          height: pct(FIGURE.height),
        }}
      />
      {worn.flatMap((id) =>
        placeItems(characterId, id).map((b, i) => {
          const src = `/game/cut/items/${id}.webp`;
          const style = boxStyle(b);
          // ถุงมือเป็นภาพคู่: ตัดครึ่งซ้าย/ขวาไปวางที่มือแต่ละข้าง
          return b.crop ? (
            <div
              key={`${id}-${i}`}
              className="pointer-events-none absolute overflow-hidden"
              style={{ ...style, aspectRatio: String((GLOVE_ASPECT[id] ?? 1.1) / 2) }}
            >
              <img
                src={src}
                alt=""
                decoding="async"
                className="absolute top-0 h-full w-auto max-w-none drop-shadow-sm"
                style={b.crop === 'left' ? { left: 0 } : { right: 0 }}
              />
            </div>
          ) : (
            <img
              key={`${id}-${i}`}
              src={src}
              alt=""
              decoding="async"
              className={`pointer-events-none absolute drop-shadow-sm ${b.height === undefined ? 'h-auto' : 'object-fill'}`}
              style={style}
            />
          );
        }),
      )}
      {pet && petBox && (
        <img
          src={`/game/cut/companions/${pet.collection}.webp`}
          alt=""
          decoding="async"
          className="pointer-events-none absolute h-auto drop-shadow"
          style={boxStyle(petBox)}
        />
      )}
    </div>
  );
}
