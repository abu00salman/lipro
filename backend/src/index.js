// Worker entry point: routing, CORS allowlist, error mapping.
// Bindings expected: DB (D1). Secrets: MFA_ENCRYPTION_KEY, SESSION_SECRET, IP_HASH_SALT.
// Plain vars: ALLOWED_ORIGINS (comma-separated).
import { ApiError, json, SECURITY_HEADERS } from './util.js';
import { handleCreateOrder, handleGetOrder, handleTapCharge, handleTapVerify, publicProducts } from './store.js';
import {
  handleAddMember, handleAttendanceReport, handleCreateCoach, handleCreateSession, handleCreateTeam,
  handleGetSession, handleListTeams, handleMarkAttendance, handleRemoveMember,
} from './coaching.js';
import { handleCreateRegistration, handleGetRegistration, handleTransferClaim, halalaToSar } from './registrations.js';
import {
  handleApprovePayment, handleAuditList, handleCreateUser, handleExportCsv, handleListRegistrations,
  handleLogin, handleLogout, handleMe, handleMfaConfirm, handleMfaEnroll, handleMfaVerify,
  handleRegistrationDetail, handleRejectPayment, handleReportSummary,
} from './admin.js';

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

async function publicConfig(env) {
  const programs = await env.DB
    .prepare('SELECT id, name, duration_label, price_halala, description, badge, includes_json, vat_included FROM programs WHERE active = 1 ORDER BY price_halala')
    .all();
  const branches = await env.DB.prepare('SELECT id, name FROM branches WHERE active = 1 ORDER BY name').all();
  return {
    ok: true,
    currency: 'SAR',
    vat_included: true,
    publishable_key: '',
    payment_methods: ['bank_transfer'],
    programs: (programs.results || []).map((p) => ({
      id: p.id, name: p.name, desc: p.description, duration: p.duration_label,
      price_sar: halalaToSar(p.price_halala), badge: p.badge, includes: JSON.parse(p.includes_json || '[]'),
      vat_included: !!p.vat_included,
    })),
    branches: branches.results || [],
    products: publicProducts(),
  };
}

/** Endpoints kept reachable on the public site but not implemented by this Worker yet. */
const NOT_IMPLEMENTED = [/^\/api\/registrations\/tap\//];
/** Removed on purpose: lookup by phone number let anyone enumerate guardians' data. */
const REMOVED = [/^\/api\/lookup\//];

async function route(request, env, url) {
  const { pathname: p } = url;
  const m = request.method;

  if (p === '/api/health' && m === 'GET') return json({ ok: true, time: new Date().toISOString() });
  if (p === '/api/config' && m === 'GET') return json(await publicConfig(env));

  if (p === '/api/orders' && m === 'POST') return handleCreateOrder(request, env);
  const order = /^\/api\/orders\/(LPS-[^/]+)$/.exec(p);
  if (order && m === 'GET') return handleGetOrder(request, env, order[1]);
  if (p === '/api/payments/tap/charge' && m === 'POST') return handleTapCharge(request, env);
  if (p === '/api/payments/tap/verify' && m === 'GET') return handleTapVerify(request, env, url);

  if (p === '/api/registrations' && m === 'POST') return handleCreateRegistration(request, env);
  const reg = /^\/api\/registrations\/(LPA-[^/]+)$/.exec(p);
  if (reg && m === 'GET') return handleGetRegistration(request, env, reg[1]);
  const claim = /^\/api\/registrations\/(LPA-[^/]+)\/transfer-claim$/.exec(p);
  if (claim && m === 'POST') return handleTransferClaim(request, env, claim[1]);

  if (p === '/api/admin/login' && m === 'POST') return handleLogin(request, env);
  if (p === '/api/admin/mfa/verify' && m === 'POST') return handleMfaVerify(request, env);
  if (p === '/api/admin/mfa/enroll' && m === 'POST') return handleMfaEnroll(request, env);
  if (p === '/api/admin/mfa/confirm' && m === 'POST') return handleMfaConfirm(request, env);
  if (p === '/api/admin/logout' && m === 'POST') return handleLogout(request, env);
  if (p === '/api/admin/me' && m === 'GET') return handleMe(request, env);
  if (p === '/api/admin/users' && m === 'POST') return handleCreateUser(request, env);

  if (p === '/api/admin/registrations' && m === 'GET') return handleListRegistrations(request, env, url);
  if (p === '/api/admin/registrations.csv' && m === 'GET') return handleExportCsv(request, env, url);
  const detail = /^\/api\/admin\/registrations\/(LPA-[^/]+)$/.exec(p);
  if (detail && m === 'GET') return handleRegistrationDetail(request, env, detail[1]);

  const pay = /^\/api\/admin\/payments\/(\d+)\/(approve|reject)$/.exec(p);
  if (pay && m === 'POST') {
    return pay[2] === 'approve'
      ? handleApprovePayment(request, env, Number(pay[1]))
      : handleRejectPayment(request, env, Number(pay[1]));
  }

  if (p === '/api/admin/reports/summary' && m === 'GET') return handleReportSummary(request, env, url);

  // Phase 2: teams, coaches, sessions, attendance
  if (p === '/api/admin/teams' && m === 'GET') return handleListTeams(request, env, url);
  if (p === '/api/admin/teams' && m === 'POST') return handleCreateTeam(request, env);
  if (p === '/api/admin/coaches' && m === 'POST') return handleCreateCoach(request, env);
  const members = /^\/api\/admin\/teams\/(\d+)\/members$/.exec(p);
  if (members && m === 'POST') return handleAddMember(request, env, Number(members[1]));
  const member = /^\/api\/admin\/teams\/(\d+)\/members\/(\d+)$/.exec(p);
  if (member && m === 'DELETE') return handleRemoveMember(request, env, Number(member[1]), Number(member[2]));
  const teamSessions = /^\/api\/admin\/teams\/(\d+)\/sessions$/.exec(p);
  if (teamSessions && m === 'POST') return handleCreateSession(request, env, Number(teamSessions[1]));
  const session = /^\/api\/admin\/sessions\/(\d+)$/.exec(p);
  if (session && m === 'GET') return handleGetSession(request, env, Number(session[1]));
  const sessionAtt = /^\/api\/admin\/sessions\/(\d+)\/attendance$/.exec(p);
  if (sessionAtt && m === 'PUT') return handleMarkAttendance(request, env, Number(sessionAtt[1]));
  if (p === '/api/admin/attendance/report' && m === 'GET') return handleAttendanceReport(request, env, url);
  if (p === '/api/admin/audit' && m === 'GET') return handleAuditList(request, env, url);

  if (REMOVED.some((re) => re.test(p))) throw new ApiError(410, 'removed', 'هذه الخدمة أُوقفت لحماية بيانات أولياء الأمور.');
  if (NOT_IMPLEMENTED.some((re) => re.test(p))) throw new ApiError(501, 'not_implemented', 'هذه الخدمة غير متاحة في هذا الإصدار.');

  throw new ApiError(404, 'not_found', 'المسار غير موجود.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...SECURITY_HEADERS, ...cors } });
    }
    try {
      const res = await route(request, env, url);
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(cors)) headers.set(k, v);
      return new Response(res.body, { status: res.status, headers });
    } catch (err) {
      if (err instanceof ApiError) {
        const body = { ok: false, code: err.code, message: err.message };
        if (err.errors) body.errors = err.errors;
        return json(body, err.status, { ...err.headers, ...cors });
      }
      // Never leak internals: log the type only.
      console.error('unhandled', err && err.name);
      return json({ ok: false, code: 'internal', message: 'حدث خطأ غير متوقع، حاول لاحقًا.' }, 500, cors);
    }
  },
};
