import type { SidebarSection } from './types';

/** ลำดับแสดงคงที่; ผู้ใช้เลือกได้เฉพาะแสดง/ซ่อน */
export const SIDEBAR_ALL: SidebarSection[] = [
  'search',
  'jump',
  'category',
  'urgency',
  'importance',
  'status',
  'tag',
  'legend',
];
/** ค่าเริ่มต้น: เฉพาะที่สำคัญ (ต้องตรงกับ DEFAULT_SIDEBAR ฝั่งเซิร์ฟเวอร์) */
export const SIDEBAR_DEFAULT: SidebarSection[] = ['search', 'category', 'urgency'];

export const sortSections = (s: Iterable<SidebarSection>): SidebarSection[] => {
  const set = new Set(s);
  return SIDEBAR_ALL.filter((x) => set.has(x));
};
