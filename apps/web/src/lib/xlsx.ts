/**
 * อ่านไฟล์ .xlsx แบบเบา ๆ ไม่ใช้ไลบรารี: xlsx = zip ของไฟล์ XML → แกะ zip เอง + inflate ด้วย DecompressionStream
 * (เบราว์เซอร์/Node 18+ มีให้) แล้วอ่านเฉพาะค่าของเซลล์ (ข้อความ ตัวเลข วันที่เป็นเลขซีเรียล สูตรใช้ค่าที่คำนวณไว้)
 */
export type Cell = string | number | boolean | null;
export interface Sheet {
  name: string;
  rows: Cell[][];
}

const dec = new TextDecoder('utf-8');
const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32 = (b: Uint8Array, o: number) => (u16(b, o) | (u16(b, o + 2) << 16)) >>> 0;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const src = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(data);
      c.close();
    },
  });
  const chunks: Uint8Array[] = [];
  const reader = src
    .pipeThrough(ds as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
    .getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** แกะ zip → แผนที่ ชื่อไฟล์ → ข้อความ (เฉพาะ .xml/.rels) */
export async function unzipText(buf: ArrayBuffer): Promise<Map<string, string>> {
  const b = new Uint8Array(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--)
    if (u32(b, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('ไม่ใช่ไฟล์ Excel (.xlsx)');
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const out = new Map<string, string>();
  for (let n = 0; n < count; n++) {
    if (u32(b, p) !== 0x02014b50) throw new Error('ไฟล์ Excel เสียหาย');
    const method = u16(b, p + 10);
    const csize = u32(b, p + 20);
    const nlen = u16(b, p + 28);
    const elen = u16(b, p + 30);
    const clen = u16(b, p + 32);
    const lho = u32(b, p + 42);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (!/\.(xml|rels)$/.test(name)) continue;
    const start = lho + 30 + u16(b, lho + 26) + u16(b, lho + 28);
    const raw = b.subarray(start, start + csize);
    const data = method === 0 ? raw : method === 8 ? await inflateRaw(raw) : null;
    if (data) out.set(name, dec.decode(data));
  }
  return out;
}

const unesc = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

const textOf = (xml: string) =>
  [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unesc(m[1]!)).join('');

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function readXlsx(buf: ArrayBuffer): Promise<Sheet[]> {
  const files = await unzipText(buf);
  const wb = files.get('xl/workbook.xml');
  if (!wb) throw new Error('ไม่ใช่ไฟล์ Excel (.xlsx)');
  const rels = new Map<string, string>();
  for (const m of (files.get('xl/_rels/workbook.xml.rels') ?? '').matchAll(
    /<Relationship\b[^>]*>/g,
  )) {
    const id = /\bId="([^"]*)"/.exec(m[0])?.[1];
    const target = /\bTarget="([^"]*)"/.exec(m[0])?.[1];
    if (id && target) rels.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  }
  const shared = [
    ...(files.get('xl/sharedStrings.xml') ?? '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g),
  ].map((m) => textOf(m[1]!));
  const sheets: Sheet[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = unesc(/\bname="([^"]*)"/.exec(m[0])?.[1] ?? '');
    const rid = /\br:id="([^"]*)"/.exec(m[0])?.[1] ?? '';
    const xml = files.get(rels.get(rid) ?? '');
    if (!xml) continue;
    const rows: Cell[][] = [];
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]!;
      const body = c[2] ?? '';
      const ref = /\br="([A-Z]+)(\d+)"/.exec(attrs);
      if (!ref) continue;
      const t = /\bt="([^"]*)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let val: Cell = null;
      if (t === 'inlineStr') val = textOf(body);
      else if (v !== undefined) {
        if (t === 's') val = shared[Number(v)] ?? null;
        else if (t === 'str') val = unesc(v);
        else if (t === 'b') val = v === '1';
        else if (t === 'e') val = null;
        else val = Number(v);
      }
      if (val === null || val === '') continue;
      const r = Number(ref[2]) - 1;
      (rows[r] ??= [])[colIndex(ref[1]!)] = val;
    }
    sheets.push({ name, rows: Array.from(rows, (r) => r ?? []) });
  }
  return sheets;
}

/** เลขซีเรียลวันที่ของ Excel → YYYY-MM-DD (ฐาน 1899-12-30) */
export function excelDate(n: number): string | null {
  if (!Number.isFinite(n) || n < 20_000 || n > 80_000) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86_400_000).toISOString().slice(0, 10);
}
