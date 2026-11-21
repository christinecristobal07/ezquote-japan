import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { changedFields, diffSnapshots, parseSnapshot } from '@/domain';
import { snapshotJson } from '@/domain/__fixtures__/snapshot';
import type { AuditRow } from '@/data/repositories/auditRepository';
import { AuditChanges } from './AuditChanges';
import { SnapshotDiffList } from '@/features/quotations/SnapshotDiffList';

function row(overrides: Partial<AuditRow> = {}): AuditRow {
  return {
    id: 1,
    tableName: 'fx_rates',
    entityLabel: 'FX rate',
    recordId: '7',
    recordLabel: null,
    action: 'INSERT',
    actorId: 'p1',
    actorName: 'Tine Gladex',
    changedAt: '2026-11-21T02:00:00Z',
    changes: [],
    ...overrides,
  };
}

describe('AuditChanges', () => {
  it('says so when the trigger kept no detail', () => {
    render(<AuditChanges row={row()} />);
    expect(screen.getByText(/No field-level detail/)).toBeInTheDocument();
  });

  it('shows a field with its before and after', () => {
    render(
      <AuditChanges
        row={row({
          changes: changedFields({ php_per_unit: 0.5 }, { php_per_unit: 0.48 }),
        })}
      />,
    );
    expect(screen.getByRole('rowheader', { name: 'PHP per unit' })).toBeInTheDocument();
    expect(screen.getByText('0.5')).toBeInTheDocument();
    expect(screen.getByText('0.48')).toBeInTheDocument();
  });

  it('shows a dash where an insert had no previous value', () => {
    render(<AuditChanges row={row({ changes: changedFields(null, { amount: 250_000 }) })} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('PHP 250,000')).toBeInTheDocument();
  });

  it('puts the whole of a long value in the title attribute', () => {
    const long = `Corrected the quad rate. ${'x'.repeat(200)}`;
    render(<AuditChanges row={row({ changes: changedFields(null, { reason: long }) })} />);
    const cell = screen.getByTitle(long);
    expect(cell).toBeInTheDocument();
    expect(cell.textContent.endsWith('…')).toBe(true);
  });

  it('names the fields in plain words, not column names', () => {
    render(
      <AuditChanges
        row={row({ changes: changedFields({ is_active: true }, { is_active: false }) })}
      />,
    );
    expect(screen.getByRole('rowheader', { name: 'Active' })).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
  });
});

describe('SnapshotDiffList', () => {
  const base = parseSnapshot(snapshotJson());

  it('shows an FX move in both directions of reading', () => {
    render(<SnapshotDiffList diff={diffSnapshots(base, parseSnapshot(snapshotJson(0.42)))} />);
    expect(screen.getByText('Exchange rate')).toBeInTheDocument();
    expect(screen.getByText(/JPY: 0\.5 → 0\.42 PHP/)).toBeInTheDocument();
  });

  it('renders nothing but the wrapper when nothing changed', () => {
    render(<SnapshotDiffList diff={diffSnapshots(base, parseSnapshot(snapshotJson()))} />);
    expect(screen.queryByText('Exchange rate')).not.toBeInTheDocument();
    expect(screen.queryByText('Operator rates')).not.toBeInTheDocument();
    expect(screen.queryByText('Services')).not.toBeInTheDocument();
  });

  it('names a service that is no longer on sale', () => {
    const json = structuredClone(snapshotJson()) as { services: unknown[] };
    json.services = json.services.slice(0, 1);
    render(<SnapshotDiffList diff={diffSnapshots(base, parseSnapshot(json))} />);
    expect(screen.getByText(/no longer on sale/)).toBeInTheDocument();
  });

  it('shows a tier change with the group size band', () => {
    const json = structuredClone(snapshotJson()) as {
      services: { tiers: { minPax: number; amount: number }[] }[];
    };
    const tier = json.services[0]?.tiers.find((entry) => entry.minPax === 2);
    if (tier) tier.amount = 11_000;
    render(<SnapshotDiffList diff={diffSnapshots(base, parseSnapshot(json))} />);
    expect(screen.getByText(/Mt Fuji Tour · 2–6 pax: JPY 10,850 → JPY 11,000/)).toBeInTheDocument();
  });

  it('shows a markup moving from pesos to a percentage', () => {
    const json = structuredClone(snapshotJson()) as {
      serviceMarkups: Record<string, unknown>;
    };
    json.serviceMarkups.tour = { type: 'percent', value: 10 };
    render(<SnapshotDiffList diff={diffSnapshots(base, parseSnapshot(json))} />);
    expect(screen.getByText(/tour: PHP 1,000 → 10%/)).toBeInTheDocument();
  });
});
