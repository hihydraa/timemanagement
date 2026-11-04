import { t } from '../lib/i18n';
import type { Category, Status } from '../lib/types';

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
}

export default function Filters({ value, onChange, categories, allTags }: Props) {
  const set = (p: Partial<FilterState>) => onChange({ ...value, ...p });
  return (
    <section aria-label={t.nav.filters} className="space-y-4 text-sm">
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
          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
        />
      </div>

      <fieldset>
        <legend className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
          {t.filter.category}
        </legend>
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
                  style={{ background: c.color }}
                />
                {c.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
          {t.filter.urgency}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {[4, 3, 2, 1].map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={value.urgency.has(l)}
              onClick={() => set({ urgency: toggle(value.urgency, l) })}
              className={chip(value.urgency.has(l))}
            >
              {'!'.repeat(l)} {t.urgency[l]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
          {t.filter.importance}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {[4, 3, 2, 1].map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={value.importance.has(l)}
              onClick={() => set({ importance: toggle(value.importance, l) })}
              className={chip(value.importance.has(l))}
            >
              {'★'.repeat(l)} {t.importance[l]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
          {t.filter.status}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {(['todo', 'doing', 'done', 'cancelled'] as Status[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={value.statuses.has(s)}
              onClick={() => set({ statuses: toggle(value.statuses, s) })}
              className={chip(value.statuses.has(s))}
            >
              {t.status[s]}
            </button>
          ))}
        </div>
      </fieldset>

      {allTags.length > 0 && (
        <div>
          <label
            htmlFor="flt-tag"
            className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400"
          >
            {t.filter.tag}
          </label>
          <select
            id="flt-tag"
            value={value.tag}
            onChange={(e) => set({ tag: e.target.value })}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
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
        className="text-xs text-brand-600 underline dark:text-brand-400"
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
