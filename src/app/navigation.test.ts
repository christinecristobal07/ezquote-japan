import { describe, expect, it } from 'vitest';
import { activeNavPath, visibleNavGroups, visibleNavItems } from './navigation.ts';
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

// -----------------------------------------------------------------------------
// Only the most specific item lights up. "/quotations" used to stay highlighted
// while the agent was on "/quotations/new", so two tabs looked active at once.
// -----------------------------------------------------------------------------
describe('activeNavPath', () => {
  const PATHS = [
    '/',
    '/quotations/new',
    '/quotations',
    '/team/quotations',
    '/admin/rates',
    '/admin/rates/fx',
    '/admin/content',
    '/me',
    '/audit',
  ];

  it('picks the more specific item for the new-quotation page', () => {
    expect(activeNavPath('/quotations/new', PATHS)).toBe('/quotations/new');
  });

  it('keeps an open quotation under Quotations', () => {
    expect(activeNavPath('/quotations/0f2a6f2e-0000-4000-8000-000000000001', PATHS)).toBe(
      '/quotations',
    );
  });

  it('keeps the output page under Quotations too', () => {
    expect(activeNavPath('/quotations/abc/output', PATHS)).toBe('/quotations');
  });

  it('matches the list itself', () => {
    expect(activeNavPath('/quotations', PATHS)).toBe('/quotations');
  });

  it('only matches the dashboard exactly', () => {
    expect(activeNavPath('/', PATHS)).toBe('/');
    expect(activeNavPath('/audit', PATHS)).toBe('/audit');
  });

  it('picks the deeper admin item', () => {
    expect(activeNavPath('/admin/rates/fx', PATHS)).toBe('/admin/rates/fx');
    expect(activeNavPath('/admin/rates', PATHS)).toBe('/admin/rates');
    // A service rate page still belongs to Rates & FX.
    expect(activeNavPath('/admin/rates/some-service-id', PATHS)).toBe('/admin/rates');
  });

  it('does not match across a partial segment', () => {
    expect(activeNavPath('/quotationsfoo', PATHS)).toBeNull();
  });

  it('ignores a trailing slash', () => {
    expect(activeNavPath('/quotations/', PATHS)).toBe('/quotations');
  });

  it('returns nothing for a path no item owns', () => {
    expect(activeNavPath('/nowhere', PATHS)).toBeNull();
  });

  it('keeps the team list separate from the agent one', () => {
    expect(activeNavPath('/team/quotations', PATHS)).toBe('/team/quotations');
  });
});
