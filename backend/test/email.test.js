import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call } from './helpers.js';
import { hashPassword, encryptSecret, newTotpSecret } from '../src/auth.js';

const PASS = 'correct horse battery';

/** Replaces Resend's endpoint with a recorder. Restores fetch when the test is done. */
function stubResend() {
  const sent = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url) !== 'https://api.resend.com/emails') return real(url, init);
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
  };
  return { sent, restore: () => { globalThis.fetch = real; } };
}

function emailEnv() {
  return { ...makeEnv(), RESEND_API_KEY: 're_test_key', MAIL_FROM: 'Lipro <no-reply@liproacademy.com>' };
}

/** Owner with MFA enrolled (encrypted TOTP secret), and a fresh MFA challenge from password login. */
async function mfaUserChallenge(env) {
  const secret = newTotpSecret();
  await env.DB
    .prepare("INSERT INTO users (email, full_name, role, password_hash, mfa_enabled, totp_secret_enc) VALUES ('owner@example.test', 'مالك تجريبي', 'owner', ?, 1, ?)")
    .bind(await hashPassword(PASS), await encryptSecret(env, secret))
    .run();
  const login = await call(env, 'POST', '/api/admin/login', { body: { email: 'owner@example.test', password: PASS } });
  assert.equal(login.data.mfa_required, true);
  return login.data.challenge;
}

function codeFrom(sent) {
  const m = /رمز الدخول: (\d{6})/.exec(sent[sent.length - 1].text);
  assert.ok(m, 'email contains the code');
  return m[1];
}

test('email codes are refused with 503 until the mail provider is configured', async () => {
  const env = makeEnv();
  const challenge = await mfaUserChallenge(env);
  const res = await call(env, 'POST', '/api/admin/mfa/email-code', { body: { challenge } });
  assert.equal(res.status, 503);
  assert.equal(res.data.code, 'email_not_configured');
});

test('email code: sent to the account, accepted once, and stored only as a hash', async () => {
  const env = emailEnv();
  const stub = stubResend();
  try {
    const challenge = await mfaUserChallenge(env);
    const req = await call(env, 'POST', '/api/admin/mfa/email-code', { body: { challenge } });
    assert.equal(req.status, 200);
    assert.equal(stub.sent.length, 1);
    assert.deepEqual(stub.sent[0].to, ['owner@example.test']);

    const code = codeFrom(stub.sent);
    const stored = env.DB.query('SELECT code_hash FROM email_login_codes')[0].code_hash;
    assert.equal(stored.includes(code), false, 'the code itself is not stored');

    const ok = await call(env, 'POST', '/api/admin/mfa/verify', { body: { challenge, code } });
    assert.equal(ok.status, 200);
    assert.ok(ok.data.token);

    const again = await call(env, 'POST', '/api/admin/mfa/verify', { body: { challenge, code } });
    assert.equal(again.status, 401, 'a used code cannot log in twice');
  } finally { stub.restore(); }
});

test('email code: wrong guesses are capped, and an expired code is refused', async () => {
  const env = emailEnv();
  const stub = stubResend();
  try {
    const challenge = await mfaUserChallenge(env);
    await call(env, 'POST', '/api/admin/mfa/email-code', { body: { challenge } });
    const code = codeFrom(stub.sent);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      assert.equal((await call(env, 'POST', '/api/admin/mfa/verify', { body: { challenge, code: wrong } })).status, 401);
    }
    // After five wrong guesses the verify route is rate-limited, so the right code is refused too.
    assert.equal((await call(env, 'POST', '/api/admin/mfa/verify', { body: { challenge, code } })).status, 429);
  } finally { stub.restore(); }

  const env2 = emailEnv();
  const stub2 = stubResend();
  try {
    const challenge = await mfaUserChallenge(env2);
    await call(env2, 'POST', '/api/admin/mfa/email-code', { body: { challenge } });
    const code = codeFrom(stub2.sent);
    env2.DB.prepare("UPDATE email_login_codes SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    assert.equal((await call(env2, 'POST', '/api/admin/mfa/verify', { body: { challenge, code } })).status, 401);
  } finally { stub2.restore(); }
});

test('authenticator codes still work alongside email codes', async () => {
  const env = emailEnv();
  const secret = newTotpSecret();
  await env.DB
    .prepare("INSERT INTO users (email, full_name, role, password_hash, mfa_enabled, totp_secret_enc) VALUES ('owner@example.test', 'مالك', 'owner', ?, 1, ?)")
    .bind(await hashPassword(PASS), await encryptSecret(env, secret))
    .run();
  const login = await call(env, 'POST', '/api/admin/login', { body: { email: 'owner@example.test', password: PASS } });
  const { totpAt, base32Decode } = await import('../src/auth.js');
  const next = Math.floor(Date.now() / 30000) + 1;
  const code = await totpAt(base32Decode(secret), next);
  const res = await call(env, 'POST', '/api/admin/mfa/verify', { body: { challenge: login.data.challenge, code } });
  assert.equal(res.status, 200);
});
