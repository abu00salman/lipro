/**
 * =====================================================================
 *  أكاديمية ليبرو الرياضية — خادم التسجيل والدفع
 *  Cloudflare Worker + D1
 * =====================================================================
 *
 *  المبدأ الحاكم: لا نثق بالمتصفح في أي شيء يخص المال.
 *   • السعر يُقرأ من programs.js على الخادم
 *   • حالة الدفع تُتحقق من ميسر بالمفتاح السري
 *   • الويبهوك محمي بسرّ مشترك وغير قابل للتكرار
 *
 *  المسارات:
 *   GET  /api/config                     إعدادات عامة (المفتاح المنشور + البرامج)
 *   POST /api/registrations              إنشاء تسجيل بحالة pending_payment
 *   POST /api/payments/verify            التحقق من دفعة وتأكيد التسجيل
 *   GET  /api/registrations/:number      حالة تسجيل (للعرض في صفحة النجاح)
 *   POST /api/webhooks/moyasar           استقبال أحداث ميسر
 *   GET  /api/health                     فحص الحياة
 */

import { publicPrograms, publicBranches, findActiveProgram, findBranch, priceInHalalas, VAT_RATE, VAT_INCLUDED } from './programs.js';
import { validateRegistration, LABELS, localMobile } from './validation.js';
import { fetchPayment, verifyPaymentMatches, paymentSourceInfo, safeEqual } from './moyasar.js';

// ---------------------------------------------------------------------
// أدوات مساعدة
// ---------------------------------------------------------------------

const now = () => new Date().toISOString();

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || 'https://liproacademy.com,https://www.liproacademy.com')
    .split(',').map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const list = allowedOrigins(env);
  const allow = list.includes(origin) ? origin : list[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function json(data, status, request, env, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders(request, env),
      ...extra
    }
  });
}

/** رسائل خطأ عامة للعميل — لا نسرّب تفاصيل داخلية. */
function fail(request, env, status, code, message, extra = {}) {
  return json({ ok: false, code, message, ...extra }, status, request, env);
}

function uuid() {
  return crypto.randomUUID();
}

/**
 * رقم تسجيل مقاوم للتصادم: LPA-2026-XXXXX
 * الحروف مختارة بلا أحرف ملتبسة (O/0، I/1) لتسهيل النطق عبر الهاتف.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function makeRegistrationNumber() {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  const year = new Date().getUTCFullYear();
  return `LPA-${year}-${out}`;
}

/** تحديد المعدل: نافذة ثابتة بسيطة مخزّنة في D1. */
async function rateLimit(env, request, route, limit, windowSec) {
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const nowSec = Math.floor(Date.now() / 1000);
    const windowStart = Math.floor(nowSec / windowSec) * windowSec;
    const bucket = `${ip}:${route}:${windowStart}`;
    const expires = windowStart + windowSec;

    await env.DB.prepare(
      `INSERT INTO rate_limit (bucket, hits, expires_at) VALUES (?1, 1, ?2)
       ON CONFLICT(bucket) DO UPDATE SET hits = hits + 1`
    ).bind(bucket, expires).run();

    const row = await env.DB.prepare('SELECT hits FROM rate_limit WHERE bucket = ?1')
      .bind(bucket).first();

    // تنظيف عرضي للسجلات المنتهية
    if (Math.random() < 0.02) {
      await env.DB.prepare('DELETE FROM rate_limit WHERE expires_at < ?1').bind(nowSec).run();
    }
    return !row || row.hits <= limit;
  } catch {
    return true; // لا نمنع المستخدم بسبب عطل في العدّاد
  }
}

async function logTransition(env, regId, from, to, source, note) {
  try {
    await env.DB.prepare(
      `INSERT INTO payment_log (reg_id, from_status, to_status, source, note, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    ).bind(regId, from || null, to || null, source, (note || '').slice(0, 200), now()).run();
  } catch { /* السجل ثانوي — لا يوقف العملية */ }
}

// ---------------------------------------------------------------------
// GET /api/config
// ---------------------------------------------------------------------
function handleConfig(request, env) {
  const pk = env.MOYASAR_PUBLISHABLE_KEY || '';
  return json({
    ok: true,
    publishable_key: pk,                       // مفتاح منشور — آمن في المتصفح
    test_mode: pk.startsWith('pk_test'),
    currency: 'SAR',
    vat_rate: VAT_RATE,
    vat_included: VAT_INCLUDED,
    apple_pay: {
      country: 'SA',
      label: env.APPLE_PAY_LABEL || 'Lipro Academy',
      validate_merchant_url: 'https://api.moyasar.com/v1/applepay/initiate'
    },
    /* مدى فقط — البطاقات الائتمانية غير مفعّلة لدى الأكاديمية.
       لإضافة فيزا/ماستركارد لاحقًا: أضفهما هنا فقط. */
    supported_networks: ['mada'],
    methods: ['creditcard', 'applepay'],       // أضف 'stcpay' هنا لاحقًا بلا تغيير آخر

    /*
      طرق دفع معروضة كـ«قريبًا» ولم تُفعّل بعد.
      تابي وتمارا خدمتا تقسيط تحتاجان اتفاقية تاجر منفصلة، ولا تمران
      عبر نموذج ميسر — فنعرضهما للزائر فقط ريثما يكتمل التعاقد.
      عند التفعيل: انقل الطريقة من هنا إلى المصفوفة المناسبة.
    */
    coming_soon: ['tabby', 'tamara'],
    site_url: env.SITE_URL || 'https://liproacademy.com',
    programs: publicPrograms(),
    branches: publicBranches()
  }, 200, request, env);
}

// ---------------------------------------------------------------------
// POST /api/registrations
// ينشئ تسجيلًا بحالة pending_payment ويعيد المبلغ الموثوق من الخادم.
// ---------------------------------------------------------------------
async function handleCreateRegistration(request, env) {
  if (!(await rateLimit(env, request, 'reg', 12, 600))) {
    return fail(request, env, 429, 'rate_limited', 'محاولات كثيرة، حاول بعد قليل.');
  }

  let body;
  try { body = await request.json(); }
  catch { return fail(request, env, 400, 'bad_json', 'صيغة الطلب غير صحيحة.'); }

  // ---- البرنامج: السعر يُقرأ من الخادم لا من المتصفح ----
  const program = findActiveProgram(String(body.program_id || ''));
  if (!program) {
    return fail(request, env, 400, 'invalid_program', 'البرنامج المختار غير متاح.');
  }
  const amount = priceInHalalas(program);

  // ---- التحقق من البيانات ----
  const { ok, errors, data } = validateRegistration(body);
  if (!ok) {
    return fail(request, env, 422, 'validation_failed', 'بعض البيانات غير مكتملة.', { errors });
  }

  const branch = findBranch(String(body.branch_id || ''));

  // ---- إعادة استخدام تسجيل معلّق بدل إنشاء نسخة مكررة ----
  // إن حاول ولي الأمر الدفع مجددًا لنفس اللاعب والبرنامج خلال ساعتين.
  const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const existing = await env.DB.prepare(
    `SELECT * FROM registrations
      WHERE guardian_mobile = ?1 AND player_name = ?2 AND program_id = ?3
        AND registration_status IN ('pending_payment','payment_failed')
        AND created_at > ?4
      ORDER BY created_at DESC LIMIT 1`
  ).bind(data.guardian_mobile, data.player_name, program.id, twoHoursAgo).first();

  const id = existing ? existing.id : uuid();
  const registrationNumber = existing ? existing.registration_number : await uniqueRegNumber(env);
  const live = (env.MOYASAR_PUBLISHABLE_KEY || '').startsWith('pk_live') ? 1 : 0;

  if (existing) {
    await env.DB.prepare(
      `UPDATE registrations SET
         player_dob=?1, player_age=?2, gender=?3, nationality=?4, school=?5,
         football_experience=?6, preferred_position=?7, jersey_size=?8,
         guardian_name=?9, relationship=?10, guardian_email=?11, emergency_mobile=?12,
         branch_id=?13, branch_name=?14,
         program_name=?15, program_price=?16,
         registration_status='pending_payment', updated_at=?17
       WHERE id=?18`
    ).bind(
      data.player_dob, data.player_age, data.gender, data.nationality, data.school,
      data.football_experience, data.preferred_position, data.jersey_size,
      data.guardian_name, data.relationship, data.guardian_email, data.emergency_mobile,
      branch ? branch.id : '', branch ? branch.name_ar : '',
      program.name_ar, amount, now(), id
    ).run();
    await logTransition(env, id, existing.registration_status, 'pending_payment', 'create', 'reuse');
  } else {
    await env.DB.prepare(
      `INSERT INTO registrations (
         id, registration_number,
         player_name, player_dob, player_age, gender, nationality, school,
         football_experience, preferred_position, jersey_size,
         guardian_name, relationship, guardian_mobile, guardian_email, emergency_mobile,
         branch_id, branch_name,
         program_id, program_name, program_price, currency,
         payment_gateway, payment_status, registration_status,
         live, created_at, updated_at
       ) VALUES (
         ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11,
         ?12, ?13, ?14, ?15, ?16, ?17, ?18,
         ?19, ?20, ?21, 'SAR', 'moyasar', 'none', 'pending_payment', ?22, ?23, ?23
       )`
    ).bind(
      id, registrationNumber,
      data.player_name, data.player_dob, data.player_age, data.gender, data.nationality, data.school,
      data.football_experience, data.preferred_position, data.jersey_size,
      data.guardian_name, data.relationship, data.guardian_mobile, data.guardian_email, data.emergency_mobile,
      branch ? branch.id : '', branch ? branch.name_ar : '',
      program.id, program.name_ar, amount,
      live, now()
    ).run();
    await logTransition(env, id, 'draft', 'pending_payment', 'create', 'new');
  }

  const site = env.SITE_URL || 'https://liproacademy.com';

  return json({
    ok: true,
    registration_number: registrationNumber,
    amount,                                     // بالهللات — من الخادم
    amount_sar: program.price_sar,
    currency: 'SAR',
    vat_included: VAT_INCLUDED,
    description: `Lipro Academy Registration - ${registrationNumber}`,
    callback_url: `${site}/payment-success/?ref=${encodeURIComponent(registrationNumber)}`,
    metadata: {
      registration_number: registrationNumber,
      program_id: program.id
      // ملاحظة: لا نضع اسم اللاعب أو رقم ولي الأمر في البيانات الوصفية،
      // لأنها تظهر في لوحة ميسر وقد تخص قاصرًا.
    }
  }, 201, request, env);
}

/** يولّد رقم تسجيل فريدًا مع إعادة المحاولة عند التصادم النادر. */
async function uniqueRegNumber(env) {
  for (let i = 0; i < 6; i++) {
    const n = makeRegistrationNumber();
    const hit = await env.DB.prepare(
      'SELECT 1 FROM registrations WHERE registration_number = ?1'
    ).bind(n).first();
    if (!hit) return n;
  }
  // احتياط شبه مستحيل الوصول إليه
  return `LPA-${new Date().getUTCFullYear()}-${uuid().slice(0, 8).toUpperCase()}`;
}

// ---------------------------------------------------------------------
// POST /api/payments/verify
// المتصفح يرسل معرّف الدفعة فقط — الخادم يسأل ميسر ويقرّر.
// ---------------------------------------------------------------------
async function handleVerify(request, env) {
  if (!(await rateLimit(env, request, 'verify', 40, 600))) {
    return fail(request, env, 429, 'rate_limited', 'محاولات كثيرة، حاول بعد قليل.');
  }

  let body;
  try { body = await request.json(); }
  catch { return fail(request, env, 400, 'bad_json', 'صيغة الطلب غير صحيحة.'); }

  const paymentId = String(body.payment_id || '');
  const regNumber = String(body.registration_number || '');

  const reg = await env.DB.prepare(
    'SELECT * FROM registrations WHERE registration_number = ?1'
  ).bind(regNumber).first();

  if (!reg) return fail(request, env, 404, 'not_found', 'لم نجد هذا التسجيل.');

  // إن كان مدفوعًا سلفًا فلا نعيد المعالجة — عملية غير قابلة للتكرار
  if (reg.registration_status === 'paid') {
    return json({ ok: true, status: 'paid', registration: publicReg(reg) }, 200, request, env);
  }

  const got = await fetchPayment(paymentId, env.MOYASAR_SECRET_KEY);
  if (!got.ok) {
    return fail(request, env, 502, 'gateway_error', 'تعذّر التحقق من الدفع الآن، حاول بعد قليل.');
  }

  const payment = got.payment;
  const match = verifyPaymentMatches(payment, reg);
  if (!match.valid) {
    await logTransition(env, reg.id, reg.registration_status, reg.registration_status, 'verify', match.reason);
    return fail(request, env, 409, 'mismatch', 'بيانات الدفع لا تطابق هذا التسجيل.');
  }

  const updated = await applyPaymentState(env, reg, payment, 'verify');
  return json({ ok: true, status: updated.registration_status, registration: publicReg(updated) },
    200, request, env);
}

/**
 * يطبّق حالة الدفعة على التسجيل — نقطة واحدة يمر بها الويبهوك والتحقق معًا،
 * حتى لا يختلف السلوك بين المسارين.
 */
async function applyPaymentState(env, reg, payment, source) {
  const info = paymentSourceInfo(payment);
  const st = payment.status;
  const t = now();

  let regStatus = reg.registration_status;
  let payStatus = st;
  let paidAt = reg.paid_at;

  if (st === 'paid' || st === 'captured') {
    // لا نعيد تعيين paid_at إن كان مضبوطًا — يمنع تكرار الإشعارات لاحقًا
    if (reg.registration_status !== 'paid') {
      regStatus = 'paid';
      paidAt = t;
    }
    payStatus = 'paid';
  } else if (st === 'failed') {
    regStatus = 'payment_failed';
    payStatus = 'failed';
  } else if (st === 'refunded') {
    regStatus = 'refunded';
    payStatus = 'refunded';
  } else if (st === 'voided') {
    regStatus = 'cancelled';
    payStatus = 'voided';
  } else {
    payStatus = 'initiated';
  }

  await env.DB.prepare(
    `UPDATE registrations SET
       payment_id=?1, payment_status=?2, payment_source=?3, payment_company=?4,
       payment_last4=?5, failure_message=?6, registration_status=?7,
       paid_at=?8, updated_at=?9
     WHERE id=?10`
  ).bind(
    payment.id, payStatus, info.type, info.company,
    info.last4, info.message, regStatus,
    paidAt, t, reg.id
  ).run();

  if (regStatus !== reg.registration_status) {
    await logTransition(env, reg.id, reg.registration_status, regStatus, source, st);
  }

  return { ...reg, payment_id: payment.id, payment_status: payStatus, payment_source: info.type,
           payment_company: info.company, payment_last4: info.last4, failure_message: info.message,
           registration_status: regStatus, paid_at: paidAt };
}

/** نسخة آمنة للعرض — بلا بيانات شخصية زائدة. */
function publicReg(reg) {
  return {
    registration_number: reg.registration_number,
    player_name: reg.player_name,
    program_name: reg.program_name,
    amount_sar: Math.round(Number(reg.program_price) / 100),
    currency: reg.currency,
    registration_status: reg.registration_status,
    payment_status: reg.payment_status,
    payment_company: reg.payment_company,
    payment_source: reg.payment_source,
    payment_last4: reg.payment_last4,
    branch_name: reg.branch_name,
    paid_at: reg.paid_at
  };
}

// ---------------------------------------------------------------------
// GET /api/registrations/:number
// ---------------------------------------------------------------------
async function handleGetRegistration(request, env, number) {
  if (!/^LPA-\d{4}-[A-Z0-9]{5,10}$/.test(number)) {
    return fail(request, env, 400, 'bad_reference', 'رقم تسجيل غير صحيح.');
  }
  if (!(await rateLimit(env, request, 'get', 60, 600))) {
    return fail(request, env, 429, 'rate_limited', 'محاولات كثيرة.');
  }

  const reg = await env.DB.prepare(
    'SELECT * FROM registrations WHERE registration_number = ?1'
  ).bind(number).first();

  if (!reg) return fail(request, env, 404, 'not_found', 'لم نجد هذا التسجيل.');
  return json({ ok: true, registration: publicReg(reg) }, 200, request, env);
}

// ---------------------------------------------------------------------
// POST /api/webhooks/moyasar
// ---------------------------------------------------------------------
async function handleWebhook(request, env) {
  let evt;
  try { evt = await request.json(); }
  catch { return new Response('bad json', { status: 400 }); }

  // 1) التحقق من السرّ المشترك — مقارنة ثابتة الزمن
  if (!safeEqual(String(evt.secret_token || ''), String(env.MOYASAR_WEBHOOK_SECRET || ''))) {
    return new Response('unauthorized', { status: 401 });
  }

  const eventId = String(evt.id || '');
  const type = String(evt.type || '');
  const payment = evt.data || {};

  // 2) منع التكرار: نفس الحدث لا يُعالج مرتين
  //    نكتب أولًا؛ فشل القيد الفريد يعني أنه معالج سلفًا.
  if (eventId) {
    try {
      await env.DB.prepare(
        `INSERT INTO webhook_events (event_id, event_type, payment_id, processed_at)
         VALUES (?1, ?2, ?3, ?4)`
      ).bind(eventId, type, payment.id || null, now()).run();
    } catch {
      return new Response('already processed', { status: 200 }); // 2xx حتى لا يعيد ميسر الإرسال
    }
  }

  // 3) نتعامل مع أحداث الدفع فقط
  if (!type.startsWith('payment_')) {
    return new Response('ignored', { status: 200 });
  }

  const regNumber = payment.metadata && payment.metadata.registration_number;
  let reg = null;

  if (regNumber) {
    reg = await env.DB.prepare('SELECT * FROM registrations WHERE registration_number = ?1')
      .bind(String(regNumber)).first();
  }
  if (!reg && payment.id) {
    reg = await env.DB.prepare('SELECT * FROM registrations WHERE payment_id = ?1')
      .bind(String(payment.id)).first();
  }
  if (!reg) return new Response('registration not found', { status: 200 });

  // 4) نفس فحوص الأمان المطبّقة في مسار التحقق
  const match = verifyPaymentMatches(payment, reg);
  if (!match.valid) {
    await logTransition(env, reg.id, reg.registration_status, reg.registration_status, 'webhook', match.reason);
    return new Response('mismatch', { status: 200 });
  }

  await applyPaymentState(env, reg, payment, 'webhook');
  return new Response('ok', { status: 200 });
}

// ---------------------------------------------------------------------
// المُوجِّه
// ---------------------------------------------------------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    try {
      if (path === '/api/health') {
        return json({ ok: true, time: now() }, 200, request, env);
      }
      if (path === '/api/config' && request.method === 'GET') {
        return handleConfig(request, env);
      }
      if (path === '/api/registrations' && request.method === 'POST') {
        return handleCreateRegistration(request, env);
      }
      if (path === '/api/payments/verify' && request.method === 'POST') {
        return handleVerify(request, env);
      }
      if (path === '/api/webhooks/moyasar' && request.method === 'POST') {
        return handleWebhook(request, env);
      }

      const m = /^\/api\/registrations\/([A-Za-z0-9-]+)$/.exec(path);
      if (m && request.method === 'GET') {
        return handleGetRegistration(request, env, m[1]);
      }

      return fail(request, env, 404, 'not_found', 'المسار غير موجود.');
    } catch (err) {
      // لا نسرّب تفاصيل الخطأ للعميل
      console.error('worker_error', err && err.message);
      return fail(request, env, 500, 'server_error', 'حدث خطأ غير متوقع، حاول لاحقًا.');
    }
  }
};
