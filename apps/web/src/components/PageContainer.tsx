import type { ReactNode } from 'react';

/** กรอบเนื้อหากลางของทุกหน้า: กว้างสูงสุด 1200px จัดกึ่งกลาง padding 16px (มือถือ) / 24px (เดสก์ท็อป) */
export default function PageContainer({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-[1200px] px-4 md:px-6 ${className}`}>{children}</div>
  );
}
