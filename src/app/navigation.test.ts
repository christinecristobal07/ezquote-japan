import { describe, expect, it } from 'vitest';
import { visibleNavGroups, visibleNavItems } from './navigation.ts';
import type { Role } from '@/domain/permissions';

function labels(role: Role): string[] {
  return visibleNavItems(role).map((item) => item.label);
}

describe('visibleNavItems', () => {
  it('shows an agent only their own work', () => {
    expect(labels('sales_agent')).toEqual(['Dashboard', 'New quotation', 'Quotations']);
  });

  it('adds Team quotations for a supervisor', () => {
    expect(labels('sales_supervisor')).toEqual([
      'Dashboard',
      'New quotation',
      'Quotations',
      'Team quotations',
    ]);
  });

  it.each(['super_admin', 'product_development', 'admin'] as const)(
    'gives %s every item except Team quotations',
    (role) => {
      const visible = labels(role);
      expect(visible).toEqual([
        'Dashboard',
        'New quotation',
        'Quotations',
        'Rates & FX',
        'Content',
        'Agents',
        'Audit log',
      ]);
      // Managers already see everything under Quotations.
      expect(visible).not.toContain('Team quotations');
    },
  );

  it('never shows an agent an admin destination', () => {
    const paths = visibleNavItems('sales_agent').map((item) => item.path);
    expect(paths.some((path) => path.startsWith('/admin'))).toBe(false);
    expect(paths).not.toContain('/audit');
  });
});

describe('visibleNavGroups', () => {
  it('drops the Administration heading for an agent', () => {
    const groups = visibleNavGroups('sales_agent');
    expect(groups.map((group) => group.name)).toEqual(['Sales']);
  });

  it('drops it for a supervisor too', () => {
    expect(visibleNavGroups('sales_supervisor').map((group) => group.name)).toEqual(['Sales']);
  });

  it('shows both headings for a manager', () => {
    const groups = visibleNavGroups('admin');
    expect(groups.map((group) => group.name)).toEqual(['Sales', 'Administration']);
    expect(groups[1]?.items.map((item) => item.label)).toEqual([
      'Rates & FX',
      'Content',
      'Agents',
      'Audit log',
    ]);
  });

  it('never returns an empty group', () => {
    for (const role of [
      'super_admin',
      'product_development',
      'admin',
      'sales_supervisor',
      'sales_agent',
    ] as const) {
      for (const group of visibleNavGroups(role)) {
        expect(group.items.length).toBeGreaterThan(0);
      }
    }
  });
});
