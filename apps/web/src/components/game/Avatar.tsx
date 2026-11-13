import { canvasAspect, placeItem } from '../../lib/avatar';
import { getItem } from '../../lib/game';

/** ตัวละครที่ "สวมจริง": ซ้อนภาพไอเท็มที่สวมอยู่บนตัวละคร + สัตว์ประจำตัวเป็นป้ายกลมที่มุม */
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
  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ height, width: height * aspect }}
      role="img"
      aria-label={
        worn
          .map((i) => getItem(i)?.th)
          .filter(Boolean)
          .join(', ') || undefined
      }
    >
      <img
        src={`/game/cut/characters/${characterId}.webp`}
        alt=""
        decoding="async"
        className="absolute object-contain"
        style={{ left: '17.95%', top: '18.75%', width: '64.1%', height: '78.1%' }}
      />
      {worn.map((id) => {
        const b = placeItem(characterId, id);
        if (!b) return null;
        return (
          <img
            key={id}
            src={`/game/cut/items/${id}.webp`}
            alt=""
            decoding="async"
            className="pointer-events-none absolute object-contain drop-shadow-sm"
            style={{
              left: `${b.left}%`,
              top: `${b.top}%`,
              width: `${b.width}%`,
              height: `${b.height}%`,
              zIndex: b.z,
            }}
          />
        );
      })}
      {pet && (
        <img
          src={`/game/companions/${pet.collection}.webp`}
          alt={pet.th}
          decoding="async"
          className="absolute -bottom-1 -left-1 rounded-full border-2 border-amber-400 bg-[#fcf5e6] object-cover shadow"
          style={{ width: height * 0.3, height: height * 0.3, zIndex: 20 }}
        />
      )}
    </div>
  );
}
