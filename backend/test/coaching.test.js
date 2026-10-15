import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call, makeStaff, validRegistration, createRegistrationApi } from './helpers.js';
import { hashPassword, createSession } from '../src/auth.js';

// Creates a player in a branch through the public API, so the dob/branch rules are real.
async function player(env, { branch = 'jizan', name, dob = '2016-05-01' }) {
  const r = await createRegistrationApi(env, validRegistration({ branch_id: branch, player_name: name, player_dob: dob }));
  assert.equal(r.status, 201);
  return env.DB.query('SELECT id FROM players ORDER BY id DESC LIMIT 1')[0].id;
}

async function setup(env) {
  const owner = await makeStaff(env, { role: 'owner' });
  const mgr = await makeStaff(env, { role: 'branch_manager', branch_id: 'jizan' });
  const coachUser = await env.DB
    .prepare("INSERT INTO users (email, full_name, role, branch_id, password_hash, mfa_enabled) VALUES ('coach@example.test', 'مدرب تجريبي', 'coach', 'jizan', ?, 1) RETURNING id")
    .bind(await hashPassword('correct horse battery'))
    .first();
  const coachCreated = await call(env, 'POST', '/api/admin/coaches', { token: mgr.token, body: { branch_id: 'jizan', full_name: 'كابتن تجريبي', user_id: coachUser.id } });
  assert.equal(coachCreated.status, 201);
  const team = await call(env, 'POST', '/api/admin/teams', { token: mgr.token, body: { branch_id: 'jizan', category_id: 'u10', name: 'فريق تحت ١٠', coach_id: coachCreated.data.id } });
  assert.equal(team.status, 201);
  // Session for the SAME user that the coach row is linked to.
  const coachToken = await createSession(env.DB, coachUser.id);
  return { owner, mgr, coachUser, coachTeamId: team.data.id, coachId: coachCreated.data.id, coachToken };
}

test('a squad member must belong to the team branch and the category age window', async () => {
  const env = makeEnv();
  const s = await setup(env);
  const inBranch = await player(env, { name: 'سامي عبدالله الأسمري', dob: '2016-05-01' }); // age 10: u10 window is 8-9
  const tooOld = await call(env, 'POST', `/api/admin/teams/${s.coachTeamId}/members`, { token: s.mgr.token, body: { player_id: inBranch } });
  assert.equal(tooOld.status, 422);
  assert.equal(tooOld.data.code, 'age_mismatch');

  const ok = await player(env, { name: 'ماجد فهد الشهري', dob: '2017-03-03' }); // age 9
  assert.equal((await call(env, 'POST', `/api/admin/teams/${s.coachTeamId}/members`, { token: s.mgr.token, body: { player_id: ok } })).status, 201);

  const other = await player(env, { branch: 'bish', name: 'نايف محمد الحربي', dob: '2017-03-03' });
  const wrongBranch = await call(env, 'POST', `/api/admin/teams/${s.coachTeamId}/members`, { token: s.mgr.token, body: { player_id: other } });
  assert.equal(wrongBranch.status, 422);
});

test('a player cannot be in two teams at once', async () => {
  const env = makeEnv();
  const s = await setup(env);
  const second = await call(env, 'POST', '/api/admin/teams', { token: s.mgr.token, body: { branch_id: 'jizan', category_id: 'u10', name: 'فريق ب' } });
  const pid = await player(env, { name: 'ياسر حسن القحطاني', dob: '2017-03-03' });
  assert.equal((await call(env, 'POST', `/api/admin/teams/${s.coachTeamId}/members`, { token: s.mgr.token, body: { player_id: pid } })).status, 201);
  const dup = await call(env, 'POST', `/api/admin/teams/${second.data.id}/members`, { token: s.mgr.token, body: { player_id: pid } });
  assert.equal(dup.status, 409);
});

test('attendance is marked by the coach of the team, and the roster only holds squad members', async () => {
  const env = makeEnv();
  const s = await setup(env);
  const a = await player(env, { name: 'طارق سعيد الزهراني', dob: '2017-03-03' });
  const b = await player(env, { name: 'بندر عمر الشهراني', dob: '2017-04-04' });
  for (const pid of [a, b]) await call(env, 'POST', `/api/admin/teams/${s.coachTeamId}/members`, { token: s.mgr.token, body: { player_id: pid } });

  const sess = await call(env, 'POST', `/api/admin/teams/${s.coachTeamId}/sessions`, { token: s.coachToken, body: { starts_at: '2026-10-14T14:00:00Z', venue: 'ملعب يارا' } });
  assert.equal(sess.status, 201);

  // Coach marks both players.
  const mark = await call(env, 'PUT', `/api/admin/sessions/${sess.data.id}/attendance`, {
    token: s.coachToken, body: { records: [{ player_id: a, status: 'present' }, { player_id: b, status: 'late' }] },
  });
  assert.equal(mark.status, 200);

  // Re-marking updates the row; it does not create a duplicate.
  await call(env, 'PUT', `/api/admin/sessions/${sess.data.id}/attendance`, { token: s.coachToken, body: { records: [{ player_id: b, status: 'absent' }] } });
  assert.equal(env.DB.query('SELECT COUNT(*) AS n FROM attendance')[0].n, 2);

  const roster = await call(env, 'GET', `/api/admin/sessions/${sess.data.id}`, { token: s.coachToken });
  assert.equal(roster.data.roster.find((r) => r.player_id === b).status, 'absent');

  // A player outside the squad is rejected.
  const outsider = await player(env, { name: 'فيصل راشد الغامدي', dob: '2017-05-05' });
  const bad = await call(env, 'PUT', `/api/admin/sessions/${sess.data.id}/attendance`, { token: s.coachToken, body: { records: [{ player_id: outsider, status: 'present' }] } });
  assert.equal(bad.status, 422);

  // Invalid status and duplicates are rejected.
  assert.equal((await call(env, 'PUT', `/api/admin/sessions/${sess.data.id}/attendance`, { token: s.coachToken, body: { records: [{ player_id: a, status: 'maybe' }] } })).status, 422);
  assert.equal((await call(env, 'PUT', `/api/admin/sessions/${sess.data.id}/attendance`, { token: s.coachToken, body: { records: [{ player_id: a, status: 'present' }, { player_id: a, status: 'late' }] } })).status, 422);
});

test('a coach cannot act on another coach’s team', async () => {
  const env = makeEnv();
  const s = await setup(env);
  const other = await call(env, 'POST', '/api/admin/teams', { token: s.mgr.token, body: { branch_id: 'jizan', category_id: 'u12', name: 'فريق تحت ١٢' } });
  const res = await call(env, 'POST', `/api/admin/teams/${other.data.id}/sessions`, { token: s.coachToken, body: { starts_at: '2026-10-14T14:00:00Z' } });
  assert.equal(res.status, 404);
  const list = await call(env, 'GET', '/api/admin/teams', { token: s.coachToken });
  assert.equal(list.data.items.length, 1);
  assert.equal(list.data.items[0].id, s.coachTeamId);
});

test('attendance report computes rates and leaves excused days out', async () => {
  const env = makeEnv();
  const s = await setup(env);
  const pid = await player(env, { name: 'عبدالعزيز منصور الشمري', dob: '2017-03-03' });
  await call(env, 'POST', `/api/admin/teams/${s.coachTeamId}/members`, { token: s.mgr.token, body: { player_id: pid } });
  const statuses = ['present', 'present', 'late', 'absent', 'excused'];
  for (let i = 0; i < statuses.length; i++) {
    const sess = await call(env, 'POST', `/api/admin/teams/${s.coachTeamId}/sessions`, { token: s.coachToken, body: { starts_at: `2026-10-0${i + 1}T14:00:00Z` } });
    await call(env, 'PUT', `/api/admin/sessions/${sess.data.id}/attendance`, { token: s.coachToken, body: { records: [{ player_id: pid, status: statuses[i] }] } });
  }
  const rep = await call(env, 'GET', `/api/admin/attendance/report?team_id=${s.coachTeamId}&from=2026-10-01&to=2026-10-31`, { token: s.mgr.token });
  assert.equal(rep.status, 200);
  const row = rep.data.items[0];
  assert.equal(row.present, 2);
  assert.equal(row.late, 1);
  assert.equal(row.absent, 1);
  assert.equal(row.excused, 1);
  // (2 present + 1 late) / (4 counted) = 75%
  assert.equal(row.rate_percent, 75);
});

test('removing a member stops them counting, and unmarked players show as null', async () => {
  const env = makeEnv();
  const s = await setup(env);
  const pid = await player(env, { name: 'ريان ناصر الدوسري', dob: '2017-03-03' });
  await call(env, 'POST', `/api/admin/teams/${s.coachTeamId}/members`, { token: s.mgr.token, body: { player_id: pid } });
  const sess = await call(env, 'POST', `/api/admin/teams/${s.coachTeamId}/sessions`, { token: s.coachToken, body: { starts_at: '2026-10-14T14:00:00Z' } });
  const roster = await call(env, 'GET', `/api/admin/sessions/${sess.data.id}`, { token: s.coachToken });
  assert.equal(roster.data.roster[0].status, null);
  assert.equal((await call(env, 'DELETE', `/api/admin/teams/${s.coachTeamId}/members/${pid}`, { token: s.mgr.token })).status, 200);
  const after = await call(env, 'GET', `/api/admin/sessions/${sess.data.id}`, { token: s.coachToken });
  assert.equal(after.data.roster.length, 0);
});

test('registration staff cannot mark attendance', async () => {
  const env = makeEnv();
  const s = await setup(env);
  const reg = await makeStaff(env, { role: 'registration', branch_id: 'jizan' });
  const sess = await call(env, 'POST', `/api/admin/teams/${s.coachTeamId}/sessions`, { token: s.mgr.token, body: { starts_at: '2026-10-14T14:00:00Z' } });
  assert.equal((await call(env, 'PUT', `/api/admin/sessions/${sess.data.id}/attendance`, { token: reg.token, body: { records: [{ player_id: 1, status: 'present' }] } })).status, 403);
});
