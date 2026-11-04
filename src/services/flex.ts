import { bangkokDate, bangkokParts } from '../lib/time';
import { IMPORTANCE_LABEL, URGENCY_LABEL } from '../lib/labels';
import type { LineMessage } from './line';
import type { TaskDto } from './tasks';

export const URGENCY_COLOR: Record<number, string> = {
  4: '#dc2626',
  3: '#ea580c',
  2: '#eab308',
  1: '#9ca3af',
};

const WD = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const MON = [
  '',
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];
const pad = (n: number) => String(n).padStart(2, '0');

/** ตัดตามจำนวนตัวอักษร (ไม่ตัดกลาง surrogate pair) */
export const clip = (s: string, n: number) => {
  const a = [...s];
  return a.length <= n ? s : `${a.slice(0, n - 1).join('')}…`;
};

export const dayLabel = (ymd: string): string => {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WD[wd]} ${d} ${MON[m]}`;
};

const hmOf = (iso: string) => {
  const p = bangkokParts(new Date(iso));
  return `${pad(p.hour)}:${pad(p.minute)}`;
};

/** วันที่ (ไทย) ที่งานนี้ผูกอยู่ */
export const taskDate = (t: TaskDto): string | null =>
  t.startAt
    ? bangkokDate(new Date(t.startAt))
    : t.dueAt
      ? bangkokDate(new Date(t.dueAt))
      : t.dueDate;

/** ข้อความเวลาสั้น ๆ เช่น "14:00–15:30", "ทั้งวัน", "⏰ 17:00" */
export const timeText = (t: TaskDto): string => {
  if (t.allDay) return 'ทั้งวัน';
  // เริ่ม = จบ ถือเป็นจุดเวลา (แสดงเวลาเดียว)
  if (t.startAt)
    return t.endAt && hmOf(t.endAt) !== hmOf(t.startAt)
      ? `${hmOf(t.startAt)}–${hmOf(t.endAt)}`
      : hmOf(t.startAt);
  if (t.dueAt) return `⏰ ${hmOf(t.dueAt)}`;
  return 'ไม่กำหนดเวลา';
};

export const whenText = (t: TaskDto): string => {
  const d = taskDate(t);
  if (!d) return 'ยังไม่กำหนดวัน (Inbox)';
  return `${dayLabel(d)} · ${timeText(t)}`;
};

export const text = (s: string, quick?: QuickItem[]): LineMessage => ({
  type: 'text',
  text: s,
  ...(quick?.length ? { quickReply: { items: quick.slice(0, 13) } } : {}),
});

export interface QuickItem {
  type: 'action';
  action: Record<string, unknown>;
}
export const quickMessage = (label: string, msg: string): QuickItem => ({
  type: 'action',
  action: { type: 'message', label: clip(label, 20), text: msg.slice(0, 300) },
});
export const quickPostback = (label: string, data: string, displayText?: string): QuickItem => ({
  type: 'action',
  action: {
    type: 'postback',
    label: clip(label, 20),
    data,
    ...(displayText ? { displayText: clip(displayText, 300) } : {}),
  },
});

const txt = (t: string, o: Record<string, unknown> = {}) => ({
  type: 'text',
  text: t || ' ',
  wrap: true,
  ...o,
});
const button = (
  label: string,
  action: Record<string, unknown>,
  style: 'primary' | 'secondary' | 'link' = 'secondary',
  color?: string,
) => ({
  type: 'button',
  style,
  height: 'sm',
  ...(color ? { color } : {}),
  action: { ...action, label: clip(label, 20) },
});
/** ระดับที่ควรเน้นเป็นคำ เช่น "ด่วนมาก · สำคัญ" (ระดับปกติ/ต่ำไม่แสดง) */
const levelText = (t: TaskDto): string =>
  [
    t.urgency >= 3 ? URGENCY_LABEL[t.urgency] : '',
    t.importance >= 3 ? IMPORTANCE_LABEL[t.importance] : '',
  ]
    .filter(Boolean)
    .join(' · ');

const pb = (data: string) => ({ type: 'postback', data });

export type MascotPose = 'morning' | 'deadline' | 'done' | 'rest';
/** ภาพมาสคอต Dobby บนหัวการ์ด (ไฟล์ PNG จาก /mascot/ ของเว็บเอง; LINE ต้องการ https สาธารณะ) */
const mascotHero = (baseUrl: string, pose: MascotPose) => ({
  type: 'image',
  url: `${baseUrl.replace(/\/$/, '')}/mascot/${pose}.png`,
  size: 'full',
  aspectRatio: '20:9',
  aspectMode: 'fit',
  backgroundColor: '#F6ECD6',
});

/** การ์ดยืนยันหลังสร้างงาน: มีปุ่ม เสร็จ / แก้ไข / ลบ */
export function taskCard(
  t: TaskDto,
  o: {
    baseUrl: string;
    categoryName?: string | null;
    categoryColor?: string | null;
    heading?: string;
  },
): LineMessage {
  const stripe = URGENCY_COLOR[t.urgency] ?? '#9ca3af';
  const meta = [
    // แสดงเฉพาะระดับที่ควรเน้น (ด่วน/สำคัญขึ้นไป) เป็นคำ
    t.urgency >= 3 ? (URGENCY_LABEL[t.urgency] ?? '') : '',
    t.importance >= 3 ? (IMPORTANCE_LABEL[t.importance] ?? '') : '',
    o.categoryName ? `#${o.categoryName}` : '',
    ...t.tags.map((x) => `@${x}`),
  ]
    .filter(Boolean)
    .join('  ');
  const body: unknown[] = [
    txt(o.heading ?? '✅ บันทึกงานแล้ว', { size: 'xs', color: '#6b7280' }),
    txt(clip(t.title, 120), { weight: 'bold', size: 'lg', margin: 'sm' }),
    txt(`🕒 ${whenText(t)}`, { size: 'sm', margin: 'md' }),
    txt(meta, { size: 'xs', color: '#6b7280', margin: 'sm' }),
  ];
  if (t.recurrenceRule)
    body.push(txt(`🔁 ${t.recurrenceRule}`, { size: 'xs', color: '#6b7280', margin: 'sm' }));
  if (t.estimateMinutes)
    body.push(
      txt(`⏱ ประมาณ ${t.estimateMinutes} นาที`, { size: 'xs', color: '#6b7280', margin: 'sm' }),
    );
  return {
    type: 'flex',
    altText: clip(`บันทึกงาน: ${t.title} (${whenText(t)})`, 380),
    contents: {
      type: 'bubble',
      size: 'kilo',
      styles: { body: { separator: false } },
      body: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'md',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            width: '5px',
            backgroundColor: stripe,
            cornerRadius: '3px',
            contents: [{ type: 'filler' }],
          },
          { type: 'box', layout: 'vertical', flex: 1, contents: body },
        ],
      },
      // ปุ่มหลักเต็มความกว้าง + ปุ่มรองสองปุ่มแถวล่าง (สามปุ่มแนวนอนในการ์ด kilo ทำให้ข้อความถูกตัด)
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          button('✅ เสร็จ', pb(`a=done&id=${t.id}`), 'primary', '#16a34a'),
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              button('แก้ไข', { type: 'uri', uri: `${o.baseUrl}/?task=${t.id}` }),
              button('ลบ', pb(`a=del&id=${t.id}`)),
            ],
          },
        ],
      },
    },
  };
}

export interface ListSection {
  title: string;
  color?: string;
  tasks: TaskDto[];
}

const MAX_ROWS = 12;

/** รายการงานแบบมีเลขกำกับ (ใช้กับ "เสร็จ 2") — คืนข้อความ Flex และรายการ id ตามลำดับเลข */
export function listCard(
  heading: string,
  sections: ListSection[],
  baseUrl: string,
  pose?: MascotPose,
): { message: LineMessage; ids: string[] } {
  const ids: string[] = [];
  const rows: unknown[] = [];
  let hidden = 0;
  for (const s of sections) {
    if (!s.tasks.length) continue;
    rows.push(
      txt(`${s.title} (${s.tasks.length})`, {
        weight: 'bold',
        size: 'sm',
        color: s.color ?? '#374151',
        margin: rows.length ? 'lg' : 'none',
      }),
    );
    for (const t of s.tasks) {
      if (ids.length >= MAX_ROWS) {
        hidden++;
        continue;
      }
      ids.push(t.id);
      rows.push({
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        margin: 'sm',
        contents: [
          txt(`${ids.length}.`, { flex: 0, size: 'sm', color: '#6b7280' }),
          {
            type: 'box',
            layout: 'vertical',
            width: '4px',
            backgroundColor: URGENCY_COLOR[t.urgency] ?? '#9ca3af',
            contents: [{ type: 'filler' }],
          },
          {
            type: 'box',
            layout: 'vertical',
            flex: 1,
            contents: [
              txt(clip(t.title, 60), { size: 'sm', weight: 'bold' }),
              txt(
                `${taskDate(t) && sections.length > 1 && s.title.includes('เลย') ? `${dayLabel(taskDate(t)!)} · ` : ''}${timeText(t)}${levelText(t) ? `  ${levelText(t)}` : ''}${t.attachmentCount ? ' 📎' : ''}`,
                { size: 'xs', color: '#6b7280' },
              ),
            ],
          },
        ],
      });
    }
  }
  if (hidden)
    rows.push(
      txt(`…และอีก ${hidden} งาน (เปิดเว็บเพื่อดูทั้งหมด)`, {
        size: 'xs',
        color: '#6b7280',
        margin: 'md',
      }),
    );
  const total = ids.length + hidden;
  return {
    ids,
    message: {
      type: 'flex',
      altText: clip(`${heading}: ${total} งาน`, 380),
      contents: {
        type: 'bubble',
        ...(pose && baseUrl.startsWith('https://') ? { hero: mascotHero(baseUrl, pose) } : {}),
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            txt(heading, { weight: 'bold', size: 'md' }),
            { type: 'separator', margin: 'md' },
            { type: 'box', layout: 'vertical', margin: 'md', contents: rows },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            txt('พิมพ์ "เสร็จ 1" เพื่อติ๊กเสร็จ', {
              size: 'xs',
              color: '#6b7280',
              align: 'center',
            }),
            button('เปิดในเว็บ', { type: 'uri', uri: baseUrl }, 'link'),
          ],
        },
      },
    },
  };
}

export const confirmDelete = (t: TaskDto): LineMessage => ({
  type: 'template',
  altText: clip(`ลบงาน "${t.title}" ใช่ไหม?`, 380),
  template: {
    type: 'confirm',
    text: clip(`ลบงาน "${t.title}" ใช่ไหม?`, 230),
    actions: [
      { type: 'postback', label: 'ลบ', data: `a=delok&id=${t.id}` },
      { type: 'postback', label: 'ยกเลิก', data: 'a=cancel' },
    ],
  },
});

export const HELP_TEXT = [
  '📖 วิธีใช้ Dobby',
  '',
  '➕ เพิ่มงาน: พิมพ์ได้เลย เช่น',
  'ส่งรายงาน พรุ่งนี้ 14:00 #งาน !ด่วน',
  'ประชุมทีม ทุกวันจันทร์ 9:00',
  'ส่งสไลด์ ภายใน ศุกร์ 17:00 @ลูกค้า 2 ชม.',
  '(ธง: !ด่วน !ด่วนมาก !สำคัญ !u1-4 !p1-4)',
  '',
  '📋 ดูงาน: วันนี้ · พรุ่งนี้ · สัปดาห์นี้ · ค้างอยู่ · inbox',
  '✅ เสร็จ <เลข/ชื่อ> เช่น เสร็จ 2',
  '⏰ เลื่อน <เลข/ชื่อ> พรุ่งนี้',
  '🗑 ลบ <เลข/ชื่อ>',
  '🔔 เปิดแจ้งเตือน · ปิดแจ้งเตือน',
  '📎 ส่งรูป/ไฟล์ต่อจากการเพิ่มงาน จะแนบเข้างานล่าสุด',
].join('\n');

export const LINK_HELP =
  'ยังไม่ได้ผูกบัญชี Dobby 🔗\n\n1) เปิดเว็บ Dobby แล้วกดปุ่ม "เชื่อม LINE" เพื่อรับรหัส 6 หลัก\n2) พิมพ์ที่นี่: ผูกบัญชี 123456\n\n(รหัสหมดอายุใน 10 นาที)';

// ---------------------------------------------------------------- notifications
export interface AlertItem {
  task: TaskDto;
  /** หัวการ์ด เช่น "⏰ อีก 25 นาที" */
  label: string;
}

const MAX_ALERT_BUBBLES = 8;

/**
 * Flex Carousel ของงานที่ต้องเตือน — เป็น "ข้อความเดียว" ต่อการ push (นับโควตา 1)
 * แต่ละงานมีปุ่ม ✅ เสร็จ / ⏰ เลื่อน 1 ชม. / พรุ่งนี้ / 🔗 เปิดในเว็บ
 */
export function alertCarousel(items: AlertItem[], baseUrl: string): LineMessage {
  const shown = items.slice(0, MAX_ALERT_BUBBLES);
  const bubbles: unknown[] = shown.map(({ task: t, label }) => ({
    type: 'bubble',
    size: 'kilo',
    body: {
      type: 'box',
      layout: 'horizontal',
      spacing: 'md',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          width: '5px',
          backgroundColor: URGENCY_COLOR[t.urgency] ?? '#9ca3af',
          cornerRadius: '3px',
          contents: [{ type: 'filler' }],
        },
        {
          type: 'box',
          layout: 'vertical',
          flex: 1,
          contents: [
            txt(label, { size: 'xs', weight: 'bold', color: '#3d6552' }),
            txt(clip(t.title, 100), { weight: 'bold', size: 'md', margin: 'sm' }),
            txt(`🕒 ${whenText(t)}`, { size: 'sm', margin: 'md' }),
            txt(levelText(t) || ' ', { size: 'xs', color: '#6b7280', margin: 'sm' }),
          ],
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          contents: [
            button('✅ เสร็จ', pb(`a=done&id=${t.id}`), 'primary', '#16a34a'),
            button('⏰ +1 ชม.', pb(`a=snz&id=${t.id}&m=60`)),
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          contents: [
            button('พรุ่งนี้', pb(`a=snz&id=${t.id}&d=1`)),
            button('🔗 เปิดเว็บ', { type: 'uri', uri: `${baseUrl}/?task=${t.id}` }),
          ],
        },
      ],
    },
  }));
  if (items.length > shown.length) {
    bubbles.push({
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [txt(`…และอีก ${items.length - shown.length} งาน`, { weight: 'bold' })],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [button('เปิดในเว็บ', { type: 'uri', uri: baseUrl }, 'link')],
      },
    });
  }
  const first = items[0]!;
  return {
    type: 'flex',
    altText: clip(
      `${first.label}: ${first.task.title}${items.length > 1 ? ` และอีก ${items.length - 1} งาน` : ''}`,
      380,
    ),
    contents: { type: 'carousel', contents: bubbles },
  };
}

/** สรุปตอนเย็น: เสร็จกี่งาน / ยังค้างอะไร + ปุ่มเลื่อนงานค้างไปพรุ่งนี้ */
export function eveningCard(
  date: string,
  done: TaskDto[],
  pending: TaskDto[],
  overdueBefore: number,
  baseUrl: string,
): { message: LineMessage; ids: string[] } {
  const ids: string[] = [];
  const body: unknown[] = [
    txt(`🌙 สรุปวันนี้ ${dayLabel(date)}`, { weight: 'bold', size: 'md' }),
    { type: 'separator', margin: 'md' },
  ];
  body.push(
    txt(`✅ เสร็จแล้ว ${done.length} งาน`, {
      weight: 'bold',
      size: 'sm',
      color: '#16a34a',
      margin: 'md',
    }),
  );
  for (const t of done.slice(0, 5))
    body.push(txt(`• ${clip(t.title, 60)}`, { size: 'sm', color: '#6b7280', margin: 'xs' }));
  if (done.length > 5)
    body.push(
      txt(`…และอีก ${done.length - 5} งาน`, { size: 'xs', color: '#6b7280', margin: 'xs' }),
    );

  body.push(
    txt(`⏳ ยังค้าง ${pending.length} งาน`, {
      weight: 'bold',
      size: 'sm',
      color: pending.length ? '#ea580c' : '#6b7280',
      margin: 'lg',
    }),
  );
  for (const t of pending.slice(0, 8)) {
    ids.push(t.id);
    body.push(
      txt(`${ids.length}. ${clip(t.title, 60)}  (${timeText(t)})`, { size: 'sm', margin: 'xs' }),
    );
  }
  if (pending.length > 8)
    body.push(
      txt(`…และอีก ${pending.length - 8} งาน`, { size: 'xs', color: '#6b7280', margin: 'xs' }),
    );
  if (overdueBefore > 0)
    body.push(
      txt(`🔴 ค้างจากวันก่อนหน้าอีก ${overdueBefore} งาน`, {
        size: 'xs',
        color: '#dc2626',
        margin: 'md',
      }),
    );

  const footer: unknown[] = [];
  if (pending.length)
    footer.push(button('เลื่อนงานค้างไปพรุ่งนี้', pb(`a=carry&d=${date}`), 'primary', '#3d6552'));
  footer.push(button('เปิดในเว็บ', { type: 'uri', uri: baseUrl }, 'link'));
  return {
    ids,
    message: {
      type: 'flex',
      altText: clip(`สรุปวันนี้: เสร็จ ${done.length} · ค้าง ${pending.length}`, 380),
      contents: {
        type: 'bubble',
        ...(baseUrl.startsWith('https://')
          ? { hero: mascotHero(baseUrl, done.length > 0 ? 'done' : 'rest') }
          : {}),
        body: { type: 'box', layout: 'vertical', contents: body },
        footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: footer },
      },
    },
  };
}
