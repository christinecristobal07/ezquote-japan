import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  can,
  isManager,
  permissionsFor,
  type Permission,
  type Role,
} from './permissions.ts';

const ROLES: readonly Role[] = [
  'super_admin',
  'product_development',
  'admin',
  'sales_supervisor',
  'sales_agent',
];

/** The whole matrix, written out so a change has to be deliberate. */
const EXPECTED: Readonly<Record<Role, readonly Permission[]>> = {
  super_admin: ALL_PERMISSIONS,
  product_development: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
  sales_supervisor: ['quotation.create', 'quotation.viewOwn', 'quotation.viewTeam'],
  sales_agent: ['quotation.create', 'quotation.viewOwn'],
};

describe('can', () => {
  for (const role of ROLES) {
    for (const permission of ALL_PERMISSIONS) {
      const allowed = EXPECTED[role].includes(permission);
      it(`${role} ${allowed ? 'may' : 'may not'} ${permission}`, () => {
        expect(can(role, permission)).toBe(allowed);
      });
    }
  }
});

describe('isManager', () => {
  it.each([
    ['super_admin', true],
    ['product_development', true],
    ['admin', true],
    ['sales_supervisor', false],
    ['sales_agent', false],
  ] as const)('%s -> %s', (role, expected) => {
    expect(isManager(role)).toBe(expected);
  });
});

describe('permissionsFor', () => {
  it('gives managers every permission', () => {
    expect(permissionsFor('admin')).toHaveLength(ALL_PERMISSIONS.length);
  });

  it('never lets an agent see team or all quotations', () => {
    expect(can('sales_agent', 'quotation.viewTeam')).toBe(false);
    expect(can('sales_agent', 'quotation.viewAll')).toBe(false);
  });

  it('lets a supervisor see team quotes but not manage rates', () => {
    expect(can('sales_supervisor', 'quotation.viewTeam')).toBe(true);
    expect(can('sales_supervisor', 'rates.manage')).toBe(false);
    expect(can('sales_supervisor', 'quotation.viewAll')).toBe(false);
  });
});
