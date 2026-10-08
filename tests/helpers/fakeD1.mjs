// Minimal D1Database stand-in over node:sqlite (in-memory) so route SQL really runs.
import { DatabaseSync } from 'node:sqlite';

export function createFakeD1() {
  const sqlite = new DatabaseSync(':memory:');
  const statement = (sql, params = []) => ({
    params,
    sql,
    bind: (...args) => statement(sql, args),
    run: async () => runSync(sql, params),
    first: async () => sqlite.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
  });
  const runSync = (sql, params) => {
    const info = sqlite.prepare(sql).run(...params);
    return { success: true, meta: { changes: Number(info.changes) } };
  };
  return {
    sqlite,
    prepare: (sql) => statement(sql),
    batch: async (statements) => statements.map((s) => s.sql.trim().toUpperCase().startsWith('SELECT')
      ? { results: sqlite.prepare(s.sql).all(...(s.params ?? [])) }
      : runSync(s.sql, s.params ?? [])),
  };
}
