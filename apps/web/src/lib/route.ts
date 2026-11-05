/**
 * เส้นทางของแอป (hash routing) — 3 แท็บหลัก: วันนี้ / แผน / ฉัน (+ หน้าโฟกัสที่ไม่อยู่ในเมนู)
 * ฟังก์ชันบริสุทธิ์: แปลง path/hash/query ปัจจุบัน → เส้นทางมาตรฐาน พร้อมบอกว่าเป็นการ redirect จากเส้นทางเก่าหรือไม่
 * เส้นทางเก่า (/inbox /calendar /matrix /review /stats) ยังใช้ได้ทั้งแบบ path และ hash ไม่ให้ลิงก์/บุ๊กมาร์กเดิมพัง
 */
export type View = 'today' | 'plan' | 'me' | 'focus';
export type MeTab = 'overview' | 'review' | 'stats';
export type PlanSub = 'matrix';

export interface Route {
  view: View;
  /** แท็บย่อยของ "ฉัน" */
  me?: MeTab;
  /** มุมมองพิเศษของ "แผน" (Matrix) */
  plan?: PlanSub;
  /** จุดที่ต้องเลื่อนไปในหน้า (เช่น unscheduled) */
  anchor?: string;
}

export interface Resolved {
  route: Route;
  /** hash มาตรฐาน ('' = วันนี้) */
  hash: string;
  /** true = เส้นทางที่เข้ามาไม่ใช่รูปแบบมาตรฐาน (ควร replaceState เป็น hash มาตรฐาน) */
  redirected: boolean;
}

/** hash มาตรฐานของเส้นทาง */
export function routeToHash(r: Route): string {
  switch (r.view) {
    case 'today':
      return r.anchor ? `#/today/${r.anchor}` : '';
    case 'plan':
      return r.plan ? `#/plan/${r.plan}` : '#/plan';
    case 'me':
      return r.me && r.me !== 'overview' ? `#/me/${r.me}` : '#/me';
    case 'focus':
      return '#/focus';
  }
}

const norm = (s: string) =>
  s
    .replace(/^#?\/?/, '')
    .replace(/\/+$/, '')
    .toLowerCase();

function fromSegments(seg: string[]): Route | null {
  const [a, b] = seg;
  switch (a) {
    case '':
    case 'today':
      return b === 'unscheduled' ? { view: 'today', anchor: 'unscheduled' } : { view: 'today' };
    case 'inbox':
      return { view: 'today', anchor: 'unscheduled' };
    case 'plan':
    case 'calendar':
      return b === 'matrix' ? { view: 'plan', plan: 'matrix' } : { view: 'plan' };
    case 'matrix':
      return { view: 'plan', plan: 'matrix' };
    case 'me':
      return { view: 'me', me: b === 'review' || b === 'stats' ? b : 'overview' };
    case 'review':
      return { view: 'me', me: 'review' };
    case 'stats':
      return { view: 'me', me: 'stats' };
    case 'focus':
      return { view: 'focus' };
    default:
      return null;
  }
}

export function resolveRoute(loc: { pathname: string; hash: string; search: string }): Resolved {
  const hashSeg = norm(loc.hash).split('/');
  const pathSeg = norm(loc.pathname).split('/');
  let route: Route | null = null;
  let viaPath = false;
  if (norm(loc.hash)) route = fromSegments(hashSeg);
  else if (pathSeg[0]) {
    route = fromSegments(pathSeg);
    viaPath = route !== null;
  }
  // ลิงก์ "แก้ไข" จาก LINE (/?task=<id>) เปิดฟอร์มงานในหน้า "แผน"
  if (!route && !norm(loc.hash) && new URLSearchParams(loc.search).has('task'))
    route = { view: 'plan' };
  if (!route) route = { view: 'today' };
  // ลิงก์ ?task= ที่มาพร้อม hash ว่างให้ไปหน้าแผนด้วย (ไม่ว่า path จะเป็นอะไร)
  if (!norm(loc.hash) && new URLSearchParams(loc.search).has('task')) route = { view: 'plan' };
  const hash = routeToHash(route);
  const given = loc.hash === '#' ? '' : loc.hash;
  return {
    route,
    hash,
    redirected:
      viaPath || given !== hash || (!!loc.pathname.replace(/\/+$/, '') && loc.pathname !== '/'),
  };
}
