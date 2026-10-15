import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { makeEnv, call, validRegistration, createRegistrationApi, todayDay } from './helpers.js';

test('health and config serve real branches and programs with SAR prices', async () => {
  const env = makeEnv();
  assert.equal((await call(env, 'GET', '/api/health')).status, 200);
  const cfg = await call(env, 'GET', '/api/config');
  assert.equal(cfg.status, 200);
  assert.equal(cfg.data.branches.length, 6);
  assert.equal(cfg.data.programs.length, 4);
  const monthly = cfg.data.programs.find((p) => p.id === 'monthly');
  assert.equal(monthly.price_sar, 300);
  assert.equal(monthly.desc.length > 0, true);
  assert.equal(cfg.data.publishable_key, '');
});

test('registration requires an Idempotency-Key', async () => {
  const env = makeEnv();
  const res = await call(env, 'POST', '/api/registrations', { body: validRegistration() });
  assert.equal(res.status, 400);
  assert.equal(res.data.code, 'idempotency_key_required');
});

test('a valid registration is stored and returns a server-priced reference', async () => {
  const env = makeEnv();
  // Client tries to lower the price: the server must ignore it.
  const res = await createRegistrationApi(env, validRegistration({ amount_sar: 1, price_sar: 1 }));
  assert.equal(res.status, 201);
  assert.match(res.data.registration_number, /^LPA-\d{4}-[A-Z2-9]{5}$/);
  assert.equal(res.data.amount_sar, 300);
  assert.equal(res.data.status, 'awaiting_payment');
  const rows = env.DB.query('SELECT amount_halala, status FROM registrations');
  assert.deepEqual(rows, [{ amount_halala: 30000, status: 'awaiting_payment' }]);
});

test('retrying with the same Idempotency-Key returns the same reference and creates no duplicate', async () => {
  const env = makeEnv();
  const key = randomBytes(16).toString('hex');
  const first = await call(env, 'POST', '/api/registrations', { body: validRegistration(), key });
  const second = await call(env, 'POST', '/api/registrations', { body: validRegistration(), key });
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.data.registration_number, first.data.registration_number);
  assert.equal(env.DB.query('SELECT COUNT(*) AS n FROM players')[0].n, 1);
  assert.equal(env.DB.query('SELECT COUNT(*) AS n FROM registrations')[0].n, 1);
});

test('the same key with a different payload is a conflict, not a silent overwrite', async () => {
  const env = makeEnv();
  const key = randomBytes(16).toString('hex');
  await call(env, 'POST', '/api/registrations', { body: validRegistration(), key });
  const other = await call(env, 'POST', '/api/registrations', { body: validRegistration({ player_name: 'خالد سعد العتيبي' }), key });
  assert.equal(other.status, 409);
  assert.equal(other.data.code, 'idempotency_conflict');
});

test('one guardian with several children reuses a single guardian row', async () => {
  const env = makeEnv();
  await createRegistrationApi(env, validRegistration({ player_name: 'يوسف أحمد الحربي' }));
  await createRegistrationApi(env, validRegistration({ player_name: 'سعد أحمد الحربي', player_dob: '2014-03-03' }));
  assert.equal(env.DB.query('SELECT COUNT(*) AS n FROM guardians')[0].n, 1);
  const kids = env.DB.query('SELECT COUNT(DISTINCT guardian_id) AS g, COUNT(*) AS n FROM players');
  assert.deepEqual(kids, [{ g: 1, n: 2 }]);
});

test('a public form cannot overwrite an existing guardian’s name or email', async () => {
  const env = makeEnv();
  await createRegistrationApi(env, validRegistration({ guardian_name: 'أحمد الحربي', guardian_email: 'real@example.com' }));
  await createRegistrationApi(env, validRegistration({ guardian_name: 'محتال تجريبي', guardian_email: 'evil@example.com', player_name: 'فيصل علي القحطاني' }));
  const g = env.DB.query('SELECT full_name, email FROM guardians')[0];
  assert.equal(g.full_name, 'أحمد الحربي');
  assert.equal(g.email, 'real@example.com');
});

test('invalid input returns field errors and writes nothing', async () => {
  const env = makeEnv();
  const res = await createRegistrationApi(env, validRegistration({ player_dob: '2030-01-01', guardian_mobile: '12345', terms_accepted: false }));
  assert.equal(res.status, 422);
  assert.ok(res.data.errors.player_dob);
  assert.ok(res.data.errors.guardian_mobile);
  assert.ok(res.data.errors.terms_accepted);
  // An unknown program passes shape validation, then fails the database lookup.
  const unknown = await createRegistrationApi(env, validRegistration({ program_id: 'free' }));
  assert.equal(unknown.status, 422);
  assert.equal(unknown.data.errors.program_id, 'البرنامج غير متاح.');
  assert.equal(env.DB.query('SELECT COUNT(*) AS n FROM players')[0].n, 0);
});

test('JSON content type and body size are enforced', async () => {
  const env = makeEnv();
  const bad = await call(env, 'POST', '/api/registrations', { raw: '{"a":1}', key: 'k'.repeat(20), headers: { 'Content-Type': 'text/plain' } });
  assert.equal(bad.status, 415);
  const big = await call(env, 'POST', '/api/registrations', { raw: JSON.stringify({ x: 'a'.repeat(20000) }), key: 'k'.repeat(20) });
  assert.equal(big.status, 413);
});

test('public rate limit blocks bursts from one client', async () => {
  const env = makeEnv();
  const ip = '203.0.113.9';
  let last;
  for (let i = 0; i < 11; i++) {
    last = await createRegistrationApi(env, validRegistration({ player_name: `لاعب ${i} تجريبي` }));
    last = await call(env, 'POST', '/api/registrations', { body: validRegistration(), key: randomBytes(12).toString('hex'), ip });
  }
  assert.equal(last.status, 429);
  assert.ok(last.headers.get('Retry-After'));
});

test('status lookup exposes only non-personal fields and rejects malformed references', async () => {
  const env = makeEnv();
  const { data } = await createRegistrationApi(env);
  const res = await call(env, 'GET', `/api/registrations/${data.registration_number}`);
  assert.equal(res.status, 200);
  assert.equal(res.data.registration.registration_status, 'pending_payment');
  assert.equal(res.data.registration.branch_name, 'ليبرو جيزان');
  assert.equal(JSON.stringify(res.data).includes('يوسف'), false, 'no player name on the public page');
  assert.equal(JSON.stringify(res.data).includes('0551234567'), false, 'no guardian mobile on the public page');
  assert.equal((await call(env, 'GET', '/api/registrations/LPA-2026-AAAAA')).status, 404);
  assert.equal((await call(env, 'GET', '/api/registrations/../../etc')).status, 404);
});

test('phone lookup endpoint is removed', async () => {
  const env = makeEnv();
  assert.equal((await call(env, 'GET', '/api/lookup/0551234567')).status, 410);
});

test('CORS allows only the configured origins', async () => {
  const env = makeEnv();
  const ok = await call(env, 'GET', '/api/config', { headers: { Origin: 'https://liproacademy.com' } });
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://liproacademy.com');
  const bad = await call(env, 'GET', '/api/config', { headers: { Origin: 'https://evil.example' } });
  assert.equal(bad.headers.get('Access-Control-Allow-Origin'), null);
});

test('transfer claim records a claim only, never money, and rejects wrong amounts and duplicates', async () => {
  const env = makeEnv();
  const { data } = await createRegistrationApi(env);
  const url = `/api/registrations/${data.registration_number}/transfer-claim`;
  const wrong = await call(env, 'POST', url, { body: { bank_reference: 'TRF-99871', transfer_date: todayDay(), amount_sar: '250' } });
  assert.equal(wrong.status, 422);
  assert.equal(wrong.data.code, 'amount_mismatch');

  const ok = await call(env, 'POST', url, { body: { bank_reference: 'trf-99871', transfer_date: todayDay(), amount_sar: '300' } });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.status, 'payment_claimed');
  assert.equal(env.DB.query("SELECT status, bank_reference FROM payments")[0].status, 'claimed');
  assert.equal(env.DB.query('SELECT status FROM registrations')[0].status, 'payment_claimed');

  const dup = await call(env, 'POST', url, { body: { bank_reference: 'TRF-99871', transfer_date: todayDay(), amount_sar: '300' } });
  assert.equal(dup.status, 409);
  const future = await call(env, 'POST', url, { body: { bank_reference: 'TRF-11111', transfer_date: '2999-01-01', amount_sar: '300' } });
  assert.equal(future.status, 422);
});

test('audit log records the registration without raw personal data', async () => {
  const env = makeEnv();
  await createRegistrationApi(env, validRegistration({ player_name: 'تركي ناصر الغامدي' }));
  const rows = env.DB.query("SELECT action, meta_json FROM audit_log WHERE action = 'registration.created'");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].meta_json.includes('تركي'), false);
  assert.equal(rows[0].meta_json.includes('0551234567'), false);
});
