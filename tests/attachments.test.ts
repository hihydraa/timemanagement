import { beforeEach, describe, expect, it } from 'vitest';
import { Client, makeEnv } from './helpers/app';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PDF = new TextEncoder().encode('%PDF-1.4\nhello');
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9, 9]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]);

let env: ReturnType<typeof makeEnv>;
let a: Client;
let b: Client;
let taskA: string;
const url = (id = taskA) => `/api/tasks/${id}/attachments`;

beforeEach(async () => {
  env = makeEnv();
  a = new Client(env);
  b = new Client(env);
  await a.login('a@x.com');
  await b.login('b@x.com');
  taskA = (await a.call('POST', '/api/tasks', { title: 'มีไฟล์' })).json.task.id;
});

describe('upload / list / download', () => {
  it('แนบหลายไฟล์ได้, แสดงรายการ, ดาวน์โหลดได้ตรงกับที่อัปโหลด', async () => {
    const up = await a.upload(url(), [
      { name: 'รูป.png', data: PNG },
      { name: 'report.pdf', data: PDF },
      { name: 'sheet.xlsx', data: ZIP },
    ]);
    expect(up.status).toBe(201);
    expect(up.json.attachments).toHaveLength(3);
    expect(up.json.attachments[0]).not.toHaveProperty('r2Key');

    const list = (await a.call('GET', url())).json.attachments;
    expect(list.map((x: { filename: string }) => x.filename).sort()).toEqual(
      ['sheet.xlsx', 'report.pdf', 'รูป.png'].sort(),
    );
    expect(list.find((x: { filename: string }) => x.filename === 'รูป.png').isImage).toBe(true);

    const png = list.find((x: { filename: string }) => x.filename === 'รูป.png');
    const dl = await a.download(`/api/attachments/${png.id}`);
    expect(dl.status).toBe(200);
    expect([...dl.bytes]).toEqual([...PNG]);
    expect(dl.headers.get('content-type')).toBe('image/png');
    expect(dl.headers.get('x-content-type-options')).toBe('nosniff');
    expect(dl.headers.get('content-disposition')).toMatch(/^inline; filename=/);
    expect(dl.headers.get('content-disposition')).toContain("filename*=UTF-8''%E0%B8%A3");
    expect(dl.headers.get('content-security-policy')).toContain('sandbox');
  });
  it('ไฟล์ที่ไม่ใช่รูปถูกบังคับ attachment', async () => {
    const id = (await a.upload(url(), [{ name: 'a.pdf', data: PDF }])).json.attachments[0].id;
    const dl = await a.download(`/api/attachments/${id}`);
    expect(dl.headers.get('content-disposition')).toMatch(/^attachment;/);
  });
  it('task DTO มี attachmentCount', async () => {
    await a.upload(url(), [
      { name: 'a.pdf', data: PDF },
      { name: 'b.jpg', data: JPG },
    ]);
    expect((await a.call('GET', `/api/tasks/${taskA}`)).json.task.attachmentCount).toBe(2);
    expect((await a.call('GET', '/api/tasks')).json.tasks[0].attachmentCount).toBe(2);
  });
  it('R2 key ไม่มีชื่อไฟล์ผู้ใช้', async () => {
    await a.upload(url(), [{ name: 'secret-name.pdf', data: PDF }]);
    expect(env.FILES.keys()[0]).not.toContain('secret');
    expect(env.FILES.keys()[0]).toContain(taskA);
  });
});

describe('การตรวจสอบไฟล์', () => {
  it('ปฏิเสธนามสกุลที่ไม่อยู่ใน whitelist (exe, html, svg, js, php)', async () => {
    for (const name of ['x.exe', 'x.html', 'x.svg', 'x.js', 'x.php', 'noext', 'x.doc']) {
      const r = await a.upload(url(), [{ name, data: 'hello' }]);
      expect(r.status, name).toBe(400);
      expect(r.json.error.code).toBe('unsupported_type');
    }
    expect(env.FILES.keys()).toHaveLength(0);
  });
  it('ปฏิเสธไฟล์ที่เนื้อหาไม่ตรงนามสกุล (html ปลอมเป็น png/pdf, binary ปลอมเป็น txt)', async () => {
    expect(
      (await a.upload(url(), [{ name: 'a.png', data: '<script>alert(1)</script>' }])).json.error
        .code,
    ).toBe('content_mismatch');
    expect((await a.upload(url(), [{ name: 'a.pdf', data: PNG }])).json.error.code).toBe(
      'content_mismatch',
    );
    expect(
      (await a.upload(url(), [{ name: 'a.txt', data: new Uint8Array([65, 0, 66]) }])).json.error
        .code,
    ).toBe('content_mismatch');
    expect((await a.upload(url(), [{ name: 'a.docx', data: 'not a zip' }])).json.error.code).toBe(
      'content_mismatch',
    );
  });
  it('ไม่เชื่อ Content-Type ที่ client ส่งมา', async () => {
    const r = await a.upload(url(), [{ name: 'a.exe', data: PDF, type: 'application/pdf' }]);
    expect(r.status).toBe(400);
    const ok = await a.upload(url(), [{ name: 'a.pdf', data: PDF, type: 'text/html' }]);
    expect(ok.json.attachments[0].mime).toBe('application/pdf');
  });
  it('ปฏิเสธไฟล์ว่าง', async () => {
    expect((await a.upload(url(), [{ name: 'a.txt', data: '' }])).json.error.code).toBe(
      'empty_file',
    );
  });
  it('ปฏิเสธไฟล์ใหญ่เกิน MAX_UPLOAD_MB', async () => {
    const small = makeEnv({ MAX_UPLOAD_MB: '1' });
    const c = new Client(small);
    await c.login('a@x.com');
    const t = (await c.call('POST', '/api/tasks', { title: 'x' })).json.task.id;
    const big = new Uint8Array(1024 * 1024 + 1);
    big.set(PDF);
    const r = await c.upload(url(t), [{ name: 'big.pdf', data: big }]);
    expect(r.status).toBe(413);
    expect(r.json.error.code).toBe('file_too_large');
    const edge = new Uint8Array(1024 * 1024);
    edge.set(PDF);
    expect((await c.upload(url(t), [{ name: 'edge.pdf', data: edge }])).status).toBe(201);
  });
  it('ปฏิเสธเมื่อเกินจำนวนไฟล์ต่อครั้ง และเมื่อไม่มีไฟล์', async () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.pdf`, data: PDF }));
    expect((await a.upload(url(), six)).json.error.code).toBe('too_many_files');
    expect((await a.upload(url(), [])).status).toBe(400);
  });
  it('ถ้าไฟล์หนึ่งในชุดไม่ผ่าน ไม่มีไฟล์ใดถูกบันทึก', async () => {
    const r = await a.upload(url(), [
      { name: 'ok.pdf', data: PDF },
      { name: 'bad.exe', data: 'x' },
    ]);
    expect(r.status).toBe(400);
    expect(env.FILES.keys()).toHaveLength(0);
    expect((await a.call('GET', url())).json.attachments).toHaveLength(0);
  });
  it('ปฏิเสธเมื่อไม่ใช่ multipart / ไม่มี Content-Length / คำขอใหญ่เกิน', async () => {
    expect((await a.call('POST', url(), { x: 1 }, { 'Content-Length': '10' })).status).toBe(400);
    const noLen = await a.call('POST', url(), undefined, {
      'Content-Type': 'multipart/form-data; boundary=x',
    });
    expect(noLen.json.error.code).toBe('length_required');
    const huge = await a.call('POST', url(), undefined, {
      'Content-Type': 'multipart/form-data; boundary=x',
      'Content-Length': String(500 * 1024 * 1024),
    });
    expect(huge.status).toBe(413);
  });
  it('ชื่อไฟล์อันตรายถูกล้าง (path traversal, อักขระควบคุม, header injection)', async () => {
    const r = await a.upload(url(), [
      { name: '../../etc/pass"wd\r\nX-Evil: 1.pdf', data: PDF },
      { name: 'C:\\temp\\.hidden.pdf', data: PDF },
    ]);
    const [x, y] = r.json.attachments;
    expect(x.filename).not.toMatch(/[/\\\r\n]/);
    expect(y.filename).toBe('hidden.pdf');
    const dl = await a.download(`/api/attachments/${x.id}`);
    expect(dl.headers.get('content-disposition')).not.toMatch(/[\r\n]/);
    expect(dl.headers.get('x-evil')).toBeNull();
  });
});

describe('quota', () => {
  it('นับรวมทุกงานของผู้ใช้ และหยุดเมื่อเต็ม; ลบแล้วคืนพื้นที่', async () => {
    const tiny = makeEnv({ USER_STORAGE_QUOTA_MB: '1', MAX_UPLOAD_MB: '1' });
    const c = new Client(tiny);
    await c.login('a@x.com');
    const t1 = (await c.call('POST', '/api/tasks', { title: '1' })).json.task.id;
    const t2 = (await c.call('POST', '/api/tasks', { title: '2' })).json.task.id;
    const half = new Uint8Array(600 * 1024);
    half.set(PDF);
    const first = await c.upload(url(t1), [{ name: 'a.pdf', data: half }]);
    expect(first.status).toBe(201);
    expect((await c.upload(url(t2), [{ name: 'b.pdf', data: half }])).json.error.code).toBe(
      'quota_exceeded',
    );
    expect((await c.call('GET', '/api/storage')).json.usedBytes).toBe(600 * 1024);
    await c.call('DELETE', `/api/attachments/${first.json.attachments[0].id}`);
    expect((await c.call('GET', '/api/storage')).json.usedBytes).toBe(0);
    expect((await c.upload(url(t2), [{ name: 'b.pdf', data: half }])).status).toBe(201);
  });
  it('quota ของผู้ใช้อื่นไม่ถูกนับรวม', async () => {
    await a.upload(url(), [{ name: 'a.pdf', data: PDF }]);
    expect((await b.call('GET', '/api/storage')).json.usedBytes).toBe(0);
  });
});

describe('authorization', () => {
  it('ไม่ล็อกอิน = 401 ทุก endpoint', async () => {
    const anon = new Client(env);
    expect((await anon.call('GET', url())).status).toBe(401);
    expect((await anon.upload(url(), [{ name: 'a.pdf', data: PDF }])).status).toBe(401);
    expect((await anon.call('GET', '/api/attachments/x')).status).toBe(401);
    expect((await anon.call('DELETE', '/api/attachments/x')).status).toBe(401);
  });
  it('ผู้ใช้ B เข้าถึงไฟล์/งานของ A ไม่ได้ (list, upload, download, delete) และไฟล์ยังอยู่', async () => {
    const att = (await a.upload(url(), [{ name: 'secret.pdf', data: PDF }])).json.attachments[0];
    expect((await b.call('GET', url())).status).toBe(404);
    expect((await b.upload(url(), [{ name: 'evil.pdf', data: PDF }])).status).toBe(404);
    expect((await b.download(`/api/attachments/${att.id}`)).status).toBe(404);
    expect((await b.call('DELETE', `/api/attachments/${att.id}`)).status).toBe(404);
    expect(env.FILES.keys()).toHaveLength(1);
    expect((await a.download(`/api/attachments/${att.id}`)).status).toBe(200);
    // ข้อมูลตัวนับไม่รั่ว
    expect((await b.call('GET', '/api/tasks')).json.tasks).toHaveLength(0);
  });
  it('Origin แปลกปลอมอัปโหลดไม่ได้ (CSRF)', async () => {
    const r = await a.upload(url(), [{ name: 'a.pdf', data: PDF }], { Origin: 'https://evil.com' });
    expect(r.status).toBe(403);
    expect(env.FILES.keys()).toHaveLength(0);
  });
});

describe('การลบ', () => {
  it('ลบไฟล์แนบ → ลบทั้ง R2 และแถว DB', async () => {
    const att = (await a.upload(url(), [{ name: 'a.pdf', data: PDF }])).json.attachments[0];
    expect((await a.call('DELETE', `/api/attachments/${att.id}`)).status).toBe(200);
    expect(env.FILES.keys()).toHaveLength(0);
    expect((await a.call('GET', url())).json.attachments).toHaveLength(0);
    expect((await a.download(`/api/attachments/${att.id}`)).status).toBe(404);
  });
  it('ลบงาน → ลบไฟล์ทั้งหมดของงานใน R2 แต่ไม่แตะไฟล์งานอื่น', async () => {
    const other = (await a.call('POST', '/api/tasks', { title: 'อื่น' })).json.task.id;
    await a.upload(url(), [
      { name: 'a.pdf', data: PDF },
      { name: 'b.png', data: PNG },
    ]);
    await a.upload(url(other), [{ name: 'keep.pdf', data: PDF }]);
    expect(env.FILES.keys()).toHaveLength(3);
    expect((await a.call('DELETE', `/api/tasks/${taskA}`)).status).toBe(200);
    expect(env.FILES.keys()).toHaveLength(1);
    expect(env.FILES.keys()[0]).toContain(other);
    expect((await a.call('GET', '/api/storage')).json.usedBytes).toBe(PDF.length);
  });
  it('ถ้าลบ R2 ล้มเหลว งานและไฟล์ยังอยู่ (ลองใหม่ได้) ไม่เกิดไฟล์กำพร้า', async () => {
    await a.upload(url(), [{ name: 'a.pdf', data: PDF }]);
    env.FILES.failDeleteOnce = true;
    expect((await a.call('DELETE', `/api/tasks/${taskA}`)).status).toBe(500);
    expect((await a.call('GET', `/api/tasks/${taskA}`)).status).toBe(200);
    expect((await a.call('DELETE', `/api/tasks/${taskA}`)).status).toBe(200);
    expect(env.FILES.keys()).toHaveLength(0);
  });
});
