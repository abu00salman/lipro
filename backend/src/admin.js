// Staff API: login + MFA, branch-scoped registrations, bank-transfer reconciliation,
// reports and CSV export. Every state change writes an audit row.
import {
  ApiError, json, nowIso, readJson, sha256Hex, timingSafeEqual,
} from './util.js';
import {
  INVALID_LOGIN, LOCK_MS, MAX_FAILED_LOGINS, createSession, decryptSecret, encryptSecret,
  hashPassword, issueMfaChallenge, newTotpSecret, otpauthUri, readMfaChallenge, requireUser, verifyPassword, verifyTotp,
  base32Decode,
} from './auth.js';
import { GLOBAL_ROLES, ROLES, assertBranchAccess, requirePermission, resolveBranchScope } from './rbac.js';
import { hit } from './ratelimit.js';
import { writeAudit } from './audit.js';
import { halalaToSar, ipHash, sarToHalala } from './registrations.js';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MIN_PASSWORD = 12;
const STATUS_LIST = ['awaiting_payment', 'payment_claimed', 'paid', 'cancelled'];

// Dummy hash so a login for an unknown email costs the same as a real one.
let dummyHashPromise = null;
const dummyHash = () => (dummyHashPromise ??= hashPassword('not-a-real-password-' + 'x'.repeat(8)));

// ---------- Auth ----------

export async function handleLogin(request, env) {
  const body = await readJson(request);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const ip = await ipHash(request, env);
  await hit(env.DB, `login-ip:${ip}`, 30, 900);
  await hit(env.DB, `login:${await sha256Hex(email)}`, 10, 900);

  const user = await env.DB
    .prepare('SELECT id, role, active, password_hash, failed_logins, locked_until, mfa_enabled FROM users WHERE email = ? COLLATE NOCASE')
    .bind(email)
    .first();

  const ok = await verifyPassword(password, user ? user.password_hash : await dummyHash());
  const locked = user && user.locked_until && user.locked_until > nowIso();
  if (!user || !ok || !user.active || locked) {
    if (user && !locked) {
      const fails = user.failed_logins + 1;
      const lockUntil = fails >= MAX_FAILED_LOGINS ? nowIso(new Date(Date.now() + LOCK_MS)) : null;
      await env.DB.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?').bind(fails >= MAX_FAILED_LOGINS ? 0 : fails, lockUntil, user.id).run();
    }
    throw INVALID_LOGIN;
  }
  if (user.role === 'guardian') throw new ApiError(403, 'forbidden', 'بوابة أولياء الأمور غير متاحة بعد.');

  await env.DB.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').bind(user.id).run();

  if (user.mfa_enabled) {
    return json({ mfa_required: true, challenge: await issueMfaChallenge(env, user.id) });
  }
  // No MFA yet: a session is issued, but requirePermission blocks everything except enrolment.
  const token = await createSession(env.DB, user.id);
  await writeAudit(env.DB, { actorId: user.id, action: 'auth.login_mfa_setup_pending', entity: 'user', entityId: user.id, ipHash: ip });
  return json({ mfa_required: false, mfa_setup_required: true, token });
}

export async function handleMfaVerify(request, env) {
  const body = await readJson(request);
  const userId = await readMfaChallenge(env, body.challenge);
  if (!userId) throw new ApiError(401, 'challenge_expired', 'انتهت صلاحية التحقق، سجّل الدخول من جديد.');
  const ip = await ipHash(request, env);
  await hit(env.DB, `mfa:${userId}`, 5, 900);

  const user = await env.DB
    .prepare('SELECT id, active, totp_secret_enc, last_totp_step FROM users WHERE id = ? AND mfa_enabled = 1')
    .bind(userId)
    .first();
  if (!user || !user.active) throw INVALID_LOGIN;

  const secret = base32Decode(await decryptSecret(env, user.totp_secret_enc));
  const step = await verifyTotp(secret, body.code, user.last_totp_step);
  if (step === null) {
    await writeAudit(env.DB, { actorId: user.id, action: 'auth.mfa_failed', entity: 'user', entityId: user.id, ipHash: ip });
    throw new ApiError(401, 'invalid_code', 'رمز التحقق غير صحيح أو مستخدم سابقًا.');
  }
  await env.DB.prepare('UPDATE users SET last_totp_step = ? WHERE id = ?').bind(step, user.id).run();
  const token = await createSession(env.DB, user.id);
  await writeAudit(env.DB, { actorId: user.id, action: 'auth.login', entity: 'user', entityId: user.id, ipHash: ip });
  return json({ token, expires_in: 8 * 3600 });
}

export async function handleMfaEnroll(request, env) {
  const user = await requireUser(env.DB, request);
  if (user.mfa_enabled) throw new ApiError(409, 'already_enabled', 'التحقق بخطوتين مفعّل بالفعل.');
  const secret = newTotpSecret();
  await env.DB.prepare('UPDATE users SET totp_secret_enc = ? WHERE id = ?').bind(await encryptSecret(env, secret), user.id).run();
  return json({ secret, otpauth_uri: otpauthUri(secret, user.email) });
}

export async function handleMfaConfirm(request, env) {
  const user = await requireUser(env.DB, request);
  const body = await readJson(request);
  const row = await env.DB.prepare('SELECT totp_secret_enc, last_totp_step FROM users WHERE id = ?').bind(user.id).first();
  if (!row || !row.totp_secret_enc) throw new ApiError(409, 'not_enrolled', 'ابدأ إعداد التحقق بخطوتين أولًا.');
  const step = await verifyTotp(base32Decode(await decryptSecret(env, row.totp_secret_enc)), body.code, row.last_totp_step);
  if (step === null) throw new ApiError(401, 'invalid_code', 'رمز التحقق غير صحيح.');
  await env.DB.prepare('UPDATE users SET mfa_enabled = 1, last_totp_step = ? WHERE id = ?').bind(step, user.id).run();
  await writeAudit(env.DB, { actorId: user.id, action: 'auth.mfa_enabled', entity: 'user', entityId: user.id });
  return json({ ok: true });
}

export async function handleLogout(request, env) {
  const user = await requireUser(env.DB, request);
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(user.tokenHash).run();
  return json({ ok: true });
}

export async function handleMe(request, env) {
  const user = await requireUser(env.DB, request);
  return json({ id: user.id, email: user.email, full_name: user.full_name, role: user.role, branch_id: user.branch_id, mfa_enabled: user.mfa_enabled });
}

/** Owner-only: creates a staff account. The password is set by the owner and must be changed out-of-band. */
export async function handleCreateUser(request, env) {
  const actor = await requireUser(env.DB, request);
  requirePermission(actor, 'users.manage');
  const body = await readJson(request);
  const errors = {};
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^\s@]{1,64}@[^\s@]{1,100}\.[^\s@]{2,24}$/.test(email)) errors.email = 'البريد غير صحيح.';
  const name = String(body.full_name || '').trim();
  if (name.length < 2 || name.length > 80) errors.full_name = 'الاسم مطلوب.';
  if (!ROLES.includes(body.role) || body.role === 'guardian') errors.role = 'الدور غير صحيح.';
  const branchId = body.branch_id || null;
  if (branchId && GLOBAL_ROLES.includes(body.role)) errors.branch_id = 'هذا الدور يعمل على كل الفروع.';
  if (!branchId && !GLOBAL_ROLES.includes(body.role)) errors.branch_id = 'اختر الفرع لهذا الدور.';
  if (typeof body.password !== 'string' || body.password.length < MIN_PASSWORD) errors.password = `كلمة المرور ${MIN_PASSWORD} حرفًا على الأقل.`;
  if (Object.keys(errors).length) throw new ApiError(422, 'validation_failed', 'بعض الحقول غير صحيحة.', errors);
  if (branchId) {
    const b = await env.DB.prepare('SELECT id FROM branches WHERE id = ?').bind(branchId).first();
    if (!b) throw new ApiError(422, 'validation_failed', 'بعض الحقول غير صحيحة.', { branch_id: 'الفرع غير موجود.' });
  }
  const res = await env.DB
    .prepare('INSERT INTO users (email, full_name, role, branch_id, password_hash) VALUES (?, ?, ?, ?, ?) RETURNING id')
    .bind(email, name, body.role, branchId, await hashPassword(body.password))
    .first();
  await writeAudit(env.DB, { actorId: actor.id, action: 'user.created', entity: 'user', entityId: res.id, branchId, meta: { role: body.role } });
  return json({ id: res.id, role: body.role, branch_id: branchId }, 201);
}

// ---------- Registrations ----------

/** Shared filter builder for list + CSV, so both always return the same rows. */
function buildRegistrationFilter(user, url) {
  const where = [];
  const params = [];
  const branch = resolveBranchScope(user, url.searchParams.get('branch_id'));
  if (branch) { where.push('r.branch_id = ?'); params.push(branch); }

  const status = url.searchParams.get('status');
  if (status) {
    if (!STATUS_LIST.includes(status)) throw new ApiError(422, 'validation_failed', 'الحالة غير صحيحة.');
    where.push('r.status = ?'); params.push(status);
  }
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (from) { if (!ISO_DAY.test(from)) throw new ApiError(422, 'validation_failed', 'تاريخ البداية غير صحيح.'); where.push('date(r.created_at) >= ?'); params.push(from); }
  if (to) { if (!ISO_DAY.test(to)) throw new ApiError(422, 'validation_failed', 'تاريخ النهاية غير صحيح.'); where.push('date(r.created_at) <= ?'); params.push(to); }

  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    where.push(`(p.full_name LIKE ? ESCAPE '\\' OR g.mobile LIKE ? ESCAPE '\\' OR r.registration_no LIKE ? ESCAPE '\\' OR g.full_name LIKE ? ESCAPE '\\')`);
    params.push(like, like, like, like);
  }
  return { clause: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

const LIST_SELECT = `
  SELECT r.id, r.registration_no, r.status, r.amount_halala, r.created_at, r.branch_id, r.program_id,
         b.name AS branch_name, pr.name AS program_name,
         p.full_name AS player_name, p.dob AS player_dob,
         g.full_name AS guardian_name, g.mobile AS guardian_mobile
    FROM registrations r
    JOIN players p ON p.id = r.player_id
    JOIN guardians g ON g.id = r.guardian_id
    JOIN branches b ON b.id = r.branch_id
    JOIN programs pr ON pr.id = r.program_id`;

export async function handleListRegistrations(request, env, url) {
  const user = await requireUser(env.DB, request);
  requirePermission(user, 'registrations.read');
  const { clause, params } = buildRegistrationFilter(user, url);
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const size = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size')) || 25));

  const total = await env.DB
    .prepare(`SELECT COUNT(*) AS n FROM registrations r JOIN players p ON p.id = r.player_id JOIN guardians g ON g.id = r.guardian_id ${clause}`)
    .bind(...params)
    .first();
  const rows = await env.DB
    .prepare(`${LIST_SELECT} ${clause} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`)
    .bind(...params, size, (page - 1) * size)
    .all();

  return json({
    items: (rows.results || []).map(serializeListRow),
    page, page_size: size, total: total.n,
  });
}

function serializeListRow(r) {
  return {
    registration_number: r.registration_no,
    status: r.status,
    amount_sar: halalaToSar(r.amount_halala),
    created_at: r.created_at,
    branch_id: r.branch_id,
    branch_name: r.branch_name,
    program_id: r.program_id,
    program_name: r.program_name,
    player_name: r.player_name,
    player_dob: r.player_dob,
    guardian_name: r.guardian_name,
    guardian_mobile: r.guardian_mobile,
  };
}

export async function handleRegistrationDetail(request, env, regNo) {
  const user = await requireUser(env.DB, request);
  requirePermission(user, 'registrations.read');
  const row = await env.DB.prepare(`${LIST_SELECT} WHERE r.registration_no = ?`).bind(regNo).first();
  if (!row) throw new ApiError(404, 'not_found', 'العنصر غير موجود.');
  assertBranchAccess(user, row.branch_id);
  const payments = await env.DB
    .prepare(
      `SELECT id, method, amount_halala, bank_reference, transfer_date, status, reconciled_ref, reconciled_halala, reviewed_at, review_note
         FROM payments WHERE registration_id = (SELECT id FROM registrations WHERE registration_no = ?) ORDER BY id`
    )
    .bind(regNo)
    .all();
  await writeAudit(env.DB, { actorId: user.id, action: 'registration.viewed', entity: 'registration', entityId: regNo, branchId: row.branch_id });
  return json({
    ...serializeListRow(row),
    payments: (payments.results || []).map((p) => ({
      id: p.id, method: p.method, amount_sar: halalaToSar(p.amount_halala), bank_reference: p.bank_reference,
      transfer_date: p.transfer_date, status: p.status, reconciled_ref: p.reconciled_ref,
      reconciled_amount_sar: p.reconciled_halala === null ? null : halalaToSar(p.reconciled_halala),
      reviewed_at: p.reviewed_at, review_note: p.review_note,
    })),
  });
}

export async function handleExportCsv(request, env, url) {
  const user = await requireUser(env.DB, request);
  requirePermission(user, 'registrations.export');
  const { clause, params } = buildRegistrationFilter(user, url);
  const rows = await env.DB
    .prepare(`${LIST_SELECT} ${clause} ORDER BY r.created_at DESC, r.id DESC LIMIT 5000`)
    .bind(...params)
    .all();
  const list = (rows.results || []).map(serializeListRow);

  await writeAudit(env.DB, {
    actorId: user.id, action: 'registrations.exported', entity: 'registration', entityId: null,
    branchId: user.branch_id || url.searchParams.get('branch_id') || null,
    meta: { rows: list.length, filters: { status: url.searchParams.get('status'), from: url.searchParams.get('from'), to: url.searchParams.get('to') } },
  });

  const cols = ['registration_number', 'created_at', 'status', 'branch_name', 'program_name', 'player_name', 'player_dob',
    'guardian_name', 'guardian_mobile', 'amount_sar'];
  const lines = [cols.join(',')];
  for (const r of list) lines.push(cols.map((c) => csvCell(r[c])).join(','));
  const filename = `registrations-${nowIso().slice(0, 10)}.csv`;
  return new Response('﻿' + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** CSV escaping + neutralizes spreadsheet formulas (CSV injection). */
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ---------- Bank transfer reconciliation ----------

async function loadPaymentForReview(env, user, paymentId) {
  const p = await env.DB
    .prepare(
      `SELECT p.id, p.status, p.amount_halala, p.bank_reference, p.registration_id,
              r.registration_no, r.branch_id, r.amount_halala AS reg_amount, r.status AS reg_status
         FROM payments p JOIN registrations r ON r.id = p.registration_id
        WHERE p.id = ? AND p.method = 'bank_transfer'`
    )
    .bind(paymentId)
    .first();
  if (!p) throw new ApiError(404, 'not_found', 'العنصر غير موجود.');
  assertBranchAccess(user, p.branch_id);
  return p;
}

/**
 * Approval requires the accountant to type the reference and amount exactly as they
 * appear on the BANK STATEMENT. A receipt image alone is never enough.
 */
export async function handleApprovePayment(request, env, paymentId) {
  const user = await requireUser(env.DB, request);
  requirePermission(user, 'payments.approve');
  const body = await readJson(request);
  const p = await loadPaymentForReview(env, user, paymentId);
  if (p.status !== 'claimed') throw new ApiError(409, 'invalid_state', 'هذه الدفعة ليست بانتظار المراجعة.');

  const statementRef = String(body.reconciled_ref || '').trim().toUpperCase();
  const statementHalala = sarToHalala(body.reconciled_amount_sar);
  const expected = p.bank_reference;
  const matches =
    statementRef.length > 0 &&
    timingSafeEqual(statementRef, expected) &&
    statementHalala === p.amount_halala &&
    p.amount_halala === p.reg_amount;
  if (!matches) {
    await writeAudit(env.DB, { actorId: user.id, action: 'payment.reconciliation_failed', entity: 'payment', entityId: p.id, branchId: p.branch_id });
    throw new ApiError(422, 'reconciliation_mismatch', 'المرجع أو المبلغ لا يطابق كشف البنك. لم يُعتمد الدفع.');
  }
  const note = String(body.note || '').trim().slice(0, 300) || null;

  await env.DB.batch([
    env.DB
      .prepare(
        `UPDATE payments SET status = 'approved', reconciled_ref = ?, reconciled_halala = ?, reviewed_by = ?, reviewed_at = ?, review_note = ?
          WHERE id = ? AND status = 'claimed'`
      )
      .bind(statementRef, statementHalala, user.id, nowIso(), note, p.id),
    env.DB
      .prepare("UPDATE registrations SET status = 'paid' WHERE id = ? AND status IN ('awaiting_payment', 'payment_claimed')")
      .bind(p.registration_id),
  ]);
  await writeAudit(env.DB, {
    actorId: user.id, action: 'payment.approved', entity: 'payment', entityId: p.id, branchId: p.branch_id,
    meta: { registration: p.registration_no, amount_halala: p.amount_halala },
  });
  return json({ id: p.id, status: 'approved', registration_number: p.registration_no, registration_status: 'paid' });
}

export async function handleRejectPayment(request, env, paymentId) {
  const user = await requireUser(env.DB, request);
  requirePermission(user, 'payments.review');
  const body = await readJson(request);
  const note = String(body.note || '').trim();
  if (note.length < 3 || note.length > 300) throw new ApiError(422, 'validation_failed', 'اكتب سبب الرفض.', { note: 'سبب الرفض مطلوب (3 إلى 300 حرف).' });
  const p = await loadPaymentForReview(env, user, paymentId);
  if (p.status !== 'claimed') throw new ApiError(409, 'invalid_state', 'هذه الدفعة ليست بانتظار المراجعة.');

  await env.DB.batch([
    env.DB
      .prepare("UPDATE payments SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ? AND status = 'claimed'")
      .bind(user.id, nowIso(), note, p.id),
    env.DB
      .prepare("UPDATE registrations SET status = 'awaiting_payment' WHERE id = ? AND status = 'payment_claimed'")
      .bind(p.registration_id),
  ]);
  await writeAudit(env.DB, { actorId: user.id, action: 'payment.rejected', entity: 'payment', entityId: p.id, branchId: p.branch_id, meta: { registration: p.registration_no } });
  return json({ id: p.id, status: 'rejected' });
}

// ---------- Reports ----------

function monthStartIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export async function handleReportSummary(request, env, url) {
  const user = await requireUser(env.DB, request);
  requirePermission(user, 'reports.read');
  const from = url.searchParams.get('from') || monthStartIso();
  const to = url.searchParams.get('to') || nowIso().slice(0, 10);
  if (!ISO_DAY.test(from) || !ISO_DAY.test(to) || from > to) throw new ApiError(422, 'validation_failed', 'نطاق التاريخ غير صحيح.');
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  if (days > 370) throw new ApiError(422, 'validation_failed', 'أقصى نطاق 370 يومًا.');

  const branch = resolveBranchScope(user, url.searchParams.get('branch_id'));
  const branchSql = branch ? ' AND r.branch_id = ?' : '';
  const bp = branch ? [branch] : [];

  const byStatus = await env.DB
    .prepare(`SELECT r.status, COUNT(*) AS n FROM registrations r WHERE date(r.created_at) BETWEEN ? AND ?${branchSql} GROUP BY r.status`)
    .bind(from, to, ...bp)
    .all();
  const revenue = await env.DB
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(p.amount_halala), 0) AS halala
         FROM payments p JOIN registrations r ON r.id = p.registration_id
        WHERE p.status = 'approved' AND date(p.reviewed_at) BETWEEN ? AND ?${branchSql}`
    )
    .bind(from, to, ...bp)
    .first();
  const pending = await env.DB
    .prepare(`SELECT COUNT(*) AS n FROM payments p JOIN registrations r ON r.id = p.registration_id WHERE p.status = 'claimed'${branchSql}`)
    .bind(...bp)
    .first();
  const byBranch = await env.DB
    .prepare(
      `SELECT b.id, b.name, COUNT(r.id) AS registrations,
              COALESCE(SUM(CASE WHEN r.status = 'paid' THEN r.amount_halala ELSE 0 END), 0) AS paid_halala
         FROM branches b LEFT JOIN registrations r ON r.branch_id = b.id AND date(r.created_at) BETWEEN ? AND ?
        WHERE b.active = 1 ${branch ? 'AND b.id = ?' : ''}
        GROUP BY b.id, b.name ORDER BY b.name`
    )
    .bind(from, to, ...bp)
    .all();

  const counts = Object.fromEntries(STATUS_LIST.map((s) => [s, 0]));
  for (const row of byStatus.results || []) counts[row.status] = row.n;

  return json({
    from, to,
    branch_id: branch,
    registrations: { total: Object.values(counts).reduce((a, b) => a + b, 0), by_status: counts },
    approved_payments: { count: revenue.n, total_sar: halalaToSar(revenue.halala) },
    pending_claims: pending.n,
    by_branch: (byBranch.results || []).map((r) => ({
      branch_id: r.id, branch_name: r.name, registrations: r.registrations, paid_sar: halalaToSar(r.paid_halala),
    })),
  });
}

export async function handleAuditList(request, env, url) {
  const user = await requireUser(env.DB, request);
  requirePermission(user, 'audit.read');
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const rows = await env.DB
    .prepare('SELECT id, actor_id, action, entity, entity_id, branch_id, meta_json, created_at FROM audit_log ORDER BY id DESC LIMIT ?')
    .bind(limit)
    .all();
  return json({ items: (rows.results || []).map((r) => ({ ...r, meta: JSON.parse(r.meta_json || '{}'), meta_json: undefined })) });
}
