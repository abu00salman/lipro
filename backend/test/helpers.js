import { randomBytes } from 'node:crypto';
import { D1Test } from './d1.js';
import worker from '../src/index.js';
import { createSession, hashPassword, base32Decode, totpAt } from '../src/auth.js';

export const ORIGIN = 'https://liproacademy.com';

export function makeEnv() {
  const db = new D1Test().migrate();
  return {
    DB: db,
    ALLOWED_ORIGINS: `${ORIGIN},https://www.liproacademy.com`,
    SESSION_SECRET: randomBytes(32).toString('base64url'),
    MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    IP_HASH_SALT: 'test-salt',
  };
}

let ipCounter = 0;
/** Calls the Worker. Each call gets a unique client IP unless one is given. */
export async function call(env, method, path, { body, token, key, ip, headers = {}, raw } = {}) {
  const h = { 'CF-Connecting-IP': ip || `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`, ...headers };
  if ((body !== undefined || raw !== undefined) && !h['Content-Type']) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = `Bearer ${token}`;
  if (key) h['Idempotency-Key'] = key;
  const res = await worker.fetch(
    new Request(`https://api.test${path}`, {
      method,
      headers: h,
      body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
    }),
    env,
  );
  const ct = res.headers.get('Content-Type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data, headers: res.headers };
}

export function validRegistration(overrides = {}) {
  return {
    program_id: 'monthly',
    branch_id: 'jizan',
    player_name: 'يوسف أحمد الحربي',
    player_dob: '2016-05-01',
    gender: 'male',
    nationality: 'سعودي',
    school: 'مدرسة الأمل',
    preferred_position: 'striker',
    jersey_size: 'M',
    guardian_name: 'أحمد الحربي',
    relationship: 'father',
    guardian_mobile: '0551234567',
    guardian_email: 'parent.example@example.com',
    terms_accepted: true,
    payment_method: 'bank_transfer',
    ...overrides,
  };
}

export const todayDay = () => new Date().toISOString().slice(0, 10);

/** Inserts an active staff user with MFA enabled and returns a live session token. */
export async function makeStaff(env, { role, branch_id = null, email, mfa = true }) {
  const res = await env.DB
    .prepare('INSERT INTO users (email, full_name, role, branch_id, password_hash, mfa_enabled) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(email || `${role}-${Math.random().toString(36).slice(2, 8)}@example.test`, 'موظف تجريبي', role, branch_id, await hashPassword('correct horse battery'), mfa ? 1 : 0)
    .first();
  const token = await createSession(env.DB, res.id);
  return { id: res.id, token };
}

export async function createRegistrationApi(env, body = validRegistration(), key = randomBytes(12).toString('hex')) {
  const res = await call(env, 'POST', '/api/registrations', { body, key });
  return { ...res, key };
}

export { base32Decode, totpAt };
