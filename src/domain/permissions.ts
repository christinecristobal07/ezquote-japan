/**
 * Who may do what. This mirrors the RLS policies, but it is only for the UI:
 * hiding a button never secures anything. The database is the real gate.
 */

export type Role =
  'super_admin' | 'product_development' | 'admin' | 'sales_supervisor' | 'sales_agent';

export type Permission =
  | 'quotation.create'
  | 'quotation.viewOwn'
  | 'quotation.viewTeam'
  | 'quotation.viewAll'
  | 'rates.manage'
  | 'fx.manage'
  | 'content.manage'
  | 'agents.manage'
  | 'audit.view';

export const ALL_PERMISSIONS: readonly Permission[] = [
  'quotation.create',
  'quotation.viewOwn',
  'quotation.viewTeam',
  'quotation.viewAll',
  'rates.manage',
  'fx.manage',
  'content.manage',
  'agents.manage',
  'audit.view',
];

/** Super Admin, Product Development and Admin. */
export const MANAGER_ROLES: readonly Role[] = ['super_admin', 'product_development', 'admin'];

const AGENT_PERMISSIONS: readonly Permission[] = ['quotation.create', 'quotation.viewOwn'];

const SUPERVISOR_PERMISSIONS: readonly Permission[] = [...AGENT_PERMISSIONS, 'quotation.viewTeam'];

const MATRIX: Readonly<Record<Role, readonly Permission[]>> = {
  super_admin: ALL_PERMISSIONS,
  product_development: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
  sales_supervisor: SUPERVISOR_PERMISSIONS,
  sales_agent: AGENT_PERMISSIONS,
};

export function isManager(role: Role): boolean {
  return MANAGER_ROLES.includes(role);
}

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export function permissionsFor(role: Role): readonly Permission[] {
  return MATRIX[role];
}
