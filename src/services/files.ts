/** กติกาไฟล์แนบ: ชนิดไฟล์ตัดสินจากนามสกุล (whitelist) แล้วตรวจ magic bytes ให้ตรง — ไม่เชื่อ MIME ที่ client ส่งมา */

export interface FileKind {
  mime: string;
  sniff: 'png' | 'jpeg' | 'gif' | 'webp' | 'pdf' | 'zip' | 'text';
  image: boolean;
}

export const ALLOWED_EXTENSIONS: Record<string, FileKind> = {
  pdf: { mime: 'application/pdf', sniff: 'pdf', image: false },
  png: { mime: 'image/png', sniff: 'png', image: true },
  jpg: { mime: 'image/jpeg', sniff: 'jpeg', image: true },
  jpeg: { mime: 'image/jpeg', sniff: 'jpeg', image: true },
  gif: { mime: 'image/gif', sniff: 'gif', image: true },
  webp: { mime: 'image/webp', sniff: 'webp', image: true },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sniff: 'zip',
    image: false,
  },
  xlsx: {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sniff: 'zip',
    image: false,
  },
  pptx: {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    sniff: 'zip',
    image: false,
  },
  txt: { mime: 'text/plain', sniff: 'text', image: false },
  csv: { mime: 'text/csv', sniff: 'text', image: false },
  zip: { mime: 'application/zip', sniff: 'zip', image: false },
};

export const IMAGE_MIMES = new Set(
  Object.values(ALLOWED_EXTENSIONS)
    .filter((k) => k.image)
    .map((k) => k.mime),
);

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i < 0 ? '' : filename.slice(i + 1).toLowerCase();
}

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

export function matchesMagic(kind: FileKind['sniff'], b: Uint8Array): boolean {
  switch (kind) {
    case 'png':
      return startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'jpeg':
      return startsWith(b, [0xff, 0xd8, 0xff]);
    case 'gif':
      return startsWith(b, [0x47, 0x49, 0x46, 0x38]);
    case 'webp':
      return startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8);
    case 'pdf':
      return startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case 'zip':
      return startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]);
    case 'text': {
      const n = Math.min(b.length, 8192);
      for (let i = 0; i < n; i++) if (b[i] === 0) return false;
      return true;
    }
  }
}

/** ตัดพาธ/อักขระควบคุม/ความยาว ออกจากชื่อไฟล์ที่ผู้ใช้ส่งมา */
export function sanitizeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  let name = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  name = name.replace(/^\.+/, '');
  if (name.length > 120) {
    const ext = extensionOf(name);
    const stem = name.slice(0, name.length - (ext ? ext.length + 1 : 0));
    name = stem.slice(0, 120 - (ext ? ext.length + 1 : 0)) + (ext ? `.${ext}` : '');
  }
  return name || 'file';
}

export function contentDisposition(kind: 'inline' | 'attachment', filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\;]/g, '_');
  const star = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${star}`;
}
