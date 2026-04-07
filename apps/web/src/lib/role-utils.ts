import { UserRole } from "../../../../packages/shared-types/src";

/**
 * Roles that may access FisioBase clinical data (medical records, RTP status
 * with notes, injury protocols). Enforced by requireRole('ADMIN', 'PHYSIO')
 * on the API and by canAccessClinicalData() for UI-level visibility guards.
 *
 * TREASURER and COACH are intentionally excluded — Privacy by Design (LGPD).
 */
export const CLINICAL_ROLES: ReadonlyArray<UserRole> = [
  "ADMIN",
  "PHYSIO",
] as const;

/**
 * Roles that may access financial data (charges, payments, reconciliation,
 * member billing). Enforced by requireRole('TREASURER') on the API (which
 * uses the linear hierarchy: ADMIN ≥ TREASURER).
 *
 * PHYSIO is excluded — it has no financial access by design.
 */
export const FINANCIAL_ROLES: ReadonlyArray<UserRole> = [
  "ADMIN",
  "TREASURER",
] as const;

/**
 * Returns true if the given role is allowed to access FisioBase clinical data:
 * full medical records, clinical notes, injury protocols, and RTP details.
 *
 * Use this to gate sidebar navigation, route access, and data-fetching hooks.
 *
 * @example
 * if (!canAccessClinicalData(user?.role)) router.push('/dashboard');
 */
export const canAccessClinicalData = (role: UserRole | undefined): boolean =>
  role !== undefined && (CLINICAL_ROLES as string[]).includes(role);

/**
 * Returns true if the given role may access financial data
 * (charges, payments, member billing, reconciliation).
 */
export const canAccessFinancialData = (role: UserRole | undefined): boolean =>
  role !== undefined && (FINANCIAL_ROLES as string[]).includes(role);

/** Full system administrator — unrestricted access across all modules. */
export const isAdmin = (role: UserRole | undefined): boolean =>
  role === "ADMIN";

/**
 * Physiotherapist — exclusive access to FisioBase clinical data.
 * Blocked from financial routes and sports-management write operations.
 */
export const isPhysio = (role: UserRole | undefined): boolean =>
  role === "PHYSIO";

/** Treasurer — financial read + charge access; no admin or clinical access. */
export const isTreasurer = (role: UserRole | undefined): boolean =>
  role === "TREASURER";
