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
      <div className="mb-1 flex items-center gap-1.5" aria-label={t.legend.stripe}>
        {[4, 3, 2, 1].map((l) => (
          <span key={l} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-4 w-1.5 rounded-sm"
              style={{ background: URGENCY_COLORS[l] }}
            />
            {'!'.repeat(l)}
          </span>
        ))}
      </div>
      <p className="text-slate-500 dark:text-slate-400">
        {t.legend.stripe} · {t.legend.stars}
      </p>
      <div className="mt-1 flex gap-1.5" aria-hidden>
        {[4, 3, 2, 1].map((l) => (
          <span
            key={l}
            className="inline-block h-3 w-5 rounded-sm"
            style={{ background: IMPORTANCE_COLORS[l] }}
          />
        ))}
      </div>
    </section>
  );
}
