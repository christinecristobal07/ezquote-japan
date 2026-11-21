import { describe, expect, it } from 'vitest';
import { fromPhp } from '../money.ts';
import { parseSnapshot } from '../snapshot.ts';
import { snapshotJson } from '../__fixtures__/snapshot.ts';
import {
  adjustmentErrorText,
  hotelPerPersonExplanation,
  ledgerView,
  nightlyToStayTotal,
  validateAdjustmentInput,
  type AdjustmentRecord,
} from './ledger.ts';

const snapshot = parseSnapshot(snapshotJson()); // JPY 0.5, USD 67

function entry(overrides: Partial<AdjustmentRecord> = {}): AdjustmentRecord {
  return {
    id: 'a1',
    paxCategory: 'quad',
    kind: 'hotel',
    amount: 20_000,
    currency: 'PHP',
    reason: 'Quad room, 2 nights',
    createdAt: '2026-11-21T01:00:00Z',
    createdByName: 'Agent One',
    reversesId: null,
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
describe('ledgerView', () => {
  it('converts PHP entries straight through', () => {
    const view = ledgerView([entry()], snapshot);
    const quad = view.byCategory.get('quad');
    expect(quad?.hotelRoomTotalPhp).toBe(fromPhp(20_000));
    expect(quad?.hasHotelCost).toBe(true);
    expect(quad?.otherNetPhp).toBe(0);
  });

  it('converts JPY at the snapshot rate, not the current one', () => {
    const view = ledgerView(
      [entry({ id: 'j', kind: 'surcharge', amount: 2_000, currency: 'JPY' })],
      snapshot,
    );
    expect(view.byCategory.get('quad')?.otherNetPhp).toBe(fromPhp(1_000));
  });

  it('converts USD at the snapshot rate', () => {
    const view = ledgerView(
      [entry({ id: 'u', kind: 'operator_charge', amount: 50, currency: 'USD' })],
      snapshot,
    );
    expect(view.byCategory.get('quad')?.otherNetPhp).toBe(fromPhp(3_350));
  });

  it('keeps a reversed entry visible but out of the totals', () => {
    const original = entry({ id: 'h1' });
    const reversal = entry({
      id: 'h2',
      amount: -20_000,
      reversesId: 'h1',
      reason: 'Wrong room type',
      createdByName: 'Admin',
      createdAt: '2026-11-21T02:00:00Z',
    });

    const quad = ledgerView([original, reversal], snapshot).byCategory.get('quad');
    expect(quad?.entries).toHaveLength(2);
    expect(quad?.hotelRoomTotalPhp).toBe(0);
    expect(quad?.hasHotelCost).toBe(false);
    expect(quad?.reversedCount).toBe(1);
    expect(quad?.liveCount).toBe(0);
  });

  it('marks who reversed what and when', () => {
    const view = ledgerView(
      [
        entry({ id: 'h1' }),
        entry({
          id: 'h2',
          amount: -20_000,
          reversesId: 'h1',
          createdByName: 'Admin',
          createdAt: '2026-11-21T02:00:00Z',
        }),
      ],
      snapshot,
    );
    const entries = view.byCategory.get('quad')?.entries ?? [];
    expect(entries[0]).toMatchObject({
      isReversed: true,
      isReversal: false,
      reversedByName: 'Admin',
      reversedAt: '2026-11-21T02:00:00Z',
    });
    expect(entries[1]).toMatchObject({ isReversal: true, isReversed: false });
  });

  it('separates hotel from other kinds', () => {
    const view = ledgerView(
      [
        entry({ id: 'h', kind: 'hotel', amount: 20_000 }),
        entry({ id: 's', kind: 'surcharge', amount: 1_500 }),
        entry({ id: 'd', kind: 'rate_difference', amount: -500 }),
      ],
      snapshot,
    );
    const quad = view.byCategory.get('quad');
    expect(quad?.hotelRoomTotalPhp).toBe(fromPhp(20_000));
    expect(quad?.otherNetPhp).toBe(fromPhp(1_000));
  });

  it('groups by category', () => {
    const view = ledgerView(
      [
        entry({ id: 'q', paxCategory: 'quad' }),
        entry({ id: 't', paxCategory: 'twin', amount: 12_000 }),
      ],
      snapshot,
    );
    expect(view.byCategory.get('quad')?.hotelRoomTotalPhp).toBe(fromPhp(20_000));
    expect(view.byCategory.get('twin')?.hotelRoomTotalPhp).toBe(fromPhp(12_000));
  });

  it('orders entries oldest first', () => {
    const view = ledgerView(
      [
        entry({ id: 'late', createdAt: '2026-11-21T05:00:00Z' }),
        entry({ id: 'early', createdAt: '2026-11-21T01:00:00Z' }),
      ],
      snapshot,
    );
    expect(view.byCategory.get('quad')?.entries.map((e) => e.id)).toEqual(['early', 'late']);
  });

  it('reports a category the snapshot does not define', () => {
    const view = ledgerView([entry({ paxCategory: 'penthouse' })], snapshot);
    expect(view.unknownCategories).toEqual(['penthouse']);
  });

  it('returns nothing for an empty list', () => {
    const view = ledgerView([], snapshot);
    expect(view.byCategory.size).toBe(0);
    expect(view.unknownCategories).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
describe('hotelPerPersonExplanation', () => {
  it('divides for a shared room', () => {
    expect(hotelPerPersonExplanation('quad', fromPhp(20_000), 4, 1)).toBe(
      'PHP 20,000 room ÷ 4 = PHP 5,000 per person',
    );
    expect(hotelPerPersonExplanation('twin', fromPhp(12_000), 2, 1)).toBe(
      'PHP 12,000 room ÷ 2 = PHP 6,000 per person',
    );
  });

  it('doubles for Solo, and says why', () => {
    expect(hotelPerPersonExplanation('solo', fromPhp(6_000), 1, 2)).toBe(
      'PHP 6,000 per-person twin rate × 2 = PHP 12,000',
    );
  });

  it('passes a 1/1 category straight through', () => {
    expect(hotelPerPersonExplanation('child', fromPhp(4_000), 1, 1)).toBe(
      'PHP 4,000 as entered = PHP 4,000 per person',
    );
  });

  it('handles zero', () => {
    expect(hotelPerPersonExplanation('quad', 0, 4, 1)).toContain('PHP 0');
  });
});

// -----------------------------------------------------------------------------
describe('nightlyToStayTotal', () => {
  it.each([
    [5_000, 2, 10_000],
    [3_333.33, 3, 9_999.99],
    [10_000, 1, 10_000],
  ])('%s per night for %i nights is %s', (perNight, nights, expected) => {
    expect(nightlyToStayTotal(perNight, nights)).toBe(expected);
  });

  it('is zero for a nonsense number of nights', () => {
    expect(nightlyToStayTotal(5_000, 0)).toBe(0);
    expect(nightlyToStayTotal(5_000, -1)).toBe(0);
    expect(nightlyToStayTotal(Number.NaN, 2)).toBe(0);
  });
});

// -----------------------------------------------------------------------------
describe('validateAdjustmentInput', () => {
  const base = {
    paxCategories: ['quad'],
    kind: 'surcharge' as const,
    amount: 1_500,
    currency: 'PHP' as const,
    reason: 'Peak season surcharge',
  };

  it('accepts a sound entry', () => {
    expect(validateAdjustmentInput(base).valid).toBe(true);
  });

  it('accepts a negative amount', () => {
    expect(validateAdjustmentInput({ ...base, amount: -500 }).valid).toBe(true);
  });

  it('rejects zero', () => {
    expect(validateAdjustmentInput({ ...base, amount: 0 }).errors).toContain('AMOUNT_ZERO');
  });

  it('rejects more than two decimals', () => {
    expect(validateAdjustmentInput({ ...base, amount: 1.234 }).errors).toContain(
      'AMOUNT_TOO_PRECISE',
    );
    expect(validateAdjustmentInput({ ...base, amount: 1.23 }).valid).toBe(true);
  });

  it('rejects an implausible amount', () => {
    expect(validateAdjustmentInput({ ...base, amount: 10_000_001 }).errors).toContain(
      'AMOUNT_TOO_LARGE',
    );
    expect(validateAdjustmentInput({ ...base, amount: 10_000_000 }).valid).toBe(true);
  });

  it('rejects a missing or token reason', () => {
    expect(validateAdjustmentInput({ ...base, reason: '' }).errors).toContain('REASON_TOO_SHORT');
    expect(validateAdjustmentInput({ ...base, reason: '  x ' }).errors).toContain(
      'REASON_TOO_SHORT',
    );
    expect(validateAdjustmentInput({ ...base, reason: 'fix' }).valid).toBe(true);
  });

  it('needs at least one category', () => {
    expect(validateAdjustmentInput({ ...base, paxCategories: [] }).errors).toContain('NO_CATEGORY');
  });

  it('reports every problem at once', () => {
    const result = validateAdjustmentInput({
      ...base,
      amount: 0,
      reason: '',
      paxCategories: [],
    });
    expect(result.errors).toHaveLength(3);
    expect(result.errors.map(adjustmentErrorText).every((text) => text.length > 0)).toBe(true);
  });
});
