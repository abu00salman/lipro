// Phase 2: coaches, teams, squads, training sessions and attendance.
// A coach can only act on teams they coach. Branch-scoped staff act only inside their branch.
import { ApiError, json, nowIso, readJson } from './util.js';
import { requireUser } from './auth.js';
import { assertBranchAccess, requirePermission, resolveBranchScope } from './rbac.js';
import { writeAudit } from './audit.js';
import { ageOn } from './validate.js';

const ATTENDANCE = ['present', 'absent', 'late', 'excused'];
const MAX_ROSTER = 200;

async function getTeam(db, id) {
  const t = await db
    .prepare('SELECT t.id, t.branch_id, t.category_id, t.name, t.coach_id, c.user_id AS coach_user_id FROM teams t LEFT JOIN coaches c ON c.id = t.coach_id WHERE t.id = ?')
    .bind(id)
    .first();
  if (!t) throw new ApiError(404, 'not_found', 'العنصر غير موجود.');
  return t;
}

/** Owners/admins/branch managers manage teams in their scope; a coach manages only own teams. */
async function canManageTeam(user, team) {
  if (user.role === 'coach') {
    if (team.coach_user_id !== user.id) throw new ApiError(404, 'not_found', 'العنصر غير موجود.');
    return;
  }
  assertBranchAccess(user, team.branch_id);
}

export async function handleListTeams(request, env, url) {
  const user = await requireUser(env.DB, request);
  requirePermission(user, 'teams.read');
  const branch = resolveBranchScope(user, url.searchParams.get('branch_id'));
  const params = [];
  let where = '';
  if (user.role === 'coach') { where = 'WHERE c.user_id = ?'; params.push(user.id); }
  else if (branch) { where = 'WHERE t.branch_id = ?'; params.push(branch); }
  const rows = await env.DB
    .prepare(
      `SELECT t.id, t.name, t.branch_id, b.name AS branch_name, t.category_id, ac.name AS category_name,
              t.coach_id, c.full_name AS coach_name, c.user_id AS coach_user_id,
              (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id) AS members
         FROM teams t
         JOIN branches b ON b.id = t.branch_id
         JOIN age_categories ac ON ac.id = t.category_id
         LEFT JOIN coaches c ON c.id = t.coach_id
         ${where}
        ORDER BY b.name, t.name`
    )
    .bind(...params)
    .all();
  return json({ items: (rows.results || []).map(({ coach_user_id, ...r }) => r) });
}

export async function handleCreateTeam(request, env) {
  const user = await requireUser(env.DB, request);
  requirePermission(user, 'teams.write');
  const body = await readJson(request);
  const name = String(body.name || '').trim();
  const branchId = String(body.branch_id || '');
  const categoryId = String(body.category_id || '');
  const coachId = body.coach_id ? Number(body.coach_id) : null;
  const errors = {};
  if (name.length < 2 || name.length > 60) errors.name = 'اسم الفريق بين 2 و 60 حرفًا.';
  if (!branchId) errors.branch_id = 'اختر الفرع.';
  if (!categoryId) errors.category_id = 'اختر الفئة السنية.';
  if (Object.keys(errors).length) throw new ApiError(422, 'validation_failed', 'بعض الحقول غير صحيحة.', errors);
  assertBranchAccess(user, branchId);
  const cat = await env.DB.prepare('SELECT id FROM age_categories WHERE id = ?').bind(categoryId).first();
  if (!cat) throw new ApiError(422, 'validation_failed', 'بعض الحقول غير صحيحة.', { category_id: 'الفئة غير موجودة.' });
  if (coachId) {
    const c = await env.DB.prepare('SELECT branch_id FROM coaches WHERE id = ? AND active = 1').bind(coachId).first();
    if (!c || c.branch_id !== branchId) throw new ApiError(422, 'validation_failed', 'بعض الحقول غير صحيحة.', { coach_id: 'المدرب غير متاح في هذا الفرع.' });
  }
  try {
    const row = await env.DB
      .prepare('INSERT INTO teams (branch_id, category_id, name, coach_id) VALUES (?, ?, ?, ?) RETURNING id')
      .bind(branchId, categoryId, name, coachId)
      .first();
    await writeAudit(env.DB, { actorId: user.id, action: 'team.created', entity: 'team', entityId: row.id, branchId });
    return json({ id: row.id }, 201);
  } catch (err) {
    if (String(err && err.message).includes('UNIQUE')) throw new ApiError(409, 'duplicate', 'يوجد فريق بهذا الاسم في الفرع.');
    throw err;
  }
}

export async function handleAddMember(request, env, teamId) {
  const user = await requireUser(env.DB, request);
  requirePermission(user, 'teams.write');
  const team = await getTeam(env.DB, teamId);
  await canManageTeam(user, team);
  const body = await readJson(request);
  const playerId = Number(body.player_id);
  const player = await env.DB.prepare('SELECT id, branch_id, dob FROM players WHERE id = ?').bind(playerId).first();
  if (!player) throw new ApiError(422, 'validation_failed', 'بعض الحقول غير صحيحة.', { player_id: 'اللاعب غير موجود.' });
  if (player.branch_id !== team.branch_id) throw new ApiError(422, 'validation_failed', 'اللاعب من فرع آخر.', { player_id: 'اللاعب من فرع آخر.' });

  // The squad must match the category's age window on today's date.
  const cat = await env.DB.prepare('SELECT min_age, max_age FROM age_categories WHERE id = ?').bind(team.category_id).first();
  const age = ageOn(player.dob);
  if (age === null || age < cat.min_age || age > cat.max_age) {
    throw new ApiError(422, 'age_mismatch', 'عمر اللاعب خارج الفئة السنية لهذا الفريق.');
  }
  try {
    await env.DB.prepare('INSERT INTO team_members (player_id, team_id, joined_at) VALUES (?, ?, ?)').bind(playerId, team.id, nowIso()).run();
  } catch (err) {
    if (String(err && err.message).includes('UNIQUE')) throw new ApiError(409, 'already_in_team', 'اللاعب في فريق آخر. انقله بعد إزالته من فريقه الحالي.');
    throw err;
  }
  await writeAudit(env.DB, { actorId: user.id, action: 'team.member_added', entity: 'team', entityId: team.id, branchId: team.branch_id, meta: { player_id: playerId } });
  return json({ ok: true }, 201);
}

export async function handleRemoveMember(request, env, teamId, playerId) {
  const user = await requireUser(env.DB, request);
  requirePermission(user, 'teams.write');
  const team = await getTeam(env.DB, teamId);
  await canManageTeam(user, team);
  const res = await env.DB.prepare('DELETE FROM team_members WHERE team_id = ? AND player_id = ?').bind(team.id, playerId).run();
  if (!res.meta || res.meta.changes === 0) throw new ApiError(404, 'not_found', 'العنصر غير موجود.');
  await writeAudit(env.DB, { actorId: user.id, action: 'team.member_removed', entity: 'team', entityId: team.id, branchId: team.branch_id, meta: { player_id: playerId } });
  return json({ ok: true });
}

export async function handleCreateCoach(request, env) {
  const user = await requireUser(env.DB, request);
  requirePermission(user, 'teams.write');
  const body = await readJson(request);
  const name = String(body.full_name || '').trim();
  const branchId = String(body.branch_id || '');
  const errors = {};
  if (name.length < 2 || name.length > 80) errors.full_name = 'اسم المدرب مطلوب.';
  if (!branchId) errors.branch_id = 'اختر الفرع.';
  if (Object.keys(errors).length) throw new ApiError(422, 'validation_failed', 'بعض الحقول غير صحيحة.', errors);
  assertBranchAccess(user, branchId);
  const branch = await env.DB.prepare('SELECT id FROM branches WHERE id = ? AND active = 1').bind(branchId).first();
  if (!branch) throw new ApiError(422, 'validation_failed', 'بعض الحقول غير صحيحة.', { branch_id: 'الفرع غير موجود.' });
  let linkUser = null;
  if (body.user_id) {
    // Only coach-role accounts can be linked, and only inside the same branch.
    linkUser = await env.DB.prepare("SELECT id, branch_id FROM users WHERE id = ? AND role = 'coach' AND active = 1").bind(Number(body.user_id)).first();
    if (!linkUser || linkUser.branch_id !== branchId) throw new ApiError(422, 'validation_failed', 'بعض الحقول غير صحيحة.', { user_id: 'حساب المدرب غير صالح لهذا الفرع.' });
  }
  const row = await env.DB
    .prepare('INSERT INTO coaches (branch_id, full_name, mobile, user_id) VALUES (?, ?, ?, ?) RETURNING id')
    .bind(branchId, name, String(body.mobile || '').trim() || null, linkUser ? linkUser.id : null)
    .first();
  await writeAudit(env.DB, { actorId: user.id, action: 'coach.created', entity: 'coach', entityId: row.id, branchId });
  return json({ id: row.id }, 201);
}

export async function handleCreateSession(request, env, teamId) {
  const user = await requireUser(env.DB, request);
  requirePermission(user, 'attendance.write');
  const team = await getTeam(env.DB, teamId);
  await canManageTeam(user, team);
  const body = await readJson(request);
  const when = new Date(body.starts_at);
  if (!body.starts_at || isNaN(when.getTime())) throw new ApiError(422, 'validation_failed', 'وقت الحصة غير صحيح.', { starts_at: 'وقت الحصة غير صحيح.' });
  const venue = String(body.venue || '').trim().slice(0, 100) || null;
  const row = await env.DB
    .prepare('INSERT INTO training_sessions (team_id, starts_at, venue) VALUES (?, ?, ?) RETURNING id')
    .bind(team.id, when.toISOString(), venue)
    .first();
  return json({ id: row.id, starts_at: when.toISOString() }, 201);
}

async function getSessionWithTeam(db, sessionId) {
  const s = await db
    .prepare(
      `SELECT s.id, s.team_id, s.starts_at, s.venue, t.branch_id, t.name AS team_name, c.user_id AS coach_user_id
         FROM training_sessions s JOIN teams t ON t.id = s.team_id LEFT JOIN coaches c ON c.id = t.coach_id
        WHERE s.id = ?`
    )
    .bind(sessionId)
    .first();
  if (!s) throw new ApiError(404, 'not_found', 'العنصر غير موجود.');
  return s;
}

/** Roster for one session: every squad member with their mark (null = not marked yet). */
export async function handleGetSession(request, env, sessionId) {
  const user = await requireUser(env.DB, request);
  requirePermission(user, 'attendance.read');
  const s = await getSessionWithTeam(env.DB, sessionId);
  await canManageTeam(user, { branch_id: s.branch_id, coach_user_id: s.coach_user_id });
  const rows = await env.DB
    .prepare(
      `SELECT p.id AS player_id, p.full_name, a.status
         FROM team_members m
         JOIN players p ON p.id = m.player_id
         LEFT JOIN attendance a ON a.player_id = p.id AND a.session_id = ?
        WHERE m.team_id = ?
        ORDER BY p.full_name
        LIMIT ?`
    )
    .bind(sessionId, s.team_id, MAX_ROSTER)
    .all();
  return json({ session_id: s.id, team: s.team_name, starts_at: s.starts_at, venue: s.venue, roster: rows.results || [] });
}

/** Marks many players in one batch. Re-marking updates the row. Only squad members are accepted. */
export async function handleMarkAttendance(request, env, sessionId) {
  const user = await requireUser(env.DB, request);
  requirePermission(user, 'attendance.write');
  const s = await getSessionWithTeam(env.DB, sessionId);
  await canManageTeam(user, { branch_id: s.branch_id, coach_user_id: s.coach_user_id });
  const body = await readJson(request, 32 * 1024);
  if (!Array.isArray(body.records) || body.records.length === 0 || body.records.length > MAX_ROSTER) {
    throw new ApiError(422, 'validation_failed', 'قائمة الحضور غير صحيحة.', { records: 'أرسل قائمة من 1 إلى 200 سجل.' });
  }
  const members = new Set(
    ((await env.DB.prepare('SELECT player_id FROM team_members WHERE team_id = ?').bind(s.team_id).all()).results || []).map((r) => r.player_id)
  );
  const seen = new Set();
  for (const r of body.records) {
    const pid = Number(r.player_id);
    if (!members.has(pid)) throw new ApiError(422, 'validation_failed', 'لاعب غير مسجّل في هذا الفريق.', { records: 'لاعب غير مسجّل في هذا الفريق.' });
    if (!ATTENDANCE.includes(r.status)) throw new ApiError(422, 'validation_failed', 'حالة الحضور غير صحيحة.', { records: 'حالة الحضور غير صحيحة.' });
    if (seen.has(pid)) throw new ApiError(422, 'validation_failed', 'لاعب مكرر في القائمة.', { records: 'لاعب مكرر في القائمة.' });
    seen.add(pid);
  }
  const at = nowIso();
  await env.DB.batch(
    body.records.map((r) =>
      env.DB
        .prepare(
          `INSERT INTO attendance (session_id, player_id, status, marked_by, marked_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (session_id, player_id) DO UPDATE SET status = excluded.status, marked_by = excluded.marked_by, marked_at = excluded.marked_at`
        )
        .bind(s.id, Number(r.player_id), r.status, user.id, at)
    )
  );
  await writeAudit(env.DB, { actorId: user.id, action: 'attendance.marked', entity: 'training_session', entityId: s.id, branchId: s.branch_id, meta: { count: body.records.length } });
  return json({ session_id: s.id, saved: body.records.length });
}

/** Per-player attendance rate for a team over a date range. Excused days are left out of the rate. */
export async function handleAttendanceReport(request, env, url) {
  const user = await requireUser(env.DB, request);
  requirePermission(user, 'attendance.read');
  const teamId = Number(url.searchParams.get('team_id'));
  if (!teamId) throw new ApiError(422, 'validation_failed', 'اختر الفريق.');
  const team = await getTeam(env.DB, teamId);
  await canManageTeam(user, team);
  const from = url.searchParams.get('from') || '1970-01-01';
  const to = url.searchParams.get('to') || '9999-12-31';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new ApiError(422, 'validation_failed', 'نطاق التاريخ غير صحيح.');
  }
  const rows = await env.DB
    .prepare(
      `SELECT p.id AS player_id, p.full_name,
              SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS present,
              SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) AS late,
              SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent,
              SUM(CASE WHEN a.status = 'excused' THEN 1 ELSE 0 END) AS excused
         FROM team_members m
         JOIN players p ON p.id = m.player_id
         LEFT JOIN training_sessions s ON s.team_id = m.team_id AND date(s.starts_at) BETWEEN ? AND ?
         LEFT JOIN attendance a ON a.session_id = s.id AND a.player_id = p.id
        WHERE m.team_id = ?
        GROUP BY p.id, p.full_name
        ORDER BY p.full_name`
    )
    .bind(from, to, team.id)
    .all();
  return json({
    team_id: team.id, from, to,
    items: (rows.results || []).map((r) => {
      const counted = r.present + r.late + r.absent;
      const attended = r.present + r.late;
      return { ...r, rate_percent: counted ? Math.round((attended / counted) * 1000) / 10 : null };
    }),
  });
}

