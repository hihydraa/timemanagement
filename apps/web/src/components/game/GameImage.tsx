import { characterImage, imagePath, type Item } from '../../lib/game';

/** ภาพไอเท็ม/ตัวละคร: วางบนแผ่นสีครีมเสมอ (ภาพต้นฉบับมีพื้นครีม) จึงกลมกลืนทั้งโหมดสว่าง/มืด */
export function ItemImage({
  item,
  size = 96,
  className = '',
}: {
  item: Item;
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={imagePath(item)}
      alt={item.th}
      width={size}
      height={item.slot === 'companion' ? Math.round(size * 0.75) : size}
      loading="lazy"
      decoding="async"
      className={`rounded-xl bg-[#fcf5e6] object-contain ${className}`}
    />
  );
}

export function CharacterImage({
  id,
  alt,
  height = 160,
  className = '',
}: {
  id: string;
  alt: string;
  height?: number;
  className?: string;
}) {
  return (
    <img
      src={characterImage(id)}
      alt={alt}
      height={height}
      loading="lazy"
      decoding="async"
      style={{ height }}
      className={`w-auto rounded-xl bg-[#fcf5e6] object-contain ${className}`}
    />
  );
}
