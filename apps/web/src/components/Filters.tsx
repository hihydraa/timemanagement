import { t } from '../lib/i18n';
import { IMPORTANCE_COLORS, URGENCY_COLORS } from '../lib/colors';
import type { Category, SidebarSection, Status } from '../lib/types';

export interface FilterState {
  q: string;
  tag: string;
  categories: Set<string>; // category id หรือ 'none'; ว่าง = ทั้งหมด
  urgency: Set<number>;
  importance: Set<number>;
  statuses: Set<Status>;
}

export const emptyFilters = (): FilterState => ({
  q: '',
  tag: '',
  categories: new Set(),
  urgency: new Set(),
  importance: new Set(),
  statuses: new Set<Status>(['todo', 'doing', 'done']),
});

function toggle<T>(s: Set<T>, v: T): Set<T> {
  const n = new Set(s);
  if (n.has(v)) n.delete(v);
  else n.add(v);
  return n;
}

const chip = (on: boolean) =>
  `rounded-full border px-2.5 py-1 text-xs ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'}`;

interface Props {
  value: FilterState;
  onChange: (f: FilterState) => void;
  categories: Category[];
  allTags: string[];
  sections: SidebarSection[];
  onJump: (date: string) => void;
}

const legendCls = 'mb-1 text-xs font-semibold text-slate-600 dark:text-slate-400';
const ring =
  'ring-2 ring-brand-700 ring-offset-2 ring-offset-slate-50 dark:ring-brand-300 dark:ring-offset-slate-900';

/** ความเร่งด่วน: วงสี (แดง→เทา) แตะเพื่อกรอง; ชื่อระดับอยู่ใน tooltip/ screen reader และบรรทัดสรุปด้านล่าง */
function UrgencyPicker({ value, onToggle }: { value: Set<number>; onToggle: (l: number) => void }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        {[4, 3, 2, 1].map((l) => {
          const on = value.has(l);
          return (
            <button
              key={l}
              type="button"
              aria-pressed={on}
              aria-label={`${t.filter.urgency}: ${t.urgency[l]}`}
              title={t.urgency[l]}
              onClick={() => onToggle(l)}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white transition ${on ? ring : 'opacity-80 hover:opacity-100'}`}
              style={{ background: URGENCY_COLORS[l], color: l === 2 ? '#422006' : '#fff' }}
            >
              {on ? '✓' : ''}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400" aria-live="polite">
        {value.size
          ? [4, 3, 2, 1]
              .filter((l) => value.has(l))
              .map((l) => t.urgency[l])
              .join(', ')
          : t.filter.tapHint}
      </p>
    </div>
  );
}

/** ความสำคัญ: แท่งระดับแบบสัญญาณ (ยิ่งสำคัญยิ่งเต็ม) */
function ImportancePicker({
  value,
  onToggle,
}: {
  value: Set<number>;
  onToggle: (l: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        {[4, 3, 2, 1].map((l) => {
          const on = value.has(l);
          return (
            <button
              key={l}
              type="button"
              aria-pressed={on}
              aria-label={`${t.filter.importance}: ${t.importance[l]}`}
              title={t.importance[l]}
              onClick={() => onToggle(l)}
              className={`flex h-8 items-end gap-0.5 rounded-lg border px-1.5 pb-1 transition ${on ? `border-brand-700 bg-brand-50 dark:bg-brand-950 ${ring}` : 'border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'}`}
            >
              {[1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  aria-hidden
                  className="w-1.5 rounded-sm"
                  style={{
                    height: 5 + i * 4,
                    background: i <= l ? IMPORTANCE_COLORS[l] : 'rgb(148 163 184 / 0.35)',
                  }}
                />
              ))}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400" aria-live="polite">
        {value.size
          ? [4, 3, 2, 1]
              .filter((l) => value.has(l))
              .map((l) => t.importance[l])
              .join(', ')
          : t.filter.tapHint}
      </p>
    </div>
  );
}

const STATUS_COLOR: Record<Status, string> = {
  todo: '#64748b',
  doing: '#d97706',
  done: '#16a34a',
  cancelled: '#9ca3af',
};

/** ไอคอนสถานะวาดด้วย CSS (ไม่พึ่งฟอนต์): ว่าง = ต้องทำ, ครึ่งวง = กำลังทำ, เต็ม = เสร็จ, ประ = ยกเลิก */
function StatusIcon({ status, light }: { status: Status; light: boolean }) {
  const c = light ? '#fff' : STATUS_COLOR[status];
  const background =
    status === 'done'
      ? c
      : status === 'doing'
        ? `linear-gradient(90deg, ${c} 50%, transparent 50%)`
        : 'transparent';
  return (
    <span
      aria-hidden
      className="mr-1.5 inline-block h-3 w-3 shrink-0 rounded-full border-2 align-[-1px]"
      style={{
        borderColor: c,
        background,
        borderStyle: status === 'cancelled' ? 'dashed' : 'solid',
      }}
    />
  );
}

export default function Filters({ value, onChange, categories, allTags, sections, onJump }: Props) {
  const set = (p: Partial<FilterState>) => onChange({ ...value, ...p });
  const has = (s: SidebarSection) => sections.includes(s);
  return (
    <section aria-label={t.nav.filters} className="space-y-4 text-sm">
      {has('search') && (
        <div>
          <label htmlFor="flt-q" className="sr-only">
            {t.filter.search}
          </label>
          <input
            id="flt-q"
            type="search"
            placeholder={t.filter.search}
            value={value.q}
            onChange={(e) => set({ q: e.target.value })}
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 dark:border-slate-600 dark:bg-slate-800"
          />
        </div>
      )}

      {has('jump') && (
        <div>
          <label htmlFor="jump" className={`block ${legendCls}`}>
            {t.filter.jump}
          </label>
          <input
            id="jump"
            type="date"
            onChange={(e) => e.target.value && onJump(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
        </div>
      )}

      {has('category') && (
        <fieldset>
          <legend className={legendCls}>{t.filter.category}</legend>
          <div className="flex flex-wrap gap-1.5">
            {[
              ...categories.map((c) => ({ id: c.id, name: c.name, color: c.color })),
              { id: 'none', name: t.filter.noCategory, color: '#64748b' },
            ].map((c) => {
              const on = value.categories.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ categories: toggle(value.categories, c.id) })}
                  className={chip(on)}
                >
                  <span
                    aria-hidden
                    className="mr-1 inline-block h-2 w-2 rounded-full"
                    style={{ background: on ? '#fff' : c.color }}
                  />
                  {c.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {has('urgency') && (
        <fieldset>
          <legend className={legendCls}>{t.filter.urgency}</legend>
          <UrgencyPicker
            value={value.urgency}
            onToggle={(l) => set({ urgency: toggle(value.urgency, l) })}
          />
        </fieldset>
      )}

      {has('importance') && (
        <fieldset>
          <legend className={legendCls}>{t.filter.importance}</legend>
          <ImportancePicker
            value={value.importance}
            onToggle={(l) => set({ importance: toggle(value.importance, l) })}
          />
        </fieldset>
      )}

      {has('status') && (
        <fieldset>
          <legend className={legendCls}>{t.filter.status}</legend>
          <div className="flex flex-wrap gap-1.5">
            {(['todo', 'doing', 'done', 'cancelled'] as Status[]).map((s) => {
              const on = value.statuses.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ statuses: toggle(value.statuses, s) })}
                  className={chip(on)}
                >
                  <StatusIcon status={s} light={on} />
                  {t.status[s]}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {has('tag') && allTags.length > 0 && (
        <div>
          <label htmlFor="flt-tag" className={`block ${legendCls}`}>
            {t.filter.tag}
          </label>
          <select
            id="flt-tag"
            value={value.tag}
            onChange={(e) => set({ tag: e.target.value })}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
          >
            <option value="">{t.filter.allTags}</option>
            {allTags.map((tg) => (
              <option key={tg} value={tg}>
                @{tg}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        type="button"
        onClick={() => onChange(emptyFilters())}
        className="text-xs text-brand-700 underline dark:text-brand-300"
      >
        {t.filter.clear}
      </button>
    </section>
  );
}

export function applyFilters<
  T extends {
    title: string;
    tags: string[];
    categoryId: string | null;
    urgency: number;
    importance: number;
    status: Status;
  },
>(tasks: T[], f: FilterState): T[] {
  const q = f.q.trim().toLowerCase();
  return tasks.filter(
    (x) =>
      (!q || x.title.toLowerCase().includes(q)) &&
      (!f.tag || x.tags.includes(f.tag)) &&
      (f.categories.size === 0 || f.categories.has(x.categoryId ?? 'none')) &&
      (f.urgency.size === 0 || f.urgency.has(x.urgency)) &&
      (f.importance.size === 0 || f.importance.has(x.importance)) &&
      f.statuses.has(x.status),
  );
}
