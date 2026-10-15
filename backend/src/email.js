// Email login codes. Sending uses Resend (https://resend.com) through its HTTP API.
// Secrets needed: RESEND_API_KEY and MAIL_FROM (a sender on a domain you verified in Resend).
// Without them the email option stays off and the API returns 503.
import { ApiError, nowIso, sha256Hex } from './util.js';

export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;

export function emailConfigured(env) {
  return Boolean(env.RESEND_API_KEY && env.MAIL_FROM);
}

export async function sendEmail(env, { to, subject, text }) {
  if (!emailConfigured(env)) throw new ApiError(503, 'email_not_configured', 'خدمة البريد غير مفعّلة بعد.');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text }),
  });
  if (!res.ok) {
    console.log('EMAIL_SEND_FAILED status=' + res.status); // status only: never log the body or the code
    throw new ApiError(502, 'email_failed', 'تعذّر إرسال رمز الدخول، حاول مرة أخرى.');
  }
}

export function codeHash(env, userId, code) {
  return sha256Hex(`${env.SESSION_SECRET}:${userId}:${code}`);
}

export function newEmailCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, '0');
}

/** Returns true and consumes the code when it matches a live, unexpired entry. */
export async function consumeEmailCode(db, env, userId, code, nowMs = Date.now()) {
  const row = await db.prepare('SELECT code_hash, expires_at, attempts FROM email_login_codes WHERE user_id = ?').bind(userId).first();
  if (!row || row.expires_at <= nowIso(new Date(nowMs)) || row.attempts >= EMAIL_CODE_MAX_ATTEMPTS) return false;
  const ok = (await codeHash(env, userId, code)) === row.code_hash;
  if (!ok) {
    await db.prepare('UPDATE email_login_codes SET attempts = attempts + 1 WHERE user_id = ?').bind(userId).run();
    return false;
  }
  await db.prepare('DELETE FROM email_login_codes WHERE user_id = ?').bind(userId).run();
  return true;
}
