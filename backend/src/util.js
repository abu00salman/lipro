// Shared helpers: responses, errors, hashing, encoding. Uses only Web Crypto,
// so the same code runs in Cloudflare Workers and in Node (tests).

export class ApiError extends Error {
  constructor(status, code, message, errors, headers) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
    this.headers = headers || {};
  }
}

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...extraHeaders },
  });
}

export const nowIso = (d = new Date()) => d.toISOString();

const enc = new TextEncoder();

export function bytesToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(input) {
  const data = typeof input === 'string' ? enc.encode(input) : input;
  return bytesToHex(await crypto.subtle.digest('SHA-256', data));
}

export function bytesToBase64Url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken(byteLength = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** Constant-time string comparison (both inputs must be ASCII/UTF-8 strings). */
export function timingSafeEqual(a, b) {
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Converts Arabic-Indic and Persian digits to ASCII digits. */
export function toAsciiDigits(v) {
  return String(v ?? '')
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06F0));
}

/** Reads a JSON body with a hard size limit and a strict content type. */
export async function readJson(request, maxBytes = 16 * 1024) {
  const type = request.headers.get('Content-Type') || '';
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'unsupported_media_type', 'يجب إرسال الطلب بصيغة JSON.');
  }
  const text = await request.text();
  if (text.length > maxBytes) throw new ApiError(413, 'payload_too_large', 'حجم الطلب كبير جدًا.');
  try {
    const body = JSON.parse(text || 'null');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('shape');
    return body;
  } catch {
    throw new ApiError(400, 'invalid_json', 'صيغة الطلب غير صحيحة.');
  }
}
