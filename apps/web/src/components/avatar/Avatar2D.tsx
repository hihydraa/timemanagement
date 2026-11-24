import { memo } from 'react';
import { renderAvatarSvg, type AvatarLook } from '../../lib/avatar2d';

/**
 * ตัวละคร 2D: SVG ประกอบจาก look (สตริงจาก renderAvatarSvg — สี/ไฟล์มาจากรายการในแคตาล็อกเท่านั้น จึงใส่เป็น innerHTML ได้)
 */
function Avatar2D({
  look,
  label,
  className,
  viewBox,
}: {
  look: AvatarLook;
  label?: string;
  className?: string;
  /** ซูมเฉพาะส่วน (ดู SLOT_FOCUS) */
  viewBox?: string;
}) {
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: renderAvatarSvg(look, { label, viewBox }) }}
    />
  );
}
export default memo(Avatar2D);
