import { FIGURE, canvasAspect, placeItems, placePet } from '../../lib/avatar';
import { getItem } from '../../lib/game';

const pct = (n: number) => `${n}%`;

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
          const style = {
            left: pct(b.left),
            top: pct(b.top),
            width: pct(b.width),
            height: pct(b.height),
            zIndex: Math.round(b.z * 2),
            transform: b.rotate ? `rotate(${b.rotate}deg)` : undefined,
          };
          const src = `/game/cut/items/${id}.webp`;
          // ถุงมือเป็นภาพคู่: ตัดครึ่งซ้าย/ขวาไปวางที่มือแต่ละข้าง
          return b.crop ? (
            <div
              key={`${id}-${i}`}
              className="pointer-events-none absolute overflow-hidden"
              style={style}
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
              className="pointer-events-none absolute object-contain drop-shadow-sm"
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
          className="pointer-events-none absolute object-contain drop-shadow"
          style={{
            left: pct(petBox.left),
            top: pct(petBox.top),
            width: pct(petBox.width),
            height: pct(petBox.height),
            zIndex: Math.round(petBox.z * 2),
          }}
        />
      )}
    </div>
  );
}
