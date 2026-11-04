import type { ReactNode } from 'react';
import Mascot, { type Pose } from './Mascot';

/** สถานะว่าง: มาสคอต + ข้อความ (+ ปุ่ม) */
export default function EmptyState({
  pose,
  title,
  hint,
  height = 120,
  compact = false,
  children,
}: {
  pose: Pose;
  title: string;
  hint?: string;
  height?: number;
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={`flex ${compact ? 'flex-row gap-3 py-2' : 'flex-col py-6'} items-center gap-2 text-center`}
    >
      <Mascot pose={pose} height={height} />
      <div>
        <p className="font-semibold text-slate-700 dark:text-slate-100">{title}</p>
        {hint && <p className="text-sm text-slate-600 dark:text-slate-300">{hint}</p>}
        {children}
      </div>
    </div>
  );
}
