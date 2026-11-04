/* Dobby service worker — ออฟไลน์แบบอ่านอย่างเดียว
 *  - หน้าเว็บ/ไฟล์ static: แคชไว้ให้เปิดได้แม้ไม่มีอินเทอร์เน็ต
 *  - ข้อมูล API (GET เฉพาะรายการที่อนุญาต): network-first แล้ว fallback เป็นข้อมูลล่าสุดที่เคยเปิด
 *  - ไม่แคช: คำสั่งเขียน (POST/PATCH/DELETE), /auth, /webhook, ไฟล์แนบ, ไฟล์ export, คำตอบที่ไม่สำเร็จ
 *  - แคชข้อมูลส่วนตัว (dobby-api-*) ถูกล้างเมื่อออกจากระบบ (ดู apps/web/src/lib/pwa.ts)
 */
const VERSION = 'v1';
const STATIC = `dobby-static-${VERSION}`;
const API = `dobby-api-${VERSION}`;
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/favicon-64.png', '/mascot/hero.webp'];
const API_ALLOW = [
  '/api/session',
  '/api/me',
  '/api/tasks',
  '/api/today',
  '/api/inbox',
  '/api/matrix',
  '/api/categories',
  '/api/settings',
  '/api/stats/',
  '/api/focus-sessions',
  '/api/gcal/status',
  '/api/line/status',
  '/api/notifications/status',
  '/api/storage',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(STATIC)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== STATIC && k !== API).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// หน้าเว็บส่งรายการไฟล์ที่โหลดอยู่มาให้แคชไว้ (ครั้งแรกที่ติดตั้ง SW ยังไม่ได้ควบคุมหน้า จึงไม่เห็นคำขอเหล่านั้น)
self.addEventListener('message', (e) => {
  const d = e.data;
  if (d && d.type === 'precache' && Array.isArray(d.urls)) {
    const urls = d.urls.filter(
      (u) =>
        typeof u === 'string' &&
        new URL(u, self.location.origin).origin === self.location.origin &&
        /^\/(assets|icons|mascot)\//.test(new URL(u, self.location.origin).pathname),
    );
    e.waitUntil(
      caches
        .open(STATIC)
        .then((c) => Promise.all(urls.map((u) => c.add(u).catch(() => undefined)))),
    );
  }
  if (d && d.type === 'clear-api') e.waitUntil(caches.delete(API));
});

const offlineJson = () =>
  new Response(
    JSON.stringify({
      error: { code: 'offline', message: 'ออฟไลน์ — ไม่มีข้อมูลที่เก็บไว้สำหรับหน้านี้' },
    }),
    {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    },
  );

async function networkFirstApi(req) {
  const cache = await caches.open(API);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(req, res.clone()); // ไม่แคช 401/403/5xx
    return res;
  } catch {
    return (await cache.match(req)) || offlineJson();
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // เขียนข้อมูลต้องออนไลน์เสมอ
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;

  if (
    p.startsWith('/auth/') ||
    p.startsWith('/webhook/') ||
    p.startsWith('/api/attachments/') ||
    p.startsWith('/api/export')
  )
    return;

  if (p.startsWith('/api/')) {
    if (
      API_ALLOW.some(
        (a) =>
          p === a ||
          p.startsWith(a.endsWith('/') ? a : `${a}/`) ||
          (a === '/api/tasks' && p.startsWith('/api/tasks')),
      )
    ) {
      e.respondWith(networkFirstApi(req));
    }
    return;
  }

  if (req.mode === 'navigate') {
    // SPA: ทุกเส้นทางคือ index.html — ออนไลน์ใช้ของใหม่ ออฟไลน์ใช้ shell ที่แคชไว้
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(STATIC).then((c) => c.put('/', res.clone()));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  if (p.startsWith('/assets/') || p.startsWith("/icons/") || p.startsWith("/mascot/") || p === '/manifest.webmanifest') {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(STATIC).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
  }
});
