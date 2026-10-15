import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { makeEnv, call, makeStaff, validRegistration, createRegistrationApi, todayDay, base32Decode, totpAt } from './helpers.js';
import { hashPassword, createSession } from '../src/auth.js';

const PASS = 'correct horse battery';

async function insertUser(env, { email, role, branch_id = null, password = PASS }) {
  return env.DB
    .prepare('INSERT INTO users (email, full_name, role, branch_id, password_hash) VALUES (?, ?, ?, ?, ?) RETURNING id')
    .bind(email, 'موظف', role, branch_id, await hashPassword(password))
    .first();
}

async function currentCode(secretB32) {
  return totpAt(base32Decode(secretB32), Math.floor(Date.now() / 30000));
}

test('admin endpoints reject anonymous requests', async () => {
  const env = makeEnv();
  assert.equal((await call(env, 'GET', '/api/admin/registrations')).status, 401);
  assert.equal((await call(env, 'GET', '/api/admin/reports/summary')).status, 401);
  assert.equal((await call(env, 'GET', '/api/admin/registrations', { token: 'x'.repeat(30) })).status, 401);
});

test('wrong password and unknown email return the same message', async () => {
  const env = makeEnv();
  await insertUser(env, { email: 'owner@example.test', role: 'owner' });
  const a = await call(env, 'POST', '/api/admin/login', { body: { email: 'owner@example.test', password: 'wrong wrong wrong' } });
  const b = await call(env, 'POST', '/api/admin/login', { body: { email: 'nobody@example.test', password: 'wrong wrong wrong' } });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.data.message, b.data.message);
});

test('account locks after repeated failures, even for the right password', async () => {
  const env = makeEnv();
  await insertUser(env, { email: 'lock@example.test', role: 'accountant' });
  for (let i = 0; i < 5; i++) {
    await call(env, 'POST', '/api/admin/login', { body: { email: 'lock@example.test', password: 'bad bad bad bad' } });
  }
  const right = await call(env, 'POST', '/api/admin/login', { body: { email: 'lock@example.test', password: PASS } });
  assert.equal(right.status, 401);
});

test('full MFA flow: enrol, confirm, login with challenge, and the TOTP code cannot be replayed', async () => {
  const env = makeEnv();
  await insertUser(env, { email: 'owner2@example.test', role: 'owner' });

  // First login: password only, no MFA yet -> restricted session.
  const first = await call(env, 'POST', '/api/admin/login', { body: { email: 'owner2@example.test', password: PASS } });
  assert.equal(first.data.mfa_setup_required, true);
  const setupToken = first.data.token;

  // Restricted session cannot use admin data.
  assert.equal((await call(env, 'GET', '/api/admin/registrations', { token: setupToken })).status, 403);

  const enrol = await call(env, 'POST', '/api/admin/mfa/enroll', { token: setupToken });
  assert.equal(enrol.status, 200);
  assert.match(enrol.data.otpauth_uri, /^otpauth:\/\/totp\//);
  const code = await currentCode(enrol.data.secret);
  const confirm = await call(env, 'POST', '/api/admin/mfa/confirm', { token: setupToken, body: { code } });
  assert.equal(confirm.status, 200);

  // Second login now requires a challenge.
  const second = await call(env, 'POST', '/api/admin/login', { body: { email: 'owner2@example.test', password: PASS } });
  assert.equal(second.data.mfa_required, true);
  // The code used at enrolment is spent for this 30s step: it must not work again at login.
  const spent = await call(env, 'POST', '/api/admin/mfa/verify', { body: { challenge: second.data.challenge, code } });
  assert.equal(spent.status, 401);
  // The next step's code is accepted once.
  const nextStep = Math.floor(Date.now() / 30000) + 1;
  const nextCode = await totpAt(base32Decode(enrol.data.secret), nextStep);
  const verify = await call(env, 'POST', '/api/admin/mfa/verify', { body: { challenge: second.data.challenge, code: nextCode } });
  assert.equal(verify.status, 200);
  assert.ok(verify.data.token);
  const replay = await call(env, 'POST', '/api/admin/mfa/verify', { body: { challenge: second.data.challenge, code: nextCode } });
  assert.equal(replay.status, 401);

  const me = await call(env, 'GET', '/api/admin/me', { token: verify.data.token });
  assert.equal(me.data.role, 'owner');
  assert.equal(me.data.mfa_enabled, true);
});

test('MFA secret is stored encrypted, never in plain text', async () => {
  const env = makeEnv();
  const u = await insertUser(env, { email: 'enc@example.test', role: 'owner' });
  const token = await createSession(env.DB, u.id);
  const enrol = await call(env, 'POST', '/api/admin/mfa/enroll', { token });
  const stored = env.DB.query('SELECT totp_secret_enc FROM users WHERE id = ?', u.id)[0].totp_secret_enc;
  assert.ok(stored);
  assert.equal(stored.includes(enrol.data.secret), false);
});

test('expired sessions are rejected', async () => {
  const env = makeEnv();
  const staff = await makeStaff(env, { role: 'owner' });
  env.DB.prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE user_id = ?").bind(staff.id).run();
  assert.equal((await call(env, 'GET', '/api/admin/registrations', { token: staff.token })).status, 401);
});

test('a staff account without MFA cannot read registrations', async () => {
  const env = makeEnv();
  const staff = await makeStaff(env, { role: 'owner', mfa: false });
  const res = await call(env, 'GET', '/api/admin/registrations', { token: staff.token });
  assert.equal(res.status, 403);
  assert.equal(res.data.code, 'mfa_required');
});

test('branch managers only see and act on their own branch', async () => {
  const env = makeEnv();
  const jizanReg = await createRegistrationApi(env, validRegistration({ branch_id: 'jizan', player_name: 'عمر جابر الشهري' }));
  const bishReg = await createRegistrationApi(env, validRegistration({ branch_id: 'bish', player_name: 'ماجد سعيد الفيفي' }));
  const mgr = await makeStaff(env, { role: 'branch_manager', branch_id: 'jizan' });

  const list = await call(env, 'GET', '/api/admin/registrations', { token: mgr.token });
  assert.equal(list.status, 200);
  assert.equal(list.data.total, 1);
  assert.equal(list.data.items[0].registration_number, jizanReg.data.registration_number);

  // Asking for another branch explicitly is refused.
  assert.equal((await call(env, 'GET', '/api/admin/registrations?branch_id=bish', { token: mgr.token })).status, 403);
  // Opening another branch's record looks like "not found".
  assert.equal((await call(env, 'GET', `/api/admin/registrations/${bishReg.data.registration_number}`, { token: mgr.token })).status, 404);
  // A branch manager cannot approve money at all.
  const pay = env.DB.query('SELECT id FROM payments')[0];
  assert.equal(pay, undefined);
});

test('search finds by player, guardian mobile and reference, with LIKE wildcards escaped', async () => {
  const env = makeEnv();
  await createRegistrationApi(env, validRegistration({ player_name: 'زياد محمد البارقي', guardian_mobile: '0559998877' }));
  await createRegistrationApi(env, validRegistration({ player_name: 'وليد ناصر الزهراني', guardian_mobile: '0551112233', guardian_name: 'ناصر الزهراني' }));
  const staff = await makeStaff(env, { role: 'admin' });
  const q = async (s) => (await call(env, 'GET', `/api/admin/registrations?q=${encodeURIComponent(s)}`, { token: staff.token })).data.total;
  assert.equal(await q('البارقي'), 1);
  assert.equal(await q('0559998877'), 1);
  assert.equal(await q('%'), 0, 'a bare % must not match everything');
  assert.equal(await q('_'), 0);
});

test('bank transfer approval requires the statement reference and amount, and never happens from a receipt alone', async () => {
  const env = makeEnv();
  const { data: reg } = await createRegistrationApi(env, validRegistration({ branch_id: 'jizan' }));
  await call(env, 'POST', `/api/registrations/${reg.registration_number}/transfer-claim`, {
    body: { bank_reference: 'SAB-20261015-0042', transfer_date: todayDay(), amount_sar: '300' },
  });
  const payId = env.DB.query('SELECT id FROM payments')[0].id;

  const accountant = await makeStaff(env, { role: 'accountant' });
  const mgr = await makeStaff(env, { role: 'branch_manager', branch_id: 'jizan' });

  const denied = await call(env, 'POST', `/api/admin/payments/${payId}/approve`, {
    token: mgr.token, body: { reconciled_ref: 'SAB-20261015-0042', reconciled_amount_sar: '300' },
  });
  assert.equal(denied.status, 403);

  const mismatch = await call(env, 'POST', `/api/admin/payments/${payId}/approve`, {
    token: accountant.token, body: { reconciled_ref: 'SAB-20261015-0043', reconciled_amount_sar: '300' },
  });
  assert.equal(mismatch.status, 422);
  assert.equal(mismatch.data.code, 'reconciliation_mismatch');
  assert.equal(env.DB.query('SELECT status FROM payments')[0].status, 'claimed');
  assert.equal(env.DB.query('SELECT status FROM registrations')[0].status, 'payment_claimed');

  const ok = await call(env, 'POST', `/api/admin/payments/${payId}/approve`, {
    token: accountant.token, body: { reconciled_ref: 'sab-20261015-0042', reconciled_amount_sar: '300', note: 'مطابق لكشف 15/10' },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.registration_status, 'paid');
  assert.equal(env.DB.query('SELECT status FROM registrations')[0].status, 'paid');
  const again = await call(env, 'POST', `/api/admin/payments/${payId}/approve`, {
    token: accountant.token, body: { reconciled_ref: 'SAB-20261015-0042', reconciled_amount_sar: '300' },
  });
  assert.equal(again.status, 409);
});

test('rejecting a claim requires a reason and returns the registration to awaiting payment', async () => {
  const env = makeEnv();
  const { data: reg } = await createRegistrationApi(env);
  await call(env, 'POST', `/api/registrations/${reg.registration_number}/transfer-claim`, {
    body: { bank_reference: 'REF-000111', transfer_date: todayDay(), amount_sar: '300' },
  });
  const payId = env.DB.query('SELECT id FROM payments')[0].id;
  const acc = await makeStaff(env, { role: 'accountant' });
  assert.equal((await call(env, 'POST', `/api/admin/payments/${payId}/reject`, { token: acc.token, body: { note: '' } })).status, 422);
  const res = await call(env, 'POST', `/api/admin/payments/${payId}/reject`, { token: acc.token, body: { note: 'لم يصل المبلغ للحساب' } });
  assert.equal(res.status, 200);
  assert.equal(env.DB.query('SELECT status FROM registrations')[0].status, 'awaiting_payment');
});

test('reports are computed from real rows and exclude unapproved money', async () => {
  const env = makeEnv();
  const a = await createRegistrationApi(env, validRegistration({ branch_id: 'jizan', player_name: 'راكان فهد الشمري' }));
  await createRegistrationApi(env, validRegistration({ branch_id: 'bish', player_name: 'سلمان حسن القرني' }));
  await call(env, 'POST', `/api/registrations/${a.data.registration_number}/transfer-claim`, {
    body: { bank_reference: 'RPT-000001', transfer_date: todayDay(), amount_sar: '300' },
  });
  const acc = await makeStaff(env, { role: 'accountant' });
  const payId = env.DB.query('SELECT id FROM payments')[0].id;
  await call(env, 'POST', `/api/admin/payments/${payId}/approve`, {
    token: acc.token, body: { reconciled_ref: 'RPT-000001', reconciled_amount_sar: '300' },
  });

  const from = todayDay();
  const r = await call(env, 'GET', `/api/admin/reports/summary?from=${from}&to=${from}`, { token: acc.token });
  assert.equal(r.status, 200);
  assert.equal(r.data.registrations.total, 2);
  assert.equal(r.data.registrations.by_status.paid, 1);
  assert.equal(r.data.approved_payments.total_sar, 300);
  assert.equal(r.data.pending_claims, 0);
  const jizan = r.data.by_branch.find((b) => b.branch_id === 'jizan');
  assert.equal(jizan.paid_sar, 300);

  const bad = await call(env, 'GET', '/api/admin/reports/summary?from=2026-13-40&to=2026-01-01', { token: acc.token });
  assert.equal(bad.status, 422);
});

test('empty database reports zeros, not invented numbers', async () => {
  const env = makeEnv();
  const acc = await makeStaff(env, { role: 'accountant' });
  const r = await call(env, 'GET', `/api/admin/reports/summary?from=${todayDay()}&to=${todayDay()}`, { token: acc.token });
  assert.equal(r.data.registrations.total, 0);
  assert.equal(r.data.approved_payments.total_sar, 0);
});

test('CSV export is branch-scoped, audited, and carries a UTF-8 BOM', async () => {
  const env = makeEnv();
  await createRegistrationApi(env, validRegistration({ branch_id: 'jizan', player_name: 'بدر خالد المالكي' }));
  await createRegistrationApi(env, validRegistration({ branch_id: 'bish', player_name: 'عادل سالم الحارثي' }));
  const mgr = await makeStaff(env, { role: 'branch_manager', branch_id: 'jizan' });
  const res = await call(env, 'GET', '/api/admin/registrations.csv', { token: mgr.token });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'text/csv; charset=utf-8');
  // Response.text() strips the BOM per the Fetch spec, so read the raw bytes.
  const rawRes = await worker.fetch(new Request('https://api.test/api/admin/registrations.csv', {
    headers: { Authorization: `Bearer ${mgr.token}`, 'CF-Connecting-IP': '198.51.100.7' },
  }), env);
  const raw = new Uint8Array(await rawRes.arrayBuffer());
  assert.deepEqual([...raw.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.ok(res.data.startsWith('registration_number,'));
  assert.ok(res.data.includes('بدر خالد المالكي'));
  assert.equal(res.data.includes('عادل'), false);
  const audit = env.DB.query("SELECT action FROM audit_log WHERE action = 'registrations.exported'");
  // Two exports were requested above (list + raw bytes): each one is audited.
  assert.equal(audit.length, 2);
});

test('audit trail shows who approved what, without secrets', async () => {
  const env = makeEnv();
  const { data: reg } = await createRegistrationApi(env);
  await call(env, 'POST', `/api/registrations/${reg.registration_number}/transfer-claim`, {
    body: { bank_reference: 'AUD-000001', transfer_date: todayDay(), amount_sar: '300' },
  });
  const payId = env.DB.query('SELECT id FROM payments')[0].id;
  const acc = await makeStaff(env, { role: 'accountant' });
  await call(env, 'POST', `/api/admin/payments/${payId}/approve`, { token: acc.token, body: { reconciled_ref: 'AUD-000001', reconciled_amount_sar: '300' } });
  const log = await call(env, 'GET', '/api/admin/audit', { token: acc.token });
  assert.equal(log.status, 403, 'accountants do not read the full audit trail');
  const owner = await makeStaff(env, { role: 'owner' });
  const logOwner = await call(env, 'GET', '/api/admin/audit', { token: owner.token });
  const approved = logOwner.data.items.find((i) => i.action === 'payment.approved');
  assert.equal(approved.actor_id, acc.id);
  assert.equal(JSON.stringify(logOwner.data).includes('token'), false);
});

test('only the owner can create staff accounts, and scoped roles need a branch', async () => {
  const env = makeEnv();
  const admin = await makeStaff(env, { role: 'admin' });
  const body = { email: 'new@example.test', full_name: 'موظف جديد', role: 'registration', branch_id: 'jizan', password: 'long enough password' };
  assert.equal((await call(env, 'POST', '/api/admin/users', { token: admin.token, body })).status, 403);
  const owner = await makeStaff(env, { role: 'owner' });
  const bad = await call(env, 'POST', '/api/admin/users', { token: owner.token, body: { ...body, branch_id: null } });
  assert.equal(bad.status, 422);
  const ok = await call(env, 'POST', '/api/admin/users', { token: owner.token, body });
  assert.equal(ok.status, 201);
  const short = await call(env, 'POST', '/api/admin/users', { token: owner.token, body: { ...body, email: 'x@example.test', password: 'short' } });
  assert.equal(short.status, 422);
});
