import { api } from '../lib/api';
import { IMPORTANCE_COLORS, URGENCY_COLORS } from '../lib/colors';
import { t } from '../lib/i18n';
import type { Category } from '../lib/types';

export default function Legend({
  categories,
  onChanged,
}: {
  categories: Category[];
  onChanged: () => void;
}) {
  return (
    <section
      aria-label={t.legend.title}
      className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-700"
    >
      <h3 className="mb-2 font-semibold">{t.legend.title}</h3>
      <ul className="mb-2 space-y-1">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <input
              type="color"
              value={c.color}
              aria-label={`${t.legend.pickColor}: ${c.name}`}
              onChange={(e) => {
                // อัปเดตตอนปล่อยเมาส์/ปิด picker เพื่อลดจำนวน request
                const v = e.target.value;
                e.target.dataset.pending = v;
              }}
              onBlur={(e) => {
                const v = e.target.dataset.pending;
                if (v && v !== c.color)
                  api
                    .updateCategory(c.id, { color: v })
                    .then(onChanged)
                    .catch(() => undefined);
              }}
              className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            {c.name}
          </li>
        ))}
      </ul>
      <p className="mb-1 text-slate-600 dark:text-slate-400">{t.legend.stripe}</p>
      <div className="mb-2 flex items-center gap-1.5">
        {[4, 3, 2, 1].map((l) => (
          <span
            key={l}
            title={`${t.filter.urgency}: ${t.urgency[l]}`}
            className="inline-block h-4 w-6 rounded-sm"
            style={{ background: URGENCY_COLORS[l] }}
          />
        ))}
      </div>
      <p className="mb-1 text-slate-600 dark:text-slate-400">{t.legend.stars}</p>
      <div className="flex items-end gap-1.5">
        {[4, 3, 2, 1].map((l) => (
          <span
            key={l}
            title={`${t.filter.importance}: ${t.importance[l]}`}
            className="inline-flex items-end gap-px"
          >
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                aria-hidden
                className="w-1 rounded-sm"
                style={{
                  height: 4 + i * 3,
                  background: i <= l ? IMPORTANCE_COLORS[l] : 'rgb(148 163 184 / 0.35)',
                }}
              />
            ))}
          </span>
        ))}
      </div>
    </section>
  );
}
