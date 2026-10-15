// Server-side validation for public registration input. The browser checks are
// a convenience only; every rule here is enforced again on the server.
import { ApiError, toAsciiDigits } from './util.js';

/** Age window for academy players (assumption — confirm with the academy). */
export const PLAYER_AGE_MIN = 4;
export const PLAYER_AGE_MAX = 18;
export const CONSENT_VERSION = '2026-10-01';

const NAME_RE = /^[\p{L}][\p{L}\p{M} .'-]{1,79}$/u;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,100}\.[^\s@]{2,24}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const POSITIONS = ['goalkeeper', 'defender', 'midfielder', 'winger', 'striker', 'unsure'];
const RELATIONS = ['father', 'mother', 'brother', 'guardian', 'other'];
const GENDERS = ['male', 'female'];

export function normalizeMobile(v) {
  let d = toAsciiDigits(v).replace(/\D/g, '');
  if (d.startsWith('00966')) d = d.slice(5);
  else if (d.startsWith('966')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  return /^5\d{8}$/.test(d) ? '0' + d : null;
}

/** Trims a value. Over-long input is reported as a field error, never silently cut. */
function text(v, max, field, errors) {
  const s = v === undefined || v === null ? '' : String(v).trim();
  if (s.length > max) errors[field] = `الحد الأقصى ${max} حرف.`;
  return s;
}

/** Returns the calendar age in whole years on `today`, or null if the date is invalid. */
export function ageOn(dob, today = new Date()) {
  const m = DATE_RE.exec(dob || '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const born = new Date(Date.UTC(y, mo - 1, d));
  if (born.getUTCFullYear() !== y || born.getUTCMonth() !== mo - 1 || born.getUTCDate() !== d) return null;
  let age = today.getUTCFullYear() - y;
  const before =
    today.getUTCMonth() + 1 < mo || (today.getUTCMonth() + 1 === mo && today.getUTCDate() < d);
  if (before) age--;
  return age;
}

/**
 * Validates and normalizes a registration body.
 * Returns the clean values; throws ApiError(422) with a per-field error map.
 */
export function validateRegistration(body, today = new Date()) {
  const errors = {};
  const v = {};

  v.program_id = text(body.program_id, 40, 'program_id', errors);
  v.branch_id = text(body.branch_id, 40, 'branch_id', errors);
  if (!v.program_id) errors.program_id = 'اختر البرنامج.';
  if (!v.branch_id) errors.branch_id = 'اختر الفرع.';

  v.player_name = text(body.player_name, 80, 'player_name', errors);
  if (!NAME_RE.test(v.player_name)) errors.player_name = 'اكتب اسم اللاعب الثلاثي كما في الهوية.';

  v.player_dob = text(body.player_dob, 10, 'player_dob', errors);
  const age = ageOn(v.player_dob, today);
  if (age === null) errors.player_dob = 'تاريخ الميلاد غير صحيح.';
  else if (age < PLAYER_AGE_MIN || age > PLAYER_AGE_MAX) {
    errors.player_dob = `العمر المقبول بين ${PLAYER_AGE_MIN} و ${PLAYER_AGE_MAX} سنة.`;
  }

  v.gender = text(body.gender, 10, 'gender', errors);
  if (v.gender && !GENDERS.includes(v.gender)) errors.gender = 'قيمة الجنس غير صحيحة.';

  v.nationality = text(body.nationality, 60, 'nationality', errors);
  v.school = text(body.school, 100, 'school', errors);
  v.football_experience = text(body.football_experience, 200, 'football_experience', errors);

  v.preferred_position = text(body.preferred_position, 20, 'preferred_position', errors);
  if (v.preferred_position && !POSITIONS.includes(v.preferred_position)) {
    errors.preferred_position = 'المركز غير صحيح.';
  }

  v.jersey_size = text(body.jersey_size, 10, 'jersey_size', errors);
  if (v.jersey_size && !/^[A-Za-z0-9]{1,10}$/.test(v.jersey_size)) errors.jersey_size = 'المقاس غير صحيح.';

  v.guardian_name = text(body.guardian_name, 80, 'guardian_name', errors);
  if (!NAME_RE.test(v.guardian_name)) errors.guardian_name = 'اكتب اسم ولي الأمر.';

  v.relationship = text(body.relationship, 20, 'relationship', errors);
  if (!RELATIONS.includes(v.relationship)) errors.relationship = 'اختر صلة القرابة.';

  v.guardian_mobile = normalizeMobile(body.guardian_mobile);
  if (!v.guardian_mobile) errors.guardian_mobile = 'رقم الجوال يجب أن يبدأ بـ 05 ويتكون من ١٠ أرقام.';

  v.emergency_mobile = text(body.emergency_mobile, 20, 'emergency_mobile', errors) ? normalizeMobile(body.emergency_mobile) : null;
  if (body.emergency_mobile && !v.emergency_mobile) errors.emergency_mobile = 'رقم جوال الطوارئ غير صحيح.';

  v.guardian_email = text(body.guardian_email, 120, 'guardian_email', errors).toLowerCase();
  if (v.guardian_email && !EMAIL_RE.test(v.guardian_email)) errors.guardian_email = 'البريد الإلكتروني غير صحيح.';

  v.father_job = text(body.father_job, 80, 'father_job', errors);
  v.mother_job = text(body.mother_job, 80, 'mother_job', errors);

  if (body.terms_accepted !== true) errors.terms_accepted = 'يلزم الموافقة على الشروط والأحكام.';

  const method = text(body.payment_method, 20, 'payment_method', errors) || 'bank_transfer';
  if (method !== 'bank_transfer') errors.payment_method = 'طريقة الدفع غير متاحة حاليًا.';

  if (Object.keys(errors).length) {
    throw new ApiError(422, 'validation_failed', 'بعض الحقول غير صحيحة.', errors);
  }
  return v;
}
