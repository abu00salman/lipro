// Staff authentication: password (PBKDF2-SHA256) + TOTP MFA (RFC 6238) + opaque
// session tokens stored only as SHA-256 hashes. No cookies are used, so CSRF
// does not apply to the Bearer-token API.
import { ApiError, bytesToBase64Url, nowIso, randomToken, sha256Hex, timingSafeEqual } from './util.js';

export const PBKDF2_ITERATIONS = 100000; // Workers' maximum for PBKDF2
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MS = 15 * 60 * 1000;

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = {
  enc: (bytes) => btoa(String.fromCharCode(...bytes)),
  dec: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
};

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${b64.enc(salt)}$${b64.enc(hash)}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
  const iterations = Number(parts[1]);
  const hash = await pbkdf2(password, b64.dec(parts[2]), iterations);
  return timingSafeEqual(b64.enc(hash), parts[3]);
}

// ---------- Base32 + TOTP ----------

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes) {
  let bits = 0, value = 0, out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export async function totpAt(secretBytes, step) {
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const counter = new Uint8Array(8);
  new DataView(counter.buffer).setUint32(4, step >>> 0); // 32-bit step is enough until 2106
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter));
  const offset = mac[mac.length - 1] & 0x0f;
  const bin =
    ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 1000000).padStart(6, '0');
}

/**
 * Checks a 6-digit code with ±1 step tolerance. Returns the matched step, or null.
 * Steps at or before `lastStep` are rejected to prevent code replay.
 */
export async function verifyTotp(secretBytes, code, lastStep, nowMs = Date.now()) {
  if (!/^\d{6}$/.test(String(code))) return null;
  const step = Math.floor(nowMs / 30000);
  for (const s of [step - 1, step, step + 1]) {
    if (s <= lastStep) continue;
    if (timingSafeEqual(await totpAt(secretBytes, s), String(code))) return s;
  }
  return null;
}

export function newTotpSecret() {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

export function otpauthUri(secretB32, email, issuer = 'Lipro Academy Manager') {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ---------- Encryption of TOTP secrets at rest (AES-GCM) ----------

async function aesKey(env) {
  const raw = b64.dec(env.MFA_ENCRYPTION_KEY || '');
  if (raw.length !== 32) throw new Error('MFA_ENCRYPTION_KEY must be 32 random bytes, base64-encoded');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(env, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), enc.encode(plaintext)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return b64.enc(out);
}

export async function decryptSecret(env, stored) {
  const all = b64.dec(stored);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, await aesKey(env), all.slice(12));
  return dec.decode(pt);
}

// ---------- MFA challenge + sessions ----------

async function hmacKey(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be >= 32 chars');
  return crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

/** Short-lived signed token that proves the password step succeeded. */
export async function issueMfaChallenge(env, userId, nowMs = Date.now()) {
  const payload = `${userId}.${nowMs + MFA_CHALLENGE_TTL_MS}`;
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(payload)));
  return `${payload}.${bytesToBase64Url(sig)}`;
}

export async function readMfaChallenge(env, token, nowMs = Date.now()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(`${userId}.${exp}`)));
  if (!timingSafeEqual(bytesToBase64Url(expected), sig)) return null;
  if (Number(exp) < nowMs) return null;
  return Number(userId);
}

export async function createSession(db, userId, nowMs = Date.now()) {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  await db
    .prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(tokenHash, userId, nowIso(new Date(nowMs + SESSION_TTL_MS)))
    .run();
  return token;
}

/** Resolves a Bearer token to an active user, or throws 401. */
export async function requireUser(db, request, nowMs = Date.now()) {
  const header = request.headers.get('Authorization') || '';
  const m = /^Bearer ([A-Za-z0-9_-]{20,128})$/.exec(header);
  if (!m) throw new ApiError(401, 'unauthenticated', 'سجّل الدخول أولًا.');
  const tokenHash = await sha256Hex(m[1]);
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.full_name, u.role, u.branch_id, u.active, u.mfa_enabled, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?`
    )
    .bind(tokenHash)
    .first();
  if (!row || !row.active || row.expires_at <= nowIso(new Date(nowMs))) {
    throw new ApiError(401, 'unauthenticated', 'انتهت الجلسة، سجّل الدخول من جديد.');
  }
  return { id: row.id, email: row.email, full_name: row.full_name, role: row.role, branch_id: row.branch_id, mfa_enabled: !!row.mfa_enabled, tokenHash };
}

/** Constant-work login failure to avoid revealing which step failed. */
export const INVALID_LOGIN = new ApiError(401, 'invalid_credentials', 'البريد أو كلمة المرور غير صحيحة.');
