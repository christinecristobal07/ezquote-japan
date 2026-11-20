import { describe, expect, it } from 'vitest';
import {
  AIRPORT_ID,
  ENTRANCE_ADDON_ID,
  MT_FUJI_ID,
  snapshotJson,
} from './__fixtures__/snapshot.ts';
import { add, fromPhp } from './money.ts';
import { parseSnapshot, type RateSnapshot } from './snapshot.ts';
import {
  calculateQuotation,
  type IssueCode,
  type QuotationInput,
  type QuotationResult,
} from './rateEngine.ts';

const snapshot = parseSnapshot(snapshotJson());

const BOTH_SERVICES = [{ serviceId: MT_FUJI_ID }, { serviceId: AIRPORT_ID }];

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

function only(result: QuotationResult) {
  const first = result.categories[0];
  if (!first) throw new Error('no category in result');
  return first;
}

function codes(result: QuotationResult): IssueCode[] {
  return result.issues.map((i) => i.code);
}

// -----------------------------------------------------------------------------
// Golden cases, hand-computed
// -----------------------------------------------------------------------------
describe('golden cases', () => {
  it('4 pax quad: hotel 5,000 + tour 5,425 +1,000 + transfer 3,125 +2,000 + 2,500 = 19,050 -> 19,099', () => {
    const result = quote({ adjustments: [hotel('quad', 20_000)] });
    const quad = only(result);
    expect(quad.subtotal).toBe(fromPhp(19_050));
    expect(quad.final).toBe(fromPhp(19_099));
    expect(result.issues).toEqual([]);

    expect(quad.breakdown.map((l) => [l.kind, l.amount])).toEqual([
      ['hotel', fromPhp(5_000)],
      ['service', fromPhp(5_425)],
      ['service', fromPhp(3_125)],
      ['service_markup', fromPhp(1_000)],
      ['service_markup', fromPhp(2_000)],
      ['category_markup', fromPhp(2_500)],
      ['rounding', fromPhp(49)],
    ]);
  });

  it('solo at a 6,000 per-person twin rate: 12,000 + 6,425 + 5,125 + 3,500 = 27,050 -> 27,099', () => {
    const solo = only(quote({ outputCategories: ['solo'], adjustments: [hotel('solo', 6_000)] }));
    expect(solo.breakdown[0]?.amount).toBe(fromPhp(12_000)); // 6,000 / 1 x 2
    expect(solo.subtotal).toBe(fromPhp(27_050));
    expect(solo.final).toBe(fromPhp(27_099));
  });

  it('quad with a 10% package markup: base 13,550 -> +1,355 -> 20,405 -> 20,499', () => {
    const quad = only(
      quote({
        adjustments: [hotel('quad', 20_000)],
        packageMarkup: { type: 'percent', value: 10 },
      }),
    );
    const packageLine = quad.breakdown.find((l) => l.kind === 'package_markup');
    expect(packageLine?.amount).toBe(fromPhp(1_355)); // 10% of 5,000 + 5,425 + 3,125
    expect(quad.subtotal).toBe(fromPhp(20_405));
    expect(quad.final).toBe(fromPhp(20_499));
  });
});

// -----------------------------------------------------------------------------
// Tier selection
// -----------------------------------------------------------------------------
describe('tiers', () => {
  it.each([
    [1, 50_000, 18_000],
    [2, 10_850, 6_250],
    [6, 10_850, 5_000],
    [7, 9_450, 3_889],
    [9, 9_450, 3_889],
    [10, 8_889, 3_750],
    [18, 8_889, 3_572],
    [19, 6_380, 3_572],
    [29, 6_380, 3_334],
    [30, 4_167, 3_334],
    [60, 4_167, 2_834],
  ])('%i pax uses the right band for both services', (pax, tourJpy, transferJpy) => {
    const quad = only(quote({ paxTotal: pax, adjustments: [hotel('quad', 20_000)] }));
    const services = quad.breakdown.filter((l) => l.kind === 'service');
    expect(services[0]?.amount).toBe(fromPhp(tourJpy / 2));
    expect(services[1]?.amount).toBe(fromPhp(transferJpy / 2));
  });

  it.each([0, 61, 4.5, Number.NaN])('rejects %s travellers', (pax) => {
    const result = quote({ paxTotal: pax, adjustments: [hotel('quad', 20_000)] });
    expect(codes(result)).toContain('PAX_OUT_OF_RANGE');
    expect(only(result).final).toBeNull();
  });

  it('counts children in the group size', () => {
    // 2 adults + 2 children = 4 travellers, so the 2-6 band, not the 1-pax rate.
    const result = quote({
      paxTotal: 4,
      outputCategories: ['child'],
      adjustments: [hotel('child', 4_000)],
    });
    const services = only(result).breakdown.filter((l) => l.kind === 'service');
    expect(services[0]?.amount).toBe(fromPhp(5_425));
  });

  it('uses a child tier when the snapshot has one', () => {
    const json = snapshotJson() as { services: { tiers: unknown[] }[] };
    json.services[0]!.tiers = [
      ...json.services[0]!.tiers,
      { paxType: 'child', minPax: 2, maxPax: 6, amount: 5_000 },
    ];
    const withChild = parseSnapshot(json);
    const result = calculateQuotation({
      snapshot: withChild,
      paxTotal: 4,
      services: [{ serviceId: MT_FUJI_ID }],
      outputCategories: ['child'],
      adjustments: [hotel('child', 4_000)],
    });
    const tourLine = only(result).breakdown.find((l) => l.kind === 'service');
    expect(tourLine?.amount).toBe(fromPhp(2_500)); // 5,000 JPY x 0.5
  });

  it('raises NO_TIER_FOR_PAX when no band covers the group', () => {
    const json = snapshotJson() as { services: { tiers: unknown[] }[] };
    json.services[0]!.tiers = [{ paxType: 'adult', minPax: 10, maxPax: 20, amount: 1_000 }];
    const sparse = parseSnapshot(json);
    const result = calculateQuotation({
      snapshot: sparse,
      paxTotal: 4,
      services: [{ serviceId: MT_FUJI_ID }],
      outputCategories: ['quad'],
      adjustments: [hotel('quad', 20_000)],
    });
    expect(codes(result)).toContain('NO_TIER_FOR_PAX');
    expect(only(result).final).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// Markups
// -----------------------------------------------------------------------------
describe('markups', () => {
  it('applies a percent category markup to the base only', () => {
    const json = snapshotJson() as { categoryMarkups: Record<string, unknown> };
    json.categoryMarkups.quad = { type: 'percent', value: 20 };
    const pct = parseSnapshot(json);
    const quad = only(
      calculateQuotation({
        snapshot: pct,
        paxTotal: 4,
        services: BOTH_SERVICES,
        outputCategories: ['quad'],
        adjustments: [hotel('quad', 20_000)],
      }),
    );
    // base = 5,000 + 5,425 + 3,125 = 13,550 -> 20% = 2,710
    expect(quad.breakdown.find((l) => l.kind === 'category_markup')?.amount).toBe(fromPhp(2_710));
  });

  it('keeps airfare and non-hotel Change Rate out of the percent base', () => {
    const withExtras = only(
      quote({
        adjustments: [
          hotel('quad', 20_000),
          { paxCategory: 'quad', kind: 'surcharge', amount: 1_000, currency: 'PHP' },
        ],
        airfarePhp: 15_000,
        packageMarkup: { type: 'percent', value: 10 },
      }),
    );
    // Unchanged from the golden case: still 10% of 13,550.
    expect(withExtras.breakdown.find((l) => l.kind === 'package_markup')?.amount).toBe(
      fromPhp(1_355),
    );
    expect(withExtras.subtotal).toBe(fromPhp(20_405 + 15_000 + 1_000));
  });

  it('gives add-ons no markup but counts them in the base', () => {
    const withAddon = only(
      quote({
        services: [
          { serviceId: MT_FUJI_ID, addonIds: [ENTRANCE_ADDON_ID] },
          { serviceId: AIRPORT_ID },
        ],
        adjustments: [hotel('quad', 20_000)],
        packageMarkup: { type: 'percent', value: 10 },
      }),
    );
    const tourLine = withAddon.breakdown.find((l) => l.kind === 'service');
    expect(tourLine?.amount).toBe(fromPhp(5_425 + 1_500)); // entrance ticket 3,000 JPY

    // Tour markup is still the flat 1,000, not 1,000 + something for the add-on.
    const markups = withAddon.breakdown.filter((l) => l.kind === 'service_markup');
    expect(markups.map((l) => l.amount)).toEqual([fromPhp(1_000), fromPhp(2_000)]);

    // Base grew by the add-on: 13,550 + 1,500 = 15,050 -> 10% = 1,505.
    expect(withAddon.breakdown.find((l) => l.kind === 'package_markup')?.amount).toBe(
      fromPhp(1_505),
    );
  });

  it('omits the add-on when it is not selected', () => {
    const plain = only(quote({ adjustments: [hotel('quad', 20_000)] }));
    expect(plain.breakdown.find((l) => l.kind === 'service')?.amount).toBe(fromPhp(5_425));
  });

  it('applies a percent service markup to the tier amount only', () => {
    const json = snapshotJson() as { serviceMarkups: Record<string, unknown> };
    json.serviceMarkups.tour = { type: 'percent', value: 10 };
    const pct = parseSnapshot(json);
    const quad = only(
      calculateQuotation({
        snapshot: pct,
        paxTotal: 4,
        services: [{ serviceId: MT_FUJI_ID, addonIds: [ENTRANCE_ADDON_ID] }],
        outputCategories: ['quad'],
        adjustments: [hotel('quad', 20_000)],
      }),
    );
    // 10% of the 5,425 tier, ignoring the 1,500 add-on.
    expect(quad.breakdown.find((l) => l.kind === 'service_markup')?.amount).toBe(fromPhp(542.5));
  });
});

// -----------------------------------------------------------------------------
// Change Rate
// -----------------------------------------------------------------------------
describe('Change Rate entries', () => {
  it('nets a reversal to zero', () => {
    const withReversal = only(
      quote({
        adjustments: [
          hotel('quad', 20_000),
          { paxCategory: 'quad', kind: 'operator_charge', amount: 1_500, currency: 'PHP' },
          { paxCategory: 'quad', kind: 'operator_charge', amount: -1_500, currency: 'PHP' },
        ],
      }),
    );
    expect(withReversal.subtotal).toBe(fromPhp(19_050));
    expect(withReversal.final).toBe(fromPhp(19_099));
  });

  it('converts a JPY entry at the snapshot rate', () => {
    const jpyCharge = only(
      quote({
        adjustments: [
          hotel('quad', 20_000),
          { paxCategory: 'quad', kind: 'extra_transfer', amount: 4_000, currency: 'JPY' },
        ],
      }),
    );
    expect(jpyCharge.breakdown.find((l) => l.kind === 'adjustment')?.amount).toBe(fromPhp(2_000));
  });

  it('converts a USD entry at 67', () => {
    const usd = only(
      quote({
        adjustments: [
          hotel('quad', 20_000),
          { paxCategory: 'quad', kind: 'special_arrangement', amount: 50, currency: 'USD' },
        ],
      }),
    );
    expect(usd.breakdown.find((l) => l.kind === 'adjustment')?.amount).toBe(fromPhp(3_350));
  });

  it('only applies entries belonging to the category', () => {
    const result = quote({
      outputCategories: ['quad', 'twin'],
      adjustments: [
        hotel('quad', 20_000),
        hotel('twin', 20_000),
        { paxCategory: 'twin', kind: 'surcharge', amount: 500, currency: 'PHP' },
      ],
    });
    const [quad, twin] = result.categories;
    expect(quad?.breakdown.some((l) => l.kind === 'adjustment')).toBe(false);
    expect(twin?.breakdown.some((l) => l.kind === 'adjustment')).toBe(true);
  });

  it('warns but still prices when no hotel cost was entered', () => {
    const result = quote();
    const quad = only(result);
    expect(codes(result)).toContain('MISSING_HOTEL_COST');
    expect(quad.breakdown[0]).toMatchObject({ kind: 'hotel', amount: 0 });
    expect(quad.final).toBe(fromPhp(14_099)); // 0 + 5,425 + 1,000 + 3,125 + 2,000 + 2,500 = 14,050
  });
});

// -----------------------------------------------------------------------------
// Issues
// -----------------------------------------------------------------------------
describe('issues', () => {
  it('flags a service that is not in the snapshot', () => {
    const result = quote({
      services: [{ serviceId: 'nope' }],
      adjustments: [hotel('quad', 20_000)],
    });
    expect(codes(result)).toContain('SERVICE_NOT_IN_SNAPSHOT');
    expect(only(result).final).toBeNull();
  });

  it('flags an add-on that does not belong to the service', () => {
    const result = quote({
      services: [{ serviceId: MT_FUJI_ID, addonIds: ['ghost'] }],
      adjustments: [hotel('quad', 20_000)],
    });
    expect(codes(result)).toContain('UNKNOWN_ADDON');
    expect(only(result).final).toBeNull();
  });

  it('refuses private-vehicle pricing in phase 1', () => {
    const json = snapshotJson() as { services: { pricingBasis: string }[] };
    json.services[0]!.pricingBasis = 'private_total';
    const priv = parseSnapshot(json);
    const result = calculateQuotation({
      snapshot: priv,
      paxTotal: 4,
      services: [{ serviceId: MT_FUJI_ID }],
      outputCategories: ['quad'],
      adjustments: [hotel('quad', 20_000)],
    });
    expect(codes(result)).toContain('PRIVATE_RATE_NOT_SUPPORTED');
    expect(only(result).final).toBeNull();
  });

  it('flags a missing FX rate', () => {
    const json = snapshotJson() as { fx: Record<string, number>; services: { currency: string }[] };
    json.services[0]!.currency = 'USD';
    delete json.fx.USD;
    const noUsd = parseSnapshot(json);
    const result = calculateQuotation({
      snapshot: noUsd,
      paxTotal: 4,
      services: [{ serviceId: MT_FUJI_ID }],
      outputCategories: ['quad'],
      adjustments: [hotel('quad', 20_000)],
    });
    expect(codes(result)).toContain('MISSING_FX');
    expect(only(result).final).toBeNull();
  });

  it('flags a non-positive total', () => {
    const result = quote({
      services: [],
      adjustments: [
        hotel('quad', 0),
        { paxCategory: 'quad', kind: 'surcharge', amount: -5_000, currency: 'PHP' },
      ],
      outputCategories: ['sneak_in'],
    });
    expect(codes(result)).toContain('NON_POSITIVE_TOTAL');
  });

  it('flags a category the snapshot does not define', () => {
    const result = quote({ outputCategories: ['penthouse'] });
    expect(codes(result)).toContain('UNKNOWN_CATEGORY');
    expect(only(result).final).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// Snapshot behaviour
// -----------------------------------------------------------------------------
describe('snapshot isolation', () => {
  const oldSnapshot: RateSnapshot = parseSnapshot(snapshotJson(0.5));
  const newSnapshot: RateSnapshot = parseSnapshot(snapshotJson(0.42));

  const input = (s: RateSnapshot): QuotationInput => ({
    snapshot: s,
    paxTotal: 4,
    services: BOTH_SERVICES,
    outputCategories: ['quad'],
    adjustments: [hotel('quad', 20_000)],
  });

  it('prices differently after an FX change', () => {
    const before = only(calculateQuotation(input(oldSnapshot)));
    const after = only(calculateQuotation(input(newSnapshot)));
    expect(before.final).toBe(fromPhp(19_099));
    // 10,850 x 0.42 = 4,557 and 6,250 x 0.42 = 2,625 -> 5,000+4,557+1,000+2,625+2,000+2,500
    expect(after.subtotal).toBe(fromPhp(17_682));
    expect(after.final).toBe(fromPhp(17_699));
    expect(after.final).not.toBe(before.final);
  });

  it('reproduces the original numbers exactly when replayed on the old snapshot', () => {
    const first = only(calculateQuotation(input(oldSnapshot)));
    const replay = only(calculateQuotation(input(parseSnapshot(snapshotJson(0.5)))));
    expect(replay.final).toBe(first.final);
    expect(replay.subtotal).toBe(first.subtotal);
    expect(replay.breakdown).toEqual(first.breakdown);
  });
});

// -----------------------------------------------------------------------------
// The reconciliation rule
// -----------------------------------------------------------------------------
describe('totals reconcile', () => {
  it('breakdown lines sum to final across a wide sweep of inputs', () => {
    const paxSizes = [1, 2, 5, 7, 12, 19, 30, 46, 60];
    const hotels = [0, 4_000, 6_000, 20_000, 23_333];
    const markups = [
      null,
      { type: 'fixed' as const, value: 500 },
      { type: 'percent' as const, value: 7 },
    ];
    const airfares = [0, 15_000, 28_750.5];
    let checked = 0;

    for (const paxTotal of paxSizes) {
      for (const room of hotels) {
        for (const packageMarkup of markups) {
          for (const airfarePhp of airfares) {
            const result = calculateQuotation({
              snapshot,
              paxTotal,
              services: [
                { serviceId: MT_FUJI_ID, addonIds: [ENTRANCE_ADDON_ID] },
                { serviceId: AIRPORT_ID },
              ],
              outputCategories: ['quad', 'triple', 'twin', 'solo', 'child', 'sneak_in'],
              adjustments: [
                hotel('quad', room),
                hotel('triple', room),
                hotel('twin', room),
                hotel('solo', room / 4),
                hotel('child', room / 4),
                hotel('sneak_in', room / 4),
                { paxCategory: 'twin', kind: 'surcharge', amount: 1_200, currency: 'JPY' },
              ],
              airfarePhp,
              packageMarkup,
            });

            for (const category of result.categories) {
              if (category.final === null) continue;
              expect(add(...category.breakdown.map((l) => l.amount))).toBe(category.final);
              checked += 1;
            }
          }
        }
      }
    }

    expect(checked).toBeGreaterThan(400);
  });
});
