import { describe, expect, it } from 'vitest';
import { fromPhp, toScaledRate } from '../money.ts';
import { currentAndScheduled, percentChange } from './effective.ts';
import { diffTiers, previewSellingRates } from './preview.ts';
import { validateTiers, type DraftTier } from './validateTiers.ts';

function tier(
  minPax: number,
  maxPax: number,
  amount: number,
  paxType: 'adult' | 'child' = 'adult',
): DraftTier {
  return { paxType, minPax, maxPax, amount };
}

const MT_FUJI: DraftTier[] = [
  tier(1, 1, 50_000),
  tier(2, 6, 10_850),
  tier(7, 9, 9_450),
  tier(10, 18, 8_889),
  tier(19, 29, 6_380),
  tier(30, 60, 4_167),
];

// -----------------------------------------------------------------------------
describe('validateTiers', () => {
  it('accepts the real Mt Fuji ladder with no errors or warnings', () => {
    const result = validateTiers(MT_FUJI);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('flags a band whose minimum is above its maximum', () => {
    const result = validateTiers([tier(9, 2, 100)]);
    expect(result.errors.map((e) => e.code)).toContain('MIN_AFTER_MAX');
    expect(result.valid).toBe(false);
  });

  it.each([
    [tier(0, 5, 100), 'below one'],
    [tier(1, 61, 100), 'above sixty'],
  ])('flags a band outside 1-60 (%#: %s)', (bad) => {
    expect(validateTiers([bad]).errors.map((e) => e.code)).toContain('OUT_OF_RANGE');
  });

  it('flags fractional group sizes', () => {
    expect(validateTiers([tier(1.5, 5, 100)]).errors.map((e) => e.code)).toContain(
      'NOT_WHOLE_NUMBER',
    );
  });

  it('flags a negative amount', () => {
    expect(validateTiers([tier(1, 5, -1)]).errors.map((e) => e.code)).toContain('NEGATIVE_AMOUNT');
  });

  it('allows a zero amount', () => {
    expect(validateTiers([tier(1, 60, 0)]).valid).toBe(true);
  });

  it('flags overlapping bands and names both rows', () => {
    const result = validateTiers([tier(1, 10, 100), tier(8, 20, 90)]);
    const overlap = result.errors.find((e) => e.code === 'OVERLAP');
    expect(overlap).toBeDefined();
    expect(overlap?.row).toBe(1);
    expect(overlap?.otherRow).toBe(0);
  });

  it('lets an adult and a child band cover the same group size', () => {
    const result = validateTiers([tier(2, 6, 10_850), tier(2, 6, 5_000, 'child')]);
    expect(result.errors).toEqual([]);
  });

  it('warns when the ladder does not start at 1', () => {
    const result = validateTiers([tier(2, 60, 100)]);
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((w) => w.code)).toContain('DOES_NOT_START_AT_ONE');
  });

  it('warns when the ladder stops before 60', () => {
    const warnings = validateTiers([tier(1, 30, 100)]).warnings;
    expect(warnings.map((w) => w.code)).toContain('DOES_NOT_REACH_SIXTY');
    expect(warnings.find((w) => w.code === 'DOES_NOT_REACH_SIXTY')).toMatchObject({
      from: 31,
      to: 60,
    });
  });

  it('warns about a gap in the middle', () => {
    const warnings = validateTiers([tier(1, 5, 100), tier(9, 60, 90)]).warnings;
    const gap = warnings.find((w) => w.code === 'GAP');
    expect(gap).toMatchObject({ from: 6, to: 8 });
  });

  it('does not warn about coverage for child bands', () => {
    const warnings = validateTiers([...MT_FUJI, tier(2, 6, 5_000, 'child')]).warnings;
    expect(warnings.filter((w) => w.paxType === 'child' && w.code !== 'GAP')).toEqual([]);
  });

  it('skips overlap checks on rows that are already invalid', () => {
    // A reversed band should report MIN_AFTER_MAX only, not a phantom overlap.
    const codes = validateTiers([tier(1, 10, 100), tier(20, 5, 90)]).errors.map((e) => e.code);
    expect(codes).toContain('MIN_AFTER_MAX');
    expect(codes).not.toContain('OVERLAP');
  });
});

// -----------------------------------------------------------------------------
describe('previewSellingRates', () => {
  const fx = { JPY: toScaledRate(0.5, 'JPY'), PHP: toScaledRate(1, 'PHP') };
  const serviceMarkups = { tour: { type: 'fixed' as const, value: 1000 } };

  it('converts Mt Fuji 2-6 pax and adds the tour markup: 5,425 + 1,000 = 6,425', () => {
    const rows = previewSellingRates({
      currency: 'JPY',
      serviceType: 'tour',
      tiers: MT_FUJI,
      fx,
      serviceMarkups,
    });

    const band = rows.find((row) => row.minPax === 2 && row.maxPax === 6);
    expect(band?.operatorAmount).toBe(10_850);
    expect(band?.convertedPhp).toBe(fromPhp(5_425));
    expect(band?.markupPhp).toBe(fromPhp(1_000));
    expect(band?.perPersonPhp).toBe(fromPhp(6_425));
  });

  it('keeps one row per tier, in order', () => {
    const rows = previewSellingRates({
      currency: 'JPY',
      serviceType: 'tour',
      tiers: MT_FUJI,
      fx,
      serviceMarkups,
    });
    expect(rows).toHaveLength(MT_FUJI.length);
    expect(rows[0]?.perPersonPhp).toBe(fromPhp(26_000)); // 50,000 JPY -> 25,000 + 1,000
  });

  it('applies a percent markup to the converted amount', () => {
    const rows = previewSellingRates({
      currency: 'JPY',
      serviceType: 'tour',
      tiers: [tier(2, 6, 10_850)],
      fx,
      serviceMarkups: { tour: { type: 'percent', value: 10 } },
    });
    expect(rows[0]?.markupPhp).toBe(fromPhp(542.5));
    expect(rows[0]?.perPersonPhp).toBe(fromPhp(5_967.5));
  });

  it('uses the transfer markup for a transfer', () => {
    const rows = previewSellingRates({
      currency: 'JPY',
      serviceType: 'transfer',
      tiers: [tier(2, 4, 6_250)],
      fx,
      serviceMarkups: {
        tour: { type: 'fixed', value: 1000 },
        transfer: { type: 'fixed', value: 2000 },
      },
    });
    expect(rows[0]?.perPersonPhp).toBe(fromPhp(5_125)); // 3,125 + 2,000
  });

  it('adds nothing when no markup is configured', () => {
    const rows = previewSellingRates({
      currency: 'JPY',
      serviceType: 'tour',
      tiers: [tier(2, 6, 10_850)],
      fx,
      serviceMarkups: {},
    });
    expect(rows[0]?.markupPhp).toBe(0);
    expect(rows[0]?.perPersonPhp).toBe(fromPhp(5_425));
  });
});

// -----------------------------------------------------------------------------
describe('diffTiers', () => {
  it('reports a changed amount with both values', () => {
    const next = MT_FUJI.map((t) => (t.minPax === 2 ? tier(2, 6, 11_000) : t));
    const row = diffTiers(MT_FUJI, next).find((r) => r.minPax === 2);
    expect(row).toMatchObject({ change: 'changed', oldAmount: 10_850, newAmount: 11_000 });
  });

  it('reports added and removed bands', () => {
    const next = [...MT_FUJI.slice(0, 5), tier(30, 45, 4_500)];
    const rows = diffTiers(MT_FUJI, next);
    expect(rows.find((r) => r.minPax === 30 && r.maxPax === 45)?.change).toBe('added');
    expect(rows.find((r) => r.minPax === 30 && r.maxPax === 60)?.change).toBe('removed');
  });

  it('marks untouched bands unchanged', () => {
    expect(diffTiers(MT_FUJI, MT_FUJI).every((row) => row.change === 'unchanged')).toBe(true);
  });
});

// -----------------------------------------------------------------------------
describe('currentAndScheduled', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  const rows = [
    { id: 'old', effectiveFrom: '2026-01-01T00:00:00Z' },
    { id: 'current', effectiveFrom: '2026-11-01T00:00:00Z' },
    { id: 'soon', effectiveFrom: '2026-12-01T00:00:00Z' },
    { id: 'later', effectiveFrom: '2027-01-01T00:00:00Z' },
  ];

  it('picks the newest row that has already taken effect', () => {
    expect(currentAndScheduled(rows, now).current?.id).toBe('current');
  });

  it('lists future rows soonest first', () => {
    expect(currentAndScheduled(rows, now).scheduled.map((r) => r.id)).toEqual(['soon', 'later']);
  });

  it('lists superseded rows newest first', () => {
    expect(currentAndScheduled(rows, now).history.map((r) => r.id)).toEqual(['old']);
  });

  it('has no current row when everything is in the future', () => {
    const split = currentAndScheduled(rows.slice(2), now);
    expect(split.current).toBeNull();
    expect(split.scheduled).toHaveLength(2);
  });

  it('handles an empty list', () => {
    const split = currentAndScheduled([], now);
    expect(split).toEqual({ current: null, scheduled: [], history: [] });
  });

  it('treats a row effective exactly now as current', () => {
    const split = currentAndScheduled([{ id: 'edge', effectiveFrom: now.toISOString() }], now);
    expect(split.current?.id).toBe('edge');
  });
});

describe('percentChange', () => {
  it.each([
    [0.5, 0.48, -4],
    [0.5, 0.42, -16],
    [0.5, 0.6, 20],
    [0.5, 0.5, 0],
  ])('%s -> %s is %s%%', (from, to, expected) => {
    expect(percentChange(from, to)).toBeCloseTo(expected, 6);
  });

  it('treats any move away from zero as a full change', () => {
    expect(percentChange(0, 5)).toBe(100);
    expect(percentChange(0, 0)).toBe(0);
  });
});
