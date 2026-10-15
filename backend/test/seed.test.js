import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { D1Test } from './d1.js';
import { makeEnv, call, makeStaff } from './helpers.js';

const seedSql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'seed', 'demo-data.sql'), 'utf8');

test('demo seed loads on a migrated database and drives the reports', async () => {
  const db = new D1Test().migrate();
  db.raw.exec(seedSql);
  const env = { ...makeEnv(), DB: db };
  const acc = await makeStaff(env, { role: 'accountant' });
  const r = await call(env, 'GET', `/api/admin/registrations?from=2026-10-01&to=2026-10-31`, { token: acc.token });
  assert.equal(r.status, 200);
  assert.equal(r.data.total, 3);
  const summary = await call(env, 'GET', '/api/admin/reports/summary?from=2026-10-01&to=2026-10-31', { token: acc.token });
  assert.equal(summary.data.registrations.by_status.paid, 1);
  assert.equal(summary.data.approved_payments.total_sar, 300);
  assert.equal(summary.data.pending_claims, 1);
});

test('demo seed is clearly fictional', () => {
  assert.equal(seedSql.includes('example.test'), true);
  assert.equal(/05\d{8}/.test(seedSql.replace(/050000000\d/g, '')), false, 'no real-looking mobile numbers');
});
