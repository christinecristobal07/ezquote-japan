import { describe, expect, it } from 'vitest';
import {
  effectiveAmount,
  nightlyExplanation,
  nightlyToStayTotal,
  staleStayTotals,
  type AdjustmentRecord,
} from './ledger.ts';
import { fromPhp } from '../money.ts';

function entry(overrides: Partial<AdjustmentRecord> = {}): AdjustmentRecord {
  return {
    id: 'a1',
    paxCategory: 'twin',
    kind: 'hotel',
    amount: 7_000,
    currency: 'PHP',
    reason: 'Sakura Inn, 2 nights',
    createdAt: '2026-11-22T01:00:00Z',
    createdByName: 'Agent One',
    reversesId: null,
    amountPerNight: 3_500,
    nights: 2,
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// The Excel does `=350*NUM_OF_NYTS`, where NUM_OF_NYTS follows the DURATION
// cell. Lengthening the trip re-prices the hotel on its own.
// -----------------------------------------------------------------------------
describe('effectiveAmount', () => {
  it('leaves a per-night entry alone when the nights have not moved', () => {
    expect(effectiveAmount(entry(), 2)).toBe(7_000);
  });

  it('re-prices when the trip gets longer: 3D2N to 5D4N', () => {
    // 3,500 x 4 nights, not the 7,000 that was first stored.
    expect(effectiveAmount(entry(), 4)).toBe(14_000);
  });

  it('re-prices when the trip gets shorter', () => {
    expect(effectiveAmount(entry(), 1)).toBe(3_500);
  });

  it('matches the Excel figure exactly', () => {
    // JAPAN QUOTATION!I23 is =350*NUM_OF_NYTS.
    expect(effectiveAmount(entry({ amountPerNight: 350, nights: 2, amount: 700 }), 2)).toBe(700);
    expect(effectiveAmount(entry({ amountPerNight: 350, nights: 2, amount: 700 }), 5)).toBe(1_750);
  });

  it('never re-multiplies a flat stay total', () => {
    const flat = entry({ amountPerNight: null, nights: null, amount: 20_000 });
    expect(effectiveAmount(flat, 4)).toBe(20_000);
    expect(effectiveAmount(flat, 1)).toBe(20_000);
  });

  it('keeps the stored figure if the night count is nonsense', () => {
    expect(effectiveAmount(entry(), 0)).toBe(7_000);
    expect(effectiveAmount(entry(), -3)).toBe(7_000);
    expect(effectiveAmount(entry(), Number.NaN)).toBe(7_000);
  });

  it('carries a negative reversal through the same way', () => {
    const reversal = entry({ amount: -7_000, amountPerNight: -3_500, reversesId: 'a1' });
    expect(effectiveAmount(reversal, 4)).toBe(-14_000);
    // So the pair still nets to nothing at any length.
    expect(effectiveAmount(entry(), 4) + effectiveAmount(reversal, 4)).toBe(0);
  });

  it('rounds to the centavo rather than carrying a fraction', () => {
    expect(effectiveAmount(entry({ amountPerNight: 1_333.335, nights: 1 }), 3)).toBe(4_000.01);
  });
});

// -----------------------------------------------------------------------------
describe('nightlyToStayTotal', () => {
  it('multiplies the rate by the nights', () => {
    expect(nightlyToStayTotal(3_500, 2)).toBe(7_000);
  });

  it('refuses a non-positive stay', () => {
    expect(nightlyToStayTotal(3_500, 0)).toBe(0);
    expect(nightlyToStayTotal(3_500, -1)).toBe(0);
  });

  it('refuses values that are not numbers', () => {
    expect(nightlyToStayTotal(Number.NaN, 2)).toBe(0);
    expect(nightlyToStayTotal(3_500, Number.NaN)).toBe(0);
  });
});

// -----------------------------------------------------------------------------
describe('staleStayTotals', () => {
  it('flags a hotel cost typed as one figure for the whole stay', () => {
    const flat = entry({ amountPerNight: null, nights: null, amount: 20_000 });
    expect(staleStayTotals([flat], 4)).toHaveLength(1);
  });

  it('does not flag an entry that carries its nightly rate', () => {
    expect(staleStayTotals([entry()], 4)).toEqual([]);
  });

  it('does not flag a reversal, which is cancelled anyway', () => {
    const reversal = entry({ amountPerNight: null, nights: null, reversesId: 'a1' });
    expect(staleStayTotals([reversal], 4)).toEqual([]);
  });

  it('does not flag anything that is not a hotel cost', () => {
    const surcharge = entry({ kind: 'surcharge', amountPerNight: null, nights: null });
    expect(staleStayTotals([surcharge], 4)).toEqual([]);
  });

  it('does not flag a zero entry, which changes no money', () => {
    const zero = entry({ amount: 0, amountPerNight: null, nights: null });
    expect(staleStayTotals([zero], 4)).toEqual([]);
  });

  it('removes nothing: the caller still holds every entry', () => {
    const entries = [entry({ amountPerNight: null, nights: null })];
    staleStayTotals(entries, 4);
    expect(entries).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------------
describe('nightlyExplanation', () => {
  it('shows the working, so an agent can check it against the supplier', () => {
    expect(nightlyExplanation(fromPhp(3_500), 2, fromPhp(7_000))).toBe(
      'PHP 3,500 × 2 nights = PHP 7,000',
    );
  });

  it('says one night, not 1 nights', () => {
    expect(nightlyExplanation(fromPhp(3_500), 1, fromPhp(3_500))).toContain('1 night =');
  });
});
