// Test double for Cloudflare D1, backed by Node's built-in SQLite (node:sqlite).
// It implements the subset of the D1 API this Worker uses: prepare/bind/first/all/run/batch.
// batch() runs inside a transaction, like D1.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const here = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(here, '..', 'migrations');

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) {
    return new Statement(this.db, this.sql, params.map((p) => (p === undefined ? null : p)));
  }
  first() {
    const row = this.db.raw.prepare(this.sql).get(...this.params);
    return row ? { ...row } : null; // D1 returns plain objects
  }
  all() {
    const rows = this.db.raw.prepare(this.sql).all(...this.params).map((r) => ({ ...r }));
    return { results: rows, success: true };
  }
  run() {
    const info = this.db.raw.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }
}

export class D1Test {
  constructor(file = ':memory:') {
    this.raw = new DatabaseSync(file);
    this.raw.exec('PRAGMA foreign_keys = ON;');
  }
  prepare(sql) {
    return new Statement(this, sql);
  }
  async batch(statements) {
    this.raw.exec('BEGIN');
    try {
      const out = [];
      for (const s of statements) out.push(await s.run());
      this.raw.exec('COMMIT');
      return out;
    } catch (err) {
      this.raw.exec('ROLLBACK');
      throw err;
    }
  }
  migrate() {
    const files = readFileSync(join(MIGRATIONS_DIR, '0001_init.sql'), 'utf8');
    this.raw.exec(files);
    return this;
  }
  /** Direct helper for tests only (never used by the Worker). */
  query(sql, ...params) {
    return this.raw.prepare(sql).all(...params).map((r) => ({ ...r }));
  }
}
