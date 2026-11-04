/** ตรวจไฟล์ฝั่ง client เพื่อให้ feedback เร็ว (server เป็นตัวตัดสินจริง) */
export const ALLOWED_EXT = [
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'docx',
  'xlsx',
  'pptx',
  'txt',
  'csv',
  'zip',
];
export const ACCEPT = ALLOWED_EXT.map((e) => `.${e}`).join(',');

export const extOf = (name: string): string => {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function fileIcon(name: string): string {
  switch (extOf(name)) {
    case 'pdf':
      return '📕';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
      return '🖼️';
    case 'docx':
      return '📝';
    case 'xlsx':
    case 'csv':
      return '📊';
    case 'pptx':
      return '📽️';
    case 'zip':
      return '🗜️';
    default:
      return '📄';
  }
}
