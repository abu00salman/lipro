// Role-based access control with branch scoping.
// branch_id = NULL on a user means "all branches". Branch-scoped users can never
// widen their scope through query parameters.
import { ApiError } from './util.js';

export const ROLES = ['owner', 'admin', 'accountant', 'branch_manager', 'registration', 'coach', 'guardian', 'auditor'];

const P = {
  owner: ['*'],
  admin: [
    'registrations.read', 'registrations.write', 'players.read', 'players.write',
    'payments.read', 'payments.review', 'reports.read', 'programs.write', 'audit.read',
    'teams.read', 'teams.write', 'attendance.read', 'attendance.write',
  ],
  accountant: ['registrations.read', 'registrations.export', 'payments.read', 'payments.review', 'payments.approve', 'reports.read'],
  branch_manager: ['registrations.read', 'registrations.write', 'registrations.export', 'players.read', 'players.write', 'reports.read',
    'teams.read', 'teams.write', 'attendance.read', 'attendance.write'],
  registration: ['registrations.read', 'registrations.write', 'players.read', 'teams.read'],
  // Coaches only act on teams they coach (checked in coaching.js).
  coach: ['players.read', 'teams.read', 'attendance.read', 'attendance.write'],
  guardian: [], // parent portal arrives in Phase 4; no staff API access
  auditor: ['registrations.read', 'registrations.export', 'payments.read', 'reports.read', 'audit.read', 'teams.read', 'attendance.read'],
};

// Roles that are allowed to act on every branch (no branch_id on the account).
export const GLOBAL_ROLES = ['owner', 'admin', 'accountant', 'auditor'];

export function hasPermission(role, perm) {
  const list = P[role] || [];
  return list.includes('*') || list.includes(perm);
}

/** Throws 403 unless the user holds `perm`. Also enforces MFA for every staff role. */
export function requirePermission(user, perm) {
  if (user.role === 'guardian' || !user.mfa_enabled) {
    throw new ApiError(403, 'mfa_required', 'فعّل التحقق بخطوتين قبل استخدام لوحة الإدارة.');
  }
  if (!hasPermission(user.role, perm)) throw new ApiError(403, 'forbidden', 'ليست لديك صلاحية لهذا الإجراء.');
}

/** Returns the branch a query may use: forced for scoped users, optional for global ones. */
export function resolveBranchScope(user, requestedBranchId) {
  if (user.branch_id) {
    if (requestedBranchId && requestedBranchId !== user.branch_id) {
      throw new ApiError(403, 'branch_scope', 'هذا الفرع خارج نطاق صلاحياتك.');
    }
    return user.branch_id;
  }
  return requestedBranchId || null;
}

/** Ensures a single record's branch is inside the user's scope. */
export function assertBranchAccess(user, recordBranchId) {
  if (user.branch_id && user.branch_id !== recordBranchId) {
    // Same status as "not found" so scoped users cannot probe other branches.
    throw new ApiError(404, 'not_found', 'العنصر غير موجود.');
  }
}
