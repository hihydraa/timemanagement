import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { join } from 'node:path';

/** D1Database ขั้นต่ำบน node:sqlite สำหรับ test (ใช้ migration จริงจาก ./migrations) */
export function createTestD1(): D1Database {
  const sqlite = new DatabaseSync(':memory:');
  const dir = join(process.cwd(), 'migrations');
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    sqlite.exec(readFileSync(join(dir, f), 'utf8').replace(/--> statement-breakpoint/g, ''));
  }

  const makeStmt = (sql: string, params: SQLInputValue[] = []) => {
    const stmt = {
      bind: (...p: unknown[]) => makeStmt(sql, p as SQLInputValue[]),
      all: async () => {
        const results = sqlite.prepare(sql).all(...params);
        return { results, success: true, meta: {} };
      },
      raw: async () =>
        sqlite
          .prepare(sql)
          .all(...params)
          .map((r) => Object.values(r)),
      run: async () => {
        const r = sqlite.prepare(sql).run(...params);
        return {
          results: [],
          success: true,
          meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) },
        };
      },
      first: async () => sqlite.prepare(sql).get(...params) ?? null,
    };
    return stmt;
  };

  const db = {
    prepare: (sql: string) => makeStmt(sql),
    batch: async (stmts: { run: () => Promise<unknown> }[]) =>
      Promise.all(stmts.map((s) => s.run())),
    exec: async (sql: string) => sqlite.exec(sql),
  };
  return db as unknown as D1Database;
}
