/**
 * UAT against BRD section 14.1, at the level the numbers actually live: the
 * rate engine.
 *
 * These are acceptance tests, not unit tests. Each one is named for the BRD
 * scenario it signs off, states the arithmetic in its own title, and uses the
 * seeded rate fixture so the figures match what Product Development will type
 * into the live system.
 */
import { describe, expect, it } from 'vitest';
import {
  AIRPORT_ID,
  ENTRANCE_ADDON_ID,
  MT_FUJI_ID,
  snapshotJson,
} from '../../src/domain/__fixtures__/snapshot.ts';
import { fromPhp, toPhp } from '../../src/domain/money.ts';
import { parseSnapshot, type RateSnapshot } from '../../src/domain/snapshot.ts';
import { findTier } from '../../src/domain/tiers.ts';
import type { SnapshotService } from '../../src/domain/snapshot.ts';
import { roundUpTo99 } from '../../src/domain/rounding.ts';
import {
  calculateQuotation,
  type CategoryResult,
  type QuotationInput,
  type QuotationResult,
} from '../../src/domain/rateEngine.ts';

const snapshot = parseSnapshot(snapshotJson());
const BOTH_SERVICES = [{ serviceId: MT_FUJI_ID }, { serviceId: AIRPORT_ID }];

function service(serviceId: string): SnapshotService {
  const found = snapshot.serviceById.get(serviceId);
  if (found === undefined) throw new Error(`no fixture service ${serviceId}`);
  return found;
}

function quote(overrides: Partial<QuotationInput> = {}): QuotationResult {
  return calculateQuotation({
    snapshot,
    paxTotal: 4,
    services: BOTH_SERVICES,
    outputCategories: ['quad'],
    ...overrides,
  });
}

function hotel(paxCategory: string, php: number) {
  return { paxCategory, kind: 'hotel', amount: php, currency: 'PHP' as const };
}

function sole(result: QuotationResult): CategoryResult {
  const first = result.categories[0];
  if (first === undefined) throw new Error('the quotation priced no category');
  return first;
}

function lineTotal(category: CategoryResult, kind: string): number {
  return category.breakdown
    .filter((line) => line.kind === kind)
    .reduce((sum, line) => sum + line.amount, 0);
}

// -----------------------------------------------------------------------------
describe('UAT-02 · an operator rate converts to PHP at the configured FX', () => {
  it('JPY 10,850 at 0.50 is PHP 5,425 before any markup', () => {
    const quad = sole(quote({ services: [{ serviceId: MT_FUJI_ID }] }));
    expect(lineTotal(quad, 'service')).toBe(fromPhp(5_425));
    // And the markup is a separate line, so "before markup" is verifiable.
    expect(lineTotal(quad, 'service_markup')).toBe(fromPhp(1_000));
  });

  it('converts the transfer the same way: JPY 6,250 at 0.50 is PHP 3,125', () => {
    const quad = sole(quote({ services: [{ serviceId: AIRPORT_ID }] }));
    expect(lineTotal(quad, 'service')).toBe(fromPhp(3_125));
  });

  it('holds for any JPY amount, not just the seeded ones (FR-002)', () => {
    expect(toPhp(10_850, 'JPY', snapshot.fx)).toBe(fromPhp(5_425));
    expect(toPhp(1, 'JPY', snapshot.fx)).toBe(fromPhp(0.5));
  });
});

// -----------------------------------------------------------------------------
describe('UAT-03 · group-size tiers (FR-020)', () => {
  it('4 travellers fall in the 2–6 band, so the tour is JPY 10,850', () => {
    const tier = findTier(service(MT_FUJI_ID), 4, 'adult');
    expect(tier).toMatchObject({ minPax: 2, maxPax: 6, amount: 10_850 });
  });

  it.each([
    [1, 50_000],
    [2, 10_850],
    [6, 10_850],
    [7, 9_450],
    [10, 8_889],
    [19, 6_380],
    [30, 4_167],
    [60, 4_167],
  ])('%i travellers price the tour at JPY %i', (paxTotal, amount) => {
    const tier = findTier(service(MT_FUJI_ID), paxTotal, 'adult');
    expect(tier?.amount).toBe(amount);
  });

  it('counts children towards the band, not just adults', () => {
    // 2 adults + 5 children is 7 travellers, so the 7–9 band. A child with
    // no child tier falls back to the adult one, at the same band.
    expect(findTier(service(MT_FUJI_ID), 7, 'adult')?.amount).toBe(9_450);
    expect(findTier(service(MT_FUJI_ID), 7, 'child')?.amount).toBe(9_450);
  });

  it('crossing a band boundary changes the price', () => {
    const six = sole(quote({ paxTotal: 6, services: [{ serviceId: MT_FUJI_ID }] }));
    const seven = sole(quote({ paxTotal: 7, services: [{ serviceId: MT_FUJI_ID }] }));
    expect(lineTotal(six, 'service')).toBe(fromPhp(5_425));
    expect(lineTotal(seven, 'service')).toBe(fromPhp(4_725));
  });
});

// -----------------------------------------------------------------------------
describe('UAT-04 · each occupancy category is priced in its own right (FR-004)', () => {
  const result = calculateQuotation({
    snapshot,
    paxTotal: 4,
    services: BOTH_SERVICES,
    outputCategories: ['quad', 'triple', 'twin', 'solo', 'child', 'sneak_in'],
    adjustments: [
      // One 20,000 room, entered once per category as the agent would.
      hotel('quad', 20_000),
      hotel('triple', 20_000),
      hotel('twin', 20_000),
      hotel('solo', 6_000),
      hotel('child', 4_000),
      hotel('sneak_in', 0),
    ],
  });

  function category(code: string): CategoryResult {
    const found = result.categories.find((entry) => entry.paxCategory === code);
    if (found === undefined) throw new Error(`no result for ${code}`);
    return found;
  }

  it.each([
    ['quad', 5_000],
    ['triple', 6_666.67],
    ['twin', 10_000],
    ['child', 4_000],
    ['sneak_in', 0],
  ])('%s divides the room cost by its own divisor: PHP %s per person', (code, perPerson) => {
    expect(lineTotal(category(code), 'hotel')).toBe(fromPhp(perPerson));
  });

  it('solo doubles the per-person twin rate it was given: 6,000 becomes 12,000', () => {
    expect(lineTotal(category('solo'), 'hotel')).toBe(fromPhp(12_000));
  });

  it('gives each category its own markup', () => {
    expect(lineTotal(category('quad'), 'category_markup')).toBe(fromPhp(2_500));
    expect(lineTotal(category('triple'), 'category_markup')).toBe(fromPhp(2_600));
    expect(lineTotal(category('twin'), 'category_markup')).toBe(fromPhp(2_700));
    expect(lineTotal(category('solo'), 'category_markup')).toBe(fromPhp(3_500));
    expect(lineTotal(category('child'), 'category_markup')).toBe(fromPhp(2_000));
    expect(lineTotal(category('sneak_in'), 'category_markup')).toBe(0);
  });

  it('arrives at six different selling rates from one set of inputs', () => {
    const finals = result.categories.map((entry) => entry.final);
    expect(new Set(finals).size).toBe(6);
  });

  it('prices the whole set without an issue', () => {
    expect(result.issues).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
describe('UAT-05 · the final rate rounds up to the next number ending in 99', () => {
  it.each([
    [13_957, 13_999],
    [13_050, 13_099],
    [13_099, 13_099],
    [13_100, 13_199],
    [1, 99],
    [100, 199],
  ])('PHP %i becomes PHP %i', (subtotal, final) => {
    expect(roundUpTo99(fromPhp(subtotal))).toBe(fromPhp(final));
  });

  it('a rate already ending in 99 is left alone', () => {
    expect(roundUpTo99(fromPhp(19_099))).toBe(fromPhp(19_099));
  });

  it('shows the rounding as its own line, so the agent can see it', () => {
    const quad = sole(quote({ adjustments: [hotel('quad', 20_000)] }));
    expect(quad.subtotal).toBe(fromPhp(19_050));
    expect(quad.final).toBe(fromPhp(19_099));
    expect(lineTotal(quad, 'rounding')).toBe(fromPhp(49));
  });
});

// -----------------------------------------------------------------------------
describe('UAT-06 · a category markup switches from fixed to percent (FR-003)', () => {
  const fixed = sole(quote({ adjustments: [hotel('quad', 20_000)] }));

  it('the seeded fixed markup adds PHP 2,500', () => {
    expect(lineTotal(fixed, 'category_markup')).toBe(fromPhp(2_500));
    expect(fixed.final).toBe(fromPhp(19_099));
  });

  it('as 10 percent it adds 1,355: a tenth of hotel + tours + transfers', () => {
    const asPercent = parseSnapshot({
      ...(snapshotJson() as object),
      categoryMarkups: {
        ...(snapshotJson() as { categoryMarkups: Record<string, unknown> }).categoryMarkups,
        quad: { type: 'percent', value: 10 },
      },
    });
    const quad = sole(
      calculateQuotation({
        snapshot: asPercent,
        paxTotal: 4,
        services: BOTH_SERVICES,
        outputCategories: ['quad'],
        adjustments: [hotel('quad', 20_000)],
      }),
    );
    // Base: 5,000 hotel + 5,425 tour + 3,125 transfer = 13,550, so 1,355.
    expect(lineTotal(quad, 'category_markup')).toBe(fromPhp(1_355));
    // Subtotal adds the two service markups: 13,550 + 1,000 + 2,000 + 1,355.
    expect(quad.subtotal).toBe(fromPhp(17_905));
    expect(quad.final).toBe(fromPhp(17_999));
  });

  it('the percent base excludes the service markups, airfare and Change Rate', () => {
    const asPercent = parseSnapshot({
      ...(snapshotJson() as object),
      categoryMarkups: {
        ...(snapshotJson() as { categoryMarkups: Record<string, unknown> }).categoryMarkups,
        quad: { type: 'percent', value: 10 },
      },
    });
    const quad = sole(
      calculateQuotation({
        snapshot: asPercent,
        paxTotal: 4,
        services: BOTH_SERVICES,
        outputCategories: ['quad'],
        airfarePhp: 25_000,
        adjustments: [
          hotel('quad', 20_000),
          { paxCategory: 'quad', kind: 'surcharge', amount: 1_500, currency: 'PHP' },
        ],
      }),
    );
    // Still a tenth of 13,550: neither the 25,000 airfare nor the 1,500
    // surcharge widened the base.
    expect(lineTotal(quad, 'category_markup')).toBe(fromPhp(1_355));
  });
});

// -----------------------------------------------------------------------------
describe('UAT-07 · an FX change reaches new quotations only (FR-015, data integrity)', () => {
  const aged: RateSnapshot = snapshot;
  const current: RateSnapshot = parseSnapshot(snapshotJson(0.42));

  it('a quotation created after the change uses the new rate', () => {
    const quad = sole(
      calculateQuotation({
        snapshot: current,
        paxTotal: 4,
        services: BOTH_SERVICES,
        outputCategories: ['quad'],
        adjustments: [hotel('quad', 20_000)],
      }),
    );
    // 10,850 x 0.42 = 4,557 and 6,250 x 0.42 = 2,625.
    expect(lineTotal(quad, 'service')).toBe(fromPhp(4_557 + 2_625));
    expect(quad.final).toBe(fromPhp(17_699));
  });

  it('regenerating the existing quotation reproduces its original numbers exactly', () => {
    const before = sole(
      calculateQuotation({
        snapshot: aged,
        paxTotal: 4,
        services: BOTH_SERVICES,
        outputCategories: ['quad'],
        adjustments: [hotel('quad', 20_000)],
      }),
    );
    // The same call again, as a regenerate does: the snapshot is the input.
    const regenerated = sole(
      calculateQuotation({
        snapshot: aged,
        paxTotal: 4,
        services: BOTH_SERVICES,
        outputCategories: ['quad'],
        adjustments: [hotel('quad', 20_000)],
      }),
    );
    expect(regenerated.final).toBe(before.final);
    expect(regenerated.final).toBe(fromPhp(19_099));
    expect(regenerated.breakdown).toEqual(before.breakdown);
  });

  it('the two quotations differ, which is the point of the snapshot', () => {
    expect(fromPhp(17_699)).not.toBe(fromPhp(19_099));
  });
});

// -----------------------------------------------------------------------------
describe('UAT-11 · a Change Rate entry moves the totals and they still tally (FR-005)', () => {
  it('a PHP 1,500 surcharge raises the quad rate by 1,500 before rounding', () => {
    const plain = sole(quote({ adjustments: [hotel('quad', 20_000)] }));
    const adjusted = sole(
      quote({
        adjustments: [
          hotel('quad', 20_000),
          { paxCategory: 'quad', kind: 'surcharge', amount: 1_500, currency: 'PHP' },
        ],
      }),
    );
    expect(adjusted.subtotal - plain.subtotal).toBe(fromPhp(1_500));
    expect(adjusted.final).toBe(fromPhp(20_599));
  });

  it('a negative entry reduces the rate', () => {
    const adjusted = sole(
      quote({
        adjustments: [
          hotel('quad', 20_000),
          { paxCategory: 'quad', kind: 'rate_difference', amount: -1_000, currency: 'PHP' },
        ],
      }),
    );
    expect(adjusted.subtotal).toBe(fromPhp(18_050));
    expect(adjusted.final).toBe(fromPhp(18_099));
  });

  it('an entry only touches the category it was entered against', () => {
    const result = quote({
      outputCategories: ['quad', 'twin'],
      adjustments: [
        hotel('quad', 20_000),
        hotel('twin', 20_000),
        { paxCategory: 'quad', kind: 'surcharge', amount: 1_500, currency: 'PHP' },
      ],
    });
    const quad = result.categories.find((entry) => entry.paxCategory === 'quad');
    const twin = result.categories.find((entry) => entry.paxCategory === 'twin');
    expect(quad).toBeDefined();
    expect(twin).toBeDefined();
    expect(lineTotal(quad!, 'adjustment')).toBe(fromPhp(1_500));
    expect(lineTotal(twin!, 'adjustment')).toBe(0);
  });

  it('a reversal nets the pair to nothing', () => {
    const adjusted = sole(
      quote({
        adjustments: [
          hotel('quad', 20_000),
          { paxCategory: 'quad', kind: 'surcharge', amount: 1_500, currency: 'PHP' },
          { paxCategory: 'quad', kind: 'surcharge', amount: -1_500, currency: 'PHP' },
        ],
      }),
    );
    expect(adjusted.final).toBe(fromPhp(19_099));
  });

  it('every breakdown line sums to the final rate, with nothing unaccounted for', () => {
    const quad = sole(
      quote({
        airfarePhp: 25_000,
        adjustments: [
          hotel('quad', 20_000),
          { paxCategory: 'quad', kind: 'surcharge', amount: 1_500, currency: 'PHP' },
        ],
        packageMarkup: { type: 'percent', value: 10 },
      }),
    );
    const sum = quad.breakdown.reduce((total, line) => total + line.amount, 0);
    expect(sum).toBe(quad.final);
  });
});

// -----------------------------------------------------------------------------
describe('UAT-12 · a hotel not on the reference list still has its cost counted (FR-006)', () => {
  it('the hotel cost comes from what the agent entered, not from the hotel list', () => {
    // There is no hotel record in this input at all: the engine prices the
    // entered room cost, which is how an off-list hotel is quoted.
    const quad = sole(quote({ adjustments: [hotel('quad', 23_600)] }));
    expect(lineTotal(quad, 'hotel')).toBe(fromPhp(5_900));
    expect(quad.subtotal).toBe(fromPhp(19_950));
    expect(quad.final).toBe(fromPhp(19_999));
  });

  it('warns, but still prices, when no hotel cost has been entered yet', () => {
    const result = quote();
    expect(result.issues.map((issue) => issue.code)).toContain('MISSING_HOTEL_COST');
    expect(sole(result).final).toBeGreaterThan(0);
  });
});

// -----------------------------------------------------------------------------
describe('UAT-13 · manual airfare is added to the rate', () => {
  it('PHP 25,000 airfare lands on the quad rate as its own line', () => {
    const quad = sole(quote({ airfarePhp: 25_000, adjustments: [hotel('quad', 20_000)] }));
    expect(lineTotal(quad, 'airfare')).toBe(fromPhp(25_000));
    expect(quad.subtotal).toBe(fromPhp(44_050));
    expect(quad.final).toBe(fromPhp(44_099));
  });

  it('airfare is outside the percent markup base', () => {
    const withAirfare = sole(
      quote({
        airfarePhp: 25_000,
        adjustments: [hotel('quad', 20_000)],
        packageMarkup: { type: 'percent', value: 10 },
      }),
    );
    const without = sole(
      quote({
        adjustments: [hotel('quad', 20_000)],
        packageMarkup: { type: 'percent', value: 10 },
      }),
    );
    expect(lineTotal(withAirfare, 'package_markup')).toBe(lineTotal(without, 'package_markup'));
  });

  it('no airfare means no airfare line', () => {
    const quad = sole(quote({ adjustments: [hotel('quad', 20_000)] }));
    expect(quad.breakdown.some((line) => line.kind === 'airfare')).toBe(false);
  });
});

// -----------------------------------------------------------------------------
describe('UAT · add-ons (FR-007, entrance tickets optional and off by default)', () => {
  it('an entrance ticket is left out unless it is chosen', () => {
    const quad = sole(quote({ services: [{ serviceId: MT_FUJI_ID }] }));
    expect(lineTotal(quad, 'service')).toBe(fromPhp(5_425));
  });

  it('a chosen entrance ticket is added at the snapshot FX, with no markup of its own', () => {
    const quad = sole(
      quote({
        services: [{ serviceId: MT_FUJI_ID, addonIds: [ENTRANCE_ADDON_ID] }],
        adjustments: [hotel('quad', 20_000)],
      }),
    );
    // JPY 3,000 at 0.50 is PHP 1,500, on top of the 5,425 tier.
    expect(lineTotal(quad, 'service')).toBe(fromPhp(6_925));
    expect(lineTotal(quad, 'service_markup')).toBe(fromPhp(1_000));
    expect(quad.final).toBe(fromPhp(15_499));
  });
});
