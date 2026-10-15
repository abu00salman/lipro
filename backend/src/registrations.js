// Public registration endpoints. Prices come from the database, never from the
// client. Retries with the same Idempotency-Key never create a second player.
import { ApiError, json, nowIso, readJson, sha256Hex, toAsciiDigits } from './util.js';
import { validateRegistration, CONSENT_VERSION } from './validate.js';
import { hit } from './ratelimit.js';
import { writeAudit } from './audit.js';

export const halalaToSar = (h) => Number((h / 100).toFixed(2));

/** Converts a SAR amount typed by a guardian (e.g. "300" or "300.50") to whole halalas. */
export function sarToHalala(value) {
  const s = toAsciiDigits(value).trim().replace(',', '.');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

const sha = (v) => sha256Hex(v);

export async function ipHash(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
  return sha(`${env.IP_HASH_SALT || 'dev-only-salt'}|${ip.split(',')[0].trim()}`);
}

/** Random, unambiguous public reference: LPA-YYYY-XXXXX (no 0/O/1/I). */
export function newRegistrationNumber(date = new Date()) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `LPA-${date.getUTCFullYear()}-${out}`;
}

/** Canonical JSON (sorted keys) so the same logical payload always hashes the same. */
export function canonicalHash(obj) {
  const sorted = Object.keys(obj).sort().reduce((acc, k) => ((acc[k] = obj[k]), acc), {});
  return sha(JSON.stringify(sorted));
}

async function findProgramAndBranch(db, programId, branchId) {
  const program = await db.prepare('SELECT id, name, duration_label, price_halala FROM programs WHERE id = ? AND active = 1').bind(programId).first();
  const branch = await db.prepare('SELECT id, name FROM branches WHERE id = ? AND active = 1').bind(branchId).first();
  const errors = {};
  if (!program) errors.program_id = 'البرنامج غير متاح.';
  if (!branch) errors.branch_id = 'الفرع غير متاح.';
  if (Object.keys(errors).length) throw new ApiError(422, 'validation_failed', 'بعض الحقول غير صحيحة.', errors);
  return { program, branch };
}

function publicRegistration(row) {
  return {
    registration_number: row.registration_no,
    status: row.status,
    amount_sar: halalaToSar(row.amount_halala),
    currency: 'SAR',
    vat_included: true,
    program_id: row.program_id,
    branch_id: row.branch_id,
  };
}

export async function handleCreateRegistration(request, env) {
  const db = env.DB;
  const ip = await ipHash(request, env);
  await hit(db, `reg:${ip}`, 10, 3600);

  const key = request.headers.get('Idempotency-Key') || '';
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) {
    throw new ApiError(400, 'idempotency_key_required', 'مفتاح الطلب (Idempotency-Key) مطلوب.');
  }

  const body = await readJson(request);
  const values = validateRegistration(body);
  const { program, branch } = await findProgramAndBranch(db, values.program_id, values.branch_id);
  const requestHash = await canonicalHash({ ...values, program_id: program.id, branch_id: branch.id });

  // Replay: same key → same answer. Same key with a different payload → conflict.
  const existing = await db
    .prepare('SELECT registration_no, status, amount_halala, program_id, branch_id, request_hash FROM registrations WHERE idempotency_key = ?')
    .bind(key)
    .first();
  if (existing) {
    if (existing.request_hash !== requestHash) {
      throw new ApiError(409, 'idempotency_conflict', 'هذا المفتاح مستخدم لطلب آخر.');
    }
    return json(publicRegistration(existing), 200);
  }

  // Guardian: one row per mobile number, so one parent can register several children.
  // ON CONFLICT DO NOTHING: a public form must never overwrite an existing guardian's data.
  await db
    .prepare('INSERT INTO guardians (full_name, mobile, email) VALUES (?, ?, ?) ON CONFLICT (mobile) DO NOTHING')
    .bind(values.guardian_name, values.guardian_mobile, values.guardian_email || null)
    .run();
  const guardian = await db.prepare('SELECT id FROM guardians WHERE mobile = ?').bind(values.guardian_mobile).first();

  const amount = program.price_halala;
  const consentAt = nowIso();
  const ipH = ip;

  // Player + registration are written in one batch. The player insert is skipped if
  // the idempotency key already exists, so a race cannot leave an orphan player.
  let regNo = null;
  for (let attempt = 0; attempt < 3 && !regNo; attempt++) {
    const candidate = newRegistrationNumber();
    try {
      await db.batch([
        db
          .prepare(
            `INSERT INTO players (guardian_id, branch_id, full_name, dob, gender, nationality, school, position, jersey_size, experience)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
             WHERE NOT EXISTS (SELECT 1 FROM registrations WHERE idempotency_key = ?)`
          )
          .bind(guardian.id, branch.id, values.player_name, values.player_dob, values.gender || null,
            values.nationality || null, values.school || null, values.preferred_position || null,
            values.jersey_size || null, values.football_experience || null, key),
        db
          .prepare(
            `INSERT INTO registrations (registration_no, idempotency_key, request_hash, player_id, guardian_id, branch_id,
                                        program_id, amount_halala, status, consent_version, consent_at)
             VALUES (?, ?, ?, last_insert_rowid(), ?, ?, ?, ?, 'awaiting_payment', ?, ?)
             ON CONFLICT (idempotency_key) DO NOTHING`
          )
          .bind(candidate, key, requestHash, guardian.id, branch.id, program.id, amount, CONSENT_VERSION, consentAt),
      ]);
      regNo = candidate;
    } catch (err) {
      // A registration_no collision is astronomically rare; retry with a new number.
      if (!String(err && err.message).includes('registrations.registration_no')) throw err;
    }
  }
  if (!regNo) throw new ApiError(503, 'try_again', 'تعذّر إنشاء رقم التسجيل، حاول مرة أخرى.');

  const created = await db
    .prepare('SELECT registration_no, status, amount_halala, program_id, branch_id, request_hash FROM registrations WHERE idempotency_key = ?')
    .bind(key)
    .first();
  if (created.request_hash !== requestHash) throw new ApiError(409, 'idempotency_conflict', 'هذا المفتاح مستخدم لطلب آخر.');

  await writeAudit(db, {
    action: 'registration.created', entity: 'registration', entityId: created.registration_no,
    branchId: branch.id, meta: { program_id: program.id }, ipHash: ipH,
  });
  return json(publicRegistration(created), 201);
}

/** Public status lookup: only the reference number and non-personal status fields. */
export async function handleGetRegistration(request, env, regNo) {
  const ip = await ipHash(request, env);
  await hit(env.DB, `lookup:${ip}`, 30, 60);
  if (!/^LPA-\d{4}-[A-Z2-9]{5}$/.test(regNo)) throw new ApiError(404, 'not_found', 'رقم التسجيل غير موجود.');
  const row = await env.DB
    .prepare(
      `SELECT r.registration_no, r.status, r.amount_halala, r.program_id, r.branch_id, r.created_at,
              p.name AS program_name, b.name AS branch_name
         FROM registrations r
         JOIN programs p ON p.id = r.program_id
         JOIN branches b ON b.id = r.branch_id
        WHERE r.registration_no = ?`
    )
    .bind(regNo)
    .first();
  if (!row) throw new ApiError(404, 'not_found', 'رقم التسجيل غير موجود.');
  // Envelope and status names match the public status page (status/index.html).
  const PUBLIC_STATUS = { awaiting_payment: 'pending_payment', payment_claimed: 'pending_payment', paid: 'paid', cancelled: 'cancelled' };
  const pub = publicRegistration(row);
  return json({
    registration: {
      registration_number: pub.registration_number,
      registration_status: PUBLIC_STATUS[row.status] || 'pending_payment',
      amount_sar: pub.amount_sar,
      currency: 'SAR',
      program_name: row.program_name,
      branch_name: row.branch_name,
      created_at: row.created_at,
    },
  }, 200);
}

/**
 * Guardian reports a bank transfer. This records a CLAIM only: no money is counted
 * until an accountant matches it against the bank statement (see admin.js).
 */
export async function handleTransferClaim(request, env, regNo) {
  const db = env.DB;
  const ip = await ipHash(request, env);
  await hit(db, `claim:${ip}`, 10, 3600);

  const body = await readJson(request);
  const errors = {};
  const reference = String(body.bank_reference || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{6,40}$/.test(reference)) errors.bank_reference = 'رقم العملية البنكية غير صحيح.';
  const date = String(body.transfer_date || '');
  const d = new Date(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(d.getTime())) errors.transfer_date = 'تاريخ التحويل غير صحيح.';
  else if (d.getTime() > Date.now() + 24 * 3600 * 1000) errors.transfer_date = 'تاريخ التحويل لا يمكن أن يكون في المستقبل.';
  const amount = sarToHalala(body.amount_sar);
  if (amount === null || amount <= 0) errors.amount_sar = 'المبلغ غير صحيح.';
  if (Object.keys(errors).length) throw new ApiError(422, 'validation_failed', 'بعض الحقول غير صحيحة.', errors);

  const reg = await db
    .prepare('SELECT id, status, amount_halala, registration_no FROM registrations WHERE registration_no = ?')
    .bind(regNo)
    .first();
  if (!reg) throw new ApiError(404, 'not_found', 'رقم التسجيل غير موجود.');
  if (reg.status !== 'awaiting_payment' && reg.status !== 'payment_claimed') {
    throw new ApiError(409, 'invalid_state', 'لا يمكن إرسال إثبات دفع لهذا التسجيل.');
  }
  if (amount !== reg.amount_halala) {
    throw new ApiError(422, 'amount_mismatch', `المبلغ يجب أن يساوي ${halalaToSar(reg.amount_halala)} ريال.`);
  }

  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO payments (registration_id, method, amount_halala, bank_reference, transfer_date, status)
           VALUES (?, 'bank_transfer', ?, ?, ?, 'claimed')`
        )
        .bind(reg.id, amount, reference, date),
      db
        .prepare("UPDATE registrations SET status = 'payment_claimed' WHERE id = ? AND status = 'awaiting_payment'")
        .bind(reg.id),
    ]);
  } catch (err) {
    if (String(err && err.message).includes('UNIQUE')) {
      throw new ApiError(409, 'duplicate_reference', 'رقم العملية هذا مسجّل مسبقًا.');
    }
    throw err;
  }

  await writeAudit(db, { action: 'payment.claimed', entity: 'registration', entityId: reg.registration_no, meta: { method: 'bank_transfer' }, ipHash: ip });
  return json({ registration_number: reg.registration_no, status: 'payment_claimed', message: 'استلمنا إشعار التحويل. لن يُعتمد التسجيل حتى يطابقه المحاسب مع كشف البنك.' }, 201);
}

