import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sarToHalala, halalaToSar, newRegistrationNumber, canonicalHash } from '../src/registrations.js';
import { ageOn, normalizeMobile, validateRegistration } from '../src/validate.js';
import { totpAt, verifyTotp, hashPassword, verifyPassword, base32Encode, base32Decode } from '../src/auth.js';
import { csvCell } from '../src/admin.js';
import { hasPermission, resolveBranchScope } from '../src/rbac.js';
import { ApiError } from '../src/util.js';

test('money is converted to whole halalas without floats', () => {
  assert.equal(sarToHalala('300'), 30000);
  assert.equal(sarToHalala('300.5'), 30050);
  assert.equal(sarToHalala('0.10'), 10);
  assert.equal(sarToHalala('١٥٠'), 15000, 'Arabic-Indic digits accepted');
  assert.equal(sarToHalala('1.234'), null, 'more than 2 decimals rejected');
  assert.equal(sarToHalala('-5'), null);
  assert.equal(sarToHalala(''), null);
  assert.equal(halalaToSar(30050), 300.5);
  assert.equal(halalaToSar(30000), 300);
});

test('registration numbers use the public format without ambiguous characters', () => {
  for (let i = 0; i < 200; i++) {
    const n = newRegistrationNumber(new Date('2026-10-15T00:00:00Z'));
    assert.match(n, /^LPA-2026-[A-HJ-KM-NP-Z2-9]{5}$/);
  }
});

test('canonical hash is independent of key order', async () => {
  assert.equal(await canonicalHash({ a: 1, b: 'x' }), await canonicalHash({ b: 'x', a: 1 }));
  assert.notEqual(await canonicalHash({ a: 1 }), await canonicalHash({ a: 2 }));
});

test('age is computed on calendar dates and rejects impossible dates', () => {
  const today = new Date('2026-10-15T12:00:00Z');
  assert.equal(ageOn('2016-10-15', today), 10);
  assert.equal(ageOn('2016-10-16', today), 9, 'birthday tomorrow means still 9');
  assert.equal(ageOn('2026-02-30', today), null);
  assert.equal(ageOn('nope', today), null);
});

test('Saudi mobile numbers normalize from several input shapes', () => {
  assert.equal(normalizeMobile('+966 55 123 4567'), '0551234567');
  assert.equal(normalizeMobile('00966551234567'), '0551234567');
  assert.equal(normalizeMobile('٠٥٥١٢٣٤٥٦٧'), '0551234567');
  assert.equal(normalizeMobile('0141234567'), null);
});

test('validation returns per-field errors and never silently truncates', () => {
  const body = { program_id: 'monthly', branch_id: 'jizan', player_name: 'x', player_dob: '2030-01-01',
    guardian_name: 'ا', relationship: 'uncle', guardian_mobile: '123', terms_accepted: false };
  try {
    validateRegistration(body, new Date('2026-10-15T00:00:00Z'));
    assert.fail('expected validation error');
  } catch (e) {
    assert.ok(e instanceof ApiError);
    assert.equal(e.status, 422);
    for (const k of ['player_name', 'player_dob', 'guardian_name', 'relationship', 'guardian_mobile', 'terms_accepted']) {
      assert.ok(e.errors[k], `missing error for ${k}`);
    }
  }
  assert.throws(
    () => validateRegistration({ ...body, guardian_name: 'أ'.repeat(90) }, new Date('2026-10-15T00:00:00Z')),
    (e) => Boolean(e.errors && e.errors.guardian_name),
  );
});

test('TOTP matches the RFC 6238 SHA-1 test vector (6-digit form)', async () => {
  const secret = new TextEncoder().encode('12345678901234567890');
  // RFC vector: T = 59s -> 8-digit 94287082, so the 6-digit form is 287082.
  assert.equal(await totpAt(secret, Math.floor(59 / 30)), '287082');
  assert.equal(await verifyTotp(secret, '287082', -1, 59 * 1000), 1);
  assert.equal(await verifyTotp(secret, '287082', 1, 59 * 1000), null, 'replay of an already-used step is refused');
  assert.equal(await verifyTotp(secret, '000000', -1, 59 * 1000), null);
});

test('base32 round trip', () => {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
});

test('password hashes verify and reject wrong passwords', async () => {
  const h = await hashPassword('a very long passphrase');
  assert.match(h, /^pbkdf2_sha256\$100000\$/);
  assert.equal(await verifyPassword('a very long passphrase', h), true);
  assert.equal(await verifyPassword('another passphrase!!', h), false);
  assert.equal(await verifyPassword('x', 'garbage'), false);
});

test('CSV cells are escaped and spreadsheet formulas are neutralized', () => {
  assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
  assert.equal(csvCell('+971'), "'+971");
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(30000), '30000');
});

test('RBAC: owner has everything, branch roles cannot widen scope', () => {
  assert.equal(hasPermission('owner', 'users.manage'), true);
  assert.equal(hasPermission('branch_manager', 'payments.approve'), false);
  assert.equal(hasPermission('accountant', 'payments.approve'), true);
  assert.equal(hasPermission('guardian', 'registrations.read'), false);
  assert.equal(resolveBranchScope({ branch_id: 'jizan' }, null), 'jizan');
  assert.equal(resolveBranchScope({ branch_id: 'jizan' }, 'jizan'), 'jizan');
  assert.throws(() => resolveBranchScope({ branch_id: 'jizan' }, 'bish'), (e) => e.status === 403);
  assert.equal(resolveBranchScope({ branch_id: null }, 'bish'), 'bish');
});
